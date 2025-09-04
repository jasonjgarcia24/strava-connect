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
      try {
        await fs.writeFile(this.tokenFile, JSON.stringify(tokens, null, 2));
      } catch (error) {
        throw new Error('Could not save tokens');
      }
    }
  }

  module.exports = TokenManager;