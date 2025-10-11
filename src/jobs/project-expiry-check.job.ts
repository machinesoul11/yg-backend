/**
 * Project Expiry Check Job
 * Runs daily to auto-archive projects past their end date
 * Schedule: Daily at 02:00 UTC
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';

const emailService = new EmailService();

export async function projectExpiryCheckJob() {
  try {
    console.log('[Job] Running project expiry check');

    const now = new Date();

    // Find projects past end_date that are not yet archived
    const expiredProjects = await (prisma as any).project.findMany({
      where: {
        endDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'ARCHIVED'] },
        deletedAt: null,
      },
      include: {
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (expiredProjects.length === 0) {
      console.log('[Job] No expired projects found');
      return;
    }

    console.log(`[Job] Found ${expiredProjects.length} expired projects`);

    let archivedCount = 0;
    let notificationsSeent = 0;

    for (const project of expiredProjects) {
      try {
        // Auto-archive project
        await (prisma as any).project.update({
          where: { id: project.id },
          data: { status: 'ARCHIVED' },
        });

        archivedCount++;

        // Notify brand admin
        if (project.brand?.user?.email) {
          try {
            // TODO: Use notification service when implemented
            // await notificationService.create({
            //   userId: project.brand.userId,
            //   type: 'project_expired',
            //   title: 'Project Archived',
            //   message: `Your project "${project.name}" has been automatically archived after its end date.`,
            //   actionUrl: `/projects/${project.id}`,
            //   priority: 'low',
            // });

            await emailService.sendTransactional({
              email: project.brand.user.email,
              subject: `Project Archived: ${project.name}`,
              template: 'welcome', // TODO: Create project-expired template
              variables: {
                brandName: project.brand.companyName,
                projectName: project.name,
                endDate: project.endDate.toLocaleDateString(),
                projectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id}`,
              },
            });

            notificationsSeent++;
          } catch (error) {
            console.error(`[Job] Failed to notify brand for project ${project.id}:`, error);
          }
        }

        // Track analytics event
        await (prisma as any).event.create({
          data: {
            eventType: 'project.auto_archived',
            actorType: 'system',
            projectId: project.id,
            brandId: project.brandId,
            propsJson: {
              endDate: project.endDate,
              previousStatus: project.status,
            },
          },
        });
      } catch (error) {
        console.error(`[Job] Failed to archive project ${project.id}:`, error);
        // Continue with other projects
      }
    }

    console.log(
      `[Job] Successfully archived ${archivedCount} projects and sent ${notificationsSeent} notifications`
    );
  } catch (error) {
    console.error('[Job] project-expiry-check error:', error);
    throw error;
  }
}
