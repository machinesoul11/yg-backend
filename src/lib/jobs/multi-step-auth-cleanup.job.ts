/**
 * Cleanup Job for Multi-Step Authentication
 * Periodically removes expired temporary auth tokens and trusted devices
 */

import cron from 'node-cron';
import { prisma } from '@/lib/db';
import { MultiStepAuthService } from '@/lib/services/multi-step-auth.service';

const multiStepAuth = new MultiStepAuthService(prisma);

/**
 * Cleanup job that runs hourly
 * Removes expired temporary auth tokens and trusted devices
 */
export function startMultiStepAuthCleanup() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[Multi-Step Auth Cleanup] Starting cleanup job...');
      
      const result = await multiStepAuth.cleanupExpiredTokens();
      
      console.log('[Multi-Step Auth Cleanup] Cleanup completed:', {
        tempTokensDeleted: result.tempTokensDeleted,
        devicesDeleted: result.devicesDeleted,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[Multi-Step Auth Cleanup] Cleanup job failed:', error);
    }
  });

  console.log('[Multi-Step Auth Cleanup] Cleanup job scheduled (runs hourly)');
}

/**
 * Manual cleanup function (can be called via API or CLI)
 */
export async function runMultiStepAuthCleanup() {
  const result = await multiStepAuth.cleanupExpiredTokens();
  
  return {
    success: true,
    data: result,
    message: `Cleaned up ${result.tempTokensDeleted} expired temporary tokens and ${result.devicesDeleted} expired devices`,
  };
}
