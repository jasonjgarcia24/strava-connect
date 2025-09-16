const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;
const AuthService = require('./authService');

class PassportConfig {
  constructor() {
    this.authService = new AuthService();
  }

  async initialize() {
    await this.authService.initialize();
    this.setupLocalStrategy();
    this.setupGoogleStrategy();
    this.setupStravaStrategy();
    this.setupSerialization();
  }

  setupLocalStrategy() {
    passport.use(new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (email, password, done) => {
      try {
        console.log('Local strategy: Attempting login for email:', email);
        const user = await this.authService.findUserByEmail(email);
        console.log('Local strategy: Found user:', user ? 'Yes' : 'No');
        
        if (!user) {
          console.log('Local strategy: No user found');
          return done(null, false, { message: 'No user found with that email address.' });
        }

        if (!user.isApproved) {
          console.log('Local strategy: User not approved');
          return done(null, false, { message: 'Your account is pending approval. Please contact the athlete.' });
        }

        const isValidPassword = await user.validatePassword(password);
        console.log('Local strategy: Password valid:', isValidPassword);
        if (!isValidPassword) {
          return done(null, false, { message: 'Incorrect password.' });
        }

        console.log('Local strategy: Login successful for user:', user.id);
        return done(null, user);
      } catch (error) {
        console.error('Local strategy error:', error);
        return done(error);
      }
    }));
  }

  setupGoogleStrategy() {
    // You'll need to set these environment variables
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

    console.log('Google OAuth setup - Client ID present:', !!GOOGLE_CLIENT_ID);
    console.log('Google OAuth setup - Client Secret present:', !!GOOGLE_CLIENT_SECRET);

    if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      console.log('Setting up Google OAuth strategy');
      passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          console.log('Google OAuth callback - Profile:', profile.displayName, profile._json?.email);
          console.log('Full profile:', JSON.stringify(profile, null, 2));

          // Get email from profile (handle different formats)
          const email = profile._json?.email || profile.emails?.[0]?.value;
          if (!email) {
            return done(null, false, { message: 'No email found in Google profile' });
          }

          // Check if user already exists
          let user = await this.authService.findUserByProvider('google', profile.id);

          if (user) {
            console.log('Existing Google user found:', user.email);
            if (!user.isApproved) {
              return done(null, false, { message: 'Your account is pending approval. Please contact the athlete.' });
            }
            return done(null, user);
          }

          // Check if user exists with same email
          user = await this.authService.findUserByEmail(email);
          if (user) {
            console.log('User with same email found, linking Google account');
            // Link the Google account to existing user
            await this.authService.updateUser(user.id, {
              provider: 'google',
              providerId: profile.id,
              avatar: profile.photos?.[0]?.value || profile._json?.picture
            });

            if (!user.isApproved) {
              return done(null, false, { message: 'Your account is pending approval. Please contact the athlete.' });
            }
            return done(null, user);
          }

          console.log('New Google user, creating account');
          // Create new user based on OAuth mode (this will be handled by the server route)
          // For now, return the profile data to be processed
          return done(null, false, {
            message: 'oauth_registration_needed',
            profile: profile
          });
        } catch (error) {
          console.error('Google OAuth error:', error);
          return done(error);
        }
      }));
    } else {
      console.log('⚠️  Google OAuth not configured - missing environment variables');
      // Set up a dummy strategy to prevent the "Unknown authentication strategy" error
      passport.use('google', new GoogleStrategy({
        clientID: 'dummy',
        clientSecret: 'dummy',
        callbackURL: "/auth/google/callback"
      }, (accessToken, refreshToken, profile, done) => {
        done(new Error('Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'));
      }));
    }
  }

  setupStravaStrategy() {
    // You'll need to set these environment variables  
    const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
    const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

    console.log('Strava OAuth setup - Client ID present:', !!STRAVA_CLIENT_ID);
    console.log('Strava OAuth setup - Client Secret present:', !!STRAVA_CLIENT_SECRET);

    if (STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET) {
      console.log('Setting up Strava OAuth strategy');
      passport.use('strava', new OAuth2Strategy({
        authorizationURL: 'https://www.strava.com/oauth/authorize',
        tokenURL: 'https://www.strava.com/oauth/token',
        clientID: STRAVA_CLIENT_ID,
        clientSecret: STRAVA_CLIENT_SECRET,
        callbackURL: "/auth/strava/callback"
      }, async (accessToken, refreshToken, profile, done) => {
        try {
          // Fetch user profile from Strava API
          const response = await fetch('https://www.strava.com/api/v3/athlete', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          const stravaProfile = await response.json();
          
          console.log('Strava profile:', stravaProfile);
          
          // Check if user already exists
          let user = await this.authService.findUserByProvider('strava', stravaProfile.id.toString());
          
          if (user) {
            if (!user.isApproved) {
              return done(null, false, { message: 'Your account is pending approval. Please contact the athlete.' });
            }
            return done(null, user);
          }

          // Check if user exists with same email (Strava doesn't always provide email)
          const email = stravaProfile.email || `${stravaProfile.id}@strava.local`;
          user = await this.authService.findUserByEmail(email);
          
          if (user) {
            // Link the Strava account to existing user
            await this.authService.updateUser(user.id, {
              provider: 'strava',
              providerId: stravaProfile.id.toString(),
              avatar: stravaProfile.profile
            });
            
            if (!user.isApproved) {
              return done(null, false, { message: 'Your account is pending approval. Please contact the athlete.' });
            }
            return done(null, user);
          }

          // Create new user (pending approval)
          user = await this.authService.createUser({
            email: email,
            name: `${stravaProfile.firstname} ${stravaProfile.lastname}`,
            provider: 'strava',
            providerId: stravaProfile.id.toString(),
            avatar: stravaProfile.profile,
            role: 'coach',
            isApproved: false
          });

          return done(null, false, { message: 'Account created successfully! Please wait for approval from the athlete.' });
        } catch (error) {
          console.error('Strava strategy error:', error);
          return done(error);
        }
      }));
    } else {
      console.log('⚠️  Strava OAuth not configured - missing environment variables');
      // Set up a dummy strategy to prevent the "Unknown authentication strategy" error
      passport.use('strava', new OAuth2Strategy({
        authorizationURL: 'https://www.strava.com/oauth/authorize',
        tokenURL: 'https://www.strava.com/oauth/token',
        clientID: 'dummy',
        clientSecret: 'dummy',
        callbackURL: "/auth/strava/callback"
      }, (accessToken, refreshToken, profile, done) => {
        done(new Error('Strava OAuth is not configured. Please set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET environment variables.'));
      }));
    }
  }

  setupSerialization() {
    passport.serializeUser((user, done) => {
      try {
        console.log('Serializing user:', user);
        if (!user || !user.id) {
          console.error('No user or user.id found for serialization');
          return done(new Error('User object invalid for serialization'));
        }
        done(null, user.id);
      } catch (error) {
        console.error('Serialization error:', error);
        done(error);
      }
    });

    passport.deserializeUser(async (id, done) => {
      try {
        console.log('Deserializing user ID:', id);
        if (!id) {
          return done(new Error('No user ID provided for deserialization'));
        }
        
        const user = await this.authService.findUserById(id);
        console.log('Deserialized user:', user ? 'Found' : 'Not found');
        
        if (!user) {
          return done(null, false);
        }
        
        done(null, user);
      } catch (error) {
        console.error('Deserialization error:', error);
        done(error);
      }
    });
  }
}

module.exports = PassportConfig;