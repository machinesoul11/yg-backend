/**
 * Brand Data Cleanup Job
 * Permanently deletes brands soft-deleted > 90 days ago
 * Schedule: Monthly on the 1st at midnight
 */

import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';

export async function brandDataCleanupJob() {
  try {
    console.log('[Job] Running brand data cleanup job');

    const deletionThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Find brands soft-deleted more than 90 days ago
    const brandsToDelete = await (prisma.brand as any).findMany({
      where: {
        deletedAt: { lte: deletionThreshold },
      },
      select: {
        id: true,
        brandGuidelinesUrl: true,
        companyName: true,
      },
    });

    console.log(`[Job] Found ${brandsToDelete.length} brands to permanently delete`);

    for (const brand of brandsToDelete) {
      try {
        // Delete brand guidelines from storage if exists
        if (brand.brandGuidelinesUrl) {
          const storageKey = extractKeyFromUrl(brand.brandGuidelinesUrl);
          await storageProvider.delete(storageKey).catch((err) => {
            console.error(`[Job] Failed to delete guidelines for brand ${brand.id}:`, err);
          });
        }

        // Permanently delete from database
        await prisma.brand.delete({
          where: { id: brand.id },
        });

        console.log(`[Job] Permanently deleted brand ${brand.companyName} (${brand.id})`);
      } catch (error) {
        console.error(`[Job] Failed to delete brand ${brand.id}:`, error);
      }
    }

    console.log(`[Job] Brand data cleanup completed. Deleted ${brandsToDelete.length} brands`);
  } catch (error) {
    console.error('[Job] Brand data cleanup job failed:', error);
    throw error;
  }
}

// Helper function to extract storage key from URL
function extractKeyFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.substring(1); // Remove leading slash
  } catch {
    return url; // Return as-is if not a valid URL
  }
}

// Export for scheduler
export const brandDataCleanupJobConfig = {
  name: 'brand-data-cleanup',
  schedule: '0 0 1 * *', // Monthly on the 1st at midnight
  handler: brandDataCleanupJob,
};
