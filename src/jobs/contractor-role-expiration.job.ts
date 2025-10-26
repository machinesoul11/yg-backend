/**
 * Contractor Role Expiration Job
 * 
 * Handles:
 * 1. Sending expiration warning notifications (7 days, 1 day before)
 * 2. Automatic revocation of expired contractor roles
 * 3. Cleanup and audit logging
 */

import { Queue, Worker, Job } from 'bullmq';
import { getBullMQRedisClient } from '@/lib/redis/client';
import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { AdminRoleService } from '@/lib/services/admin-role.service';

const auditService = new AuditService(prisma);
const adminRoleService = new AdminRoleService(prisma, auditService);
const emailService = new EmailService();

// Queue names
const EXPIRATION_WARNING_QUEUE = 'contractor-role-expiration-warning';
const EXPIRATION_PROCESSOR_QUEUE = 'contractor-role-expiration-processor';

/**
 * Job data for expiration warnings
 */
export interface ContractorExpirationWarningData {
  roleId: string;
  userId: string;
  expiresAt: Date;
  warningType: '7_days' | '1_day';
}

/**
 * Job data for expiration processing
 */
export interface ContractorExpirationProcessorData {
  batchSize?: number;
}

/**
 * Get or create expiration warning queue
 */
export function getExpirationWarningQueue(): Queue<ContractorExpirationWarningData> {
  return new Queue<ContractorExpirationWarningData>(EXPIRATION_WARNING_QUEUE, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 7 * 24 * 3600, // Keep for 7 days
        count: 1000,
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // Keep failed for 30 days
      },
    },
  });
}

/**
 * Get or create expiration processor queue
 */
export function getExpirationProcessorQueue(): Queue<ContractorExpirationProcessorData> {
  return new Queue<ContractorExpirationProcessorData>(EXPIRATION_PROCESSOR_QUEUE, {
    connection: getBullMQRedisClient(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: {
        age: 24 * 3600,
      },
    },
  });
}

/**
 * Queue a contractor expiration warning
 */
export async function queueContractorExpirationWarning(
  data: ContractorExpirationWarningData,
  sendAt: Date
): Promise<void> {
  const queue = getExpirationWarningQueue();
  
  await queue.add(
    `warning-${data.roleId}-${data.warningType}`,
    data,
    {
      delay: Math.max(0, sendAt.getTime() - Date.now()),
      jobId: `${data.roleId}-${data.warningType}`, // Prevent duplicates
    }
  );
  
  console.log(`[ContractorExpiration] Queued ${data.warningType} warning for role ${data.roleId} at ${sendAt.toISOString()}`);
}

/**
 * Process expiration warning - send email notification
 */
async function processExpirationWarning(
  job: Job<ContractorExpirationWarningData>
): Promise<{ success: boolean; sent: boolean }> {
  const { roleId, userId, expiresAt, warningType } = job.data;
  
  try {
    // Get role details
    const role = await prisma.adminRole.findUnique({
      where: { id: roleId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        creator: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    // Skip if role no longer exists or already expired/revoked
    if (!role || !role.isActive || role.expiresAt !== expiresAt) {
      console.log(`[ContractorExpiration] Skipping warning for role ${roleId} - role no longer valid`);
      return { success: true, sent: false };
    }

    const daysUntilExpiration = warningType === '7_days' ? 7 : 1;
    
    // Send email to contractor
    await emailService.sendTransactional({
      userId: role.userId,
      email: role.user.email,
      subject: `Your contractor access expires in ${daysUntilExpiration} day${daysUntilExpiration > 1 ? 's' : ''}`,
      template: 'contractor-expiration-warning',
      variables: {
        userName: role.user.name || role.user.email,
        daysUntilExpiration,
        expiresAt: expiresAt.toISOString(),
        department: role.department,
        permissions: (role.permissions as string[]).join(', '),
      },
    });

    // Send notification to creator (admin who assigned the role)
    if (role.creator && role.creator.email !== role.user.email) {
      await emailService.sendTransactional({
        email: role.creator.email,
        subject: `Contractor role expiring in ${daysUntilExpiration} day${daysUntilExpiration > 1 ? 's' : ''}`,
        template: 'contractor-expiration-admin-warning',
        variables: {
          adminName: role.creator.name || role.creator.email,
          contractorName: role.user.name || role.user.email,
          contractorEmail: role.user.email,
          daysUntilExpiration,
          expiresAt: expiresAt.toISOString(),
          roleId: role.id,
        },
      });
    }

    // Log the warning
    await auditService.log({
      action: 'CONTRACTOR_EXPIRATION_WARNING_SENT',
      entityType: 'admin_role',
      entityId: roleId,
      userId: role.userId,
      metadata: {
        warningType,
        expiresAt,
        recipientEmail: role.user.email,
        adminNotified: role.creator?.email,
      },
    });

    console.log(`[ContractorExpiration] Sent ${warningType} warning for role ${roleId}`);
    return { success: true, sent: true };
  } catch (error) {
    console.error(`[ContractorExpiration] Error sending warning for role ${roleId}:`, error);
    throw error;
  }
}

/**
 * Process expired contractor roles - automatic revocation
 */
async function processExpiredContractorRoles(
  job: Job<ContractorExpirationProcessorData>
): Promise<{ processed: number; revoked: number; errors: number }> {
  const batchSize = job.data.batchSize || 50;
  
  try {
    // Find expired contractor roles
    const expiredRoles = await prisma.adminRole.findMany({
      where: {
        department: 'CONTRACTOR',
        isActive: true,
        expiresAt: {
          lte: new Date(),
        },
      },
      take: batchSize,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    console.log(`[ContractorExpiration] Found ${expiredRoles.length} expired contractor roles`);

    let revoked = 0;
    let errors = 0;

    // Process each expired role
    for (const role of expiredRoles) {
      try {
        // Use admin role service to revoke with full audit trail
        await adminRoleService.revokeAdminRole(
          {
            roleId: role.id,
            reason: 'Contractor role automatically expired',
          },
          'SYSTEM', // System-initiated
          { terminateSessions: true } // Terminate sessions on expiration
        );

        // Send expiration notification
        await emailService.sendTransactional({
          userId: role.userId,
          email: role.user.email,
          subject: 'Your contractor access has expired',
          template: 'contractor-expired',
          variables: {
            userName: role.user.name || role.user.email,
            expiredAt: role.expiresAt?.toISOString() || new Date().toISOString(),
            department: role.department,
          },
        });

        revoked++;
        console.log(`[ContractorExpiration] Revoked expired role ${role.id} for user ${role.user.email}`);
      } catch (error) {
        console.error(`[ContractorExpiration] Error revoking role ${role.id}:`, error);
        errors++;
      }
    }

    // Log the batch processing
    await auditService.log({
      action: 'CONTRACTOR_ROLES_BATCH_EXPIRED',
      entityType: 'admin_role',
      entityId: 'batch',
      userId: 'SYSTEM',
      metadata: {
        totalProcessed: expiredRoles.length,
        successfullyRevoked: revoked,
        errors,
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`[ContractorExpiration] Batch complete - Revoked: ${revoked}, Errors: ${errors}`);
    
    return {
      processed: expiredRoles.length,
      revoked,
      errors,
    };
  } catch (error) {
    console.error('[ContractorExpiration] Error processing expired roles:', error);
    throw error;
  }
}

/**
 * Create expiration warning worker
 */
export function createExpirationWarningWorker(): Worker<
  ContractorExpirationWarningData,
  { success: boolean; sent: boolean }
> {
  const worker = new Worker<ContractorExpirationWarningData, { success: boolean; sent: boolean }>(
    EXPIRATION_WARNING_QUEUE,
    processExpirationWarning,
    {
      connection: getBullMQRedisClient(),
      concurrency: parseInt(process.env.WORKER_CONCURRENCY_CONTRACTOR_WARNINGS || '5'),
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[ContractorWarningWorker] Completed job ${job.id}:`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`[ContractorWarningWorker] Failed job ${job?.id}:`, error);
  });

  return worker;
}

/**
 * Create expiration processor worker
 */
export function createExpirationProcessorWorker(): Worker<
  ContractorExpirationProcessorData,
  { processed: number; revoked: number; errors: number }
> {
  const worker = new Worker<
    ContractorExpirationProcessorData,
    { processed: number; revoked: number; errors: number }
  >(
    EXPIRATION_PROCESSOR_QUEUE,
    processExpiredContractorRoles,
    {
      connection: getBullMQRedisClient(),
      concurrency: 1, // Process one batch at a time
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[ContractorProcessorWorker] Completed job ${job.id}:`, result);
  });

  worker.on('failed', (job, error) => {
    console.error(`[ContractorProcessorWorker] Failed job ${job?.id}:`, error);
  });

  return worker;
}

/**
 * Schedule the recurring expiration processor job
 * Should be called during application startup
 */
export async function scheduleContractorExpirationProcessor(): Promise<void> {
  const queue = getExpirationProcessorQueue();
  
  // Remove any existing repeatable jobs
  const repeatableJobs = await queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await queue.removeRepeatableByKey(job.key);
  }

  // Schedule to run every hour
  await queue.add(
    'process-expired-contractors',
    { batchSize: 50 },
    {
      repeat: {
        pattern: '0 * * * *', // Every hour at minute 0
      },
      jobId: 'contractor-expiration-processor',
    }
  );

  console.log('[ContractorExpiration] Scheduled recurring expiration processor (hourly)');
}

/**
 * Initialize all contractor expiration workers and schedulers
 */
export async function initializeContractorExpirationJobs(): Promise<void> {
  createExpirationWarningWorker();
  createExpirationProcessorWorker();
  await scheduleContractorExpirationProcessor();
  
  console.log('[ContractorExpiration] All contractor expiration jobs initialized');
}
