/**
 * Scheduled Blog Publishing Job
 * 
 * Automatically publishes blog posts that are scheduled for publication
 * Runs every minute to check for posts that need to be published
 */

import { Worker, Job, Queue } from 'bullmq';
import { redisConnection } from '@/lib/db/redis';
import { prisma } from '@/lib/db';
import { BlogService } from '@/modules/blog/services/blog.service';

interface ScheduledPublishJobData {
  postId?: string; // Optional - for specific post processing
}

const blogService = new BlogService(prisma);

/**
 * Process scheduled posts for publication
 */
async function processScheduledPosts(job: Job<ScheduledPublishJobData>): Promise<void> {
  const { postId } = job.data;
  
  try {
    const currentTime = new Date();
    
    // Build query conditions
    const whereConditions = {
      status: 'SCHEDULED' as const,
      scheduledFor: {
        lte: currentTime,
      },
      deletedAt: null,
      ...(postId && { id: postId }),
    };

    // Find posts that need to be published
    const postsToPublish = await prisma.post.findMany({
      where: whereConditions,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      take: postId ? 1 : 50, // Limit batch size to prevent overload
    });

    job.log(`Found ${postsToPublish.length} posts to publish`);

    if (postsToPublish.length === 0) {
      job.log('No posts found for publishing');
      return;
    }

    // Process each post
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ postId: string; error: string }> = [];

    for (const post of postsToPublish) {
      try {
        job.log(`Publishing post: ${post.id} - "${post.title}"`);
        
        // Update post status to published
        await blogService.updatePost(
          post.id,
          {
            status: 'PUBLISHED',
            publishedAt: post.scheduledFor || currentTime,
          },
          post.authorId
        );

        job.log(`Successfully published post: ${post.id}`);
        successCount++;

        // Optional: Send notification to author
        // This can be expanded to integrate with the notification system
        job.log(`Post published: "${post.title}" by ${post.author.name}`);
        
      } catch (error) {
        const err = error as Error;
        job.log(`Error publishing post ${post.id}: ${err.message}`);
        errors.push({ postId: post.id, error: err.message });
        errorCount++;
      }
    }

    job.log(`Publishing complete: ${successCount} successful, ${errorCount} errors`);

    if (errors.length > 0) {
      job.log(`Errors encountered: ${JSON.stringify(errors, null, 2)}`);
      // In production, you might want to alert administrators about failures
    }

  } catch (error) {
    const err = error as Error;
    job.log(`Critical error in scheduled publishing job: ${err.message}`);
    throw error; // Let BullMQ handle retry logic
  }
}

/**
 * Worker for processing scheduled blog posts
 */
export const scheduledBlogPublishingWorker = new Worker<ScheduledPublishJobData>(
  'scheduled-blog-publishing',
  processScheduledPosts,
  {
    connection: redisConnection,
    concurrency: 1, // Process one job at a time to prevent conflicts
    limiter: {
      max: 1, // Only allow 1 job
      duration: 60000, // per minute
    },
  }
);

/**
 * Queue for scheduled blog publishing jobs
 */
export const scheduledBlogPublishingQueue = new Queue<ScheduledPublishJobData>(
  'scheduled-blog-publishing',
  {
    connection: redisConnection,
  }
);

/**
 * Set up recurring job to check for scheduled posts every minute
 */
export async function setupScheduledPublishingJob(): Promise<void> {
  try {
    // Remove any existing recurring jobs
    await scheduledBlogPublishingQueue.obliterate({ force: true });
    
    // Add recurring job that runs every minute
    await scheduledBlogPublishingQueue.add(
      'check-scheduled-posts',
      {},
      {
        repeat: {
          pattern: '* * * * *', // Every minute
        },
        jobId: 'scheduled-blog-publishing-recurring', // Prevent duplicates
      }
    );

    console.log('[ScheduledBlogPublishing] Recurring job set up to run every minute');
  } catch (error) {
    console.error('[ScheduledBlogPublishing] Error setting up recurring job:', error);
    throw error;
  }
}

/**
 * Manually trigger publishing for a specific post
 */
export async function triggerPostPublishing(postId: string): Promise<void> {
  await scheduledBlogPublishingQueue.add(
    'publish-specific-post',
    { postId },
    {
      priority: 10, // Higher priority for manual triggers
    }
  );
}

/**
 * Get job queue stats
 */
export async function getScheduledPublishingStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    scheduledBlogPublishingQueue.getWaiting(),
    scheduledBlogPublishingQueue.getActive(),
    scheduledBlogPublishingQueue.getCompleted(),
    scheduledBlogPublishingQueue.getFailed(),
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    isHealthy: active.length < 5 && failed.length < 10, // Basic health check
  };
}

// Handle worker events
scheduledBlogPublishingWorker.on('completed', (job) => {
  console.log(`[ScheduledBlogPublishing] Job ${job.id} completed successfully`);
});

scheduledBlogPublishingWorker.on('failed', (job, err) => {
  console.error(`[ScheduledBlogPublishing] Job ${job?.id} failed:`, err);
});

scheduledBlogPublishingWorker.on('error', (err) => {
  console.error('[ScheduledBlogPublishing] Worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[ScheduledBlogPublishing] Shutting down worker...');
  await scheduledBlogPublishingWorker.close();
  await scheduledBlogPublishingQueue.close();
});

export default {
  worker: scheduledBlogPublishingWorker,
  queue: scheduledBlogPublishingQueue,
  setupScheduledPublishingJob,
  triggerPostPublishing,
  getScheduledPublishingStats,
};
