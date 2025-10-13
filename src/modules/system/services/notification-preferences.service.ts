/**
 * Notification Preferences Service
 * 
 * Manages user notification preferences for all notification types
 * Integrates with email preferences for unified preference management
 */

import { PrismaClient, NotificationType, DigestFrequency } from '@prisma/client';
import { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';

export interface NotificationPreferences {
  userId: string;
  enabledTypes: NotificationType[];
  digestFrequency: DigestFrequency;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  lastDigestSentAt?: Date;
}

export interface UpdateNotificationPreferencesInput {
  enabledTypes?: NotificationType[];
  digestFrequency?: DigestFrequency;
  emailEnabled?: boolean;
  inAppEnabled?: boolean;
}

export class NotificationPreferencesService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Get user notification preferences
   * Returns defaults if not set
   */
  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const cacheKey = `notification-prefs:${userId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Get email preferences which store notification settings
    const emailPrefs = await this.prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!emailPrefs) {
      // Create default preferences
      const newPrefs = await this.prisma.emailPreferences.create({
        data: { userId },
      });

      const prefs: NotificationPreferences = {
        userId,
        enabledTypes: this.getDefaultEnabledTypes(),
        digestFrequency: newPrefs.digestFrequency,
        emailEnabled: true,
        inAppEnabled: true,
      };

      await this.redis.set(cacheKey, JSON.stringify(prefs), 'EX', 3600);
      return prefs;
    }

    const prefs: NotificationPreferences = {
      userId,
      enabledTypes: this.getEnabledTypesFromPreferences(emailPrefs),
      digestFrequency: emailPrefs.digestFrequency,
      emailEnabled: !emailPrefs.globalUnsubscribe,
      inAppEnabled: true, // Always enabled for in-app
    };

    await this.redis.set(cacheKey, JSON.stringify(prefs), 'EX', 3600);
    return prefs;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferences> {
    const currentPrefs = await this.getPreferences(userId);

    // Update email preferences
    await this.prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        digestFrequency: input.digestFrequency ?? 'IMMEDIATE',
        licenseExpiry: input.enabledTypes?.includes('LICENSE') ?? true,
        payouts: input.enabledTypes?.includes('PAYOUT') ?? true,
        royaltyStatements: input.enabledTypes?.includes('ROYALTY') ?? true,
        projectInvitations: input.enabledTypes?.includes('PROJECT') ?? true,
        messages: input.enabledTypes?.includes('MESSAGE' as NotificationType) ?? true,
        announcements: input.enabledTypes?.includes('SYSTEM' as NotificationType) ?? true,
        globalUnsubscribe: input.emailEnabled === false,
      },
      update: {
        ...(input.digestFrequency && { digestFrequency: input.digestFrequency }),
        ...(input.enabledTypes && {
          licenseExpiry: input.enabledTypes.includes('LICENSE' as NotificationType),
          payouts: input.enabledTypes.includes('PAYOUT' as NotificationType),
          royaltyStatements: input.enabledTypes.includes('ROYALTY' as NotificationType),
          projectInvitations: input.enabledTypes.includes('PROJECT' as NotificationType),
          messages: input.enabledTypes.includes('MESSAGE' as NotificationType),
          announcements: input.enabledTypes.includes('SYSTEM' as NotificationType),
        }),
        ...(input.emailEnabled !== undefined && { 
          globalUnsubscribe: !input.emailEnabled 
        }),
      },
    });

    // Invalidate cache
    await this.redis.del(`notification-prefs:${userId}`);

    // Return updated preferences
    return this.getPreferences(userId);
  }

  /**
   * Check if user should receive a specific notification type
   */
  async shouldSendNotification(
    userId: string,
    type: NotificationType,
    channel: 'email' | 'in-app'
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId);

    // Check if notification type is enabled
    if (!prefs.enabledTypes.includes(type)) {
      return false;
    }

    // Check channel preference
    if (channel === 'email' && !prefs.emailEnabled) {
      return false;
    }

    if (channel === 'in-app' && !prefs.inAppEnabled) {
      return false;
    }

    return true;
  }

  /**
   * Get enabled delivery channels for a notification
   */
  async getEnabledChannels(
    userId: string,
    type: NotificationType
  ): Promise<Array<'email' | 'in-app'>> {
    const prefs = await this.getPreferences(userId);
    const channels: Array<'email' | 'in-app'> = [];

    if (!prefs.enabledTypes.includes(type)) {
      return channels;
    }

    if (prefs.inAppEnabled) {
      channels.push('in-app');
    }

    if (prefs.emailEnabled) {
      channels.push('email');
    }

    return channels;
  }

  /**
   * Update last digest sent timestamp
   */
  async updateLastDigestSent(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Store in user metadata or create a separate field
        updatedAt: new Date(),
      },
    });

    await this.redis.del(`notification-prefs:${userId}`);
  }

  /**
   * Get users who need digest emails
   */
  async getUsersForDigest(frequency: 'DAILY' | 'WEEKLY'): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deleted_at: null,
        isActive: true,
        emailPreferences: {
          digestFrequency: frequency,
          globalUnsubscribe: false,
        },
      },
      select: { id: true },
    });

    return users.map(u => u.id);
  }

  // Private helper methods

  private getDefaultEnabledTypes(): NotificationType[] {
    return [
      'LICENSE' as NotificationType,
      'PAYOUT' as NotificationType,
      'ROYALTY' as NotificationType,
      'PROJECT' as NotificationType,
      'SYSTEM' as NotificationType,
      'MESSAGE' as NotificationType,
    ];
  }

  private getEnabledTypesFromPreferences(prefs: any): NotificationType[] {
    const types: NotificationType[] = [];

    if (prefs.licenseExpiry) types.push('LICENSE' as NotificationType);
    if (prefs.payouts) types.push('PAYOUT' as NotificationType);
    if (prefs.royaltyStatements) types.push('ROYALTY' as NotificationType);
    if (prefs.projectInvitations) types.push('PROJECT' as NotificationType);
    if (prefs.announcements) types.push('SYSTEM' as NotificationType);
    if (prefs.messages) types.push('MESSAGE' as NotificationType);

    return types;
  }
}
