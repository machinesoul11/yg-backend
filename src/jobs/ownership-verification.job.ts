/**
 * Ownership Verification Background Job
 * 
 * Periodically verifies IP ownership data integrity
 * Ensures all assets have ownership summing to exactly 10,000 BPS
 * 
 * Schedule: Daily at 2 AM UTC
 */

import { prisma } from '@/lib/db';

interface InvalidOwnership {
  ip_asset_id: string;
  total_bps: number;
  owner_count: number;
}

export async function ownershipVerificationJob() {
  const startTime = Date.now();
  console.log('Starting ownership verification job');

  try {
    // Find assets with invalid ownership sums
    const invalidAssets = await prisma.$queryRaw<InvalidOwnership[]>`
      SELECT 
        ip_asset_id,
        SUM(share_bps) as total_bps,
        COUNT(*) as owner_count
      FROM ip_ownerships
      WHERE start_date <= NOW()
        AND (end_date IS NULL OR end_date > NOW())
      GROUP BY ip_asset_id
      HAVING SUM(share_bps) != 10000
    `;

    if (invalidAssets.length > 0) {
      // Log critical alert
      console.error('IP Ownership integrity violation detected', {
        severity: 'CRITICAL',
        invalidCount: invalidAssets.length,
        details: invalidAssets,
      });

      // Create audit event
      await prisma.auditEvent.create({
        data: {
          action: 'OWNERSHIP_INTEGRITY_CHECK_FAILED',
          afterJson: {
            invalidAssets,
            checkTime: new Date().toISOString(),
          } as any,
        },
      });

      // TODO: Send admin alert email when email service is configured
      // await notificationService.sendAdminAlert({
      //   type: 'OWNERSHIP_INTEGRITY_VIOLATION',
      //   severity: 'CRITICAL',
      //   message: `${invalidAssets.length} assets have invalid ownership splits`,
      //   details: invalidAssets,
      // });

      return {
        success: false,
        invalidCount: invalidAssets.length,
        invalidAssets,
      };
    }

    // All good - log success
    console.log('Ownership verification completed successfully', {
      duration: Date.now() - startTime,
    });

    await prisma.auditEvent.create({
      data: {
        action: 'OWNERSHIP_INTEGRITY_CHECK_PASSED',
        afterJson: {
          checkTime: new Date().toISOString(),
          duration: Date.now() - startTime,
        } as any,
      },
    });

    return {
      success: true,
      invalidCount: 0,
    };
  } catch (error) {
    console.error('Ownership verification job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

// Export job configuration for scheduler
export const ownershipVerificationJobConfig = {
  name: 'ownership-verification',
  schedule: '0 2 * * *', // Daily at 2 AM UTC
  handler: ownershipVerificationJob,
  enabled: true,
  retryAttempts: 3,
  retryDelay: 60000, // 1 minute
};
