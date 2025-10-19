/**
 * Search Index Update Job
 * 
 * Maintains PostgreSQL full-text search indexes in sync with primary data:
 * - Real-time indexing when content changes
 * - Periodic full re-indexing to correct inconsistencies
 * - Batch updates for bulk operations
 * 
 * Search architecture: PostgreSQL full-text search with tsvector/GIN indexes
 */

import { Queue, Worker, type Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redisConnection } from '@/lib/db/redis';
import { createLazyQueue, createWorkerIfNotServerless } from '@/lib/queue/lazy-queue';
import { Prisma } from '@prisma/client';

interface SearchIndexUpdateJobData {
  entityType: 'asset' | 'creator' | 'project' | 'license' | 'blog_post';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
}

interface BulkSearchIndexJobData {
  entityType: 'asset' | 'creator' | 'project' | 'license' | 'blog_post';
  entityIds: string[];
}

interface FullReindexJobData {
  entityType?: 'asset' | 'creator' | 'project' | 'license' | 'blog_post'; // If omitted, reindex all
  batchSize?: number;
}

const QUEUE_NAME = 'search-index-update';
const BULK_QUEUE_NAME = 'search-index-bulk-update';
const REINDEX_QUEUE_NAME = 'search-index-reindex';

/**
 * Queue: Real-time Search Index Update
 * Triggered when searchable content is created, updated, or deleted
 */
export const searchIndexQueue = createLazyQueue<SearchIndexUpdateJobData>(
  QUEUE_NAME,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        count: 5000,
        age: 24 * 3600, // 24 hours
      },
      removeOnFail: {
        count: 10000,
        age: 7 * 24 * 3600, // 7 days
      },
    },
  }
);

/**
 * Queue: Bulk Search Index Update
 * For batch operations on multiple entities
 */
export const bulkSearchIndexQueue = createLazyQueue<BulkSearchIndexJobData>(
  BULK_QUEUE_NAME,
  {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: {
        count: 1000,
        age: 24 * 3600,
      },
      removeOnFail: {
        count: 5000,
        age: 7 * 24 * 3600,
      },
    },
  }
);

/**
 * Queue: Full Reindex
 * Periodic full re-indexing to ensure consistency
 */
export const reindexQueue = createLazyQueue<FullReindexJobData>(
  REINDEX_QUEUE_NAME,
  {
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 300000, // 5 minutes
      },
      removeOnComplete: {
        count: 100,
        age: 30 * 24 * 3600, // 30 days
      },
      removeOnFail: {
        count: 100,
        age: 30 * 24 * 3600,
      },
    },
  }
);

/**
 * Update search index for IP Assets
 */
async function updateAssetSearchIndex(
  assetId: string,
  operation: 'create' | 'update' | 'delete',
  job: Job
): Promise<void> {
  if (operation === 'delete') {
    // For deletions, the record is already gone or soft-deleted
    // PostgreSQL will automatically exclude it from search results
    job.log(`Asset ${assetId} deletion - no index action needed (soft delete or gone)`);
    return;
  }

  // Fetch asset with relevant fields for search
  const asset = await prisma.ipAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      title: true,
      description: true,
      metadata: true,
      type: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!asset) {
    job.log(`Asset ${assetId} not found - skipping index update`);
    return;
  }

  if (asset.deletedAt) {
    job.log(`Asset ${assetId} is soft-deleted - skipping index update`);
    return;
  }

  // PostgreSQL full-text search is automatically maintained via GIN indexes
  // The tsvector columns are generated automatically by database triggers
  // We just need to ensure the record exists and is up-to-date
  
  // Touch the record to ensure triggers fire if needed
  await prisma.ipAsset.update({
    where: { id: assetId },
    data: {
      updatedAt: new Date(),
    },
  });

  job.log(`Updated search index for asset ${assetId}`);
}

/**
 * Update search index for Creators
 */
async function updateCreatorSearchIndex(
  creatorId: string,
  operation: 'create' | 'update' | 'delete',
  job: Job
): Promise<void> {
  if (operation === 'delete') {
    job.log(`Creator ${creatorId} deletion - no index action needed`);
    return;
  }

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: {
      id: true,
      stageName: true,
      bio: true,
      specialties: true,
      verificationStatus: true,
      deletedAt: true,
    },
  });

  if (!creator) {
    job.log(`Creator ${creatorId} not found - skipping index update`);
    return;
  }

  if (creator.deletedAt) {
    job.log(`Creator ${creatorId} is soft-deleted - skipping index update`);
    return;
  }

  // The search_vector column is maintained by database triggers
  // Touch the record to ensure consistency
  await prisma.creator.update({
    where: { id: creatorId },
    data: {
      updatedAt: new Date(),
    },
  });

  job.log(`Updated search index for creator ${creatorId}`);
}

/**
 * Update search index for Projects
 */
async function updateProjectSearchIndex(
  projectId: string,
  operation: 'create' | 'update' | 'delete',
  job: Job
): Promise<void> {
  if (operation === 'delete') {
    job.log(`Project ${projectId} deletion - no index action needed`);
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!project) {
    job.log(`Project ${projectId} not found - skipping index update`);
    return;
  }

  if (project.deletedAt) {
    job.log(`Project ${projectId} is soft-deleted - skipping index update`);
    return;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      updatedAt: new Date(),
    },
  });

  job.log(`Updated search index for project ${projectId}`);
}

/**
 * Update search index for Licenses
 */
async function updateLicenseSearchIndex(
  licenseId: string,
  operation: 'create' | 'update' | 'delete',
  job: Job
): Promise<void> {
  if (operation === 'delete') {
    job.log(`License ${licenseId} deletion - no index action needed`);
    return;
  }

  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    select: {
      id: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!license) {
    job.log(`License ${licenseId} not found - skipping index update`);
    return;
  }

  if (license.deletedAt) {
    job.log(`License ${licenseId} is soft-deleted - skipping index update`);
    return;
  }

  await prisma.license.update({
    where: { id: licenseId },
    data: {
      updatedAt: new Date(),
    },
  });

  job.log(`Updated search index for license ${licenseId}`);
}

/**
 * Update search index for Blog Posts
 */
async function updateBlogPostSearchIndex(
  postId: string,
  operation: 'create' | 'update' | 'delete',
  job: Job
): Promise<void> {
  if (operation === 'delete') {
    job.log(`Blog post ${postId} deletion - no index action needed`);
    return;
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!post) {
    job.log(`Blog post ${postId} not found - skipping index update`);
    return;
  }

  if (post.deletedAt) {
    job.log(`Blog post ${postId} is soft-deleted - skipping index update`);
    return;
  }

  await prisma.post.update({
    where: { id: postId },
    data: {
      updatedAt: new Date(),
    },
  });

  job.log(`Updated search index for blog post ${postId}`);
}

/**
 * Worker: Real-time Search Index Update
 */
async function processSearchIndexUpdate(job: Job<SearchIndexUpdateJobData>): Promise<void> {
  const { entityType, entityId, operation } = job.data;

  job.log(`Processing ${operation} for ${entityType} ${entityId}`);

  try {
    switch (entityType) {
      case 'asset':
        await updateAssetSearchIndex(entityId, operation, job);
        break;
      case 'creator':
        await updateCreatorSearchIndex(entityId, operation, job);
        break;
      case 'project':
        await updateProjectSearchIndex(entityId, operation, job);
        break;
      case 'license':
        await updateLicenseSearchIndex(entityId, operation, job);
        break;
      case 'blog_post':
        await updateBlogPostSearchIndex(entityId, operation, job);
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    job.log(`Successfully processed ${operation} for ${entityType} ${entityId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Error processing ${operation} for ${entityType} ${entityId}: ${errorMessage}`);
    throw error;
  }
}

/**
 * Worker: Bulk Search Index Update
 */
async function processBulkSearchIndexUpdate(job: Job<BulkSearchIndexJobData>): Promise<void> {
  const { entityType, entityIds } = job.data;

  job.log(`Processing bulk update for ${entityIds.length} ${entityType} entities`);

  let successCount = 0;
  let errorCount = 0;

  // Process in batches to avoid overwhelming the database
  const batchSize = 50;
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);
    
    await Promise.allSettled(
      batch.map(async (entityId) => {
        try {
          await processSearchIndexUpdate({
            ...job,
            data: { entityType, entityId, operation: 'update' },
          } as Job<SearchIndexUpdateJobData>);
          successCount++;
        } catch (error) {
          errorCount++;
          job.log(`Error updating ${entityType} ${entityId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      })
    );

    job.updateProgress((i + batch.length) / entityIds.length * 100);
  }

  job.log(`Bulk update complete: ${successCount} successful, ${errorCount} errors`);
}

/**
 * Worker: Full Reindex
 */
async function processFullReindex(job: Job<FullReindexJobData>): Promise<void> {
  const { entityType, batchSize = 100 } = job.data;
  const startTime = Date.now();

  const entitiesToReindex = entityType 
    ? [entityType] 
    : ['asset', 'creator', 'project', 'license', 'blog_post'] as const;

  job.log(`Starting full reindex for: ${entitiesToReindex.join(', ')}`);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const entity of entitiesToReindex) {
    job.log(`Reindexing ${entity} entities...`);

    try {
      let processedCount = 0;
      let errorCount = 0;

      // Get total count for this entity type
      let totalCount = 0;
      switch (entity) {
        case 'asset':
          totalCount = await prisma.ipAsset.count({ where: { deletedAt: null } });
          break;
        case 'creator':
          totalCount = await prisma.creator.count({ where: { deletedAt: null } });
          break;
        case 'project':
          totalCount = await prisma.project.count({ where: { deletedAt: null } });
          break;
        case 'license':
          totalCount = await prisma.license.count({ where: { deletedAt: null } });
          break;
        case 'blog_post':
          totalCount = await prisma.post.count({ where: { deletedAt: null } });
          break;
      }

      job.log(`Found ${totalCount} ${entity} entities to reindex`);

      // Process in batches
      for (let skip = 0; skip < totalCount; skip += batchSize) {
        let entityIds: string[] = [];

        switch (entity) {
          case 'asset':
            const assets = await prisma.ipAsset.findMany({
              where: { deletedAt: null },
              select: { id: true },
              skip,
              take: batchSize,
            });
            entityIds = assets.map((a: { id: string }) => a.id);
            break;
          case 'creator':
            const creators = await prisma.creator.findMany({
              where: { deletedAt: null },
              select: { id: true },
              skip,
              take: batchSize,
            });
            entityIds = creators.map((c: { id: string }) => c.id);
            break;
          case 'project':
            const projects = await prisma.project.findMany({
              where: { deletedAt: null },
              select: { id: true },
              skip,
              take: batchSize,
            });
            entityIds = projects.map((p: { id: string }) => p.id);
            break;
          case 'license':
            const licenses = await prisma.license.findMany({
              where: { deletedAt: null },
              select: { id: true },
              skip,
              take: batchSize,
            });
            entityIds = licenses.map((l: { id: string }) => l.id);
            break;
          case 'blog_post':
            const posts = await prisma.post.findMany({
              where: { deletedAt: null },
              select: { id: true },
              skip,
              take: batchSize,
            });
            entityIds = posts.map((p: { id: string }) => p.id);
            break;
        }

        // Process this batch
        await Promise.allSettled(
          entityIds.map(async (entityId) => {
            try {
              await processSearchIndexUpdate({
                ...job,
                data: { entityType: entity, entityId, operation: 'update' },
              } as Job<SearchIndexUpdateJobData>);
              processedCount++;
            } catch (error) {
              errorCount++;
            }
          })
        );

        // Update progress
        const progress = ((skip + entityIds.length) / totalCount) * 100;
        job.updateProgress(progress);
        job.log(`${entity}: ${processedCount}/${totalCount} processed`);
      }

      job.log(`Completed ${entity} reindex: ${processedCount} processed, ${errorCount} errors`);
      totalProcessed += processedCount;
      totalErrors += errorCount;
    } catch (error) {
      job.log(`Error reindexing ${entity}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      totalErrors++;
    }
  }

  const duration = Date.now() - startTime;
  const durationMinutes = Math.round(duration / 60000);

  job.log(
    `Full reindex complete in ${durationMinutes} minutes: ${totalProcessed} entities processed, ${totalErrors} errors`
  );
}

/**
 * Create workers
 */
export const searchIndexWorker = createWorkerIfNotServerless<SearchIndexUpdateJobData>(
  QUEUE_NAME,
  processSearchIndexUpdate,
  {
    concurrency: 20, // Process 20 index updates concurrently
  }
);

export const bulkSearchIndexWorker = createWorkerIfNotServerless<BulkSearchIndexJobData>(
  BULK_QUEUE_NAME,
  processBulkSearchIndexUpdate,
  {
    concurrency: 5, // Process 5 bulk updates concurrently
  }
);

export const reindexWorker = createWorkerIfNotServerless<FullReindexJobData>(
  REINDEX_QUEUE_NAME,
  processFullReindex,
  {
    concurrency: 1, // Only one full reindex at a time
  }
);

/**
 * Event listeners
 */
if (searchIndexWorker) {
  searchIndexWorker.on('completed', (job) => {
    console.log(`[SearchIndex] Job ${job.id} completed`);
  });

  searchIndexWorker.on('failed', (job, error) => {
    console.error(`[SearchIndex] Job ${job?.id} failed:`, error.message);
  });

  searchIndexWorker.on('error', (error) => {
    console.error('[SearchIndex] Worker error:', error);
  });
}

if (bulkSearchIndexWorker) {
  bulkSearchIndexWorker.on('completed', (job) => {
    console.log(`[SearchIndex] Bulk job ${job.id} completed`);
  });

  bulkSearchIndexWorker.on('failed', (job, error) => {
    console.error(`[SearchIndex] Bulk job ${job?.id} failed:`, error.message);
  });
}

if (reindexWorker) {
  reindexWorker.on('completed', (job, result) => {
    console.log(`[SearchIndex] Reindex job ${job.id} completed`);
  });

  reindexWorker.on('failed', (job, error) => {
    console.error(`[SearchIndex] Reindex job ${job?.id} failed:`, error.message);
  });

  reindexWorker.on('progress', (job, progress) => {
    console.log(`[SearchIndex] Reindex progress: ${progress}%`);
  });
}

/**
 * Queue a search index update
 */
export async function queueSearchIndexUpdate(
  entityType: SearchIndexUpdateJobData['entityType'],
  entityId: string,
  operation: 'create' | 'update' | 'delete' = 'update'
): Promise<void> {
  await searchIndexQueue.add(
    'update',
    { entityType, entityId, operation },
    {
      jobId: `search-${entityType}-${entityId}-${operation}`,
    }
  );
}

/**
 * Queue a bulk search index update
 */
export async function queueBulkSearchIndexUpdate(
  entityType: BulkSearchIndexJobData['entityType'],
  entityIds: string[]
): Promise<void> {
  if (entityIds.length === 0) return;

  // Split into manageable chunks if too large
  const chunkSize = 1000;
  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    
    await bulkSearchIndexQueue.add(
      'bulk-update',
      { entityType, entityIds: chunk },
      {
        jobId: `search-bulk-${entityType}-${Date.now()}-${i}`,
      }
    );
  }
}

/**
 * Queue a full reindex
 */
export async function queueFullReindex(
  entityType?: FullReindexJobData['entityType'],
  batchSize?: number
): Promise<void> {
  await reindexQueue.add(
    'full-reindex',
    { entityType, batchSize },
    {
      jobId: `search-reindex-${entityType || 'all'}-${Date.now()}`,
    }
  );
}

/**
 * Schedule periodic full reindex
 * Runs weekly on Sunday at 3 AM UTC to ensure consistency
 */
export async function schedulePeriodicReindex(): Promise<void> {
  await reindexQueue.add(
    'scheduled-reindex',
    { batchSize: 100 },
    {
      repeat: {
        pattern: '0 3 * * 0', // Every Sunday at 3 AM UTC
        tz: 'UTC',
      },
      jobId: 'search-periodic-reindex',
    }
  );

  console.log('[SearchIndex] Scheduled periodic full reindex every Sunday at 3 AM UTC');
}

/**
 * Get search index queue statistics
 */
export async function getSearchIndexStats() {
  const [indexCounts, bulkCounts, reindexCounts] = await Promise.all([
    searchIndexQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    bulkSearchIndexQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    reindexQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
  ]);

  return {
    realtime: indexCounts,
    bulk: bulkCounts,
    reindex: reindexCounts,
  };
}
