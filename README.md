# Strava Connect

Automatically sync your Strava activities to a Google Sheet.

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Strava API**:
   - Go to https://www.strava.com/settings/api
   - Create a new application
   - Note your Client ID and Client Secret
   - Get your refresh token by following Strava's OAuth flow

3. **Configure Google Sheets API**:
   - Go to Google Cloud Console
   - Enable the Google Sheets API
   - Create a service account and download the JSON key
   - Create a Google Sheet and share it with your service account email
   - Note your sheet ID from the URL

4. **Environment Configuration**:
   - Copy `.env.example` to `.env`
   - Fill in your credentials

5. **Run the application**:
   ```bash
   npm start [number_of_activities]
   ```

## Usage

- `npm start` - Sync 30 most recent activities (default)
- `npm start 50` - Sync 50 most recent activities
- The app will avoid duplicate entries automatically

## Features

- Fetches recent Strava activities
- Converts units (distance to km, speed to km/h, time to minutes)
- Populates Google Sheet with activity data
- Avoids duplicate entries
- Handles token refresh automatically