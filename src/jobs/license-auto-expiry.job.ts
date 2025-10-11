/**
 * License Auto-Expiry Processor Job
 * Runs hourly to automatically expire licenses past their end date
 * Schedule: Every hour
 */

import { prisma } from '@/lib/db';

export async function licenseAutoExpiryJob() {
  try {
    console.log('[Job] Running license auto-expiry processor');

    const now = new Date();

    // Find active licenses past their end date
    const expiredLicenses = await prisma.license.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: now },
        deletedAt: null,
      },
      include: {
        brand: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    if (expiredLicenses.length === 0) {
      console.log('[Job] No expired licenses found');
      return { success: true, expired: 0 };
    }

    console.log(`[Job] Found ${expiredLicenses.length} expired licenses`);

    let expiredCount = 0;

    for (const license of expiredLicenses) {
      try {
        // Update status to EXPIRED
        await prisma.license.update({
          where: { id: license.id },
          data: { status: 'EXPIRED' },
        });

        expiredCount++;

        // Log event
        await prisma.event.create({
          data: {
            eventType: 'license.auto_expired',
            actorType: 'system',
            propsJson: {
              licenseId: license.id,
              brandId: license.brandId,
              endDate: license.endDate.toISOString(),
            },
          },
        });

        console.log(
          `[Job] Expired license ${license.id} for brand ${license.brand.companyName}`
        );
      } catch (error) {
        console.error(`[Job] Failed to expire license ${license.id}:`, error);
        // Continue with other licenses
      }
    }

    console.log(`[Job] License auto-expiry completed - Expired: ${expiredCount}`);

    return {
      success: true,
      expired: expiredCount,
    };
  } catch (error) {
    console.error('[Job] License auto-expiry job failed:', error);
    throw error;
  }
}
