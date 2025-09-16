require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const StravaConnectApp = require('./src/index');
const PassportConfig = require('./src/passport');
const AuthService = require('./src/authService');

const app = express();
const port = process.env.PORT || 3000;

// Initialize authentication
const passportConfig = new PassportConfig();
const authService = new AuthService();

// Session store
const sessionStore = new SequelizeStore({
  db: authService.sequelize,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'strava-dashboard-secret-key-change-in-production',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Sync session store
sessionStore.sync();

// Authentication middleware
function requireAuth(req, res, next) {
  if (!authInitialized) {
    return res.status(503).send('Authentication system is still initializing. Please try again in a moment.');
  }
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Athlete access middleware - ensures user has access to the specified athlete's data
async function requireAthleteAccess(req, res, next) {
  try {
    const athleteId = req.params.athleteId || req.query.athleteId || req.body.athleteId;

    if (!athleteId) {
      return res.status(400).json({ error: 'Athlete ID is required' });
    }

    // Athletes can always access their own data
    if (req.user.role === 'athlete') {
      // Find the athlete record for this user
      const athleteAccess = await authService.AthleteAccess.findOne({
        where: {
          userId: req.user.id,
          athleteId: athleteId,
          isApproved: true
        }
      });

      if (!athleteAccess) {
        return res.status(403).json({ error: 'Access denied to this athlete data' });
      }

      req.athleteId = athleteId;
      return next();
    }

    // For coaches, verify they have approved access to this athlete
    const access = await authService.getUserAthleteAccess(req.user.id, athleteId);
    if (!access) {
      return res.status(403).json({ error: 'Access denied to this athlete data' });
    }

    req.athleteId = athleteId;
    req.athleteAccess = access;
    next();
  } catch (error) {
    console.error('Athlete access middleware error:', error);
    res.status(500).json({ error: 'Failed to verify athlete access' });
  }
}

// Initialize authentication on startup - wait for completion before starting routes
let authInitialized = false;

async function initializeAuth() {
  try {
    await passportConfig.initialize();
    authInitialized = true;
    console.log('✅ Authentication system initialized');
  } catch (error) {
    console.error('❌ Failed to initialize authentication:', error);
    process.exit(1);
  }
}

// Initialize authentication before setting up routes
initializeAuth();

// Authentication routes
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  const error = req.query.error || '';
  const message = req.query.message || '';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏃‍♂️ Login - Strava Training Dashboard</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .login-container {
                background: white;
                padding: 2rem;
                border-radius: 15px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.1);
                width: 100%;
                max-width: 400px;
                text-align: center;
            }
            .logo {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
            h1 {
                color: #333;
                margin-bottom: 2rem;
                font-size: 1.5rem;
            }
            .auth-method {
                margin-bottom: 1rem;
                padding: 1rem;
                border: 2px solid #f0f0f0;
                border-radius: 10px;
                transition: all 0.3s ease;
            }
            .auth-method:hover {
                border-color: #667eea;
                background: #f8f9ff;
            }
            .auth-form {
                display: none;
            }
            .auth-form.active {
                display: block;
            }
            input[type="email"], input[type="password"] {
                width: 100%;
                padding: 0.8rem;
                margin: 0.5rem 0;
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                font-size: 1rem;
            }
            .btn {
                width: 100%;
                padding: 0.8rem;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                cursor: pointer;
                transition: background 0.3s ease;
                text-decoration: none;
                display: inline-block;
                margin: 0.5rem 0;
            }
            .btn:hover {
                background: #5a6fd8;
            }
            .btn-oauth {
                background: #ff6b35;
            }
            .btn-oauth:hover {
                background: #e55a2b;
            }
            .btn-google {
                background: #4285f4;
            }
            .btn-google:hover {
                background: #3367d6;
            }
            .btn-strava {
                background: #fc4c02;
            }
            .btn-strava:hover {
                background: #e0430c;
            }
            .toggle-link {
                color: #667eea;
                cursor: pointer;
                text-decoration: underline;
                margin-top: 1rem;
                display: block;
            }
            .error {
                background: #ffe6e6;
                color: #d00;
                padding: 0.8rem;
                border-radius: 8px;
                margin-bottom: 1rem;
            }
            .success {
                background: #e6ffe6;
                color: #0a5d00;
                padding: 0.8rem;
                border-radius: 8px;
                margin-bottom: 1rem;
            }
            .divider {
                margin: 1.5rem 0;
                text-align: center;
                color: #666;
                position: relative;
            }
            .divider::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 0;
                right: 0;
                height: 1px;
                background: #e1e5e9;
            }
            .divider span {
                background: white;
                padding: 0 1rem;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="logo">🏃‍♂️</div>
            <h1>Training Dashboard Login</h1>
            
            ${error ? `<div class="error">${error}</div>` : ''}
            ${message ? `<div class="success">${message}</div>` : ''}
            
            <!-- OAuth Login Options -->
            <div class="auth-method">
                <h3>Quick Login</h3>
                <a href="/auth/google" class="btn btn-google">📧 Login with Google</a>
                <a href="/auth/strava" class="btn btn-strava">🚴‍♂️ Login with Strava</a>
            </div>
            
            <div class="divider"><span>or</span></div>
            
            <!-- Traditional Login -->
            <div class="auth-method">
                <h3>Email & Password</h3>
                <form action="/auth/local" method="POST">
                    <input type="email" name="email" placeholder="Email Address" required>
                    <input type="password" name="password" placeholder="Password" required>
                    <button type="submit" class="btn">🔐 Login</button>
                </form>
                <span class="toggle-link" onclick="toggleRegister()">Need an account? Register here</span>
            </div>
            
            <!-- Registration Form -->
            <div id="registerForm" class="auth-method" style="display: none;">
                <h3>Create Account</h3>
                <form action="/auth/register" method="POST">
                    <input type="text" name="name" placeholder="Full Name" required>
                    <input type="email" name="email" placeholder="Email Address" required>
                    <input type="password" name="password" placeholder="Password" required>
                    <button type="submit" class="btn">📝 Register</button>
                </form>
                <span class="toggle-link" onclick="toggleRegister()">Already have an account? Login here</span>
            </div>
            
            <div style="margin-top: 2rem; font-size: 0.9rem; color: #666;">
                <p>🛡️ Secure access to training data</p>
                <p>Coach accounts require athlete approval</p>
            </div>
        </div>
        
        <script>
            function toggleRegister() {
                const registerForm = document.getElementById('registerForm');
                if (registerForm.style.display === 'none') {
                    registerForm.style.display = 'block';
                } else {
                    registerForm.style.display = 'none';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// Local authentication routes
app.post('/auth/local', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login?error=Invalid email or password'
}));

// Athlete registration page
app.get('/register/athlete', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏃‍♂️ Create Athlete Account</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .form-container {
                background: white;
                padding: 3rem;
                border-radius: 20px;
                box-shadow: 0 30px 80px rgba(0,0,0,0.15);
                width: 100%;
                max-width: 500px;
            }
            .logo {
                font-size: 3rem;
                text-align: center;
                margin-bottom: 1rem;
            }
            h1 {
                color: #333;
                text-align: center;
                margin-bottom: 2rem;
                font-size: 2rem;
            }
            .form-group {
                margin-bottom: 1.5rem;
            }
            label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
                color: #333;
            }
            input[type="text"], input[type="email"], input[type="password"] {
                width: 100%;
                padding: 1rem;
                border: 2px solid #e1e5e9;
                border-radius: 10px;
                font-size: 1rem;
                transition: border-color 0.3s ease;
            }
            input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 1rem;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 1.1rem;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.3s ease;
                margin-bottom: 1rem;
            }
            .btn:hover {
                background: #5a6fd8;
            }
            .back-link {
                text-align: center;
                margin-top: 1rem;
            }
            .back-link a {
                color: #667eea;
                text-decoration: none;
            }
            .back-link a:hover {
                text-decoration: underline;
            }
            .info-box {
                background: #f8f9ff;
                padding: 1.5rem;
                border-radius: 10px;
                margin-bottom: 2rem;
                border-left: 4px solid #667eea;
            }
            .info-box h3 {
                color: #667eea;
                margin-bottom: 0.5rem;
            }
            .info-box p {
                color: #666;
                line-height: 1.5;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="form-container">
            <div class="logo">🏃‍♂️</div>
            <h1>Create Athlete Account</h1>

            <div class="info-box">
                <h3>Welcome to Your Training Platform!</h3>
                <p>
                    You're creating your personal training dashboard. After registration, you'll be able to:
                    connect your Strava account, sync your training data, manage coach access, and view comprehensive analytics.
                </p>
            </div>

            <form action="/auth/register/athlete" method="POST">
                <div class="form-group">
                    <label for="name">Full Name</label>
                    <input type="text" id="name" name="name" placeholder="Enter your full name" required>
                </div>

                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" name="email" placeholder="Enter your email" required>
                </div>

                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" placeholder="Create a secure password" required>
                </div>

                <button type="submit" class="btn">🚀 Create My Training Dashboard</button>
            </form>

            <div style="text-align: center; margin: 1.5rem 0;">
                <p style="color: #666; margin-bottom: 1rem;">Or register with:</p>
                <a href="/auth/google?mode=athlete" class="btn" style="background: #db4437; margin: 0.5rem;">
                    📧 Continue with Google
                </a>
            </div>

            <div class="back-link">
                <a href="/">← Back to home</a>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Coach registration page
app.get('/register/coach', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>👥 Coach Access Request</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .form-container {
                background: white;
                padding: 3rem;
                border-radius: 20px;
                box-shadow: 0 30px 80px rgba(0,0,0,0.15);
                width: 100%;
                max-width: 500px;
            }
            .logo {
                font-size: 3rem;
                text-align: center;
                margin-bottom: 1rem;
            }
            h1 {
                color: #333;
                text-align: center;
                margin-bottom: 2rem;
                font-size: 2rem;
            }
            .form-group {
                margin-bottom: 1.5rem;
            }
            label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 500;
                color: #333;
            }
            input[type="text"], input[type="email"], input[type="password"], select {
                width: 100%;
                padding: 1rem;
                border: 2px solid #e1e5e9;
                border-radius: 10px;
                font-size: 1rem;
                transition: border-color 0.3s ease;
            }
            input[type="text"]:focus, input[type="email"]:focus, input[type="password"]:focus, select:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                width: 100%;
                padding: 1rem;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 1.1rem;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.3s ease;
                margin-bottom: 1rem;
            }
            .btn:hover {
                background: #5a6fd8;
            }
            .back-link {
                text-align: center;
                margin-top: 1rem;
            }
            .back-link a {
                color: #667eea;
                text-decoration: none;
            }
            .back-link a:hover {
                text-decoration: underline;
            }
            .info-box {
                background: #fff9e6;
                padding: 1.5rem;
                border-radius: 10px;
                margin-bottom: 2rem;
                border-left: 4px solid #ffc107;
            }
            .info-box h3 {
                color: #856404;
                margin-bottom: 0.5rem;
            }
            .info-box p {
                color: #666;
                line-height: 1.5;
                font-size: 0.9rem;
            }
        </style>
    </head>
    <body>
        <div class="form-container">
            <div class="logo">👥</div>
            <h1>Request Coach Access</h1>

            <div class="info-box">
                <h3>⚠️ Approval Required</h3>
                <p>
                    Coach accounts require approval from the athlete whose data you want to access.
                    You'll need to know which athlete's training dashboard you want to join.
                    They'll receive a notification and can approve or deny your request.
                </p>
            </div>

            <form action="/auth/register/coach" method="POST">
                <div class="form-group">
                    <label for="name">Full Name</label>
                    <input type="text" id="name" name="name" placeholder="Enter your full name" required>
                </div>

                <div class="form-group">
                    <label for="email">Email Address</label>
                    <input type="email" id="email" name="email" placeholder="Enter your email" required>
                </div>

                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" placeholder="Create a secure password" required>
                </div>

                <div class="form-group">
                    <label for="athleteEmail">Athlete Email</label>
                    <input type="email" id="athleteEmail" name="athleteEmail" placeholder="Enter the athlete's email address" required>
                </div>

                <button type="submit" class="btn">📝 Request Coach Access</button>
            </form>

            <div style="text-align: center; margin: 1.5rem 0;">
                <p style="color: #666; margin-bottom: 1rem;">Or register with:</p>
                <a href="/auth/google?mode=coach" class="btn" style="background: #db4437; margin: 0.5rem;">
                    📧 Continue with Google
                </a>
            </div>

            <div class="back-link">
                <a href="/">← Back to home</a>
            </div>
        </div>
    </body>
    </html>
  `);
});

// Athlete registration handler
app.post('/auth/register/athlete', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if athlete already exists
    const existingAthlete = await authService.findAthleteByEmail(email);
    if (existingAthlete) {
      return res.redirect('/register/athlete?error=An athlete with this email already exists');
    }

    // Check if user already exists
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return res.redirect('/register/athlete?error=A user with this email already exists');
    }

    // Create athlete record
    const athlete = await authService.createAthlete({
      name,
      email,
      planType: 'free'
    });

    // Create user account for the athlete
    const user = await authService.createUser({
      name,
      email,
      password,
      provider: 'local',
      role: 'athlete'
    });

    // Give the athlete admin access to their own data
    await authService.AthleteAccess.create({
      athleteId: athlete.id,
      userId: user.id,
      accessLevel: 'admin',
      isApproved: true,
      approvedAt: new Date()
    });

    res.redirect('/login?message=Athlete account created successfully! You can now log in and set up your training dashboard.');
  } catch (error) {
    console.error('Athlete registration error:', error);
    res.redirect('/register/athlete?error=Registration failed. Please try again.');
  }
});

// Coach registration handler
app.post('/auth/register/coach', async (req, res) => {
  try {
    const { name, email, password, athleteEmail } = req.body;

    // Check if user already exists
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return res.redirect('/register/coach?error=A user with this email already exists');
    }

    // Find the athlete they want to request access to
    const athlete = await authService.findAthleteByEmail(athleteEmail);
    if (!athlete) {
      return res.redirect('/register/coach?error=No athlete found with that email address');
    }

    // Create coach user account
    const user = await authService.createUser({
      name,
      email,
      password,
      provider: 'local',
      role: 'coach'
    });

    // Create access request
    await authService.requestAthleteAccess(user.id, athlete.id, `Coach registration request for ${athlete.name}'s training data`);

    res.redirect('/login?message=Coach account created! Your access request has been sent to the athlete for approval.');
  } catch (error) {
    console.error('Coach registration error:', error);
    res.redirect('/register/coach?error=Registration failed. Please try again.');
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await authService.findUserByEmail(email);
    if (existingUser) {
      return res.redirect('/login?error=User with this email already exists');
    }

    // Create new user (pending approval for coaches)
    await authService.createUser({
      name,
      email,
      password,
      provider: 'local',
      role: 'coach',
      isApproved: false
    });

    res.redirect('/login?message=Account created! Please wait for approval from the athlete.');
  } catch (error) {
    console.error('Registration error:', error);
    res.redirect('/login?error=Registration failed. Please try again.');
  }
});

// Google OAuth routes
app.get('/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect('/login?error=Google OAuth is not configured. Please contact the administrator.');
  }

  // Store the registration mode in session
  req.session.oauthMode = req.query.mode || 'general';

  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error('Google OAuth error:', err);
      return res.redirect('/login?error=Google authentication failed');
    }

    if (!user && info && info.message === 'oauth_registration_needed') {
      // Handle new user registration with Google OAuth
      return handleGoogleOAuthRegistration(req, res, info.profile);
    }

    if (!user) {
      return res.redirect('/login?error=Google authentication failed');
    }

    // Login successful
    req.logIn(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.redirect('/login?error=Login failed');
      }
      res.redirect('/dashboard');
    });
  })(req, res, next);
});

async function handleGoogleOAuthRegistration(req, res, profile) {
  try {
    const oauthMode = req.session.oauthMode || 'general';
    console.log('Handling Google OAuth registration, mode:', oauthMode);

    // Get email from profile (handle different formats)
    const email = profile._json?.email || profile.emails?.[0]?.value;
    if (!email) {
      return res.redirect('/login?error=No email found in Google profile');
    }

    if (oauthMode === 'athlete') {
      // Create athlete and user account
      const athlete = await authService.createAthlete({
        name: profile.displayName,
        email: email,
        planType: 'free'
      });

      const user = await authService.createUser({
        name: profile.displayName,
        email: email,
        provider: 'google',
        providerId: profile.id,
        avatar: profile.photos?.[0]?.value || profile._json?.picture,
        role: 'athlete',
        isApproved: true
      });

      // Give the athlete admin access to their own data
      await authService.AthleteAccess.create({
        athleteId: athlete.id,
        userId: user.id,
        accessLevel: 'admin',
        isApproved: true,
        approvedAt: new Date()
      });

      // Log the user in
      req.logIn(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return res.redirect('/login?error=Registration successful but login failed');
        }
        res.redirect('/dashboard?welcome=true');
      });

    } else {
      // For coaches, we need them to specify which athlete they want access to
      // Redirect to a special page to collect athlete email
      req.session.pendingGoogleProfile = profile;
      res.redirect('/register/coach/google');
    }

  } catch (error) {
    console.error('Google OAuth registration error:', error);
    res.redirect('/login?error=Registration failed. Please try again.');
  }
}

// Strava OAuth routes
app.get('/auth/strava', (req, res, next) => {
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
    return res.redirect('/login?error=Strava OAuth is not configured. Please contact the administrator.');
  }
  passport.authenticate('strava', { scope: ['read'] })(req, res, next);
});

app.get('/auth/strava/callback',
  passport.authenticate('strava', { failureRedirect: '/login?error=Strava authentication failed' }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

// Platform landing page
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏃‍♂️ Training Dashboard Platform</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            .landing-container {
                background: white;
                padding: 3rem;
                border-radius: 20px;
                box-shadow: 0 30px 80px rgba(0,0,0,0.15);
                width: 100%;
                max-width: 800px;
                text-align: center;
            }
            .logo {
                font-size: 4rem;
                margin-bottom: 1rem;
            }
            h1 {
                color: #333;
                margin-bottom: 1rem;
                font-size: 2.5rem;
            }
            .subtitle {
                color: #666;
                margin-bottom: 3rem;
                font-size: 1.2rem;
                line-height: 1.6;
            }
            .user-types {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 2rem;
                margin-bottom: 3rem;
            }
            .user-type-card {
                background: #f8f9ff;
                padding: 2rem;
                border-radius: 15px;
                border: 3px solid #e1e5e9;
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .user-type-card:hover {
                border-color: #667eea;
                transform: translateY(-5px);
                box-shadow: 0 10px 30px rgba(102, 126, 234, 0.2);
            }
            .user-type-card.selected {
                border-color: #667eea;
                background: #667eea;
                color: white;
            }
            .user-icon {
                font-size: 3rem;
                margin-bottom: 1rem;
            }
            .user-title {
                font-size: 1.5rem;
                font-weight: bold;
                margin-bottom: 0.5rem;
            }
            .user-description {
                font-size: 0.9rem;
                line-height: 1.4;
            }
            .action-section {
                display: none;
                margin-top: 2rem;
                padding: 2rem;
                background: #f8f9ff;
                border-radius: 15px;
            }
            .action-section.show {
                display: block;
            }
            .btn {
                display: inline-block;
                padding: 1rem 2rem;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 10px;
                font-size: 1.1rem;
                font-weight: 500;
                margin: 0.5rem;
                transition: all 0.3s ease;
                border: none;
                cursor: pointer;
            }
            .btn:hover {
                background: #5a6fd8;
                transform: translateY(-2px);
            }
            .btn-secondary {
                background: #6c757d;
            }
            .btn-secondary:hover {
                background: #545b62;
            }
            .features {
                margin-top: 3rem;
                text-align: left;
            }
            .features h3 {
                color: #667eea;
                margin-bottom: 1rem;
                text-align: center;
            }
            .feature-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 1rem;
            }
            .feature-item {
                background: #f8f9ff;
                padding: 1rem;
                border-radius: 10px;
                text-align: center;
            }
            .feature-emoji {
                font-size: 2rem;
                display: block;
                margin-bottom: 0.5rem;
            }
            .feature-text {
                font-size: 0.9rem;
                color: #555;
            }
            @media (max-width: 768px) {
                .landing-container {
                    padding: 2rem;
                }
                h1 {
                    font-size: 2rem;
                }
                .user-types {
                    grid-template-columns: 1fr;
                    gap: 1rem;
                }
                .feature-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <div class="landing-container">
            <div class="logo">🏃‍♂️</div>
            <h1>Training Dashboard Platform</h1>
            <p class="subtitle">
                Connect athletes with coaches through comprehensive training analytics.<br>
                Secure data sharing with powerful insights and AI-powered summaries.
            </p>

            <div class="user-types">
                <div class="user-type-card" onclick="selectUserType('athlete')">
                    <div class="user-icon">🏃‍♂️</div>
                    <div class="user-title">I'm an Athlete</div>
                    <div class="user-description">
                        Create your training dashboard and manage who can access your data
                    </div>
                </div>

                <div class="user-type-card" onclick="selectUserType('coach')">
                    <div class="user-icon">👥</div>
                    <div class="user-title">I'm a Coach</div>
                    <div class="user-description">
                        Request access to athlete training data and provide coaching insights
                    </div>
                </div>
            </div>

            <!-- Athlete Action Section -->
            <div id="athlete-actions" class="action-section">
                <h3>🏃‍♂️ Set Up Your Training Dashboard</h3>
                <p style="margin-bottom: 1.5rem;">
                    Create your personal training analytics platform and connect your Strava data.
                    You'll be able to invite coaches and control who sees your training information.
                </p>
                <a href="/register/athlete" class="btn">🚀 Create Athlete Account</a>
                <a href="/login" class="btn btn-secondary">Already have an account? Sign In</a>
            </div>

            <!-- Coach Action Section -->
            <div id="coach-actions" class="action-section">
                <h3>👥 Join as a Coach</h3>
                <p style="margin-bottom: 1.5rem;">
                    Request access to athlete training data. Athletes must approve your access
                    before you can view their training analytics and provide coaching insights.
                </p>
                <a href="/register/coach" class="btn">📝 Request Coach Access</a>
                <a href="/login" class="btn btn-secondary">Already have an account? Sign In</a>
            </div>

            <div class="features">
                <h3>✨ Platform Features</h3>
                <div class="feature-grid">
                    <div class="feature-item">
                        <span class="feature-emoji">📊</span>
                        <div class="feature-text">Comprehensive Analytics</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-emoji">🔄</span>
                        <div class="feature-text">Auto Strava Sync</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-emoji">🤖</span>
                        <div class="feature-text">AI Training Summaries</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-emoji">👥</span>
                        <div class="feature-text">Coach Collaboration</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-emoji">🛡️</span>
                        <div class="feature-text">Secure Data Control</div>
                    </div>
                    <div class="feature-item">
                        <span class="feature-emoji">📱</span>
                        <div class="feature-text">Mobile Friendly</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            function selectUserType(type) {
                // Remove selection from all cards
                document.querySelectorAll('.user-type-card').forEach(card => {
                    card.classList.remove('selected');
                });

                // Hide all action sections
                document.querySelectorAll('.action-section').forEach(section => {
                    section.classList.remove('show');
                });

                // Select current card and show corresponding actions
                event.target.closest('.user-type-card').classList.add('selected');
                document.getElementById(type + '-actions').classList.add('show');
            }
        </script>
    </body>
    </html>
  `);
});

// Dashboard route - handles athlete selection for coaches
app.get('/dashboard', requireAuth, async (req, res) => {
  console.log('Dashboard route accessed by user:', req.user.id, 'role:', req.user.role);
  try {
    if (req.user.role === 'athlete') {
      // For athletes, find their athlete record and redirect to their dashboard
      const athleteAccess = await authService.AthleteAccess.findOne({
        where: {
          userId: req.user.id,
          isApproved: true
        }
      });

      if (!athleteAccess) {
        return res.status(500).send('Athlete data not found. Please contact support.');
      }

      return res.redirect(`/dashboard/${athleteAccess.athleteId}`);
    }

    // For coaches, show athlete selection interface
    const accessibleAthletes = await authService.getUserAccessibleAthletes(req.user.id);

    if (accessibleAthletes.length === 1) {
      // If coach only has access to one athlete, redirect directly
      return res.redirect(`/dashboard/${accessibleAthletes[0].athleteId}`);
    }

    // Show athlete selection page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>👥 Select Athlete - Training Dashboard</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  padding: 20px;
              }
              .header {
                  background: rgba(255, 255, 255, 0.1);
                  color: white;
                  padding: 2rem;
                  text-align: center;
                  margin-bottom: 2rem;
                  border-radius: 15px;
                  backdrop-filter: blur(10px);
              }
              .container {
                  max-width: 800px;
                  margin: 0 auto;
              }
              .athlete-grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                  gap: 2rem;
                  margin-bottom: 2rem;
              }
              .athlete-card {
                  background: white;
                  padding: 2rem;
                  border-radius: 15px;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
                  transition: all 0.3s ease;
                  cursor: pointer;
                  text-decoration: none;
                  color: inherit;
              }
              .athlete-card:hover {
                  transform: translateY(-5px);
                  box-shadow: 0 20px 40px rgba(0,0,0,0.15);
              }
              .athlete-icon {
                  font-size: 3rem;
                  text-align: center;
                  margin-bottom: 1rem;
              }
              .athlete-name {
                  font-size: 1.5rem;
                  font-weight: bold;
                  color: #333;
                  margin-bottom: 0.5rem;
                  text-align: center;
              }
              .athlete-email {
                  color: #666;
                  text-align: center;
                  font-size: 0.9rem;
              }
              .no-athletes {
                  background: white;
                  padding: 3rem;
                  border-radius: 15px;
                  text-align: center;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
              }
              .logout-link {
                  text-align: center;
                  margin-top: 2rem;
              }
              .logout-link a {
                  color: white;
                  text-decoration: none;
                  background: rgba(255, 255, 255, 0.2);
                  padding: 0.8rem 1.5rem;
                  border-radius: 10px;
                  backdrop-filter: blur(10px);
                  transition: all 0.3s ease;
              }
              .logout-link a:hover {
                  background: rgba(255, 255, 255, 0.3);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>👥 Select Athlete Dashboard</h1>
                  <p>Welcome ${req.user.name}! Choose which athlete's training data to view.</p>
              </div>

              ${accessibleAthletes.length > 0 ? `
                <div class="athlete-grid">
                    ${accessibleAthletes.map(access => `
                        <a href="/dashboard/${access.athleteId}" class="athlete-card">
                            <div class="athlete-icon">🏃‍♂️</div>
                            <div class="athlete-name">${access.Athlete.name}</div>
                            <div class="athlete-email">${access.Athlete.email}</div>
                        </a>
                    `).join('')}
                </div>
              ` : `
                <div class="no-athletes">
                    <h3>🤷‍♂️ No Athlete Access</h3>
                    <p>You don't currently have access to any athlete dashboards.</p>
                    <p>Ask an athlete to approve your access through their user management page.</p>
                </div>
              `}

              <div class="logout-link">
                  <a href="/logout">🚪 Logout</a>
              </div>
          </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Dashboard route error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send('Failed to load dashboard: ' + error.message);
  }
});

// Athlete-specific dashboard
app.get('/dashboard/:athleteId', requireAuth, requireAthleteAccess, (req, res) => {
  console.log('Athlete-specific dashboard accessed by user:', req.user.id, 'for athlete:', req.params.athleteId);
  try {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏃‍♂️ Strava Training Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: #f5f7fa; 
                color: #333;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                text-align: center;
            }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .nav-tabs {
                display: flex;
                background: white;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .nav-tab {
                flex: 1;
                padding: 15px;
                background: white;
                border: none;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 14px;
                font-weight: 500;
            }
            .nav-tab:hover { background: #f8f9ff; }
            .nav-tab.active { background: #667eea; color: white; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
            .card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .card h3 { margin-bottom: 15px; color: #667eea; }
            .sync-section {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 20px;
                padding: 15px;
                background: #f8f9ff;
                border-radius: 8px;
            }
            .sync-section input {
                padding: 8px 12px;
                border: 2px solid #ddd;
                border-radius: 4px;
                width: 80px;
            }
            .btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.3s ease;
            }
            .btn:hover { background: #5a6fd8; }
            .btn:disabled { background: #ccc; cursor: not-allowed; }
            .status { 
                padding: 10px; 
                border-radius: 4px; 
                margin-top: 10px;
                font-weight: 500;
            }
            .status.success { background: #d4edda; color: #155724; }
            .status.error { background: #f8d7da; color: #721c24; }
            .status.loading { background: #cce7ff; color: #004085; }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #eee;
            }
            th {
                background: #f8f9ff;
                font-weight: 600;
                color: #667eea;
            }
            .chart-container {
                position: relative;
                height: 400px;
                margin-bottom: 20px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }
            .stat-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .stat-value {
                font-size: 24px;
                font-weight: bold;
                color: #667eea;
                margin-bottom: 5px;
            }
            .stat-label { font-size: 14px; color: #666; }
            .loading { text-align: center; padding: 40px; color: #666; }
            .week-group {
                margin-bottom: 30px;
                border: 1px solid #eee;
                border-radius: 8px;
                overflow: hidden;
            }
            .week-header {
                background: #f8f9ff;
                padding: 15px 20px;
                border-bottom: 1px solid #eee;
                font-weight: 600;
                color: #667eea;
            }
            .week-summary {
                background: #f0f4ff;
                padding: 10px 20px;
                font-size: 14px;
                color: #555;
                display: flex;
                gap: 20px;
                flex-wrap: wrap;
            }
            .daily-table {
                width: 100%;
                border-collapse: collapse;
            }
            .daily-table th,
            .daily-table td {
                padding: 10px;
                text-align: left;
                border-bottom: 1px solid #f0f0f0;
                font-size: 13px;
            }
            .daily-table th {
                background: #fafafa;
                font-weight: 600;
                color: #333;
            }
            .daily-table tr:hover {
                background: #f8f9ff;
            }
            .no-activity-day {
                color: #999;
                font-style: italic;
                text-align: center;
            }
            .rpe-tooltip {
                position: relative;
                cursor: help;
                border-bottom: 1px dotted #667eea;
                color: #667eea;
            }
            .rpe-tooltip:hover::after {
                content: "Rate of Perceived Effort - subjective measure of exercise intensity (1-10 scale)";
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
            }
            .equipment-info {
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .notes-cell {
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .notes-cell:hover {
                white-space: normal;
                overflow: visible;
            }
            .week-ai-summary {
                background: #f0f8ff;
                padding: 15px 20px;
                margin: 10px 0;
                border-left: 4px solid #667eea;
                border-radius: 0 4px 4px 0;
            }
            .week-ai-summary h4 {
                margin: 0 0 8px 0;
                color: #667eea;
                font-size: 14px;
            }
            .week-ai-summary p {
                margin: 0;
                line-height: 1.5;
                color: #555;
                font-size: 13px;
            }
            .out-of-month {
                background: #f9f9f9;
                color: #999;
            }
            .out-of-month td {
                border-color: #f0f0f0;
            }
            
            /* Mobile Responsive Styles */
            @media (max-width: 768px) {
                .header {
                    padding: 15px 10px;
                }
                .header h1 {
                    font-size: 24px;
                }
                .header p {
                    font-size: 14px;
                }
                .container {
                    padding: 10px;
                }
                .nav-tabs {
                    flex-wrap: wrap;
                    margin-bottom: 15px;
                }
                .nav-tab {
                    flex: none;
                    min-width: 80px;
                    font-size: 12px;
                    padding: 10px 8px;
                    text-align: center;
                }
                .card {
                    padding: 15px;
                    margin-bottom: 15px;
                }
                .sync-section {
                    flex-direction: column;
                    gap: 10px;
                    align-items: stretch;
                }
                .sync-section input {
                    width: 100%;
                    max-width: 120px;
                }
                .stats-grid {
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .stat-card {
                    padding: 15px 10px;
                }
                .stat-value {
                    font-size: 20px;
                }
                .chart-container {
                    height: 300px;
                }
                table {
                    font-size: 12px;
                }
                th, td {
                    padding: 8px 4px;
                }
                .daily-table th,
                .daily-table td {
                    padding: 6px 3px;
                    font-size: 11px;
                }
                .equipment-info {
                    max-width: 80px;
                }
                .notes-cell {
                    max-width: 100px;
                }
                .week-summary {
                    flex-direction: column;
                    gap: 8px;
                }
                .week-ai-summary {
                    padding: 10px 15px;
                    font-size: 12px;
                }
            }
            
            @media (max-width: 480px) {
                .nav-tabs {
                    justify-content: center;
                }
                .nav-tab {
                    min-width: 60px;
                    font-size: 10px;
                    padding: 8px 4px;
                }
                .stats-grid {
                    grid-template-columns: 1fr;
                }
                .chart-container {
                    height: 250px;
                }
                .daily-table {
                    display: block;
                    overflow-x: auto;
                    white-space: nowrap;
                }
                .sync-section > * {
                    text-align: center;
                }
                .btn {
                    width: 100%;
                    max-width: 200px;
                }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1>🏃‍♂️ Strava Training Dashboard</h1>
                    <p>Comprehensive training analytics and activity management</p>
                </div>
                <div style="text-align: right;">
                    <div style="margin-bottom: 0.5rem;">
                        <span style="font-size: 0.9rem; color: #666;">Logged in as:</span><br>
                        <strong>${req.user.name}</strong>
                        ${req.user.avatar ? `<img src="${req.user.avatar}" alt="Avatar" style="width: 30px; height: 30px; border-radius: 50%; margin-left: 10px; vertical-align: middle;">` : ''}
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: flex-end;">
                        ${req.user.role === 'athlete' ? `<a href="/admin" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.9rem; width: auto;">👥 Manage Users</a>` : ''}
                        <a href="/logout" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.9rem; width: auto;">🚪 Logout</a>
                    </div>
                </div>
            </div>
        </div>

        <div class="container">
            <!-- Sync Section -->
            <div class="card">
                <h3>🔄 Sync Activities</h3>
                <div class="sync-section">
                    <label>Activities to sync:</label>
                    <input type="number" id="activityCount" value="3" min="1" max="200">
                    <button class="btn" onclick="syncActivities()">Sync Activities</button>
                </div>
                <div id="syncStatus"></div>
            </div>

            <!-- Navigation -->
            <div class="nav-tabs">
                <button class="nav-tab active" onclick="showTab('overview')">📊 Overview</button>
                <button class="nav-tab" onclick="showTab('daily')">📆 Daily</button>
                <button class="nav-tab" onclick="showTab('activities')">🏃 Activities</button>
                <button class="nav-tab" onclick="showTab('weekly')">📅 Weekly</button>
                <button class="nav-tab" onclick="showTab('monthly')">📈 Monthly</button>
                <button class="nav-tab" onclick="showTab('summaries')">📝 Summaries</button>
            </div>

            <!-- Overview Tab -->
            <div id="overview" class="tab-content active">
                <div class="stats-grid" id="overviewStats">
                    <div class="loading">Loading overview statistics...</div>
                </div>
                
                <div class="card">
                    <h3>📈 Activity Trends (Last 30 Days)</h3>
                    <div class="chart-container">
                        <canvas id="trendsChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Daily Tab -->
            <div id="daily" class="tab-content">
                <div class="card">
                    <div class="daily-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3>📆 Daily Training Log</h3>
                        <div class="daily-controls" style="display: flex; align-items: center; gap: 10px;">
                            <label for="monthSelector" style="font-weight: 500;">Month:</label>
                            <select id="monthSelector" onchange="loadDailyData()" style="padding: 8px; border: 2px solid #ddd; border-radius: 4px; background: white; min-width: 150px;">
                                <!-- Options populated by JavaScript -->
                            </select>
                        </div>
                    </div>
                    <div id="dailyContent">
                        <div class="loading">Loading daily training data...</div>
                    </div>
                </div>
            </div>

            <!-- Activities Tab -->
            <div id="activities" class="tab-content">
                <div class="card">
                    <h3>🏃 Recent Activities</h3>
                    <div id="activitiesTable">
                        <div class="loading">Loading activities...</div>
                    </div>
                </div>
            </div>

            <!-- Weekly Tab -->
            <div id="weekly" class="tab-content">
                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h3>📅 Weekly Analysis</h3>
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <label for="activityTypeFilter" style="font-weight: 500;">Activity Types:</label>
                            <select id="activityTypeFilter" multiple style="padding: 8px; border: 2px solid #ddd; border-radius: 4px; background: white; min-width: 200px;">
                                <!-- Options populated by JavaScript -->
                            </select>
                            <button onclick="updateWeeklyChart()" class="btn" style="padding: 6px 12px; font-size: 12px;">Update Chart</button>
                        </div>
                    </div>
                    <div class="chart-container">
                        <canvas id="weeklyChart"></canvas>
                    </div>
                </div>
                
                <div class="card">
                    <h3>📊 Weekly Statistics</h3>
                    <div id="weeklyStats">
                        <div class="loading">Loading weekly statistics...</div>
                    </div>
                </div>
            </div>

            <!-- Monthly Tab -->
            <div id="monthly" class="tab-content">
                <div class="card">
                    <h3>📈 Monthly Trends</h3>
                    <div class="chart-container">
                        <canvas id="monthlyChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Summaries Tab -->
            <div id="summaries" class="tab-content">
                <div class="card">
                    <h3>📝 Weekly Summaries</h3>
                    <div id="summariesContent">
                        <div class="loading">Loading weekly summaries...</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let currentTab = 'overview';
            let activities = [];
            let summaries = [];

            // Tab management
            function showTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                
                document.getElementById(tabName).classList.add('active');
                event.target.classList.add('active');
                
                currentTab = tabName;
                loadTabData(tabName);
            }

            // Sync activities
            async function syncActivities() {
                const status = document.getElementById('syncStatus');
                const activityCount = document.getElementById('activityCount').value;
                const btn = event.target;
                
                btn.disabled = true;
                status.innerHTML = \`<div class="status loading">⏳ Syncing \${activityCount} activities...</div>\`;
                
                try {
                    const response = await fetch(\`/sync?count=\${activityCount}\`);
                    const result = await response.text();
                    status.innerHTML = \`<div class="status success">✅ \${result}</div>\`;
                    
                    // Refresh current tab data
                    setTimeout(() => loadTabData(currentTab), 1000);
                } catch (error) {
                    status.innerHTML = \`<div class="status error">❌ Error: \${error.message}</div>\`;
                } finally {
                    btn.disabled = false;
                }
            }

            // Load data for specific tab
            async function loadTabData(tabName) {
                switch(tabName) {
                    case 'overview':
                        loadOverview();
                        break;
                    case 'daily':
                        initializeDailyTab();
                        break;
                    case 'activities':
                        loadActivities();
                        break;
                    case 'weekly':
                        loadWeeklyAnalysis();
                        break;
                    case 'monthly':
                        loadMonthlyAnalysis();
                        break;
                    case 'summaries':
                        loadSummaries();
                        break;
                }
            }

            // Load overview statistics
            async function loadOverview() {
                try {
                    const response = await fetch('/api/overview');
                    const data = await response.json();
                    
                    document.getElementById('overviewStats').innerHTML = \`
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalActivities}</div>
                            <div class="stat-label">Total Activities</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalDistance}</div>
                            <div class="stat-label">Total Distance (mi)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalTime}</div>
                            <div class="stat-label">Total Time (hrs)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.avgHeartRate}</div>
                            <div class="stat-label">Avg Heart Rate</div>
                        </div>
                    \`;
                    
                    // Create trends chart
                    createTrendsChart(data.trendsData);
                } catch (error) {
                    document.getElementById('overviewStats').innerHTML = '<div class="error">Failed to load overview data</div>';
                }
            }

            // Load activities table
            async function loadActivities() {
                try {
                    const response = await fetch('/api/activities');
                    activities = await response.json();
                    
                    const tableHTML = \`
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Distance</th>
                                    <th>Duration</th>
                                    <th>Avg HR</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${activities.map(activity => \`
                                    <tr>
                                        <td>\${new Date(activity.Date || activity.start_date_local).toLocaleDateString()}</td>
                                        <td>\${activity.Name || activity.name}</td>
                                        <td>\${activity.Type || activity.sport_type}</td>
                                        <td>\${activity['Distance (mi)'] || (activity.distance / 1609.34).toFixed(1)} mi</td>
                                        <td>\${activity['Moving Time (min)'] || Math.round(activity.moving_time / 60)} min</td>
                                        <td>\${activity['Avg Heart Rate'] || activity.average_heartrate || 'N/A'}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                    
                    document.getElementById('activitiesTable').innerHTML = tableHTML;
                } catch (error) {
                    document.getElementById('activitiesTable').innerHTML = '<div class="error">Failed to load activities</div>';
                }
            }

            // Load weekly analysis
            async function loadWeeklyAnalysis() {
                try {
                    const response = await fetch('/api/weekly');
                    const data = await response.json();
                    
                    // Populate activity type selector
                    const activityTypeFilter = document.getElementById('activityTypeFilter');
                    activityTypeFilter.innerHTML = data.allActivityTypes.map(type => 
                        '<option value="' + type + '" selected>' + type + '</option>'
                    ).join('');
                    
                    // Store data globally for chart updates
                    window.weeklyData = data;
                    
                    createWeeklyChart(data);
                    
                    document.getElementById('weeklyStats').innerHTML = 
                        '<div class="stats-grid">' +
                            '<div class="stat-card">' +
                                '<div class="stat-value">' + data.thisWeek.activities + '</div>' +
                                '<div class="stat-label">This Week Activities</div>' +
                            '</div>' +
                            '<div class="stat-card">' +
                                '<div class="stat-value">' + data.thisWeek.distance + '</div>' +
                                '<div class="stat-label">This Week Distance</div>' +
                            '</div>' +
                            '<div class="stat-card">' +
                                '<div class="stat-value">' + data.lastWeek.activities + '</div>' +
                                '<div class="stat-label">Last Week Activities</div>' +
                            '</div>' +
                            '<div class="stat-card">' +
                                '<div class="stat-value">' + data.lastWeek.distance + '</div>' +
                                '<div class="stat-label">Last Week Distance</div>' +
                            '</div>' +
                        '</div>';
                } catch (error) {
                    document.getElementById('weeklyStats').innerHTML = '<div class="error">Failed to load weekly data</div>';
                }
            }

            // Update weekly chart with selected activity types
            async function updateWeeklyChart() {
                const activityTypeFilter = document.getElementById('activityTypeFilter');
                const selectedTypes = Array.from(activityTypeFilter.selectedOptions).map(option => option.value);
                
                if (selectedTypes.length === 0) {
                    alert('Please select at least one activity type');
                    return;
                }
                
                try {
                    const response = await fetch('/api/weekly?types=' + selectedTypes.join(','));
                    const data = await response.json();
                    
                    createWeeklyChart(data);
                    window.weeklyData = data;
                } catch (error) {
                    console.error('Failed to update weekly chart:', error);
                }
            }

            // Load monthly analysis
            async function loadMonthlyAnalysis() {
                try {
                    const response = await fetch('/api/monthly');
                    const data = await response.json();
                    
                    createMonthlyChart(data);
                } catch (error) {
                    console.error('Failed to load monthly data');
                }
            }

            // Initialize Daily tab
            async function initializeDailyTab() {
                // Populate month selector
                const monthSelector = document.getElementById('monthSelector');
                const currentDate = new Date();
                const months = [];
                
                // Generate last 12 months
                for (let i = 0; i < 12; i++) {
                    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                    months.push({
                        value: date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'),
                        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    });
                }
                
                const currentMonthValue = currentDate.getFullYear() + '-' + String(currentDate.getMonth() + 1).padStart(2, '0');
                monthSelector.innerHTML = months.map(month => 
                    '<option value="' + month.value + '"' + (month.value === currentMonthValue ? ' selected' : '') + '>' + month.label + '</option>'
                ).join('');
                
                loadDailyData();
            }

            // Load daily data for selected month
            async function loadDailyData() {
                const monthSelector = document.getElementById('monthSelector');
                const selectedMonth = monthSelector.value;
                
                try {
                    const response = await fetch('/api/daily?month=' + selectedMonth);
                    const data = await response.json();
                    
                    displayDailyData(data);
                } catch (error) {
                    document.getElementById('dailyContent').innerHTML = '<div class="error">Failed to load daily data</div>';
                }
            }

            // Display daily data grouped by weeks
            function displayDailyData(data) {
                const dailyContent = document.getElementById('dailyContent');
                
                if (!data.weeks || data.weeks.length === 0) {
                    dailyContent.innerHTML = '<p>No activities found for this month.</p>';
                    return;
                }
                
                let html = '';
                
                data.weeks.forEach(week => {
                    html += '<div class="week-group">' +
                        '<div class="week-header">Week of ' + week.weekStart + ' - ' + week.weekEnd + '</div>' +
                        '<div class="week-summary">' +
                            '<span><strong>Total Distance:</strong> ' + week.summary.totalDistance + ' mi</span>' +
                            '<span><strong>Total Time:</strong> ' + week.summary.totalTime + '</span>' +
                            '<span><strong>Activities:</strong> ' + week.summary.totalActivities + '</span>' +
                            '<span><strong>Elevation:</strong> ' + week.summary.totalElevation + ' ft</span>' +
                        '</div>' +
                        (week.aiSummary ? 
                            '<div class="week-ai-summary">' +
                                '<h4>📝 Weekly Summary</h4>' +
                                '<p>' + week.aiSummary + '</p>' +
                            '</div>' : '') +
                        '<table class="daily-table">' +
                            '<thead>' +
                                '<tr>' +
                                    '<th>Date</th>' +
                                    '<th>Activity</th>' +
                                    '<th>Distance (mi)</th>' +
                                    '<th>Duration</th>' +
                                    '<th>Elevation (ft)</th>' +
                                    '<th>Equipment</th>' +
                                    '<th><span class="rpe-tooltip">RPE</span></th>' +
                                    '<th>Location</th>' +
                                    '<th>Notes</th>' +
                                '</tr>' +
                            '</thead>' +
                            '<tbody>' +
                                week.days.map(day => {
                                    const rowClass = day.isInTargetMonth ? '' : ' class="out-of-month"';
                                    if (day.activities.length === 0) {
                                        // Don't show "Rest Day" for future dates
                                        const dayDate = new Date(day.dateObj);
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        
                                        if (dayDate > today) {
                                            return '<tr' + rowClass + '><td>' + day.date + '</td><td class="no-activity-day" colspan="8"></td></tr>';
                                        } else {
                                            return '<tr' + rowClass + '><td>' + day.date + '</td><td class="no-activity-day" colspan="8">Rest Day</td></tr>';
                                        }
                                    }
                                    return day.activities.map(activity => 
                                        '<tr' + rowClass + '>' +
                                            '<td>' + day.date + '</td>' +
                                            '<td>' + activity.name + '</td>' +
                                            '<td>' + activity.distance + '</td>' +
                                            '<td>' + activity.duration + '</td>' +
                                            '<td>' + activity.elevation + '</td>' +
                                            '<td class="equipment-info" title="' + activity.equipmentFull + '">' + activity.equipment + '</td>' +
                                            '<td>' + activity.rpe + '</td>' +
                                            '<td>' + activity.location + '</td>' +
                                            '<td class="notes-cell" title="' + activity.notes + '">' + activity.notes + '</td>' +
                                        '</tr>'
                                    ).join('');
                                }).join('') +
                            '</tbody>' +
                        '</table>' +
                    '</div>';
                });
                
                dailyContent.innerHTML = html;
            }

            // Load summaries
            async function loadSummaries() {
                try {
                    const response = await fetch('/api/summaries');
                    summaries = await response.json();
                    
                    const summariesHTML = summaries.map(summary => \`
                        <div class="card">
                            <h4>Week \${summary['Week Number']}, \${summary['Year']} - \${summary['Week Range']}</h4>
                            <p><strong>Activities:</strong> \${summary['Total Activities']} (\${summary['Activities With Notes']} with notes)</p>
                            <div style="margin-top: 10px; padding: 15px; background: #f8f9ff; border-radius: 4px;">
                                \${summary['AI Summary']}
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('summariesContent').innerHTML = summariesHTML || '<p>No weekly summaries found.</p>';
                } catch (error) {
                    document.getElementById('summariesContent').innerHTML = '<div class="error">Failed to load summaries</div>';
                }
            }

            // Chart creation functions
            function createTrendsChart(data) {
                const ctx = document.getElementById('trendsChart').getContext('2d');
                
                // Destroy existing chart if it exists
                const existingChart = Chart.getChart('trendsChart');
                if (existingChart) {
                    existingChart.destroy();
                }
                
                window.trendsChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [
                            {
                                label: 'Distance (mi)',
                                data: data.distances,
                                borderColor: '#667eea',
                                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                                tension: 0.4,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Time (min)',
                                data: data.times,
                                borderColor: '#fa709a',
                                backgroundColor: 'rgba(250, 112, 154, 0.1)',
                                tension: 0.4,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        scales: {
                            x: {
                                display: true,
                                title: {
                                    display: true,
                                    text: 'Date'
                                }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                title: {
                                    display: true,
                                    text: 'Distance (miles)'
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                title: {
                                    display: true,
                                    text: 'Time (minutes)'
                                },
                                grid: {
                                    drawOnChartArea: false,
                                }
                            }
                        },
                        plugins: {
                            title: {
                                display: true,
                                text: 'Activity Trends - Distance & Time (Last 30 Days)'
                            },
                            legend: { 
                                display: true,
                                position: 'top'
                            }
                        }
                    }
                });
            }

            function createWeeklyChart(data) {
                const ctx = document.getElementById('weeklyChart').getContext('2d');
                
                // Destroy existing chart if it exists
                const existingChart = Chart.getChart('weeklyChart');
                if (existingChart) {
                    existingChart.destroy();
                }
                
                // Create datasets for each activity type with different colors
                const colors = [
                    '#667eea', '#f093fb', '#4facfe', '#43e97b', 
                    '#fa709a', '#fee140', '#a8edea', '#ffecd2',
                    '#ff9a9e', '#a8caba', '#fbc2eb', '#84fab0'
                ];
                
                const datasets = data.selectedTypes.map((type, index) => ({
                    label: type,
                    data: data.activityTypeData[type],
                    backgroundColor: colors[index % colors.length],
                    borderColor: colors[index % colors.length],
                    borderWidth: 1
                }));
                
                window.weeklyChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.weeks,
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { stacked: true },
                            y: { 
                                stacked: true,
                                title: {
                                    display: true,
                                    text: 'Distance (miles)'
                                }
                            }
                        },
                        plugins: {
                            title: {
                                display: true,
                                text: 'Weekly Distance by Activity Type'
                            },
                            legend: {
                                display: true,
                                position: 'top'
                            }
                        }
                    }
                });
            }

            function createMonthlyChart(data) {
                const ctx = document.getElementById('monthlyChart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.months,
                        datasets: [{
                            label: 'Monthly Distance (mi)',
                            data: data.distances,
                            borderColor: '#764ba2',
                            backgroundColor: 'rgba(118, 75, 162, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            }

            // Initialize dashboard
            document.addEventListener('DOMContentLoaded', function() {
                loadTabData('overview');
            });
        </script>
    </body>
    </html>
  `);
  } catch (error) {
    console.error('Athlete dashboard error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send('Failed to load athlete dashboard: ' + error.message);
  }
});

// Sync endpoint
app.get('/sync', requireAuth, async (req, res) => {
  try {
    const activityCount = parseInt(req.query.count) || 3; // Default to 3 if not provided
    
    // Validate the count
    if (activityCount < 1 || activityCount > 200) {
      return res.status(400).send('Activity count must be between 1 and 200');
    }
    
    console.log(`Starting sync from web trigger... (${activityCount} activities)`);
    
    const stravaApp = new StravaConnectApp();
    await stravaApp.syncActivities(activityCount);
    res.send(`Sync completed successfully! Processed ${activityCount} activities.`);
  } catch (error) {
    console.error('Sync error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).send('Sync failed: ' + error.message);
  }
});

// API Endpoints for dashboard data
app.get('/api/overview', requireAuth, async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Calculate overview statistics
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, activity) => {
      const distance = parseFloat(activity['Distance (mi)']) || 0;
      return sum + distance;
    }, 0).toFixed(1);
    
    const totalTime = activities.reduce((sum, activity) => {
      const time = parseFloat(activity['Moving Time (min)']) || 0;
      return sum + time;
    }, 0);
    
    const avgHeartRate = activities.filter(a => a['Avg Heart Rate'] && a['Avg Heart Rate'] !== 'N/A')
      .reduce((sum, activity, _, arr) => {
        return sum + (parseFloat(activity['Avg Heart Rate']) || 0) / arr.length;
      }, 0).toFixed(0);

    // Prepare trends data (last 30 days)
    const last30Days = activities
      .filter(activity => {
        const activityDate = new Date(activity.Date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return activityDate >= thirtyDaysAgo;
      })
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const trendsData = {
      labels: last30Days.map(activity => new Date(activity.Date).toLocaleDateString()),
      distances: last30Days.map(activity => parseFloat(activity['Distance (mi)']) || 0),
      times: last30Days.map(activity => parseFloat(activity['Moving Time (min)']) || 0)
    };

    res.json({
      totalActivities,
      totalDistance,
      totalTime: (totalTime / 60).toFixed(1),
      avgHeartRate: avgHeartRate || 'N/A',
      trendsData
    });
  } catch (error) {
    console.error('Overview API error:', error);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

app.get('/api/activities', requireAuth, async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Sort by date, most recent first
    const sortedActivities = activities.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
    res.json(sortedActivities.slice(0, 50)); // Return last 50 activities
  } catch (error) {
    console.error('Activities API error:', error);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

app.get('/api/weekly', requireAuth, async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    const { types } = req.query; // Optional activity type filter
    
    console.log(`Weekly API: Found ${activities.length} activities`);
    if (activities.length > 0) {
      console.log('Sample activity:', {
        Date: activities[0].Date,
        Distance: activities[0]['Distance (mi)'],
        Name: activities[0].Name
      });
    }
    
    // Calculate weekly statistics with better error handling
    const now = new Date();
    const thisWeekStart = new Date(now);
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Handle Sunday = 0
    thisWeekStart.setDate(now.getDate() - daysFromMonday);
    thisWeekStart.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
    lastWeekEnd.setHours(23, 59, 59, 999);
    
    console.log('Date ranges:', {
      thisWeekStart: thisWeekStart.toISOString(),
      lastWeekStart: lastWeekStart.toISOString(),
      lastWeekEnd: lastWeekEnd.toISOString()
    });
    
    const thisWeekActivities = activities.filter(activity => {
      if (!activity.Date) return false;
      const date = new Date(activity.Date);
      const isValid = !isNaN(date.getTime());
      const inRange = date >= thisWeekStart;
      return isValid && inRange;
    });
    
    const lastWeekActivities = activities.filter(activity => {
      if (!activity.Date) return false;
      const date = new Date(activity.Date);
      const isValid = !isNaN(date.getTime());
      const inRange = date >= lastWeekStart && date <= lastWeekEnd;
      return isValid && inRange;
    });
    
    console.log(`This week: ${thisWeekActivities.length}, Last week: ${lastWeekActivities.length}`);
    
    // Get available activity types and apply filter
    const allActivityTypes = [...new Set(activities.map(a => a.Type || a['Type'] || 'Unknown').filter(Boolean))];
    const selectedTypes = types ? types.split(',') : allActivityTypes;
    
    console.log('Available activity types:', allActivityTypes);
    console.log('Selected types:', selectedTypes);
    
    // Prepare weekly chart data (last 8 weeks) with activity type breakdown
    const weeks = [];
    const activityTypeData = {};
    
    // Initialize data structure for each activity type
    selectedTypes.forEach(type => {
      activityTypeData[type] = [];
    });
    
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      const weekDayOfWeek = now.getDay();
      const weekDaysFromMonday = weekDayOfWeek === 0 ? 6 : weekDayOfWeek - 1;
      weekStart.setDate(now.getDate() - weekDaysFromMonday - (i * 7));
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const weekActivities = activities.filter(activity => {
        if (!activity.Date) return false;
        const date = new Date(activity.Date);
        const activityType = activity.Type || activity['Type'] || 'Unknown';
        const isValid = !isNaN(date.getTime());
        const inRange = date >= weekStart && date <= weekEnd;
        const typeMatch = selectedTypes.includes(activityType);
        return isValid && inRange && typeMatch;
      });
      
      weeks.push(`${weekStart.getMonth() + 1}/${weekStart.getDate()}`);
      
      // Calculate distance by activity type for this week
      selectedTypes.forEach(type => {
        const typeActivities = weekActivities.filter(activity => {
          const activityType = activity.Type || activity['Type'] || 'Unknown';
          return activityType === type;
        });
        
        const typeDistance = typeActivities.reduce((sum, activity) => {
          const distance = parseFloat(activity['Distance (mi)']);
          return sum + (isNaN(distance) ? 0 : distance);
        }, 0);
        
        activityTypeData[type].push(parseFloat(typeDistance.toFixed(1)));
      });
    }
    
    // Calculate distances with better error handling
    const thisWeekDistance = thisWeekActivities.reduce((sum, activity) => {
      const distance = parseFloat(activity['Distance (mi)']);
      return sum + (isNaN(distance) ? 0 : distance);
    }, 0);
    
    const lastWeekDistance = lastWeekActivities.reduce((sum, activity) => {
      const distance = parseFloat(activity['Distance (mi)']);
      return sum + (isNaN(distance) ? 0 : distance);
    }, 0);
    
    const result = {
      thisWeek: {
        activities: thisWeekActivities.length,
        distance: thisWeekDistance.toFixed(1)
      },
      lastWeek: {
        activities: lastWeekActivities.length,
        distance: lastWeekDistance.toFixed(1)
      },
      weeks,
      activityTypeData,
      allActivityTypes,
      selectedTypes
    };
    
    console.log('Weekly API result:', result);
    res.json(result);
    
  } catch (error) {
    console.error('Weekly API error details:', error);
    res.status(500).json({ 
      error: 'Failed to load weekly data',
      details: error.message 
    });
  }
});

app.get('/api/monthly', requireAuth, async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Calculate monthly data (last 12 months)
    const months = [];
    const distances = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthActivities = activities.filter(activity => {
        const date = new Date(activity.Date);
        return date >= monthStart && date <= monthEnd;
      });
      
      const monthDistance = monthActivities.reduce((sum, activity) => {
        return sum + (parseFloat(activity['Distance (mi)']) || 0);
      }, 0);
      
      months.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      distances.push(monthDistance.toFixed(1));
    }
    
    res.json({ months, distances });
  } catch (error) {
    console.error('Monthly API error:', error);
    res.status(500).json({ error: 'Failed to load monthly data' });
  }
});

app.get('/api/daily', requireAuth, async (req, res) => {
  try {
    const { month } = req.query; // Format: YYYY-MM
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    console.log(`Daily API: Requested month ${month}, found ${activities.length} total activities`);
    
    // Parse month
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0); // Last day of month
    monthEnd.setHours(23, 59, 59, 999);
    
    // Filter activities for the month
    const monthActivities = activities.filter(activity => {
      if (!activity.Date) return false;
      const date = new Date(activity.Date);
      return date >= monthStart && date <= monthEnd;
    }).sort((a, b) => new Date(a.Date) - new Date(b.Date));
    
    console.log(`Daily API: Found ${monthActivities.length} activities for ${month}`);
    
    // Get AI summaries for reference
    const summaries = await stravaApp.sheetsService.getExistingWeeklySummaries();
    console.log(`Found ${summaries.length} AI summaries`);
    
    // Group activities by weeks (Monday start) - show full weeks even if they extend beyond month
    const weeks = [];
    let currentWeekStart = new Date(monthStart);
    
    // Adjust to start on Monday of the first week that contains any day of the month
    const dayOfWeek = currentWeekStart.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setDate(currentWeekStart.getDate() - daysFromMonday);
    
    // Continue until we've covered all weeks that intersect with the month
    const monthEndExtended = new Date(monthEnd);
    monthEndExtended.setDate(monthEnd.getDate() + 6); // Add a week buffer
    
    while (currentWeekStart <= monthEndExtended) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      // Get activities for this week
      const weekActivities = monthActivities.filter(activity => {
        const date = new Date(activity.Date);
        return date >= currentWeekStart && date <= weekEnd;
      });
      
      // Create days array for the week (always show full 7 days)
      const days = [];
      const hasMonthDays = [];
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(currentWeekStart);
        dayDate.setDate(currentWeekStart.getDate() + d);
        
        // Mark if this day is in the target month
        const isInTargetMonth = dayDate >= monthStart && dayDate <= monthEnd;
        hasMonthDays.push(isInTargetMonth);
        
        const dayActivities = weekActivities.filter(activity => {
          const actDate = new Date(activity.Date);
          return actDate.toDateString() === dayDate.toDateString();
        }).map(activity => ({
          name: activity.Name || 'Unknown Activity',
          distance: (parseFloat(activity['Distance (mi)']) || 0).toFixed(1),
          duration: activity['Moving Time (min)'] ? `${activity['Moving Time (min)']} min` : 'N/A',
          elevation: (parseFloat(activity['Elevation Gain (ft)']) || 0).toFixed(0),
          equipment: formatEquipment(activity),
          equipmentFull: getFullEquipmentInfo(activity),
          rpe: activity['Perceived Exertion'] || 'N/A',
          location: activity['Location Name'] || activity['Detected City'] || 'Unknown',
          notes: activity['Private Notes'] || activity['Description'] || 'No notes'
        }));
        
        days.push({
          date: dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
          dateObj: dayDate.toISOString().split('T')[0], // Include YYYY-MM-DD format for comparison
          activities: dayActivities,
          isInTargetMonth: isInTargetMonth
        });
      }
      
      // Calculate week summary
      const weekSummary = {
        totalDistance: weekActivities.reduce((sum, a) => sum + (parseFloat(a['Distance (mi)']) || 0), 0).toFixed(1),
        totalTime: formatTotalTime(weekActivities.reduce((sum, a) => sum + (parseFloat(a['Moving Time (min)']) || 0), 0)),
        totalActivities: weekActivities.length,
        totalElevation: weekActivities.reduce((sum, a) => sum + (parseFloat(a['Elevation Gain (ft)']) || 0), 0).toFixed(0)
      };
      
      // Find matching AI summary for this week
      const weekNumber = getWeekNumber(currentWeekStart);
      const weekYear = currentWeekStart.getFullYear();
      const matchingSummary = summaries.find(summary => {
        return summary['Week Number'] == weekNumber && summary['Year'] == weekYear;
      });
      
      // Only add week if it intersects with the target month
      const hasTargetMonthDays = hasMonthDays.some(inMonth => inMonth);
      if (hasTargetMonthDays) {
        weeks.push({
          weekStart: currentWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          weekEnd: weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          days: days,
          summary: weekSummary,
          aiSummary: matchingSummary ? matchingSummary['AI Summary'] : null
        });
      }
      
      // Move to next week
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    
    res.json({ weeks });
    
  } catch (error) {
    console.error('Daily API error:', error);
    res.status(500).json({ error: 'Failed to load daily data' });
  }
});

// Helper functions for daily data
function formatEquipment(activity) {
  const brand = activity['Equipment Brand'];
  const model = activity['Equipment Model'];
  const nickname = activity['Equipment Nickname'];
  
  if (nickname) return nickname;
  if (brand && model) return `${brand} ${model}`.substring(0, 20);
  if (brand) return brand.substring(0, 15);
  return 'N/A';
}

function getFullEquipmentInfo(activity) {
  const brand = activity['Equipment Brand'];
  const model = activity['Equipment Model'];
  const nickname = activity['Equipment Nickname'];
  const name = activity['Equipment Name'];
  
  const parts = [nickname, name, brand, model].filter(Boolean);
  return parts.join(' - ') || 'No equipment info';
}

function formatTotalTime(minutes) {
  if (!minutes || minutes === 0) return '0 min';
  
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} min`;
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

app.get('/api/summaries', requireAuth, async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const summaries = await stravaApp.sheetsService.getExistingWeeklySummaries();
    
    // Group by week and year, keeping only the most recent summary for each week
    const latestSummariesMap = new Map();
    
    summaries.forEach(summary => {
      const weekKey = `${summary['Week Number']}-${summary['Year']}`;
      const generatedDate = new Date(summary['Generated Date']);
      
      if (!latestSummariesMap.has(weekKey)) {
        latestSummariesMap.set(weekKey, summary);
      } else {
        const existing = latestSummariesMap.get(weekKey);
        const existingDate = new Date(existing['Generated Date']);
        
        // Keep the one with the most recent Generated Date
        if (generatedDate > existingDate) {
          latestSummariesMap.set(weekKey, summary);
        }
      }
    });
    
    // Convert back to array and sort by year and week number, most recent first
    const latestSummaries = Array.from(latestSummariesMap.values());
    const sortedSummaries = latestSummaries.sort((a, b) => {
      const yearDiff = parseInt(b.Year) - parseInt(a.Year);
      if (yearDiff !== 0) return yearDiff;
      return parseInt(b['Week Number']) - parseInt(a['Week Number']);
    });
    
    console.log(`Summaries API: Found ${summaries.length} total summaries, returning ${sortedSummaries.length} latest unique summaries`);
    
    res.json(sortedSummaries.slice(0, 20)); // Return last 20 unique summaries
  } catch (error) {
    console.error('Summaries API error:', error);
    res.status(500).json({ error: 'Failed to load summaries' });
  }
});

// Admin interface for athlete access management
app.get('/admin', requireAuth, async (req, res) => {
  if (req.user.role !== 'athlete') {
    return res.status(403).send('<h1>403 Forbidden</h1><p>Only athletes can access user management.</p>');
  }

  try {
    // Find the athlete record for this user
    const athleteAccess = await authService.AthleteAccess.findOne({
      where: {
        userId: req.user.id,
        isApproved: true
      }
    });

    if (!athleteAccess) {
      return res.status(500).send('<h1>500 Error</h1><p>Athlete data not found. Please contact support.</p>');
    }

    const athleteId = athleteAccess.athleteId;

    // Get access requests for this athlete
    const pendingRequests = await authService.getAthleteAccessRequests(athleteId);
    const approvedUsers = await authService.getAthleteApprovedUsers(athleteId);
    
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>👥 User Management - Strava Training Dashboard</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { 
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                  background: #f5f7fa; 
                  color: #333;
              }
              .header {
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 2rem;
                  text-align: center;
                  margin-bottom: 2rem;
              }
              .container {
                  max-width: 1200px;
                  margin: 0 auto;
                  padding: 0 1rem;
              }
              .card {
                  background: white;
                  border-radius: 8px;
                  padding: 20px;
                  margin-bottom: 20px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .user-list {
                  display: grid;
                  gap: 1rem;
              }
              .user-item {
                  background: #f8f9fa;
                  border: 2px solid #e9ecef;
                  border-radius: 8px;
                  padding: 1rem;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
              }
              .user-item.pending {
                  border-color: #ffc107;
                  background: #fff9e6;
              }
              .user-item.approved {
                  border-color: #28a745;
                  background: #e6f7e6;
              }
              .user-info {
                  display: flex;
                  align-items: center;
                  gap: 1rem;
              }
              .user-avatar {
                  width: 40px;
                  height: 40px;
                  border-radius: 50%;
                  background: #667eea;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
              }
              .user-details h4 {
                  margin-bottom: 0.25rem;
              }
              .user-details span {
                  font-size: 0.9rem;
                  color: #666;
              }
              .user-actions {
                  display: flex;
                  gap: 0.5rem;
              }
              .btn {
                  padding: 0.5rem 1rem;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 0.9rem;
                  text-decoration: none;
                  display: inline-block;
                  transition: all 0.3s ease;
              }
              .btn-approve {
                  background: #28a745;
                  color: white;
              }
              .btn-approve:hover {
                  background: #218838;
              }
              .btn-delete {
                  background: #dc3545;
                  color: white;
              }
              .btn-delete:hover {
                  background: #c82333;
              }
              .btn-back {
                  background: #667eea;
                  color: white;
                  margin-bottom: 1rem;
              }
              .btn-back:hover {
                  background: #5a6fd8;
              }
              .status-badge {
                  padding: 0.25rem 0.5rem;
                  border-radius: 12px;
                  font-size: 0.8rem;
                  font-weight: bold;
              }
              .status-pending {
                  background: #ffc107;
                  color: #856404;
              }
              .status-approved {
                  background: #28a745;
                  color: white;
              }
              .provider-badge {
                  padding: 0.2rem 0.4rem;
                  border-radius: 8px;
                  font-size: 0.7rem;
                  font-weight: bold;
                  margin-left: 0.5rem;
              }
              .provider-local {
                  background: #6c757d;
                  color: white;
              }
              .provider-google {
                  background: #4285f4;
                  color: white;
              }
              .provider-strava {
                  background: #fc4c02;
                  color: white;
              }
              .empty-state {
                  text-align: center;
                  padding: 2rem;
                  color: #666;
              }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>👥 User Management</h1>
              <p>Manage coach access to your training data</p>
          </div>
          
          <div class="container">
              <a href="/dashboard" class="btn btn-back">← Back to Dashboard</a>
              
              ${pendingRequests.length > 0 ? `
              <div class="card">
                  <h2>⏳ Pending Access Requests (${pendingRequests.length})</h2>
                  <p style="margin-bottom: 1rem; color: #666;">These coaches are requesting access to your training data.</p>
                  <div class="user-list">
                      ${pendingRequests.map(request => `
                          <div class="user-item pending">
                              <div class="user-info">
                                  <div class="user-avatar">
                                      ${request.User.avatar ? `<img src="${request.User.avatar}" alt="${request.User.name}" style="width: 100%; height: 100%; border-radius: 50%;">` : request.User.name.charAt(0)}
                                  </div>
                                  <div class="user-details">
                                      <h4>${request.User.name}</h4>
                                      <span>${request.User.email}</span>
                                      <span class="provider-badge provider-${request.User.provider}">${request.User.provider.toUpperCase()}</span>
                                      <br><small>Requested: ${new Date(request.createdAt).toLocaleDateString()}</small>
                                      ${request.requestMessage ? `<br><small style="color: #666;">Message: ${request.requestMessage}</small>` : ''}
                                  </div>
                              </div>
                              <div class="user-actions">
                                  <button class="btn btn-approve" onclick="approveAccess(${request.userId}, ${athleteId})">✅ Approve</button>
                                  <button class="btn btn-delete" onclick="rejectAccess(${request.userId}, ${athleteId})">❌ Reject</button>
                              </div>
                          </div>
                      `).join('')}
                  </div>
              </div>
              ` : `
              <div class="card">
                  <div class="empty-state">
                      <h3>✅ No Pending Requests</h3>
                      <p>All access requests have been processed!</p>
                  </div>
              </div>
              `}

              <div class="card">
                  <h2>➕ Add Coach by Email</h2>
                  <p style="margin-bottom: 1rem; color: #666;">Grant access to a coach by entering their email address.</p>
                  <form id="addCoachForm" style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                      <input
                          type="email"
                          id="coachEmail"
                          placeholder="Enter coach's email address"
                          required
                          style="flex: 1; min-width: 250px; padding: 0.75rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem;"
                      >
                      <button
                          type="submit"
                          class="btn btn-approve"
                          style="white-space: nowrap;"
                      >
                          ➕ Add Coach
                      </button>
                  </form>
                  <div id="addCoachMessage" style="margin-top: 1rem; display: none;"></div>
              </div>

              <div class="card">
                  <h2>👥 Approved Coaches (${approvedUsers.length})</h2>
                  <div class="user-list">
                      ${approvedUsers.map(access => `
                          <div class="user-item approved">
                              <div class="user-info">
                                  <div class="user-avatar">
                                      ${access.User.avatar ? `<img src="${access.User.avatar}" alt="${access.User.name}" style="width: 100%; height: 100%; border-radius: 50%;">` : access.User.name.charAt(0)}
                                  </div>
                                  <div class="user-details">
                                      <h4>${access.User.name} 👥</h4>
                                      <span>${access.User.email}</span>
                                      <span class="provider-badge provider-${access.User.provider}">${access.User.provider.toUpperCase()}</span>
                                      <span class="status-badge status-approved">
                                          ${access.accessLevel.charAt(0).toUpperCase() + access.accessLevel.slice(1)} Access
                                      </span>
                                      <br><small>Approved: ${new Date(access.approvedAt).toLocaleDateString()}</small>
                                  </div>
                              </div>
                              <div class="user-actions">
                                  <button class="btn btn-delete" onclick="revokeAccess(${access.userId}, ${athleteId})">🗑️ Revoke Access</button>
                              </div>
                          </div>
                      `).join('')}
                  </div>
              </div>
          </div>
          
          <script>
              async function approveAccess(userId, athleteId) {
                  if (confirm('Approve this coach to access your training data?')) {
                      try {
                          const response = await fetch(\`/admin/approve-access/\${userId}/\${athleteId}\`, { method: 'POST' });
                          if (response.ok) {
                              location.reload();
                          } else {
                              alert('Failed to approve access');
                          }
                      } catch (error) {
                          alert('Error approving access');
                      }
                  }
              }

              async function rejectAccess(userId, athleteId) {
                  if (confirm('Reject this access request? This action cannot be undone.')) {
                      try {
                          const response = await fetch(\`/admin/reject-access/\${userId}/\${athleteId}\`, { method: 'DELETE' });
                          if (response.ok) {
                              location.reload();
                          } else {
                              alert('Failed to reject access');
                          }
                      } catch (error) {
                          alert('Error rejecting access');
                      }
                  }
              }

              async function revokeAccess(userId, athleteId) {
                  if (confirm('Revoke this coach\\'s access to your training data? This action cannot be undone.')) {
                      try {
                          const response = await fetch(\`/admin/revoke-access/\${userId}/\${athleteId}\`, { method: 'DELETE' });
                          if (response.ok) {
                              location.reload();
                          } else {
                              alert('Failed to revoke access');
                          }
                      } catch (error) {
                          alert('Error revoking access');
                      }
                  }
              }

              // Add coach by email functionality
              document.getElementById('addCoachForm').addEventListener('submit', async (e) => {
                  e.preventDefault();

                  const coachEmail = document.getElementById('coachEmail').value.trim();
                  const athleteId = ${athleteId};
                  const messageDiv = document.getElementById('addCoachMessage');
                  const submitBtn = e.target.querySelector('button[type="submit"]');

                  if (!coachEmail) {
                      showMessage('Please enter a coach email address.', 'error');
                      return;
                  }

                  // Disable button and show loading
                  submitBtn.disabled = true;
                  submitBtn.textContent = '⏳ Adding...';

                  try {
                      const response = await fetch('/admin/add-coach', {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                              coachEmail: coachEmail,
                              athleteId: athleteId
                          })
                      });

                      const result = await response.json();

                      if (response.ok) {
                          showMessage(\`✅ \${result.message}\`, 'success');
                          document.getElementById('coachEmail').value = '';
                          // Reload page after 2 seconds to show updated coach list
                          setTimeout(() => location.reload(), 2000);
                      } else {
                          showMessage(\`❌ \${result.error || 'Failed to add coach'}\`, 'error');
                      }
                  } catch (error) {
                      showMessage('❌ Network error. Please try again.', 'error');
                  } finally {
                      // Re-enable button
                      submitBtn.disabled = false;
                      submitBtn.textContent = '➕ Add Coach';
                  }
              });

              function showMessage(text, type) {
                  const messageDiv = document.getElementById('addCoachMessage');
                  messageDiv.textContent = text;
                  messageDiv.style.display = 'block';
                  messageDiv.style.color = type === 'success' ? '#28a745' : '#dc3545';
                  messageDiv.style.fontWeight = 'bold';

                  // Auto-hide success messages after 5 seconds
                  if (type === 'success') {
                      setTimeout(() => {
                          messageDiv.style.display = 'none';
                      }, 5000);
                  }
              }
          </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Admin page error:', error);
    res.status(500).send('<h1>500 Error</h1><p>Failed to load user management page.</p>');
  }
});

// Admin API endpoints for athlete access management
app.post('/admin/approve-access/:userId/:athleteId', requireAuth, async (req, res) => {
  if (req.user.role !== 'athlete') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const userId = parseInt(req.params.userId);
    const athleteId = parseInt(req.params.athleteId);

    // Verify the athlete owns this data
    const athleteAccess = await authService.AthleteAccess.findOne({
      where: {
        userId: req.user.id,
        athleteId: athleteId,
        isApproved: true
      }
    });

    if (!athleteAccess) {
      return res.status(403).json({ error: 'You do not have access to manage this athlete data' });
    }

    await authService.approveAthleteAccess(userId, athleteId);
    res.json({ success: true });
  } catch (error) {
    console.error('Approve access error:', error);
    res.status(500).json({ error: 'Failed to approve access' });
  }
});

// Add coach by email endpoint
app.post('/admin/add-coach', requireAuth, async (req, res) => {
  if (req.user.role !== 'athlete') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const { coachEmail, athleteId } = req.body;

    if (!coachEmail || !athleteId) {
      return res.status(400).json({ error: 'Coach email and athlete ID are required' });
    }

    // Verify the athlete owns this data
    const athleteAccess = await authService.AthleteAccess.findOne({
      where: {
        userId: req.user.id,
        athleteId: parseInt(athleteId),
        accessLevel: 'admin',
        isApproved: true
      }
    });

    if (!athleteAccess) {
      return res.status(403).json({ error: 'You do not have admin access to this athlete data' });
    }

    // Find the coach by email
    const coach = await authService.findUserByEmail(coachEmail.trim().toLowerCase());

    if (!coach) {
      return res.status(404).json({ error: 'Coach not found. They may need to register first.' });
    }

    if (coach.role !== 'coach') {
      return res.status(400).json({ error: 'This user is not registered as a coach.' });
    }

    // Check if coach already has access
    const existingAccess = await authService.getUserAthleteAccess(coach.id, parseInt(athleteId));
    if (existingAccess) {
      return res.status(400).json({ error: 'This coach already has access to your data.' });
    }

    // Grant access to the coach
    await authService.requestAthleteAccess(coach.id, parseInt(athleteId), `Added by athlete via email: ${coachEmail}`);
    await authService.approveAthleteAccess(coach.id, parseInt(athleteId));

    res.json({
      success: true,
      message: `Coach ${coach.name} (${coach.email}) has been granted access to your data.`,
      coach: {
        name: coach.name,
        email: coach.email,
        avatar: coach.avatar
      }
    });
  } catch (error) {
    console.error('Add coach error:', error);
    res.status(500).json({ error: 'Failed to add coach. Please try again.' });
  }
});

app.delete('/admin/reject-access/:userId/:athleteId', requireAuth, async (req, res) => {
  if (req.user.role !== 'athlete') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const userId = parseInt(req.params.userId);
    const athleteId = parseInt(req.params.athleteId);

    // Verify the athlete owns this data
    const athleteAccess = await authService.AthleteAccess.findOne({
      where: {
        userId: req.user.id,
        athleteId: athleteId,
        isApproved: true
      }
    });

    if (!athleteAccess) {
      return res.status(403).json({ error: 'You do not have access to manage this athlete data' });
    }

    await authService.revokeAthleteAccess(userId, athleteId);
    res.json({ success: true });
  } catch (error) {
    console.error('Reject access error:', error);
    res.status(500).json({ error: 'Failed to reject access' });
  }
});

app.delete('/admin/revoke-access/:userId/:athleteId', requireAuth, async (req, res) => {
  if (req.user.role !== 'athlete') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const userId = parseInt(req.params.userId);
    const athleteId = parseInt(req.params.athleteId);

    // Verify the athlete owns this data
    const athleteAccess = await authService.AthleteAccess.findOne({
      where: {
        userId: req.user.id,
        athleteId: athleteId,
        isApproved: true
      }
    });

    if (!athleteAccess) {
      return res.status(403).json({ error: 'You do not have access to manage this athlete data' });
    }

    // Prevent revoking the athlete's own access
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot revoke your own access' });
    }

    await authService.revokeAthleteAccess(userId, athleteId);
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Strava Training Dashboard running on port ${port}`);
  console.log('📱 Access your comprehensive training analytics at the web interface!');
  console.log('✨ Features: Activity sync, data tables, charts, weekly/monthly trends, and AI summaries');
});