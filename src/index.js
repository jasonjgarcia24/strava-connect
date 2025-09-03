require('dotenv').config();
const StravaService = require('./stravaService');
const SheetsService = require('./sheetsService');

class StravaConnectApp {
  constructor() {
    this.validateEnvironmentVariables();
    
    this.stravaService = new StravaService(
      process.env.STRAVA_CLIENT_ID,
      process.env.STRAVA_CLIENT_SECRET,
      process.env.STRAVA_REFRESH_TOKEN
    );

    this.sheetsService = new SheetsService(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      process.env.GOOGLE_PRIVATE_KEY,
      process.env.GOOGLE_SHEETS_ID
    );
  }

  validateEnvironmentVariables() {
    const requiredVars = [
      'STRAVA_CLIENT_ID',
      'STRAVA_CLIENT_SECRET', 
      'STRAVA_REFRESH_TOKEN',
      'GOOGLE_SHEETS_ID',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:');
      missingVars.forEach(varName => console.error(`  - ${varName}`));
      console.error('\nPlease create a .env file based on .env.example and fill in your credentials.');
      process.exit(1);
    }
  }

  async syncActivities(activityCount = 30) {
    try {
      console.log('Starting Strava to Google Sheets sync...');
      
      // Initialize Strava service with tokens
      await this.stravaService.initialize();
      
      // Initialize Google Sheets with headers
      await this.sheetsService.createHeaderRow();
      
      // Fetch recent activities from Strava
      console.log(`Fetching ${activityCount} recent activities from Strava...`);
      const activities = await this.stravaService.getActivities(1, activityCount);
      
      if (!activities || activities.length === 0) {
        console.log('No activities found');
        return;
      }

      console.log(`Found ${activities.length} activities`);

      // Format activities for Google Sheets
      const formattedActivities = activities.map(activity => 
        this.stravaService.formatActivityForSheet(activity)
      );

      // Add activities to Google Sheets
      await this.sheetsService.appendActivities(formattedActivities);
      
      console.log('Sync completed successfully!');
      
    } catch (error) {
      console.error('Error during sync:', error.message);
      process.exit(1);
    }
  }

  async run() {
    const args = process.argv.slice(2);
    const activityCount = args[0] ? parseInt(args[0]) : 30;
    
    if (isNaN(activityCount) || activityCount < 1) {
      console.error('Invalid activity count. Please provide a positive number.');
      process.exit(1);
    }

    await this.syncActivities(activityCount);
  }
}

// Run the application
if (require.main === module) {
  const app = new StravaConnectApp();
  app.run().catch(error => {
    console.error('Application error:', error.message);
    process.exit(1);
  });
}

module.exports = StravaConnectApp;