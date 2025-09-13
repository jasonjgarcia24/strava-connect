require('dotenv').config();
const StravaService = require('./stravaService');
const SheetsService = require('./sheetsService');
const LocationService = require('./locationService');
const WeeklySummaryService = require('./weeklySummaryService');

class StravaConnectApp {
  constructor() {
    this.validateEnvironmentVariables();

    this.stravaService = new StravaService();
    this.sheetsService = new SheetsService();
    this.locationService = new LocationService();
    this.weeklySummaryService = new WeeklySummaryService();
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

  async syncActivities(activityCount = 3) {
    try {
      console.log('Starting Strava to Google Sheets sync...');
      console.log(`📊 Syncing ${activityCount} activities (default reduced to 3 to avoid Strava rate limits)`);
            
      // Initialize Google Sheets with headers
      await this.sheetsService.createHeaderRow();
      
      // Get existing activity IDs from the sheet to avoid re-processing
      console.log('Checking for existing activities in Google Sheets...');
      const existingActivityIds = await this.sheetsService.getExistingActivityIds();
      console.log(`Found ${existingActivityIds.length} existing activities in sheet`);
      
      // Fetch recent activities from Strava
      console.log(`Fetching ${activityCount} recent activities from Strava... (Rate limit friendly: fetching fewer activities)`);
      const activities = await this.stravaService.getActivities(1, activityCount);
      
      if (!activities || activities.length === 0) {
        console.log('No activities found');
        return;
      }

      console.log(`Found ${activities.length} activities`);
      
      // Filter out activities that already exist in the sheet
      const newActivities = activities.filter(activity => 
        !existingActivityIds.includes(activity.id.toString())
      );
      
      if (newActivities.length === 0) {
        console.log('✅ All activities are already in the sheet - no new activities to process');
        // Still run weekly summary check
        console.log('\n📅 Checking for missing weekly summaries...');
        try {
          const allActivities = await this.sheetsService.getAllActivities();
          if (allActivities.length > 0) {
            const activitiesWithDates = allActivities.map(activity => ({
              ...activity,
              start_date_local: new Date(activity.Date).toISOString()
            }));
            
            // Check and create previous week summary if missing
            await this.weeklySummaryService.checkAndCreatePreviousWeekSummary(activitiesWithDates);
            
            // Generate current week summary if it's Wednesday or later
            await this.weeklySummaryService.generateCurrentWeekSummaryIfNeeded(activitiesWithDates);
          }
        } catch (error) {
          console.warn('⚠️  Weekly summary auto-generation failed:', error.message);
        }
        return;
      }
      
      console.log(`Processing ${newActivities.length} new activities (${activities.length - newActivities.length} already exist)`);

      // Process activities with location data
      console.log('Enriching new activities with location data...');
      const enrichedActivities = [];
      
      for (let i = 0; i < newActivities.length; i++) {
        const activity = newActivities[i];
        console.log(`Processing activity ${i + 1}/${newActivities.length}: ${activity.name}`);
        
        // Find location for this activity
        const locationData = await this.locationService.findActivityLocation(activity);
        
        // Format activity with location data for Google Sheets
        const formattedActivity = this.stravaService.formatActivityForSheet(activity, locationData);
        enrichedActivities.push(formattedActivity);
        
        // Add delay to respect API rate limits
        if (i < newActivities.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }

      // Add activities to Google Sheets
      await this.sheetsService.appendActivities(enrichedActivities);
      
      console.log('Sync completed successfully!');

      // Auto-generate weekly summaries
      console.log('\n📅 Checking for missing weekly summaries...');
      try {
        // Get all activities for weekly summary analysis
        const allActivities = await this.sheetsService.getAllActivities();
        
        if (allActivities.length > 0) {
          // Add start_date_local for date filtering from sheet data
          const activitiesWithDates = allActivities.map(activity => ({
            ...activity,
            start_date_local: new Date(activity.Date).toISOString()
          }));
          
          // Check and create previous week summary if missing
          await this.weeklySummaryService.checkAndCreatePreviousWeekSummary(activitiesWithDates);
          
          // Generate current week summary if it's Wednesday or later
          await this.weeklySummaryService.generateCurrentWeekSummaryIfNeeded(activitiesWithDates);
        } else {
          console.log('📊 No activities found for weekly summary analysis');
        }
      } catch (error) {
        console.warn('⚠️  Weekly summary auto-generation failed:', error.message);
        // Don't fail the entire sync if weekly summary fails
      }
      
    } catch (error) {
      console.error('Error during sync:', error.message);
      process.exit(1);
    }
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (command === 'summary' || command === 'weekly') {
      const dateString = args[1]; // Optional date in YYYY-MM-DD format
      await this.generateWeeklySummary(dateString);
      return;
    }
    
    if (command === 'backfill') {
      const weeksBack = args[1] ? parseInt(args[1]) : 12; // Default to 12 weeks back
      await this.backfillWeeklySummaries(weeksBack);
      return;
    }
    
    // Default behavior - sync activities
    const activityCount = args[0] ? parseInt(args[0]) : 3;
    
    if (isNaN(activityCount) || activityCount < 1) {
      console.error('Invalid activity count. Please provide a positive number.');
      console.error('');
      console.error('Usage:');
      console.error('  node src/index.js [activity_count]     - Sync activities (default: 3, rate limit friendly)');
      console.error('  node src/index.js summary [date]       - Generate weekly summary');
      console.error('  node src/index.js weekly [date]        - Generate weekly summary');
      console.error('  node src/index.js backfill [weeks]     - Generate missing weekly summaries');
      console.error('');
      console.error('Examples:');
      console.error('  node src/index.js                      - Sync 3 activities (default, rate limit friendly)');
      console.error('  node src/index.js 10                   - Sync 10 activities');
      console.error('  node src/index.js 50                   - Sync 50 activities (caution: may hit rate limits)');
      console.error('  node src/index.js summary              - Current week summary');
      console.error('  node src/index.js summary 2024-01-15   - Summary for week containing Jan 15');
      console.error('  node src/index.js backfill             - Check last 12 weeks for missing summaries');
      console.error('  node src/index.js backfill 20          - Check last 20 weeks for missing summaries');
      process.exit(1);
    }

    await this.syncActivities(activityCount);
  }

  async generateWeeklySummary(dateString = null) {
    try {
      console.log('Generating weekly training summary...');
      
      // Get activities from Google Sheets (as fallback) or recent activities
      let activities = await this.sheetsService.getAllActivities();
      
      if (activities.length === 0) {
        console.log('No activities found in Google Sheets, fetching recent activities...');
        const recentActivities = await this.stravaService.getActivities(1, 200);
        
        // Convert to the same format as sheet data
        activities = recentActivities.map(activity => ({
          'Name': activity.name,
          'Date': new Date(activity.start_date_local).toLocaleDateString(),
          'Type': activity.sport_type,
          'Distance (mi)': activity.distance ? Math.round(activity.distance / 1609.34 * 100) / 100 : 0,
          'Moving Time (min)': Math.round(activity.moving_time / 60),
          'Private Notes': activity.private_note || '',
          'Perceived Exertion': activity.perceived_exertion || null,
          'Avg Heart Rate': activity.average_heartrate || null,
          'Location Name': '',
          'start_date_local': activity.start_date_local // Keep original for date filtering
        }));
      } else {
        // Add start_date_local for date filtering from sheet data
        activities = activities.map(activity => ({
          ...activity,
          start_date_local: new Date(activity.Date).toISOString()
        }));
      }

      let summary;
      if (dateString) {
        summary = await this.weeklySummaryService.getWeekSummaryByDate(activities, dateString);
      } else {
        summary = await this.weeklySummaryService.getCurrentWeekSummary(activities);
      }

      // Save to spreadsheet if we have a valid summary
      if (summary.summary && summary.summary !== 'No activities with private notes found for this week.') {
        console.log('Saving summary to Week Summary spreadsheet tab...');
        
        // Create headers if they don't exist
        await this.sheetsService.createWeeklySummaryHeaders();
        
        // Save the summary
        await this.sheetsService.appendWeeklySummary(summary);
      }

      // Display the summary
      console.log('\n' + '='.repeat(60));
      console.log(`🏃‍♂️ WEEKLY TRAINING SUMMARY`);
      console.log(`📅 Week: ${summary.weekRange} (Week ${summary.weekNumber}, ${summary.year})`);
      console.log('='.repeat(60));
      console.log(`📊 Activities: ${summary.totalActivities} total, ${summary.activitiesWithNotes} with notes`);
      if (summary.activityIds?.length > 0) {
        console.log(`🆔 Activity IDs: ${summary.activityIds.join(', ')}`);
      }
      console.log('\n📝 AI SUMMARY:');
      console.log(summary.summary);
      console.log('='.repeat(60));

      return summary;

    } catch (error) {
      console.error('Error generating weekly summary:', error.message);
      
      if (error.message.includes('Hugging Face API key')) {
        console.log('\n💡 To enable weekly summaries:');
        console.log('1. Get a Hugging Face API key from https://huggingface.co/settings/tokens');
        console.log('2. Add your key to tokens.json:');
        console.log('   "huggingface": {');
        console.log('     "private_key": "your_api_key_here"');
        console.log('   }');
      }
      
      throw error;
    }
  }

  async backfillWeeklySummaries(weeksBack = 12) {
    try {
      console.log(`🔍 Checking for missing weekly summaries (${weeksBack} weeks back)...`);
      
      // Get activities from Google Sheets (as fallback) or recent activities
      let activities = await this.sheetsService.getAllActivities();
      
      if (activities.length === 0) {
        console.log('No activities found in Google Sheets, fetching recent activities...');
        const recentActivities = await this.stravaService.getActivities(1, 200);
        
        // Convert to the same format as sheet data
        activities = recentActivities.map(activity => ({
          'Name': activity.name,
          'Date': new Date(activity.start_date_local).toLocaleDateString(),
          'Type': activity.sport_type,
          'Distance (mi)': activity.distance ? Math.round(activity.distance / 1609.34 * 100) / 100 : 0,
          'Moving Time (min)': Math.round(activity.moving_time / 60),
          'Private Notes': activity.private_note || '',
          'Perceived Exertion': activity.perceived_exertion || null,
          'Avg Heart Rate': activity.average_heartrate || null,
          'Location Name': '',
          'start_date_local': activity.start_date_local // Keep original for date filtering
        }));
      } else {
        // Add start_date_local for date filtering from sheet data
        activities = activities.map(activity => ({
          ...activity,
          start_date_local: new Date(activity.Date).toISOString()
        }));
      }

      const generatedSummaries = await this.weeklySummaryService.backfillMissingSummaries(activities, weeksBack);
      
      if (generatedSummaries.length > 0) {
        console.log(`\n🎉 Successfully generated ${generatedSummaries.length} missing weekly summaries!`);
        generatedSummaries.forEach(summary => {
          console.log(`  ✅ Week ${summary.weekNumber} ${summary.year}: ${summary.activitiesWithNotes} activities with notes`);
        });
      } else {
        console.log('\n✅ No missing weekly summaries found - all up to date!');
      }

    } catch (error) {
      console.error('Error during backfill:', error.message);
      throw error;
    }
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