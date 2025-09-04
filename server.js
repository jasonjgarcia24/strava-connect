require('dotenv').config();
const express = require('express');
const StravaConnectApp = require('./src/index');

const app = express();
const port = process.env.PORT || 3000;

// Simple web interface
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Strava Sync</title></head>
      <body style="font-family: Arial; padding: 20px;">
        <h1>🏃‍♂️ Strava Sync</h1>
        <p>Click the button to sync your activities:</p>
        <button onclick="sync()" style="padding: 10px 20px; font-size: 16px;">
          Sync Activities
        </button>
        <div id="status" style="margin-top: 20px;"></div>
        
        <script>
          async function sync() {
            const status = document.getElementById('status');
            status.innerHTML = '⏳ Syncing activities...';
            
            try {
              const response = await fetch('/sync');
              const result = await response.text();
              status.innerHTML = '✅ ' + result;
            } catch (error) {
              status.innerHTML = '❌ Error: ' + error.message;
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Sync endpoint
app.get('/sync', async (req, res) => {
  try {
    console.log('Starting sync from web trigger...');
    console.log('Environment variables check:', {
      STRAVA_ACCESS_TOKEN: process.env.STRAVA_ACCESS_TOKEN ? 'present' : 'missing',
      STRAVA_REFRESH_TOKEN: process.env.STRAVA_REFRESH_TOKEN ? 'present' : 'missing',
      GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'present' : 'missing'
    });
    
    const stravaApp = new StravaConnectApp();
    await stravaApp.syncActivities(5); // Start with fewer activities for testing
    res.send('Sync completed successfully!');
  } catch (error) {
    console.error('Sync error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).send('Sync failed: ' + error.message);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Strava sync server running on port ${port}`);
  console.log('📱 You can now trigger syncs from your phone browser!');
  console.log('Environment check:', {
    hasStravaClientId: !!process.env.STRAVA_CLIENT_ID,
    hasGoogleSheetsId: !!process.env.GOOGLE_SHEETS_ID,
    nodeEnv: process.env.NODE_ENV
  });
});