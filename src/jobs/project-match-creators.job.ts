/**
 * Project Creator Matching Job
 * Triggered when project status changes to ACTIVE
 * Finds creators whose specialties match project requirements and notifies them
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { EmailService } from '@/lib/services/email/email.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { queueNotificationDelivery } from './notification-delivery.job';

const emailService = new EmailService();
const notificationService = new NotificationService(prisma, redis);

interface JobData {
  projectId: string;
}

export async function projectMatchCreatorsJob(data: JobData) {
  try {
    console.log(`[Job] Running project-match-creators for project ${data.projectId}`);

    // 1. Fetch project with requirements
    const project = await (prisma as any).project.findUnique({
      where: { id: data.projectId },
      include: { 
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!project) {
      console.log(`[Job] Project ${data.projectId} not found`);
      return;
    }

    if (project.status !== 'ACTIVE') {
      console.log(`[Job] Project ${data.projectId} is not ACTIVE, skipping creator matching`);
      return;
    }

    // 2. Extract requirements
    const requirements = project.requirements as any;
    const requiredAssetTypes = requirements?.assetTypes || [];

    if (requiredAssetTypes.length === 0) {
      console.log(`[Job] Project ${data.projectId} has no specific asset type requirements`);
      return;
    }

    // 3. Find matching creators
    // Using raw SQL for JSONB array_contains check
    const creators = await prisma.$queryRaw`
      SELECT c.*, u.email, u.name, u.avatar
      FROM creators c
      INNER JOIN users u ON c."userId" = u.id
      WHERE c."verificationStatus" = 'approved'
        AND c."deletedAt" IS NULL
        AND c.specialties ?| ${requiredAssetTypes}
      LIMIT 100
    `;

    if (!Array.isArray(creators) || creators.length === 0) {
      console.log(`[Job] No matching creators found for project ${data.projectId}`);
      return;
    }

    console.log(`[Job] Found ${creators.length} matching creators for project ${data.projectId}`);

    // 4. Send notifications to matching creators
    let notificationsSent = 0;
    for (const creator of creators as any[]) {
      try {
        // Create in-app notification
        const notification = await notificationService.create({
          userId: creator.userId,
          type: 'PROJECT' as any,
          priority: 'MEDIUM' as any,
          title: 'New Project Match',
          message: `${project.brand.companyName} has a new project that matches your specialties: ${project.name}`,
          actionUrl: `/projects/${project.id}`,
          metadata: {
            projectId: project.id,
            brandId: project.brandId,
            matchType: 'specialty',
          },
        });

        // Queue for delivery
        if (notification.notificationIds.length > 0) {
          await queueNotificationDelivery(notification.notificationIds[0]);
        }

        // Send email notification
        await emailService.sendTransactional({
          email: creator.email,
          subject: `New Project Opportunity: ${project.name}`,
          template: 'welcome', // TODO: Create project-match-notification template
          variables: {
            creatorName: creator.name || creator.stageName,
            projectName: project.name,
            brandName: project.brand.companyName,
            projectDescription: project.description,
            budgetRange: project.budgetCents > 0 
              ? `$${(project.budgetCents / 100).toLocaleString()}`
              : 'Budget available',
            projectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id}`,
          },
        });

        notificationsSent++;
      } catch (error) {
        console.error(`[Job] Failed to notify creator ${creator.id}:`, error);
        // Continue with other creators
      }
    }

    console.log(
      `[Job] Successfully sent ${notificationsSent} notifications for project ${data.projectId}`
    );

    // 5. Track analytics event
    await (prisma as any).event.create({
      data: {
        eventType: 'project.creators_matched',
        actorType: 'system',
        projectId: project.id,
        brandId: project.brandId,
        propsJson: {
          creatorsMatched: creators.length,
          notificationsSent,
          requiredAssetTypes,
        },
      },
    });
  } catch (error) {
    console.error('[Job] project-match-creators error:', error);
    throw error;
  }
}
