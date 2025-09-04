  const fs = require('fs').promises;
  const path = require('path');

  class TokenManager {
    constructor() {
      this.tokenFile = path.join(__dirname, '../config/tokens.json');
    }

    async loadTokens() {
      try {
        const data = await fs.readFile(this.tokenFile, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        // Fall back to environment variables if file doesn't exist (e.g., in Railway)
        return {
          access_token: process.env.STRAVA_ACCESS_TOKEN,
          refresh_token: process.env.STRAVA_REFRESH_TOKEN,
          expires_at: parseInt(process.env.STRAVA_TOKEN_EXPIRES_AT) || Date.now()
        };
      }
    }

    async saveTokens(tokens) {
      // In production, don't save tokens to files for security
      if (process.env.NODE_ENV === 'production') {
        console.log('Production mode: Not saving tokens to file for security');
        return;
      }
      
      // Only save to local file in development
      try {
        await fs.writeFile(this.tokenFile, JSON.stringify(tokens, null, 2));
        console.log('Tokens saved to local file (development only)');
      } catch (error) {
        console.log('Could not save tokens to local file:', error.message);
      }
    }
  }

  module.exports = TokenManager;