import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { ScanStatus, AssetStatus } from '@prisma/client';
import { storageProvider } from '@/lib/storage';
import { 
  virusScanner, 
  VirusScanStatus,
  type ScanResult 
} from '@/lib/services/virus-scanner';
import { EventService } from '@/modules/analytics/services/event.service';
import { redisConnection } from '@/lib/db/redis';;
import { Queue } from 'bullmq';

/**
 * Virus Scan Job
 * 
 * Scans uploaded assets for viruses and malware
 */

export interface VirusScanJobData {
  assetId: string;
  storageKey: string;
  retryCount?: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export async function virusScanJob(job: Job<VirusScanJobData>) {
  const { assetId, storageKey, retryCount = 0 } = job.data;

  try {
    job.log(`Starting virus scan for asset ${assetId} (attempt ${retryCount + 1}/${MAX_RETRIES})`);

    // Get asset details
    const asset = await prisma.ipAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        mimeType: true,
        fileSize: true,
        createdBy: true,
      },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    // Update status to scanning
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: { scanStatus: ScanStatus.SCANNING },
    });

    // Generate signed URL for scanner to access file
    const { url: fileUrl } = await storageProvider.getDownloadUrl({
      key: storageKey,
      expiresIn: 900, // 15 minutes
    });

    // Submit file for scanning
    const scanId = await virusScanner.submitScan(fileUrl, {
      assetId,
      storageKey,
      mimeType: asset.mimeType,
      fileSize: Number(asset.fileSize),
    });

    job.log(`Scan submitted with ID: ${scanId}`);

    // Poll for scan completion (max 5 minutes)
    let scanResult: ScanResult | null = null;
    const pollInterval = 5000; // 5 seconds
    const maxPolls = 60; // 5 minutes total
    let pollCount = 0;

    while (pollCount < maxPolls) {
      const isComplete = await virusScanner.isScanComplete(scanId);
      
      if (isComplete) {
        scanResult = await virusScanner.getScanResult(scanId);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      pollCount++;
      
      if (pollCount % 6 === 0) {
        job.updateProgress(Math.min((pollCount / maxPolls) * 100, 95));
      }
    }

    if (!scanResult) {
      throw new Error('Scan timeout - results not available');
    }

    job.log(`Scan completed: ${scanResult.status}`);

    // Handle scan results
    if (scanResult.status === VirusScanStatus.CLEAN) {
      await handleCleanFile(assetId, storageKey, scanResult, asset);
      job.log(`Asset ${assetId} marked as CLEAN`);
    } else if (scanResult.status === VirusScanStatus.INFECTED) {
      await handleInfectedFile(assetId, storageKey, scanResult, asset);
      job.log(`Asset ${assetId} marked as INFECTED - quarantined`);
    } else {
      throw new Error(`Unexpected scan status: ${scanResult.status}`);
    }

    job.updateProgress(100);
    return { success: true, scanResult };

  } catch (error) {
    job.log(`Virus scan failed for asset ${assetId}: ${error instanceof Error ? error.message : 'Unknown error'}`);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      job.log(`Scheduling retry ${retryCount + 1}/${MAX_RETRIES}`);
      
      // Re-queue with incremented retry count
      const jobQueue = new Queue('asset-virus-scan', { connection: redisConnection });
      await jobQueue.add(
        'scan',
        { ...job.data, retryCount: retryCount + 1 },
        { delay: RETRY_DELAY_MS * (retryCount + 1) }
      );

      return { success: false, retry: true, retryCount: retryCount + 1 };
    }

    // Max retries exceeded - mark as error
    await prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        scanStatus: ScanStatus.ERROR,
        scanResult: {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          retries: retryCount,
        },
      },
    });

  // Track failure event
  try {
    const eventService = new EventService(prisma, redis, new Queue('enrich-event', { connection: redisConnection }));
    await eventService.trackEvent(
      {
        eventType: 'asset.scan.failed',
        source: 'system',
        entityId: assetId,
        entityType: 'asset',
        props: {
          error: error instanceof Error ? error.message : 'Unknown error',
          retries: retryCount,
        },
      },
      { session: undefined, ipAddress: '', userAgent: '', deviceType: '', browser: '', os: '' }
    );
  } catch (eventError) {
    console.error('Failed to track scan failure event:', eventError);
  }    throw error;
  }
}

/**
 * Handle clean file - update status and trigger next processing step
 */
async function handleCleanFile(
  assetId: string,
  storageKey: string,
  scanResult: ScanResult,
  asset: any
) {
  await prisma.ipAsset.update({
    where: { id: assetId },
    data: {
      scanStatus: ScanStatus.CLEAN,
      scanResult: {
        scanned: true,
        scanEngine: scanResult.scanEngine,
        scanEngineVersion: scanResult.scanEngineVersion,
        timestamp: scanResult.scannedAt.toISOString(),
        threatsFound: scanResult.threatsDetected,
        clean: true,
      } as any,
    },
  });

  // Track success event
  try {
    const eventService = new EventService(prisma, redis, new Queue('enrich-event', { connection: redisConnection }));
    await eventService.trackEvent(
      {
        eventType: 'asset.scan.completed',
        source: 'system',
        entityId: assetId,
        entityType: 'asset',
        props: {
          status: 'clean',
          scanEngine: scanResult.scanEngine,
        },
      },
      { session: undefined, ipAddress: '', userAgent: '', deviceType: '', browser: '', os: '' }
    );
  } catch (error) {
    console.error('Failed to track scan event:', error);
  }

  // Queue asset processing pipeline (thumbnail generation, metadata extraction, etc.)
  try {
    const { enqueueAssetProcessing } = await import('./asset-processing-pipeline');
    await enqueueAssetProcessing(assetId, storageKey, asset.type, asset.mimeType, {
      enableThumbnailGeneration: true,
      enableMetadataExtraction: true,
      enablePreviewGeneration: false, // Preview generation is optional
    });
  } catch (error) {
    console.error('Failed to queue asset processing:', error);
  }
}

/**
 * Handle infected file - quarantine and notify
 */
async function handleInfectedFile(
  assetId: string,
  storageKey: string,
  scanResult: ScanResult,
  asset: any
) {
  // Update asset status
  await prisma.ipAsset.update({
    where: { id: assetId },
    data: {
      scanStatus: ScanStatus.INFECTED,
      status: AssetStatus.REJECTED,
      scanResult: {
        scanned: true,
        scanEngine: scanResult.scanEngine,
        scanEngineVersion: scanResult.scanEngineVersion,
        timestamp: scanResult.scannedAt.toISOString(),
        threatsFound: scanResult.threatsDetected,
        clean: false,
        threats: scanResult.threats as any,
      } as any,
    },
  });

  // Move file to quarantine (prefix with quarantine/)
  const quarantineKey = `quarantine/${storageKey}`;
  try {
    await storageProvider.move({
      sourceKey: storageKey,
      destinationKey: quarantineKey,
    });
  } catch (error) {
    // If move fails, delete the file
    console.error(`Failed to quarantine file ${storageKey}:`, error);
    await storageProvider.delete(storageKey);
  }

  // Track security event
  try {
    const eventService = new EventService(prisma, redis, new Queue('enrich-event', { connection: redisConnection }));
    await eventService.trackEvent(
      {
        eventType: 'security.threat.detected',
        source: 'system',
        entityId: assetId,
        entityType: 'asset',
        props: {
          scanEngine: scanResult.scanEngine,
          threatsDetected: scanResult.threatsDetected,
          threats: scanResult.threats,
          severity: 'critical',
        },
      },
      { session: undefined, ipAddress: '', userAgent: '', deviceType: '', browser: '', os: '' }
    );
  } catch (error) {
    console.error('Failed to track security event:', error);
  }

  // TODO: Send notifications
  // - Notify user who uploaded the file
  // - Alert administrators
  // - Create security audit event
  
  console.error(`[SECURITY ALERT] Infected file detected: ${assetId}`, {
    assetId,
    storageKey,
    threats: scanResult.threats,
    uploadedBy: asset.createdBy,
  });
}

