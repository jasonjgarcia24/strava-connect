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
        <p>Sync your recent Strava activities to Google Sheets:</p>
        
        <div style="margin: 20px 0;">
          <label for="activityCount" style="display: block; margin-bottom: 5px;">
            Number of activities to sync:
          </label>
          <input 
            type="number" 
            id="activityCount" 
            value="3" 
            min="1" 
            max="200"
            style="padding: 8px; width: 80px; margin-right: 10px;"
          />
          <small style="color: #666;">
            (Default: 3 to avoid rate limits. Higher numbers may fail.)
          </small>
        </div>
        
        <button onclick="sync()" style="padding: 10px 20px; font-size: 16px;">
          Sync Activities
        </button>
        <div id="status" style="margin-top: 20px;"></div>
        
        <script>
          async function sync() {
            const status = document.getElementById('status');
            const activityCount = document.getElementById('activityCount').value;
            
            status.innerHTML = \`⏳ Syncing \${activityCount} activities...\`;
            
            try {
              const response = await fetch(\`/sync?count=\${activityCount}\`);
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
    const activityCount = parseInt(req.query.count) || 3; // Default to 3 if not provided
    
    // Validate the count
    if (activityCount < 1 || activityCount > 200) {
      return res.status(400).send('Activity count must be between 1 and 200');
    }
    
    console.log(`Starting sync from web trigger... (${activityCount} activities)`);
    
    const stravaApp = new StravaConnectApp();
    await stravaApp.syncActivities(activityCount);
    res.send(`Sync completed successfully! Processed ${activityCount} activities.`);
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
});