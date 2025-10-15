/**
 * Post Analytics Job Initialization
 * Script to initialize background jobs for post analytics
 */

import { scheduleNightlyPostAggregation } from '@/jobs/analytics-jobs';

/**
 * Initialize post analytics background jobs
 * Call this during application startup
 */
export async function initializePostAnalyticsJobs(): Promise<void> {
  try {
    console.log('[PostAnalytics] Initializing background jobs...');
    
    // Schedule nightly metrics aggregation
    await scheduleNightlyPostAggregation();
    
    console.log('[PostAnalytics] Background jobs initialized successfully');
  } catch (error) {
    console.error('[PostAnalytics] Failed to initialize background jobs:', error);
    throw error;
  }
}

// For standalone execution
if (require.main === module) {
  initializePostAnalyticsJobs()
    .then(() => {
      console.log('Post analytics jobs initialized');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to initialize post analytics jobs:', error);
      process.exit(1);
    });
}
