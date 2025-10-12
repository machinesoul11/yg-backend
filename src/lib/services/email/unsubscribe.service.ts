/**
 * Unsubscribe Management Service
 * 
 * Handles granular email unsubscribe preferences:
 * - One-click unsubscribe
 * - Category-specific preferences
 * - Frequency preferences (immediate, daily, weekly)
 * - Global unsubscribe
 * - Preference center management
 * - Audit trail for compliance
 */

import { prisma } from '@/lib/db';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export interface UnsubscribeOptions {
  userId?: string;
  email: string;
  global?: boolean;
  categories?: string[];
  source: 'email_client' | 'one_click' | 'preference_center' | 'webhook';
  campaignId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface EmailPreferenceUpdate {
  userId: string;
  categoryPreferences?: Record<string, boolean>;
  frequencyPreference?: 'immediate' | 'daily' | 'weekly' | 'never';
  globalUnsubscribe?: boolean;
}

export class UnsubscribeService {
  /**
   * Generate unique unsubscribe token for user
   */
  async generateUnsubscribeToken(userId: string): Promise<string> {
    const token = nanoid(32);
    
    // Hash token for storage
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    await prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        unsubscribeToken: hash,
      },
      update: {
        unsubscribeToken: hash,
      },
    });

    return token; // Return unhashed token for URL
  }

  /**
   * Verify and retrieve user from unsubscribe token
   */
  async verifyUnsubscribeToken(token: string): Promise<string | null> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const preferences = await prisma.emailPreferences.findFirst({
      where: { unsubscribeToken: hash },
      select: { userId: true },
    });

    return preferences?.userId || null;
  }

  /**
   * Process unsubscribe request
   */
  async processUnsubscribe(options: UnsubscribeOptions): Promise<void> {
    const { userId, email, global, categories, source, campaignId, userAgent, ipAddress } = options;

    // Get current preferences
    const currentPrefs = userId 
      ? await prisma.emailPreferences.findUnique({ where: { userId } })
      : null;

    const previousPreferences = currentPrefs ? {
      globalUnsubscribe: currentPrefs.globalUnsubscribe,
      categoryPreferences: currentPrefs.categoryPreferences,
      frequencyPreference: currentPrefs.frequencyPreference,
    } : null;

    // Update preferences
    if (userId) {
      const updates: any = {
        updatedAt: new Date(),
      };

      if (global) {
        updates.globalUnsubscribe = true;
        updates.unsubscribedAt = new Date();
      }

      if (categories && categories.length > 0) {
        const categoryPrefs = (currentPrefs?.categoryPreferences as Record<string, boolean>) || {};
        categories.forEach(cat => {
          categoryPrefs[cat] = false;
        });
        updates.categoryPreferences = categoryPrefs;
      }

      await prisma.emailPreferences.upsert({
        where: { userId },
        create: {
          userId,
          ...updates,
        },
        update: updates,
      });

      // Also add to suppression list if global unsubscribe
      if (global) {
        await prisma.emailSuppression.upsert({
          where: { email },
          create: {
            email,
            reason: 'UNSUBSCRIBE',
          },
          update: {},
        });
      }
    } else {
      // No userId - just add to suppression list
      await prisma.emailSuppression.upsert({
        where: { email },
        create: {
          email,
          reason: 'UNSUBSCRIBE',
        },
        update: {},
      });
    }

    // Create audit log
    await prisma.emailUnsubscribeLog.create({
      data: {
        userId,
        email,
        unsubscribeAction: global ? 'global_unsubscribe' : 'category_unsubscribe',
        unsubscribeSource: source,
        campaignId,
        categoriesAffected: categories || [],
        previousPreferences,
        newPreferences: global ? { globalUnsubscribe: true } : { categories },
        userAgent,
        ipAddress,
      },
    });

    console.log(`[Unsubscribe] Processed for ${email} - global: ${global}, categories: ${categories?.join(', ')}`);
  }

  /**
   * Update email preferences from preference center
   */
  async updatePreferences(update: EmailPreferenceUpdate): Promise<void> {
    const { userId, categoryPreferences, frequencyPreference, globalUnsubscribe } = update;

    const updates: any = {
      updatedAt: new Date(),
      preferenceCenterLastVisited: new Date(),
    };

    if (categoryPreferences !== undefined) {
      updates.categoryPreferences = categoryPreferences;
    }

    if (frequencyPreference !== undefined) {
      updates.frequencyPreference = frequencyPreference;
    }

    if (globalUnsubscribe !== undefined) {
      updates.globalUnsubscribe = globalUnsubscribe;
      if (globalUnsubscribe) {
        updates.unsubscribedAt = new Date();
      }
    }

    await prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...updates,
      },
      update: updates,
    });
  }

  /**
   * Re-subscribe user to emails
   */
  async resubscribe(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) throw new Error('User not found');

    // Update preferences
    await prisma.emailPreferences.upsert({
      where: { userId },
      create: {
        userId,
        globalUnsubscribe: false,
      },
      update: {
        globalUnsubscribe: false,
        unsubscribedAt: null,
      },
    });

    // Remove from suppression list
    await prisma.emailSuppression.deleteMany({
      where: {
        email: user.email,
        reason: 'UNSUBSCRIBE',
      },
    });

    // Log re-subscription
    await prisma.emailUnsubscribeLog.create({
      data: {
        userId,
        email: user.email,
        unsubscribeAction: 'resubscribe',
        unsubscribeSource: 'preference_center',
        categoriesAffected: [],
        previousPreferences: { globalUnsubscribe: true },
        newPreferences: { globalUnsubscribe: false },
      },
    });

    console.log(`[Unsubscribe] User ${userId} resubscribed`);
  }

  /**
   * Check if user should receive specific email category
   */
  async shouldReceiveEmail(
    userId: string,
    category: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const preferences = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!preferences) {
      // No preferences set - allow by default
      return { allowed: true };
    }

    // Check global unsubscribe
    if (preferences.globalUnsubscribe) {
      return { allowed: false, reason: 'Global unsubscribe' };
    }

    // Check category preferences
    const categoryPrefs = preferences.categoryPreferences as Record<string, boolean> | null;
    if (categoryPrefs && categoryPrefs[category] === false) {
      return { allowed: false, reason: `Unsubscribed from ${category}` };
    }

    // Check built-in boolean preferences
    const builtInPrefs: Record<string, boolean> = {
      royaltyStatements: preferences.royaltyStatements,
      licenseExpiry: preferences.licenseExpiry,
      projectInvitations: preferences.projectInvitations,
      messages: preferences.messages,
      payouts: preferences.payouts,
      newsletters: preferences.newsletters,
      announcements: preferences.announcements,
    };

    if (category in builtInPrefs && !builtInPrefs[category]) {
      return { allowed: false, reason: `Opted out of ${category}` };
    }

    return { allowed: true };
  }

  /**
   * Get unsubscribe rate for a campaign
   */
  async getCampaignUnsubscribeRate(campaignId: string): Promise<number> {
    const unsubscribes = await prisma.emailUnsubscribeLog.count({
      where: { campaignId },
    });

    const sent = await prisma.emailEvent.count({
      where: {
        metadata: {
          path: ['campaignId'],
          equals: campaignId,
        },
        eventType: 'SENT',
      },
    });

    return sent > 0 ? unsubscribes / sent : 0;
  }

  /**
   * Get unsubscribe analytics
   */
  async getUnsubscribeAnalytics(days: number = 30): Promise<{
    totalUnsubscribes: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    trend: Array<{ date: string; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await prisma.emailUnsubscribeLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
        unsubscribeAction: {
          not: 'resubscribe',
        },
      },
    });

    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byDate: Record<string, number> = {};

    logs.forEach(log => {
      // Count by category
      log.categoriesAffected.forEach(cat => {
        byCategory[cat] = (byCategory[cat] || 0) + 1;
      });

      // Count by source
      bySource[log.unsubscribeSource] = (bySource[log.unsubscribeSource] || 0) + 1;

      // Count by date
      const date = log.createdAt.toISOString().split('T')[0];
      byDate[date] = (byDate[date] || 0) + 1;
    });

    const trend = Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalUnsubscribes: logs.length,
      byCategory,
      bySource,
      trend,
    };
  }
}

export const unsubscribeService = new UnsubscribeService();
