/**
 * License Management Background Job
 * Runs automated status transitions and renewal processing
 * Schedule: Daily at 02:00 UTC
 */

import { licenseService } from '@/modules/licenses';

export async function licenseManagementJob() {
  try {
    console.log('[Job] Running license management job');
    const startTime = Date.now();

    // 1. Process automated status transitions
    console.log('[Job] Processing automated status transitions...');
    const transitionResults = await licenseService.processAutomatedTransitions();
    
    console.log(
      `[Job] Status transitions complete - Processed: ${transitionResults.processed}, Errors: ${transitionResults.errors.length}`
    );

    if (transitionResults.errors.length > 0) {
      console.error('[Job] Status transition errors:', transitionResults.errors);
    }

    // 2. Process auto-renewals
    console.log('[Job] Processing auto-renewals...');
    const renewalResults = await licenseService.processAutoRenewals();
    
    console.log(
      `[Job] Auto-renewals complete - Processed: ${renewalResults.processed}, Failed: ${renewalResults.failed}`
    );

    const duration = Date.now() - startTime;
    
    console.log(
      `[Job] License management job completed in ${duration}ms - Total transitions: ${transitionResults.processed}, Total renewals: ${renewalResults.processed}`
    );

    return {
      success: true,
      duration,
      transitions: transitionResults,
      renewals: renewalResults,
    };
  } catch (error) {
    console.error('[Job] License management job failed:', error);
    throw error;
  }
}
