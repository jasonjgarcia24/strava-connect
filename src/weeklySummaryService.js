const { InferenceClient } = require('@huggingface/inference');
const TokenManager = require('./tokenManager');
const SecureEncryption = require('../utils/encryptUtils.js');

class WeeklySummaryService {
  #encryption = null;
  #source = 'huggingface';

  constructor() {
    this.modelName = 'meta-llama/Llama-4-Maverick-17B-128E-Instruct';
    
    const tokenManager = new TokenManager(this.#source);
    const tokens = tokenManager.loadTokens();
    
    this.huggingFaceApiKey = tokens?.private_key;
    
    if (!this.huggingFaceApiKey) {
      console.warn('Hugging Face API key not found in tokens.json. Weekly summaries will not be available.');
      console.warn('Please add "private_key" to the "huggingface" section in your tokens.json file.');
      console.warn('Get a free API key at: https://huggingface.co/settings/tokens');
    }
  }

  async safeAsyncCall(func, args = []) {
    try {
      this.#encryption = new SecureEncryption(this.#source);

      switch (func) {
        case '#generateAISummary':
          return await this.#generateAISummary(...args);
      }
    }
    finally {
      this.#encryption.destroy();
    }
  }

  /**
   * Check if we should generate a weekly summary based on the current day
   * Only generate on Wednesday (3) or later in the week
   */
  shouldGenerateWeeklySummary(date = new Date()) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return dayOfWeek >= 3; // Wednesday (3) or later
  }

  /**
   * Get the start and end dates for a given week
   */
  getWeekDateRange(date = new Date()) {
    const startOfWeek = new Date(date);
    const dayOfWeek = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as start
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { startOfWeek, endOfWeek };
  }

  /**
   * Calculate week number for a given date
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Filter activities for a specific week
   */
  getActivitiesForWeek(activities, weekDate = new Date()) {
    const { startOfWeek, endOfWeek } = this.getWeekDateRange(weekDate);
    
    return activities.filter(activity => {
      const activityDate = new Date(activity.start_date_local);
      return activityDate >= startOfWeek && activityDate <= endOfWeek;
    });
  }

  /**
   * Extract and structure activity data for AI analysis
   */
  prepareActivityData(activities) {
    return activities.map(activity => {
      // Handle both Strava API format and Sheet format
      const activityId = activity.id || activity.ID || activity['ID'];
      const activityName = activity.name || activity.Name || activity['Name'];
      const startDate = activity.start_date_local || activity['Date'];
      const sportType = activity.sport_type || activity.Type || activity['Type'];
      const distance = activity.distance || activity['Distance (mi)'];
      const movingTime = activity.moving_time || activity['Moving Time (min)'];
      const avgHeartrate = activity.average_heartrate || activity['Avg Heart Rate'];
      const perceivedExertion = activity.perceived_exertion || activity['Perceived Exertion'];
      const privateNotes = activity.private_note || activity['Private Notes'];
      const locationCity = activity.location_city || activity['Location Name'];
      
      return {
        id: activityId,
        name: activityName,
        date: startDate instanceof Date ? startDate.toLocaleDateString() : new Date(startDate).toLocaleDateString(),
        type: sportType,
        distance: distance ? (typeof distance === 'number' ? `${Math.round(distance / 1609.34 * 100) / 100} mi` : `${distance} mi`) : '0 mi',
        duration: movingTime ? (typeof movingTime === 'number' ? `${Math.round(movingTime / 60)} min` : `${movingTime} min`) : 'N/A',
        heartRate: avgHeartrate ? `avg ${avgHeartrate} bpm` : 'N/A',
        perceivedExertion: perceivedExertion || 'N/A',
        privateNotes: privateNotes || 'No notes',
        location: locationCity || 'Unknown'
      };
    }).filter(activity => activity.privateNotes && activity.privateNotes !== 'No notes'); // Only include activities with notes
  }

  /**
   * Generate weekly summary using Hugging Face AI
   */
  async generateWeeklySummary(activities, weekDate = new Date()) {
    if (!this.huggingFaceApiKey) {
      throw new Error('Hugging Face API key not configured. Please add "private_key" to the "huggingface" section in your tokens.json file.');
    }

    const weekActivities = this.getActivitiesForWeek(activities, weekDate);
    const activitiesWithNotes = this.prepareActivityData(weekActivities);

    if (activitiesWithNotes.length === 0) {
      return {
        weekRange: this.getWeekDateRange(weekDate),
        summary: 'No activities with private notes found for this week.',
        totalActivities: weekActivities.length,
        activitiesWithNotes: 0
      };
    }

    const { startOfWeek, endOfWeek } = this.getWeekDateRange(weekDate);
    const weekRange = `${startOfWeek.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
    const weekNumber = this.getWeekNumber(startOfWeek);
    const year = startOfWeek.getFullYear();

    // Get all activity IDs for the week (both with and without notes)
    const allActivityIds = weekActivities.map(activity => 
      activity.id || activity.ID || activity['ID']
    ).filter(id => id);

    const prompt = this.createAnalysisPrompt(activitiesWithNotes, weekRange);

    try {
      const aiSummary = await this.safeAsyncCall('#generateAISummary', [prompt]);

      return {
        weekNumber,
        year,
        weekRange,
        weekStartDate: startOfWeek.toLocaleDateString(),
        weekEndDate: endOfWeek.toLocaleDateString(),
        summary: aiSummary,
        totalActivities: weekActivities.length,
        activitiesWithNotes: activitiesWithNotes.length,
        activityIds: allActivityIds,
        activities: activitiesWithNotes
      };

    } catch (error) {
      console.error('Error generating AI summary:', error.response?.data || error.message);
      throw new Error(`Failed to generate weekly summary: ${error.message}`);
    }
  }

  async #generateAISummary(prompt) {
    // Check if we have enough content
    const activitiesMatch = prompt.match(/\*\*Activities with Notes:\*\*\n([\s\S]*)/);
    const activitiesText = activitiesMatch ? activitiesMatch[1].trim() : '';
    
    if (activitiesText.length < 50) {
      return 'Not enough activity notes to generate a meaningful summary for this week.';
    }
    
    // Initialize Hugging Face client
    const hf = new InferenceClient(this.#encryption.decrypt(this.huggingFaceApiKey));
    
    // Prepare the prompt, truncating if necessary
    let userPrompt = prompt;
    if (userPrompt.length > 3000) {
      const truncatedActivities = activitiesText.substring(0, 1500) + '...\n\n[Additional activities truncated for length]';
      userPrompt = prompt.replace(activitiesText, truncatedActivities);
    }
    
    try {
      const response = await hf.chatCompletion({
        model: this.modelName,
        messages: [
          {
            role: "system",
            content: "You are analyzing your own training notes and creating a factual summary. Write in first person ('I', 'my', 'me') and focus on specific, concrete observations from the notes: recurring body issues, equipment changes, location patterns, pace/effort mentions, recovery activities, medical appointments, or notable performance changes. Avoid subjective interpretations - stick to what was explicitly mentioned in the notes. Keep it to 2-3 sentences highlighting the most important factual patterns from the week. Start directly with the observations - no introduction or preamble."
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      // Extract the generated text from the response
      const generatedText = response.choices?.[0]?.message?.content || 'Unable to generate summary';
      
      return generatedText.trim();
      
    } catch (error) {
      console.error('Hugging Face API Error:', error.message);
      
      // Fallback to a basic summary if API fails
      const weekMatch = prompt.match(/\*\*Week: (.*?)\*\*/);
      const weekRange = weekMatch ? weekMatch[1] : 'Unknown week';
      
      return `Weekly Training Summary for ${weekRange}:\n\nAPI summarization temporarily unavailable. Raw notes available in training data.`;
    }
  }

  /**
   * Create the analysis prompt for AI model
   */
  createAnalysisPrompt(activities, weekRange) {
    const activitiesText = activities.map(activity => 
      `**${activity.date} - ${activity.name}** (${activity.type})
Distance: ${activity.distance} | Duration: ${activity.duration} | Heart Rate: ${activity.heartRate}
Perceived Exertion: ${activity.perceivedExertion} | Location: ${activity.location}
Notes: ${activity.privateNotes}
---`
    ).join('\n');

    return `You are analyzing a week's worth of athletic activities and training notes. Please provide a concise, insightful summary focusing on:

1. **Training Patterns**: What types of activities were done and their frequency
2. **Physical Condition**: Any mentions of injuries, pain, recovery, or how the body felt
3. **Performance Trends**: Improvements, struggles, or notable achievements
4. **Recovery & Health**: Sleep, nutrition, equipment issues, or medical appointments mentioned
5. **Key Insights**: Important patterns or themes that emerge from the notes

**Week: ${weekRange}**

**Activities with Notes:**
${activitiesText}

Please provide a well-organized summary in 3-4 paragraphs that would be useful for tracking training progress and health patterns. Focus on actionable insights and notable trends rather than just restating the individual notes.`;
  }

  /**
   * Generate summary for the current week
   */
  async getCurrentWeekSummary(activities) {
    return this.generateWeeklySummary(activities, new Date());
  }

  /**
   * Generate summary for the previous week
   */
  async getPreviousWeekSummary(activities) {
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    return this.generateWeeklySummary(activities, lastWeek);
  }

  /**
   * Generate summary for a specific week by date
   */
  async getWeekSummaryByDate(activities, dateString) {
    const targetDate = new Date(dateString);
    if (isNaN(targetDate.getTime())) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD format.');
    }
    return this.generateWeeklySummary(activities, targetDate);
  }

  /**
   * Check for missing weekly summaries and generate them
   */
  async backfillMissingSummaries(activities, startWeeks = 12) {
    if (!activities || activities.length === 0) {
      console.log('No activities found for backfill analysis.');
      return [];
    }

    // Get existing summaries from sheets
    const SheetsService = require('./sheetsService');
    const sheetsService = new SheetsService();
    const existingSummaries = await sheetsService.getExistingWeeklySummaries();
    
    // Create a set of existing week/year combinations
    const existingWeeks = new Set();
    existingSummaries.forEach(summary => {
      const weekKey = `${summary['Week Number']}-${summary['Year']}`;
      existingWeeks.add(weekKey);
    });

    console.log(`Found ${existingSummaries.length} existing weekly summaries`);

    // Generate list of weeks to check (going back startWeeks from today)
    const weeksToCheck = [];
    const today = new Date();
    
    for (let i = 0; i < startWeeks; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - (i * 7));
      
      const { startOfWeek } = this.getWeekDateRange(checkDate);
      const weekNumber = this.getWeekNumber(startOfWeek);
      const year = startOfWeek.getFullYear();
      const weekKey = `${weekNumber}-${year}`;
      
      if (!existingWeeks.has(weekKey)) {
        weeksToCheck.push({
          date: new Date(checkDate),
          weekNumber,
          year,
          weekKey
        });
      }
    }

    if (weeksToCheck.length === 0) {
      console.log('✅ All weekly summaries are up to date!');
      return [];
    }

    console.log(`Found ${weeksToCheck.length} missing weekly summaries:`);
    weeksToCheck.forEach(week => {
      console.log(`  - Week ${week.weekNumber} ${week.year}`);
    });

    // Generate missing summaries
    const generatedSummaries = [];
    for (const week of weeksToCheck) {
      try {
        console.log(`\nGenerating summary for Week ${week.weekNumber} ${week.year}...`);
        const summary = await this.generateWeeklySummary(activities, week.date);
        
        if (summary.activitiesWithNotes > 0) {
          // Save to spreadsheet
          await sheetsService.createWeeklySummaryHeaders();
          await sheetsService.appendWeeklySummary(summary);
          
          generatedSummaries.push(summary);
          console.log(`✅ Generated summary for Week ${week.weekNumber} ${week.year} (${summary.activitiesWithNotes} activities with notes)`);
        } else {
          console.log(`⏭️  Skipping Week ${week.weekNumber} ${week.year} - no activities with notes`);
        }
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Failed to generate summary for Week ${week.weekNumber} ${week.year}:`, error.message);
      }
    }

    return generatedSummaries;
  }

  /**
   * Check if current week already has a summary and generate if needed
   */
  async generateCurrentWeekSummaryIfNeeded(activities) {
    // Check if it's Wednesday or later
    if (!this.shouldGenerateWeeklySummary()) {
      console.log('📅 Not generating weekly summary yet - waiting until Wednesday');
      return null;
    }

    // Get current week info
    const today = new Date();
    const { startOfWeek } = this.getWeekDateRange(today);
    const weekNumber = this.getWeekNumber(startOfWeek);
    const year = startOfWeek.getFullYear();

    // Check if summary already exists
    const SheetsService = require('./sheetsService');
    const sheetsService = new SheetsService();
    const existingSummaries = await sheetsService.getExistingWeeklySummaries();
    
    const weekKey = `${weekNumber}-${year}`;
    const alreadyExists = existingSummaries.some(summary => {
      const existingWeekKey = `${summary['Week Number']}-${summary['Year']}`;
      return existingWeekKey === weekKey;
    });

    if (alreadyExists) {
      console.log(`📊 Weekly summary for Week ${weekNumber} ${year} already exists - regenerating with latest data`);
    }

    // Generate current week summary
    console.log(`📝 Auto-generating weekly summary for Week ${weekNumber} ${year}...`);
    try {
      const summary = await this.getCurrentWeekSummary(activities);
      
      if (summary.activitiesWithNotes > 0) {
        // Save to spreadsheet (always append)
        await sheetsService.createWeeklySummaryHeaders();
        await sheetsService.appendWeeklySummary(summary);
        
        const action = alreadyExists ? 'Regenerated' : 'Generated';
        console.log(`✅ ${action} weekly summary for Week ${weekNumber} ${year} (${summary.activitiesWithNotes} activities with notes)`);
        return summary;
      } else {
        console.log(`⏭️  Skipping Week ${weekNumber} ${year} auto-summary - no activities with notes yet`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to auto-generate weekly summary for Week ${weekNumber} ${year}:`, error.message);
      return null;
    }
  }
}

module.exports = WeeklySummaryService;