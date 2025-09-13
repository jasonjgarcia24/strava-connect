require('dotenv').config();
const express = require('express');
const path = require('path');
const StravaConnectApp = require('./src/index');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Main dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏃‍♂️ Strava Training Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                background: #f5f7fa; 
                color: #333;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                text-align: center;
            }
            .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
            .nav-tabs {
                display: flex;
                background: white;
                border-radius: 8px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .nav-tab {
                flex: 1;
                padding: 15px;
                background: white;
                border: none;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 14px;
                font-weight: 500;
            }
            .nav-tab:hover { background: #f8f9ff; }
            .nav-tab.active { background: #667eea; color: white; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }
            .card {
                background: white;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .card h3 { margin-bottom: 15px; color: #667eea; }
            .sync-section {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 20px;
                padding: 15px;
                background: #f8f9ff;
                border-radius: 8px;
            }
            .sync-section input {
                padding: 8px 12px;
                border: 2px solid #ddd;
                border-radius: 4px;
                width: 80px;
            }
            .btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: background 0.3s ease;
            }
            .btn:hover { background: #5a6fd8; }
            .btn:disabled { background: #ccc; cursor: not-allowed; }
            .status { 
                padding: 10px; 
                border-radius: 4px; 
                margin-top: 10px;
                font-weight: 500;
            }
            .status.success { background: #d4edda; color: #155724; }
            .status.error { background: #f8d7da; color: #721c24; }
            .status.loading { background: #cce7ff; color: #004085; }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            th, td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #eee;
            }
            th {
                background: #f8f9ff;
                font-weight: 600;
                color: #667eea;
            }
            .chart-container {
                position: relative;
                height: 400px;
                margin-bottom: 20px;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                margin-bottom: 20px;
            }
            .stat-card {
                background: white;
                padding: 20px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .stat-value {
                font-size: 24px;
                font-weight: bold;
                color: #667eea;
                margin-bottom: 5px;
            }
            .stat-label { font-size: 14px; color: #666; }
            .loading { text-align: center; padding: 40px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🏃‍♂️ Strava Training Dashboard</h1>
            <p>Comprehensive training analytics and activity management</p>
        </div>

        <div class="container">
            <!-- Sync Section -->
            <div class="card">
                <h3>🔄 Sync Activities</h3>
                <div class="sync-section">
                    <label>Activities to sync:</label>
                    <input type="number" id="activityCount" value="3" min="1" max="200">
                    <small style="color: #666;">(Default: 3 to avoid rate limits)</small>
                    <button class="btn" onclick="syncActivities()">Sync Activities</button>
                </div>
                <div id="syncStatus"></div>
            </div>

            <!-- Navigation -->
            <div class="nav-tabs">
                <button class="nav-tab active" onclick="showTab('overview')">📊 Overview</button>
                <button class="nav-tab" onclick="showTab('activities')">🏃 Activities</button>
                <button class="nav-tab" onclick="showTab('weekly')">📅 Weekly</button>
                <button class="nav-tab" onclick="showTab('monthly')">📈 Monthly</button>
                <button class="nav-tab" onclick="showTab('summaries')">📝 Summaries</button>
            </div>

            <!-- Overview Tab -->
            <div id="overview" class="tab-content active">
                <div class="stats-grid" id="overviewStats">
                    <div class="loading">Loading overview statistics...</div>
                </div>
                
                <div class="card">
                    <h3>📈 Activity Trends (Last 30 Days)</h3>
                    <div class="chart-container">
                        <canvas id="trendsChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Activities Tab -->
            <div id="activities" class="tab-content">
                <div class="card">
                    <h3>🏃 Recent Activities</h3>
                    <div id="activitiesTable">
                        <div class="loading">Loading activities...</div>
                    </div>
                </div>
            </div>

            <!-- Weekly Tab -->
            <div id="weekly" class="tab-content">
                <div class="card">
                    <h3>📅 Weekly Analysis</h3>
                    <div class="chart-container">
                        <canvas id="weeklyChart"></canvas>
                    </div>
                </div>
                
                <div class="card">
                    <h3>📊 Weekly Statistics</h3>
                    <div id="weeklyStats">
                        <div class="loading">Loading weekly statistics...</div>
                    </div>
                </div>
            </div>

            <!-- Monthly Tab -->
            <div id="monthly" class="tab-content">
                <div class="card">
                    <h3>📈 Monthly Trends</h3>
                    <div class="chart-container">
                        <canvas id="monthlyChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Summaries Tab -->
            <div id="summaries" class="tab-content">
                <div class="card">
                    <h3>📝 Weekly Summaries</h3>
                    <div id="summariesContent">
                        <div class="loading">Loading weekly summaries...</div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let currentTab = 'overview';
            let activities = [];
            let summaries = [];

            // Tab management
            function showTab(tabName) {
                document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                
                document.getElementById(tabName).classList.add('active');
                event.target.classList.add('active');
                
                currentTab = tabName;
                loadTabData(tabName);
            }

            // Sync activities
            async function syncActivities() {
                const status = document.getElementById('syncStatus');
                const activityCount = document.getElementById('activityCount').value;
                const btn = event.target;
                
                btn.disabled = true;
                status.innerHTML = \`<div class="status loading">⏳ Syncing \${activityCount} activities...</div>\`;
                
                try {
                    const response = await fetch(\`/sync?count=\${activityCount}\`);
                    const result = await response.text();
                    status.innerHTML = \`<div class="status success">✅ \${result}</div>\`;
                    
                    // Refresh current tab data
                    setTimeout(() => loadTabData(currentTab), 1000);
                } catch (error) {
                    status.innerHTML = \`<div class="status error">❌ Error: \${error.message}</div>\`;
                } finally {
                    btn.disabled = false;
                }
            }

            // Load data for specific tab
            async function loadTabData(tabName) {
                switch(tabName) {
                    case 'overview':
                        loadOverview();
                        break;
                    case 'activities':
                        loadActivities();
                        break;
                    case 'weekly':
                        loadWeeklyAnalysis();
                        break;
                    case 'monthly':
                        loadMonthlyAnalysis();
                        break;
                    case 'summaries':
                        loadSummaries();
                        break;
                }
            }

            // Load overview statistics
            async function loadOverview() {
                try {
                    const response = await fetch('/api/overview');
                    const data = await response.json();
                    
                    document.getElementById('overviewStats').innerHTML = \`
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalActivities}</div>
                            <div class="stat-label">Total Activities</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalDistance}</div>
                            <div class="stat-label">Total Distance (mi)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.totalTime}</div>
                            <div class="stat-label">Total Time (hrs)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">\${data.avgHeartRate}</div>
                            <div class="stat-label">Avg Heart Rate</div>
                        </div>
                    \`;
                    
                    // Create trends chart
                    createTrendsChart(data.trendsData);
                } catch (error) {
                    document.getElementById('overviewStats').innerHTML = '<div class="error">Failed to load overview data</div>';
                }
            }

            // Load activities table
            async function loadActivities() {
                try {
                    const response = await fetch('/api/activities');
                    activities = await response.json();
                    
                    const tableHTML = \`
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Distance</th>
                                    <th>Duration</th>
                                    <th>Avg HR</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${activities.map(activity => \`
                                    <tr>
                                        <td>\${new Date(activity.Date || activity.start_date_local).toLocaleDateString()}</td>
                                        <td>\${activity.Name || activity.name}</td>
                                        <td>\${activity.Type || activity.sport_type}</td>
                                        <td>\${activity['Distance (mi)'] || (activity.distance / 1609.34).toFixed(1)} mi</td>
                                        <td>\${activity['Moving Time (min)'] || Math.round(activity.moving_time / 60)} min</td>
                                        <td>\${activity['Avg Heart Rate'] || activity.average_heartrate || 'N/A'}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                    
                    document.getElementById('activitiesTable').innerHTML = tableHTML;
                } catch (error) {
                    document.getElementById('activitiesTable').innerHTML = '<div class="error">Failed to load activities</div>';
                }
            }

            // Load weekly analysis
            async function loadWeeklyAnalysis() {
                try {
                    const response = await fetch('/api/weekly');
                    const data = await response.json();
                    
                    createWeeklyChart(data);
                    
                    document.getElementById('weeklyStats').innerHTML = \`
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="stat-value">\${data.thisWeek.activities}</div>
                                <div class="stat-label">This Week Activities</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${data.thisWeek.distance}</div>
                                <div class="stat-label">This Week Distance</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${data.lastWeek.activities}</div>
                                <div class="stat-label">Last Week Activities</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-value">\${data.lastWeek.distance}</div>
                                <div class="stat-label">Last Week Distance</div>
                            </div>
                        </div>
                    \`;
                } catch (error) {
                    document.getElementById('weeklyStats').innerHTML = '<div class="error">Failed to load weekly data</div>';
                }
            }

            // Load monthly analysis
            async function loadMonthlyAnalysis() {
                try {
                    const response = await fetch('/api/monthly');
                    const data = await response.json();
                    
                    createMonthlyChart(data);
                } catch (error) {
                    console.error('Failed to load monthly data');
                }
            }

            // Load summaries
            async function loadSummaries() {
                try {
                    const response = await fetch('/api/summaries');
                    summaries = await response.json();
                    
                    const summariesHTML = summaries.map(summary => \`
                        <div class="card">
                            <h4>Week \${summary['Week Number']}, \${summary['Year']} - \${summary['Week Range']}</h4>
                            <p><strong>Activities:</strong> \${summary['Total Activities']} (\${summary['Activities With Notes']} with notes)</p>
                            <div style="margin-top: 10px; padding: 15px; background: #f8f9ff; border-radius: 4px;">
                                \${summary['AI Summary']}
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('summariesContent').innerHTML = summariesHTML || '<p>No weekly summaries found.</p>';
                } catch (error) {
                    document.getElementById('summariesContent').innerHTML = '<div class="error">Failed to load summaries</div>';
                }
            }

            // Chart creation functions
            function createTrendsChart(data) {
                const ctx = document.getElementById('trendsChart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [{
                            label: 'Distance (mi)',
                            data: data.distances,
                            borderColor: '#667eea',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: true }
                        }
                    }
                });
            }

            function createWeeklyChart(data) {
                const ctx = document.getElementById('weeklyChart').getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: data.weeks,
                        datasets: [{
                            label: 'Weekly Distance (mi)',
                            data: data.distances,
                            backgroundColor: '#667eea'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            }

            function createMonthlyChart(data) {
                const ctx = document.getElementById('monthlyChart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.months,
                        datasets: [{
                            label: 'Monthly Distance (mi)',
                            data: data.distances,
                            borderColor: '#764ba2',
                            backgroundColor: 'rgba(118, 75, 162, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            }

            // Initialize dashboard
            document.addEventListener('DOMContentLoaded', function() {
                loadTabData('overview');
            });
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

// API Endpoints for dashboard data
app.get('/api/overview', async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Calculate overview statistics
    const totalActivities = activities.length;
    const totalDistance = activities.reduce((sum, activity) => {
      const distance = parseFloat(activity['Distance (mi)']) || 0;
      return sum + distance;
    }, 0).toFixed(1);
    
    const totalTime = activities.reduce((sum, activity) => {
      const time = parseFloat(activity['Moving Time (min)']) || 0;
      return sum + time;
    }, 0);
    
    const avgHeartRate = activities.filter(a => a['Avg Heart Rate'] && a['Avg Heart Rate'] !== 'N/A')
      .reduce((sum, activity, _, arr) => {
        return sum + (parseFloat(activity['Avg Heart Rate']) || 0) / arr.length;
      }, 0).toFixed(0);

    // Prepare trends data (last 30 days)
    const last30Days = activities
      .filter(activity => {
        const activityDate = new Date(activity.Date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return activityDate >= thirtyDaysAgo;
      })
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const trendsData = {
      labels: last30Days.map(activity => new Date(activity.Date).toLocaleDateString()),
      distances: last30Days.map(activity => parseFloat(activity['Distance (mi)']) || 0)
    };

    res.json({
      totalActivities,
      totalDistance,
      totalTime: (totalTime / 60).toFixed(1),
      avgHeartRate: avgHeartRate || 'N/A',
      trendsData
    });
  } catch (error) {
    console.error('Overview API error:', error);
    res.status(500).json({ error: 'Failed to load overview data' });
  }
});

app.get('/api/activities', async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Sort by date, most recent first
    const sortedActivities = activities.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
    res.json(sortedActivities.slice(0, 50)); // Return last 50 activities
  } catch (error) {
    console.error('Activities API error:', error);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

app.get('/api/weekly', async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Calculate weekly statistics
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    thisWeekStart.setHours(0, 0, 0, 0);
    
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);
    
    const thisWeekActivities = activities.filter(activity => {
      const date = new Date(activity.Date);
      return date >= thisWeekStart;
    });
    
    const lastWeekActivities = activities.filter(activity => {
      const date = new Date(activity.Date);
      return date >= lastWeekStart && date <= lastWeekEnd;
    });
    
    // Prepare weekly chart data (last 8 weeks)
    const weeks = [];
    const distances = [];
    
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (i * 7) - now.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const weekActivities = activities.filter(activity => {
        const date = new Date(activity.Date);
        return date >= weekStart && date <= weekEnd;
      });
      
      const weekDistance = weekActivities.reduce((sum, activity) => {
        return sum + (parseFloat(activity['Distance (mi)']) || 0);
      }, 0);
      
      weeks.push(`Week ${weekStart.getMonth() + 1}/${weekStart.getDate()}`);
      distances.push(weekDistance.toFixed(1));
    }
    
    res.json({
      thisWeek: {
        activities: thisWeekActivities.length,
        distance: thisWeekActivities.reduce((sum, a) => sum + (parseFloat(a['Distance (mi)']) || 0), 0).toFixed(1)
      },
      lastWeek: {
        activities: lastWeekActivities.length,
        distance: lastWeekActivities.reduce((sum, a) => sum + (parseFloat(a['Distance (mi)']) || 0), 0).toFixed(1)
      },
      weeks,
      distances
    });
  } catch (error) {
    console.error('Weekly API error:', error);
    res.status(500).json({ error: 'Failed to load weekly data' });
  }
});

app.get('/api/monthly', async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const activities = await stravaApp.sheetsService.getAllActivities();
    
    // Calculate monthly data (last 12 months)
    const months = [];
    const distances = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const monthActivities = activities.filter(activity => {
        const date = new Date(activity.Date);
        return date >= monthStart && date <= monthEnd;
      });
      
      const monthDistance = monthActivities.reduce((sum, activity) => {
        return sum + (parseFloat(activity['Distance (mi)']) || 0);
      }, 0);
      
      months.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      distances.push(monthDistance.toFixed(1));
    }
    
    res.json({ months, distances });
  } catch (error) {
    console.error('Monthly API error:', error);
    res.status(500).json({ error: 'Failed to load monthly data' });
  }
});

app.get('/api/summaries', async (req, res) => {
  try {
    const stravaApp = new StravaConnectApp();
    const summaries = await stravaApp.sheetsService.getExistingWeeklySummaries();
    
    // Sort by year and week number, most recent first
    const sortedSummaries = summaries.sort((a, b) => {
      const yearDiff = parseInt(b.Year) - parseInt(a.Year);
      if (yearDiff !== 0) return yearDiff;
      return parseInt(b['Week Number']) - parseInt(a['Week Number']);
    });
    
    res.json(sortedSummaries.slice(0, 20)); // Return last 20 summaries
  } catch (error) {
    console.error('Summaries API error:', error);
    res.status(500).json({ error: 'Failed to load summaries' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Strava Training Dashboard running on port ${port}`);
  console.log('📱 Access your comprehensive training analytics at the web interface!');
  console.log('✨ Features: Activity sync, data tables, charts, weekly/monthly trends, and AI summaries');
});