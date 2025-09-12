require('dotenv').config();
const StravaService = require('./stravaService');
const SheetsService = require('./sheetsService');
const LocationService = require('./locationService');

class StravaConnectApp {
  constructor() {
    this.validateEnvironmentVariables();

    this.stravaService = new StravaService();
    this.sheetsService = new SheetsService();
    this.locationService = new LocationService();
  }

  validateEnvironmentVariables() {
    const requiredVars = [
      'STRAVA_ENCRYPTION_KEY',
      'SHEETS_ENCRYPTION_KEY'
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

      // Process activities with location data
      console.log('Enriching activities with location data...');
      const enrichedActivities = [];
      
      for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        console.log(`Processing activity ${i + 1}/${activities.length}: ${activity.name}`);
        
        // Find location for this activity
        const locationData = await this.locationService.findActivityLocation(activity);
        
        // Format activity with location data for Google Sheets
        const formattedActivity = this.stravaService.formatActivityForSheet(activity, locationData);
        enrichedActivities.push(formattedActivity);
        
        // Add delay to respect API rate limits
        if (i < activities.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }

      // Add activities to Google Sheets
      await this.sheetsService.appendActivities(enrichedActivities);
      
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