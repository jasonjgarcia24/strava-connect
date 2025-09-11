const TokenManager = require('./tokenManager');
const SecureEncryption = require('../utils/encryptUtils.js');
const { google } = require('googleapis');

class SheetsService {
  #encryption = null;
  #auth = null;
  #sheets = null;
  #source = 'sheets';

  constructor(
    sheetsId = "",
    privateKey = "",
    serviceAccountEmail = ""
  ) {
    const tokenManager = new TokenManager(this.#source);
    const tokens = tokenManager.loadTokens();

    this.sheetsId = sheetsId || tokens.sheets_id;
    this.serviceAccountEmail = serviceAccountEmail || tokens.service_account_email
    this.privateKey = privateKey || tokens.private_key
    
    this.safeCall('#setAuth');    
    this.#sheets = google.sheets({ version: 'v4', auth: this.#auth });
  }

  safeCall(func, args = []) {
    try {
      this.#encryption = new SecureEncryption(this.#source);

      switch (func) {
        case '#setAuth':
          return this.#setAuth();
      }
    }
    finally {
      this.#encryption.destroy();
    }
  }

  async safeAsyncCall(func, args = []) {
    try {
      this.#encryption = new SecureEncryption(this.#source);

      switch (func) {
        case '#createHeaderRow':
          return await this.#createHeaderRow();
        case '#getExistingActivities':
          return await this.#getExistingActivities();
        case '#appendActivities':
          return await this.#appendActivities(...args);
        case '#clearSheet':
          return await this.#clearSheet();
      }
    }
    finally {
      this.#encryption.destroy();
    }
  }

  #setAuth() {
    this.#auth = new google.auth.JWT(
      this.#encryption.decrypt(this.serviceAccountEmail),
      null,
      this.#encryption.decrypt(this.privateKey).replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
  }

  async createHeaderRow() {
    return await this.safeAsyncCall('#createHeaderRow');
  }

  async appendActivities(activities) {
    return await this.safeAsyncCall('#appendActivities', [activities]);
  }

  async #createHeaderRow() {
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
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'A1:AE1'
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.#sheets.spreadsheets.values.update({
          spreadsheetId: this.#encryption.decrypt(this.sheetsId),
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

  async #getExistingActivities() {
    try {
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
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

  async #appendActivities(activities) {
    if (!activities || activities.length === 0) {
      console.log('No activities to append');
      return;
    }

    try {
      // Get existing activity IDs to avoid duplicates
      const existingIds = await this.#getExistingActivities();
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

      await this.#sheets.spreadsheets.values.append({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
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

  async #clearSheet() {
    try {
      await this.#sheets.spreadsheets.values.clear({
        sheetsId: this.#encryption.decrypt(this.sheetsId),
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