/**
 * Password Security Cleanup Job
 * Periodically cleans up expired remember-me tokens and unlocks accounts
 * Runs every 15 minutes
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { RememberMeService } from '@/lib/auth/remember-me.service';
import { AccountLockoutService } from '@/lib/auth/account-lockout.service';

export async function processPasswordSecurityCleanup(job: Job) {
  job.log('Starting password security cleanup');

  try {
    const rememberMeService = new RememberMeService(prisma);
    const lockoutService = new AccountLockoutService(prisma);

    // Clean up expired remember-me tokens
    const tokensRemoved = await rememberMeService.cleanupExpiredTokens();
    job.log(`Cleaned up ${tokensRemoved} expired remember-me tokens`);

    // Unlock accounts whose lockout period has expired
    const accountsUnlocked = await lockoutService.unlockExpiredAccounts();
    job.log(`Unlocked ${accountsUnlocked} accounts`);

    // Get lockout statistics for monitoring
    const lockoutStats = await lockoutService.getLockoutStats();
    job.log(
      `Lockout stats: ${lockoutStats.currentlyLocked} currently locked, ${lockoutStats.lockedToday} locked today`
    );

    return {
      success: true,
      tokensRemoved,
      accountsUnlocked,
      lockoutStats,
    };
  } catch (error) {
    job.log(`Password security cleanup failed: ${error}`);
    throw error;
  }
}
