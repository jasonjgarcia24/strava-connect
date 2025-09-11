const axios = require('axios');
const TokenManager = require('./tokenManager');
const SecureEncryption = require('../utils/encryptUtils.js');

class StravaService {
  baseURL = "https://www.strava.com/api/v3"
  #tokenManager = null;
  #encryption = null;
  #source = 'strava';

  constructor(
    clientId = "",
    clientSecret = "",
    accessToken = "",
    refreshToken = "",
    tokenExpiresAt = ""
  ) {
    this.#tokenManager = new TokenManager(this.#source);
    const tokens = this.#tokenManager.loadTokens();

    this.clientId = clientId || tokens.client_id;
    this.clientSecret = clientSecret || tokens.client_secret;
    this.accessToken = accessToken || tokens.access_token;
    this.refreshToken = refreshToken || tokens.refresh_token;
    this.tokenExpiresAt = tokenExpiresAt || tokens.token_expires_at;
  }

  safeCall(func, args = []) {
    try {
      this.#encryption = new SecureEncryption(this.#source);

      switch (func) {
        case '#isTokenExpired':
          return this.#isTokenExpired();
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
        case '#getActivities':
          return await this.#getActivities(...args);
      }
    }
    finally {
      this.#encryption.destroy();
    }
  }

  async getActivities(page = 1, perPage = 30) {
    return await this.safeAsyncCall('#getActivities', [page, perPage]);
  }

  isTokenExpired() {
    return this.safeCall('#isTokenExpired', []);
  }

  async #refreshAccessToken() {
    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: this.#encryption.decrypt(this.clientId),
        client_secret: this.#encryption.decrypt(this.clientSecret),
        refresh_token: this.#encryption.decrypt(this.refreshToken),
        grant_type: 'refresh_token'
      });

      this.accessToken = this.#encryption.encrypt(response.data.access_token);
      this.refreshToken = this.#encryption.encrypt(response.data.refresh_token);
      this.tokenExpiresAt = this.#encryption.encrypt(`${Date.now() + (response.data.expires_in * 1000)}`);
      console.log('Access token refreshed successfully');

      const tokens = {
        access_token: this.accessToken,
        refresh_token: this.refreshToken,
        expires_at: this.tokenExpiresAt
      };

      await this.#tokenManager.saveTokens(tokens, this.#source);
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
      this.tokenExpiresAt = tokens.expires_at;

      return this.accessToken;
    } catch (error) {
      console.error('Error refreshing access token:', error.response?.data || error.message);
      throw error;
    }
  }

  #isTokenExpired() {
    if (!this.tokenExpiresAt) return true;

    // Convert to JavaScript Date (multiply by 1000 for milliseconds)
    const tokenExpiresAt = new Date(this.#encryption.decrypt(this.tokenExpiresAt) * 1000);
    const now = new Date();

    // Compare with 5-minute buffer
    const fiveMinutesInMs = 5 * 60 * 1000; // 5 minutes in milliseconds
    const timeDifference = tokenExpiresAt.getTime() - now.getTime();

    return Math.abs(timeDifference) <= fiveMinutesInMs
  }

  async #getActivities(page, perPage) {
    if (!this.#encryption.decrypt(this.accessToken) || this.#isTokenExpired()) {
      console.log('Token missing or expired, refreshing...');
      await this.#refreshAccessToken();
    }

    try {
      const response = await axios.get(`${this.baseURL}/athlete/activities`, {
        headers: {
          'Authorization': `Bearer ${this.#encryption.decrypt(this.accessToken)}`
        },
        params: {
          page,
          per_page: perPage
        }
      });

      // Get detailed data for each activity to include metadata
      // Add small delay between API calls to respect rate limits
      const activitiesWithDetails = [];
      for (const activity of response.data) {
        const detailedActivity = await this.#getActivityDetails(activity.id);
        if (detailedActivity) {
          activitiesWithDetails.push(detailedActivity);
        }
        // Small delay to avoid rate limiting (Strava allows 100 requests per 15 minutes)
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
      }

      return activitiesWithDetails;
    } catch (error) {
      if (error.response?.status === 401 && !this.#isTokenExpired()) {
        console.log('Access token rejected by API, refreshing...');
        await this.#refreshAccessToken();
        return this.getActivities(page, perPage);
      }
      console.error('Error fetching activities:', error.response?.data || error.message);
      throw error;
    }
  }

  async #getActivityDetails(activityId) {
    try {
      const response = await axios.get(`${this.baseURL}/activities/${activityId}`, {
        headers: {
          'Authorization': `Bearer ${this.#encryption.decrypt(this.accessToken)}`
        }
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('Access token expired, refreshing...');
        await this.#refreshAccessToken();
        return this.#getActivityDetails(activityId);
      }
      console.error(`Error fetching activity details for ${activityId}:`, error.response?.data || error.message);
      // Return null if we can't get details, the main activity list will still work
      return null;
    }
  }

  formatActivityForSheet(activity) {
    if (!activity) return null;

    return {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      sportType: activity.sport_type,
      date: new Date(activity.start_date).toLocaleDateString(),
      distance: Math.round((activity.distance / 1609.34) * 100) / 100, // Convert to miles
      movingTime: Math.round(activity.moving_time / 60), // Convert to minutes
      totalTime: Math.round(activity.elapsed_time / 60), // Convert to minutes
      elevationGain: Math.round(activity.total_elevation_gain * 3.28084), // Convert to feet
      averageSpeed: activity.average_speed ? Math.round(activity.average_speed * 2.237 * 100) / 100 : null, // Convert to mph
      maxSpeed: activity.max_speed ? Math.round(activity.max_speed * 2.237 * 100) / 100 : null, // Convert to mph
      averageHeartrate: activity.average_heartrate,
      maxHeartrate: activity.max_heartrate,
      calories: activity.kilojoules,
      // New metadata fields
      description: activity.description || '',
      privateNotes: activity.private_note || '',
      equipmentName: activity.gear?.name || '',
      equipmentBrand: activity.gear?.brand_name || '',
      equipmentModel: activity.gear?.model_name || '',
      equipmentNickname: activity.gear?.nickname || '',
      equipmentDistance: activity.gear ? Math.round((activity.gear.distance / 1609.34) * 100) / 100 : null, // Convert to miles
      location: activity.location_city || activity.location_state || activity.location_country || '',
      timezone: activity.timezone,
      utcOffset: activity.utc_offset,
      deviceName: activity.device_name || '',
      embedToken: activity.embed_token || '',
      private: activity.private || false,
      visibility: activity.visibility || 'everyone',
      flagged: activity.flagged || false,
      workoutType: activity.workout_type,
      uploadId: activity.upload_id,
      externalId: activity.external_id || ''
    };
  }
}

module.exports = StravaService;