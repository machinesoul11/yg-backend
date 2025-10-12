/**
 * Email Preference Center Service
 * Manages user email preferences, unsubscribe handling, and GDPR compliance
 */
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { TRPCError } from '@trpc/server';
import { createHash, randomBytes } from 'crypto';

export interface UpdatePreferencesParams {
  royaltyStatements?: boolean;
  licenseExpiry?: boolean;
  projectInvitations?: boolean;
  messages?: boolean;
  payouts?: boolean;
  digestFrequency?: 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'NEVER';
  newsletters?: boolean;
  announcements?: boolean;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: 'immediate' | 'daily' | 'weekly';
}

export interface UnsubscribeParams {
  email: string;
  campaignId?: string;
  categories?: string[];
  reason?: string;
  userAgent?: string;
  ipAddress?: string;
}

export class PreferenceCenterService {
  /**
   * Get user's email preferences
   */
  async getPreferences(userId: string) {
    let prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Create default preferences
      prefs = await prisma.emailPreferences.create({
        data: { userId },
      });
    }

    return prefs;
  }

  /**
   * Update user's email preferences
   */
  async updatePreferences(userId: string, params: UpdatePreferencesParams) {
    // Update preferences
    const updated = await prisma.emailPreferences.upsert({
      where: { userId },
      update: {
        ...(params.royaltyStatements !== undefined && { royaltyStatements: params.royaltyStatements }),
        ...(params.licenseExpiry !== undefined && { licenseExpiry: params.licenseExpiry }),
        ...(params.projectInvitations !== undefined && { projectInvitations: params.projectInvitations }),
        ...(params.messages !== undefined && { messages: params.messages }),
        ...(params.payouts !== undefined && { payouts: params.payouts }),
        ...(params.digestFrequency && { digestFrequency: params.digestFrequency }),
        ...(params.newsletters !== undefined && { newsletters: params.newsletters }),
        ...(params.announcements !== undefined && { announcements: params.announcements }),
        ...(params.categoryPreferences && { categoryPreferences: params.categoryPreferences }),
        ...(params.frequencyPreference && { frequencyPreference: params.frequencyPreference }),
        preferenceCenterLastVisited: new Date(),
      },
      create: {
        userId,
        ...params,
        preferenceCenterLastVisited: new Date(),
      },
    });

    // Invalidate cache
    await redis.del(`email-prefs:${userId}`);

    // Log the change
    await this.logPreferenceChange(userId, params);

    return updated;
  }

  /**
   * Generate unsubscribe token for email links
   */
  async generateUnsubscribeToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');

    await prisma.emailPreferences.upsert({
      where: { userId },
      update: { unsubscribeToken: hash },
      create: {
        userId,
        unsubscribeToken: hash,
      },
    });

    // Return unhashed token for use in URL
    return token;
  }

  /**
   * Verify unsubscribe token
   */
  async verifyUnsubscribeToken(token: string): Promise<string | null> {
    const hash = createHash('sha256').update(token).digest('hex');

    const prefs = await prisma.emailPreferences.findFirst({
      where: { unsubscribeToken: hash },
      include: { user: true },
    });

    return prefs?.userId || null;
  }

  /**
   * Handle global unsubscribe
   */
  async globalUnsubscribe(params: UnsubscribeParams) {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: params.email },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    // Get current preferences
    const currentPrefs = await this.getPreferences(user.id);

    // Update preferences to unsubscribe from all
    await prisma.emailPreferences.update({
      where: { userId: user.id },
      data: {
        globalUnsubscribe: true,
        unsubscribedAt: new Date(),
        // Turn off all categories
        royaltyStatements: false,
        licenseExpiry: false,
        projectInvitations: false,
        messages: false,
        payouts: false,
        newsletters: false,
        announcements: false,
      },
    });

    // Log unsubscribe event
    await prisma.emailUnsubscribeLog.create({
      data: {
        userId: user.id,
        email: params.email,
        unsubscribeAction: 'global',
        unsubscribeSource: params.campaignId ? 'campaign' : 'preference_center',
        campaignId: params.campaignId,
        categoriesAffected: ['all'],
        previousPreferences: currentPrefs as any,
        newPreferences: {
          globalUnsubscribe: true,
          allCategoriesOff: true,
        } as any,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      },
    });

    // Add to suppression list
    await prisma.emailSuppression.upsert({
      where: { email: params.email },
      update: {
        reason: 'UNSUBSCRIBE',
        suppressedAt: new Date(),
      },
      create: {
        email: params.email,
        reason: 'UNSUBSCRIBE',
      },
    });

    // Invalidate cache
    await redis.del(`email-prefs:${user.id}`);
    await redis.del(`email-suppressed:${params.email}`);

    return { success: true };
  }

  /**
   * Handle category-specific unsubscribe
   */
  async categoryUnsubscribe(
    userId: string,
    categories: string[],
    params: Partial<UnsubscribeParams>
  ) {
    const currentPrefs = await this.getPreferences(userId);

    // Build update object
    const updates: any = {};
    for (const category of categories) {
      if (category in currentPrefs) {
        updates[category] = false;
      }
    }

    // Update preferences
    await prisma.emailPreferences.update({
      where: { userId },
      data: updates,
    });

    // Log unsubscribe event
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.emailUnsubscribeLog.create({
        data: {
          userId,
          email: user.email,
          unsubscribeAction: 'category',
          unsubscribeSource: params.campaignId ? 'campaign' : 'preference_center',
          campaignId: params.campaignId,
          categoriesAffected: categories,
          previousPreferences: currentPrefs as any,
          newPreferences: { ...currentPrefs, ...updates } as any,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        },
      });
    }

    // Invalidate cache
    await redis.del(`email-prefs:${userId}`);

    return { success: true };
  }

  /**
   * Re-subscribe user (opt back in)
   */
  async resubscribe(userId: string) {
    await prisma.emailPreferences.update({
      where: { userId },
      data: {
        globalUnsubscribe: false,
        unsubscribedAt: null,
      },
    });

    // Remove from suppression list
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.emailSuppression.delete({
        where: { email: user.email },
      }).catch(() => {
        // Ignore if not in suppression list
      });

      // Invalidate cache
      await redis.del(`email-prefs:${userId}`);
      await redis.del(`email-suppressed:${user.email}`);
    }

    return { success: true };
  }

  /**
   * Export user's email data (GDPR compliance)
   */
  async exportUserEmailData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        emailPreferences: true,
        emailEvents: {
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        emailUnsubscribeLogs: {
          orderBy: { createdAt: 'desc' },
        },
        scheduledEmails: {
          where: {
            status: { in: ['PENDING', 'QUEUED'] },
          },
        },
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      personalInfo: {
        email: user.email,
        name: user.name,
      },
      preferences: user.emailPreferences,
      recentEvents: user.emailEvents,
      unsubscribeHistory: user.emailUnsubscribeLogs,
      scheduledEmails: user.scheduledEmails,
    };
  }

  /**
   * Delete user's email data (GDPR right to be forgotten)
   */
  async deleteUserEmailData(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    // Anonymize email events (keep for analytics but remove PII)
    await prisma.emailEvent.updateMany({
      where: { userId },
      data: {
        userId: null,
        email: `deleted_${randomBytes(8).toString('hex')}@deleted.local`,
      },
    });

    // Delete preferences
    await prisma.emailPreferences.deleteMany({
      where: { userId },
    });

    // Delete unsubscribe logs (or anonymize)
    await prisma.emailUnsubscribeLog.updateMany({
      where: { userId },
      data: {
        userId: null,
        email: `deleted_${randomBytes(8).toString('hex')}@deleted.local`,
      },
    });

    // Cancel scheduled emails
    await prisma.scheduledEmail.deleteMany({
      where: { recipientUserId: userId },
    });

    // Invalidate caches
    await redis.del(`email-prefs:${userId}`);
    await redis.del(`email-suppressed:${user.email}`);

    return { success: true };
  }

  // --- Private helper methods ---

  private async logPreferenceChange(userId: string, changes: UpdatePreferencesParams) {
    // Log to audit system for compliance
    await prisma.auditEvent.create({
      data: {
        userId,
        entityType: 'email_preferences',
        entityId: userId,
        action: 'update',
        afterJson: changes as any,
        timestamp: new Date(),
      },
    });
  }
}

export const preferenceCenterService = new PreferenceCenterService();
