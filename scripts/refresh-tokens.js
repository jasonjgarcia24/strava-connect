require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class StravaTokenRefresher {
  constructor() {
    this.clientId = process.env.STRAVA_CLIENT_ID;
    this.clientSecret = process.env.STRAVA_CLIENT_SECRET;
    this.redirectUri = 'http://localhost:3000/callback'; // Default redirect URI
    
    if (!this.clientId || !this.clientSecret) {
      console.error('Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in .env file');
      process.exit(1);
    }
  }

  generateAuthUrl() {
    const scopes = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=${this.redirectUri}&approval_prompt=force&scope=${scopes}`;
    return authUrl;
  }

  async exchangeCodeForTokens(authCode) {
    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: authCode,
        grant_type: 'authorization_code'
      });

      return response.data;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error.response?.data || error.message);
      throw error;
    }
  }

  updateEnvFile(accessToken, refreshToken, expiresAt) {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update or add the tokens
    const updates = {
      'STRAVA_ACCESS_TOKEN': accessToken,
      'STRAVA_REFRESH_TOKEN': refreshToken,
      'STRAVA_TOKEN_EXPIRES_AT': expiresAt.toString()
    };

    Object.entries(updates).forEach(([key, value]) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    });

    fs.writeFileSync(envPath, envContent.trim() + '\n');
    console.log('✅ Updated .env file with new tokens');
  }

  updateTokensFile(accessToken, refreshToken, expiresAt) {
    const tokensPath = path.join(process.cwd(), 'config', 'tokens.json');
    const tokensData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt
    };

    // Ensure config directory exists
    const configDir = path.dirname(tokensPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(tokensPath, JSON.stringify(tokensData, null, 2));
    console.log('✅ Updated config/tokens.json with new tokens');
  }

  async refreshWithExistingToken() {
    const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
    
    if (!refreshToken) {
      console.error('No refresh token found in .env file');
      return false;
    }

    try {
      console.log('Attempting to refresh with existing token...');
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      const { access_token, refresh_token, expires_at } = response.data;
      this.updateEnvFile(access_token, refresh_token, expires_at);
      this.updateTokensFile(access_token, refresh_token, expires_at);
      console.log('✅ Successfully refreshed tokens!');
      return true;
    } catch (error) {
      console.log('❌ Failed to refresh with existing token:', error.response?.data?.message || error.message);
      return false;
    }
  }

  async run() {
    console.log('🔄 Strava Token Refresher\n');
    console.log('🔐 Getting new authorization...\n');
    console.log('Step 1: Visit this URL in your browser:');
    console.log(this.generateAuthUrl());
    console.log('\nStep 2: After authorizing, you\'ll be redirected to a URL like:');
    console.log('http://localhost:3000/callback?code=AUTHORIZATION_CODE&scope=...');
    console.log('\nStep 3: Copy the authorization code from the URL and run:');
    console.log(`node scripts/refresh-tokens.js YOUR_AUTHORIZATION_CODE`);
  }

  async runWithCode(authCode) {
    try {
      console.log('🔄 Exchanging authorization code for tokens...');
      const tokens = await this.exchangeCodeForTokens(authCode);
      
      const { access_token, refresh_token, expires_at } = tokens;
      this.updateEnvFile(access_token, refresh_token, expires_at);
      this.updateTokensFile(access_token, refresh_token, expires_at);
      
      console.log('✅ Successfully obtained new tokens!');
      console.log('\nYou can now run your application:');
      console.log('npm start');
      
    } catch (error) {
      console.error('❌ Failed to get tokens:', error.message);
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const refresher = new StravaTokenRefresher();
  const authCode = process.argv[2];
  
  if (authCode) {
    console.log("Auth code present");
    refresher.runWithCode(authCode);
  } else {
    console.log("No auth code");
    refresher.run();
  }
}

module.exports = StravaTokenRefresher;