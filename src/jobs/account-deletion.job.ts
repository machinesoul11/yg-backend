/**
 * Account Deletion Job
 * Permanently deletes soft-deleted accounts after 30-day grace period
 * Runs daily at 2 AM
 */

import type { Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { AuditService, AUDIT_ACTIONS } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);

export async function processAccountDeletion(job: Job) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  job.log('Starting account deletion process');

  try {
    // Find soft-deleted users past the grace period
    const usersToDelete = await prisma.user.findMany({
      where: {
        deleted_at: { not: null, lt: thirtyDaysAgo },
      },
      include: {
        talent: {
          include: {
            royalties: {
              where: {
                status: { in: ['PENDING', 'PROCESSING'] },
              },
            },
          },
        },
      },
    });

    let deleted = 0;
    let skipped = 0;

    for (const user of usersToDelete) {
      // Check for pending financial obligations
      if (user.talent && user.talent.royalties.length > 0) {
        job.log(
          `Skipping user ${user.id} (${user.email}) - has pending royalties`
        );
        skipped++;
        continue;
      }

      // Log before deletion
      await auditService.log({
        action: AUDIT_ACTIONS.ACCOUNT_PERMANENTLY_DELETED,
        userId: user.id,
        email: user.email,
        afterJson: {
          deletedAt: user.deletedAt,
          email: user.email,
          role: user.role,
        },
      });

      // Permanently delete user (cascades to related records via Prisma)
      await prisma.user.delete({
        where: { id: user.id },
      });

      job.log(`Permanently deleted user ${user.id} (${user.email})`);
      deleted++;
    }

    job.log(
      `Account deletion complete: ${deleted} deleted, ${skipped} skipped`
    );

    return {
      success: true,
      deleted,
      skipped,
    };
  } catch (error) {
    job.log(`Account deletion failed: ${error}`);
    throw error;
  }
}
