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
        throw new Error('Could not load tokens file');
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