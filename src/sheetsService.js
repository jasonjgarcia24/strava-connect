const { google } = require('googleapis');

class SheetsService {
  constructor(serviceAccountEmail, privateKey, spreadsheetId) {
    this.spreadsheetId = spreadsheetId;
    
    this.auth = new google.auth.JWT(
      serviceAccountEmail,
      null,
      privateKey.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    
    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async createHeaderRow() {
    const headers = [
      'ID',
      'Name', 
      'Type',
      'Sport Type',
      'Date',
      'Distance (mi)',
      'Moving Time (min)',
      'Total Time (min)',
      'Elevation Gain (ft)',
      'Avg Speed (mph)',
      'Max Speed (mph)',
      'Avg Heart Rate',
      'Max Heart Rate',
      'Calories',
      'Description',
      'Private Notes',
      'Equipment Name',
      'Equipment Brand',
      'Equipment Model',
      'Equipment Nickname',
      'Equipment Distance (mi)',
      'Location',
      'Timezone',
      'UTC Offset',
      'Device Name',
      'Private',
      'Visibility',
      'Flagged',
      'Workout Type',
      'Upload ID',
      'External ID'
    ];

    try {
      // Check if headers already exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A1:AE1'
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: 'A1:AE1',
          valueInputOption: 'RAW',
          resource: {
            values: [headers]
          }
        });
        console.log('Header row created with enhanced metadata');
      }
    } catch (error) {
      console.error('Error creating header row:', error.message);
      throw error;
    }
  }

  async getExistingActivities() {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'A:A'
      });

      if (!response.data.values) return [];
      
      // Skip header row and get activity IDs
      return response.data.values.slice(1).map(row => row[0]).filter(id => id);
    } catch (error) {
      console.error('Error getting existing activities:', error.message);
      return [];
    }
  }

  async appendActivities(activities) {
    if (!activities || activities.length === 0) {
      console.log('No activities to append');
      return;
    }

    try {
      // Get existing activity IDs to avoid duplicates
      const existingIds = await this.getExistingActivities();
      const newActivities = activities.filter(activity => 
        !existingIds.includes(activity.id.toString())
      );

      if (newActivities.length === 0) {
        console.log('No new activities to add');
        return;
      }

      const rows = newActivities.map(activity => [
        activity.id,
        activity.name,
        activity.type,
        activity.sportType,
        activity.date,
        activity.distance,
        activity.movingTime,
        activity.totalTime,
        activity.elevationGain,
        activity.averageSpeed,
        activity.maxSpeed,
        activity.averageHeartrate,
        activity.maxHeartrate,
        activity.calories,
        activity.description,
        activity.privateNotes,
        activity.equipmentName,
        activity.equipmentBrand,
        activity.equipmentModel,
        activity.equipmentNickname,
        activity.equipmentDistance,
        activity.location,
        activity.timezone,
        activity.utcOffset,
        activity.deviceName,
        activity.private,
        activity.visibility,
        activity.flagged,
        activity.workoutType,
        activity.uploadId,
        activity.externalId
      ]);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'A:AE',
        valueInputOption: 'RAW',
        resource: {
          values: rows
        }
      });

      console.log(`Added ${newActivities.length} new activities to the spreadsheet`);
    } catch (error) {
      console.error('Error appending activities:', error.message);
      throw error;
    }
  }

  async clearSheet() {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: 'A:Z'
      });
      console.log('Sheet cleared');
    } catch (error) {
      console.error('Error clearing sheet:', error.message);
      throw error;
    }
  }
}

module.exports = SheetsService;