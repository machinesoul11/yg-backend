import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';

/**
 * Asset Cleanup Job
 * 
 * Cleans up soft-deleted assets after retention period
 * Scheduled to run daily at 2 AM
 */

export async function assetCleanupJob(job: Job) {
  try {
    const retentionDays = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    job.log(`Cleaning up assets deleted before ${cutoffDate.toISOString()}`);

    // Find assets to clean up
    const assetsToDelete = await prisma.ipAsset.findMany({
      where: {
        deletedAt: {
          not: null,
          lt: cutoffDate,
        },
      },
      select: {
        id: true,
        storageKey: true,
        thumbnailUrl: true,
        previewUrl: true,
      },
    });

    job.log(`Found ${assetsToDelete.length} assets to clean up`);

    let deletedCount = 0;
    let errorCount = 0;

    for (const asset of assetsToDelete) {
      try {
        // Delete files from storage
        const keysToDelete = [asset.storageKey];
        
        // Add thumbnail and preview keys if they exist
        if (asset.thumbnailUrl) {
          keysToDelete.push(extractKeyFromUrl(asset.thumbnailUrl));
        }
        if (asset.previewUrl) {
          keysToDelete.push(extractKeyFromUrl(asset.previewUrl));
        }

        const result = await storageProvider.deleteBatch(keysToDelete);
        
        if (result.failed.length > 0) {
          job.log(
            `Failed to delete some files for asset ${asset.id}: ${result.failed.join(', ')}`
          );
        }

        // Hard delete from database
        await prisma.ipAsset.delete({
          where: { id: asset.id },
        });

        deletedCount++;
        job.log(`Cleaned up asset ${asset.id}`);
      } catch (error) {
        errorCount++;
        job.log(
          `Failed to clean up asset ${asset.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    const summary = {
      total: assetsToDelete.length,
      deleted: deletedCount,
      errors: errorCount,
      cutoffDate: cutoffDate.toISOString(),
    };

    job.log(`Cleanup completed: ${JSON.stringify(summary)}`);

    return summary;
  } catch (error) {
    job.log(`Cleanup job failed: ${error}`);
    throw error;
  }
}

/**
 * Helper to extract storage key from URL
 */
function extractKeyFromUrl(url: string): string {
  // This is a simple implementation
  // Adjust based on your actual URL structure
  const urlObj = new URL(url);
  return urlObj.pathname.substring(1); // Remove leading slash
}
