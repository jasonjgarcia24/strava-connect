  const fs = require('fs');
  const path = require('path');

  class TokenManager {
    constructor(source) {
      this.source = source;
      this.tokenFile = path.join(__dirname, '../config/tokens.json');
    }

    loadTokens() {
      try {
        const tokens = require(this.tokenFile);
        return tokens[this.source];
      } catch (error) {
        console.log(`Error reading ${this.source} tokens from local file:`, error.message);
      }
    }

    async saveTokens(new_tokens, source) {     
      // Only save to local file in development
      try {
        const tokens = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        tokens[source] = {...tokens[source], ...new_tokens};

        fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
        // await fs.writeFile(this.tokenFile, JSON.stringify(tokens, null, 2));
        console.log('Tokens saved to local file (development only)');
      } catch (error) {
        console.log('Could not save tokens to local file:', error.message);
      }
    }
  }

  module.exports = TokenManager;