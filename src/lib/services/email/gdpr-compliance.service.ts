/**
 * GDPR Compliance Service
 * Handles consent management, data portability, and right to erasure
 */
import { prisma } from '@/lib/db';
import { TRPCError } from '@trpc/server';
import { createHash } from 'crypto';

export interface ConsentRecord {
  consentVersion: string;
  consentText: string;
  consentedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface GDPRExportData {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: Date;
  };
  emailPreferences: any;
  consentHistory: ConsentRecord[];
  campaignActivity: {
    campaignsReceived: number;
    totalOpens: number;
    totalClicks: number;
    campaigns: Array<{
      campaignId: string;
      campaignName: string;
      sentAt: Date;
      deliveredAt: Date | null;
      openedAt: Date | null;
      clickedAt: Date | null;
    }>;
  };
  unsubscribeHistory: Array<{
    unsubscribedAt: Date;
    action: string;
    source: string;
    categoriesAffected: string[];
  }>;
  suppressions: Array<{
    email: string;
    reason: string;
    suppressedAt: Date;
  }>;
}

const CURRENT_CONSENT_VERSION = '1.0.0';
const CONSENT_TEXT = `
I consent to receiving marketing emails from YES GODDESS including:
- Product updates and new features
- Creator spotlights and community highlights
- Monthly newsletters
- Platform announcements

I understand I can unsubscribe at any time by clicking the unsubscribe link in any email or updating my preferences in my account settings.
`;

export class GDPRComplianceService {
  /**
   * Capture user consent with full audit trail
   */
  async captureConsent(
    userId: string,
    categories: string[],
    metadata: {
      ipAddress: string;
      userAgent: string;
      source?: string;
    }
  ): Promise<void> {
    // Update email preferences
    await prisma.emailPreferences.upsert({
      where: { userId },
      update: {
        // Set category preferences
        ...(categories.includes('marketing') && { newsletters: true }),
        ...(categories.includes('announcements') && { announcements: true }),
        ...(categories.includes('royaltyStatements') && { royaltyStatements: true }),
        ...(categories.includes('licenseExpiry') && { licenseExpiry: true }),
        ...(categories.includes('projectInvitations') && { projectInvitations: true }),
      },
      create: {
        userId,
        newsletters: categories.includes('marketing'),
        announcements: categories.includes('announcements'),
        royaltyStatements: categories.includes('royaltyStatements'),
        licenseExpiry: categories.includes('licenseExpiry'),
        projectInvitations: categories.includes('projectInvitations'),
      },
    });

    // Log consent in audit trail
    await this.logConsentEvent(userId, {
      action: 'consent_given',
      consentVersion: CURRENT_CONSENT_VERSION,
      categories,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      source: metadata.source || 'preference_center',
    });
  }

  /**
   * Check if user has current consent version
   */
  async hasCurrentConsent(userId: string): Promise<boolean> {
    // Check if user has consented to current version
    const latestConsent = await this.getLatestConsentEvent(userId);

    if (!latestConsent) {
      return false;
    }

    return latestConsent.consentVersion === CURRENT_CONSENT_VERSION;
  }

  /**
   * Request consent renewal when policy changes
   */
  async requestConsentRenewal(userId: string): Promise<void> {
    // Set all marketing preferences to false until re-consent
    await prisma.emailPreferences.update({
      where: { userId },
      data: {
        newsletters: false,
        announcements: false,
      },
    });

    // Log that consent renewal is needed
    await this.logConsentEvent(userId, {
      action: 'consent_renewal_required',
      consentVersion: CURRENT_CONSENT_VERSION,
      categories: [],
      ipAddress: 'system',
      userAgent: 'system',
      source: 'policy_update',
    });
  }

  /**
   * Export all user email data (GDPR Right to Access)
   */
  async exportUserData(userId: string): Promise<GDPRExportData> {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    // Get email preferences
    const emailPreferences = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    // Get consent history
    const consentHistory = await this.getConsentHistory(userId);

    // Get campaign activity
    const campaignRecipients = await prisma.campaignRecipient.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
    });

    const campaignActivity = {
      campaignsReceived: campaignRecipients.length,
      totalOpens: campaignRecipients.filter((r) => r.openedAt).length,
      totalClicks: campaignRecipients.filter((r) => r.firstClickedAt).length,
      campaigns: campaignRecipients.map((r) => ({
        campaignId: r.campaignId,
        campaignName: r.campaign.name,
        sentAt: r.sentAt!,
        deliveredAt: r.deliveredAt,
        openedAt: r.openedAt,
        clickedAt: r.firstClickedAt,
      })),
    };

    // Get unsubscribe history
    const unsubscribeLogs = await prisma.emailUnsubscribeLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const unsubscribeHistory = unsubscribeLogs.map((log) => ({
      unsubscribedAt: log.createdAt,
      action: log.unsubscribeAction,
      source: log.unsubscribeSource,
      categoriesAffected: log.categoriesAffected,
    }));

    // Get suppressions
    const suppressions = await prisma.emailSuppression.findMany({
      where: { email: user.email },
    });

    return {
      user,
      emailPreferences,
      consentHistory,
      campaignActivity,
      unsubscribeHistory,
      suppressions: suppressions.map((s) => ({
        email: s.email,
        reason: s.reason,
        suppressedAt: s.suppressedAt,
      })),
    };
  }

  /**
   * Delete all user email data (GDPR Right to Erasure)
   */
  async deleteUserEmailData(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    // Delete in transaction
    await prisma.$transaction(async (tx) => {
      // Anonymize campaign recipients (keep for analytics but remove PII)
      await tx.campaignRecipient.updateMany({
        where: { userId },
        data: {
          email: `deleted-${createHash('sha256').update(user.email).digest('hex').substring(0, 16)}@anonymized.local`,
          userId: null,
          personalizationData: {},
        },
      });

      // Delete email preferences
      await tx.emailPreferences.deleteMany({
        where: { userId },
      });

      // Delete scheduled emails
      await tx.scheduledEmail.deleteMany({
        where: { recipientUserId: userId },
      });

      // Keep unsubscribe logs for compliance (anonymize email)
      await tx.emailUnsubscribeLog.updateMany({
        where: { userId },
        data: {
          email: `deleted-${createHash('sha256').update(user.email).digest('hex').substring(0, 16)}@anonymized.local`,
          userId: null,
        },
      });

      // Keep email events for compliance (anonymize)
      await tx.emailEvent.updateMany({
        where: { userId },
        data: {
          email: `deleted-${createHash('sha256').update(user.email).digest('hex').substring(0, 16)}@anonymized.local`,
          userId: null,
        },
      });

      // Log the deletion
      await this.logConsentEvent(userId, {
        action: 'data_deleted',
        consentVersion: CURRENT_CONSENT_VERSION,
        categories: [],
        ipAddress: 'system',
        userAgent: 'system',
        source: 'user_request',
      });
    });
  }

  /**
   * Get consent history for user
   */
  async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    // In a real implementation, you'd store consent events in a dedicated table
    // For now, we'll derive from email preferences updates
    const prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      return [];
    }

    // Return current consent as the history
    // In production, maintain a consent_history table
    return [
      {
        consentVersion: CURRENT_CONSENT_VERSION,
        consentText: CONSENT_TEXT,
        consentedAt: prefs.createdAt,
        ipAddress: 'unknown', // Would be stored in consent_history table
        userAgent: 'unknown', // Would be stored in consent_history table
      },
    ];
  }

  /**
   * Generate data portability export file
   */
  async generateDataPortabilityExport(userId: string): Promise<Buffer> {
    const data = await this.exportUserData(userId);

    // Convert to JSON and create buffer
    const jsonData = JSON.stringify(data, null, 2);
    return Buffer.from(jsonData, 'utf-8');
  }

  /**
   * Validate data processing is GDPR compliant
   */
  async validateGDPRCompliance(userId: string): Promise<{
    compliant: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if user has consented
    const hasConsent = await this.hasCurrentConsent(userId);
    if (!hasConsent) {
      issues.push('User has not consented to current privacy policy version');
      recommendations.push('Request consent renewal before sending marketing emails');
    }

    // Check if user is globally unsubscribed
    const prefs = await prisma.emailPreferences.findUnique({
      where: { userId },
    });

    // Check if user is globally unsubscribed - field is mapped as global_unsubscribe in DB
    const globalUnsub = (prefs as any)?.global_unsubscribe;
    if (globalUnsub) {
      issues.push('User has globally unsubscribed');
      recommendations.push('Do not send any marketing emails');
    }

    // Check if email is suppressed
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user) {
      const suppressed = await prisma.emailSuppression.findUnique({
        where: { email: user.email },
      });

      if (suppressed) {
        issues.push(`Email suppressed due to: ${suppressed.reason}`);
        recommendations.push('Remove from suppression list only if user re-verifies email');
      }
    }

    return {
      compliant: issues.length === 0,
      issues,
      recommendations,
    };
  }

  // Private helper methods

  private async logConsentEvent(
    userId: string,
    data: {
      action: string;
      consentVersion: string;
      categories: string[];
      ipAddress: string;
      userAgent: string;
      source: string;
    }
  ): Promise<void> {
    // In production, log to dedicated consent_events table
    // For now, use audit events
    await prisma.auditEvent.create({
      data: {
        userId,
        entityType: 'email_consent',
        entityId: userId,
        action: data.action,
        afterJson: data as any,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  private async getLatestConsentEvent(userId: string): Promise<{
    consentVersion: string;
    consentedAt: Date;
  } | null> {
    const event = await prisma.auditEvent.findFirst({
      where: {
        userId,
        entityType: 'email_consent',
        action: 'consent_given',
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!event || !event.afterJson) {
      return null;
    }

    const data = event.afterJson as any;
    return {
      consentVersion: data.consentVersion || '1.0.0',
      consentedAt: event.timestamp,
    };
  }
}

export const gdprComplianceService = new GDPRComplianceService();
