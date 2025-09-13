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
        case '#getAllActivities':
          return await this.#getAllActivities();
        case '#createWeeklySummaryHeaders':
          return await this.#createWeeklySummaryHeaders();
        case '#appendWeeklySummary':
          return await this.#appendWeeklySummary(...args);
        case '#updateWeeklySummary':
          return await this.#updateWeeklySummary(...args);
        case '#getExistingWeeklySummaries':
          return await this.#getExistingWeeklySummaries();
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

  async getAllActivities() {
    return await this.safeAsyncCall('#getAllActivities');
  }

  async createWeeklySummaryHeaders() {
    return await this.safeAsyncCall('#createWeeklySummaryHeaders');
  }

  async appendWeeklySummary(summaryData) {
    return await this.safeAsyncCall('#appendWeeklySummary', [summaryData]);
  }

  async updateWeeklySummary(summaryData) {
    return await this.safeAsyncCall('#updateWeeklySummary', [summaryData]);
  }

  async getExistingWeeklySummaries() {
    return await this.safeAsyncCall('#getExistingWeeklySummaries');
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
      'Perceived Exertion',
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
      'External ID',
      // New location fields
      'Detected State',
      'Detected City',
      'Detected County',
      'Detected Country',
      'Location Name',
      'Location Full Name',
      'Location Type',
      'Nearest Location Distance (km)',
      'Coordinate Source',
      'Segment Name',
      'Location Latitude',
      'Location Longitude'
    ];

    try {
      // Check if headers already exist
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Daily!A1:AR1'
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.#sheets.spreadsheets.values.update({
          spreadsheetId: this.#encryption.decrypt(this.sheetsId),
          range: 'Daily!A1:AR1',
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
        range: 'Daily!A:A'
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
        activity.perceivedExertion,
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
        activity.externalId,
        // New location fields
        activity.detectedState,
        activity.detectedCity,
        activity.detectedCounty,
        activity.detectedCountry,
        activity.nearestLocationName,
        activity.nearestLocationFullName,
        activity.nearestLocationType,
        activity.nearestLocationDistance,
        activity.coordinateSource,
        activity.segmentName,
        activity.locationLat,
        activity.locationLon
      ]);

      await this.#sheets.spreadsheets.values.append({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Daily!A:AR',
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

  async #getAllActivities() {
    try {
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Daily!A:AR'
      });

      if (!response.data.values || response.data.values.length <= 1) {
        return []; // No data or only headers
      }

      const headers = response.data.values[0];
      const rows = response.data.values.slice(1);

      // Convert rows to objects using headers
      return rows.map(row => {
        const activity = {};
        headers.forEach((header, index) => {
          activity[header] = row[index] || '';
        });
        return activity;
      });

    } catch (error) {
      console.error('Error getting all activities from sheet:', error.message);
      return [];
    }
  }

  async #createWeeklySummaryHeaders() {
    const headers = [
      'Week Number',
      'Year',
      'Week Start Date',
      'Week End Date',
      'Week Range',
      'Total Activities', 
      'Activities With Notes',
      'AI Summary',
      'Activity IDs',
      'Generated Date'
    ];

    try {
      // Check if headers already exist
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Week Summary!A1:J1'
      });

      if (!response.data.values || response.data.values.length === 0) {
        await this.#sheets.spreadsheets.values.update({
          spreadsheetId: this.#encryption.decrypt(this.sheetsId),
          range: 'Week Summary!A1:J1',
          valueInputOption: 'RAW',
          resource: {
            values: [headers]
          }
        });
        console.log('Week Summary header row created');
      }
    } catch (error) {
      console.error('Error creating Week Summary header row:', error.message);
      throw error;
    }
  }

  async #appendWeeklySummary(summaryData) {
    try {
      // Check if this week already exists to avoid duplicates
      const existingResponse = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Week Summary!A:B'
      });

      const existingRows = existingResponse.data.values || [];
      const isDuplicate = existingRows.some((row, index) => {
        if (index === 0) return false; // Skip header
        return row[0] === summaryData.weekNumber.toString() && 
               row[1] === summaryData.year.toString();
      });

      if (isDuplicate) {
        console.log(`Week ${summaryData.weekNumber} ${summaryData.year} summary already exists. Skipping.`);
        return;
      }

      const row = [
        summaryData.weekNumber,
        summaryData.year,
        summaryData.weekStartDate,
        summaryData.weekEndDate,
        summaryData.weekRange,
        summaryData.totalActivities,
        summaryData.activitiesWithNotes,
        summaryData.summary,
        summaryData.activityIds.join(', '),
        new Date().toISOString()
      ];

      await this.#sheets.spreadsheets.values.append({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Week Summary!A:J',
        valueInputOption: 'RAW',
        resource: {
          values: [row]
        }
      });

      console.log(`Added week ${summaryData.weekNumber} summary to the spreadsheet`);
    } catch (error) {
      console.error('Error appending weekly summary:', error.message);
      throw error;
    }
  }

  async #getExistingWeeklySummaries() {
    try {
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Week Summary!A:J'
      });

      if (!response.data.values || response.data.values.length <= 1) {
        return []; // No data or only headers
      }

      const headers = response.data.values[0];
      const rows = response.data.values.slice(1);

      // Convert rows to objects using headers
      return rows.map(row => {
        const summary = {};
        headers.forEach((header, index) => {
          summary[header] = row[index] || '';
        });
        return summary;
      });

    } catch (error) {
      console.error('Error getting existing weekly summaries:', error.message);
      return [];
    }
  }

  async #updateWeeklySummary(summaryData) {
    try {
      // Get existing summaries to find the row to update
      const response = await this.#sheets.spreadsheets.values.get({
        spreadsheetId: this.#encryption.decrypt(this.sheetsId),
        range: 'Week Summary!A:J'
      });

      if (!response.data.values || response.data.values.length <= 1) {
        // No existing data, just append
        return await this.#appendWeeklySummary(summaryData);
      }

      const rows = response.data.values;
      let updateRowIndex = -1;

      // Find the row that matches this week/year
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[0] === summaryData.weekNumber.toString() && row[1] === summaryData.year.toString()) {
          updateRowIndex = i + 1; // +1 because sheets are 1-indexed
          break;
        }
      }

      const newRow = [
        summaryData.weekNumber,
        summaryData.year,
        summaryData.weekStartDate,
        summaryData.weekEndDate,
        summaryData.weekRange,
        summaryData.totalActivities,
        summaryData.activitiesWithNotes,
        summaryData.summary,
        summaryData.activityIds.join(', '),
        new Date().toISOString()
      ];

      if (updateRowIndex > 0) {
        // Update existing row
        await this.#sheets.spreadsheets.values.update({
          spreadsheetId: this.#encryption.decrypt(this.sheetsId),
          range: `Week Summary!A${updateRowIndex}:J${updateRowIndex}`,
          valueInputOption: 'RAW',
          resource: {
            values: [newRow]
          }
        });
        console.log(`Updated existing week ${summaryData.weekNumber} summary in the spreadsheet`);
      } else {
        // Append new row
        await this.#sheets.spreadsheets.values.append({
          spreadsheetId: this.#encryption.decrypt(this.sheetsId),
          range: 'Week Summary!A:J',
          valueInputOption: 'RAW',
          resource: {
            values: [newRow]
          }
        });
        console.log(`Added new week ${summaryData.weekNumber} summary to the spreadsheet`);
      }

    } catch (error) {
      console.error('Error updating weekly summary:', error.message);
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