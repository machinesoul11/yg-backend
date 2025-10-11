/**
 * Creator Notifications Service
 * Handles email notifications for creator-related events
 */

import { PrismaClient } from '@prisma/client';
import { render } from '@react-email/render';
import { emailService } from '@/lib/services/email/email.service';
import CreatorWelcomeEmail from '@/emails/templates/CreatorWelcome';
import CreatorVerificationApprovedEmail from '@/emails/templates/CreatorVerificationApproved';
import CreatorVerificationRejectedEmail from '@/emails/templates/CreatorVerificationRejected';
import StripeOnboardingReminderEmail from '@/emails/templates/StripeOnboardingReminder';
import { CreatorNotFoundError } from '../errors/creator.errors';

export class CreatorNotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Send welcome email to new creator
   */
  async sendWelcomeEmail(creatorId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard`;

    const html = render(
      CreatorWelcomeEmail({
        stageName: creator.stageName,
        dashboardUrl,
      })
    );

    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Welcome to YES GODDESS`,
      html,
      template: 'creator-welcome',
      userId: creator.userId,
    });
  }

  /**
   * Send verification approved email
   */
  async sendVerificationApprovedEmail(
    creatorId: string,
    includeStripeOnboarding = true
  ): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard`;
    
    // Only include Stripe onboarding link if not completed
    const stripeOnboardingUrl = includeStripeOnboarding && creator.onboardingStatus !== 'completed'
      ? `${dashboardUrl}/settings/payouts`
      : undefined;

    const html = render(
      CreatorVerificationApprovedEmail({
        stageName: creator.stageName,
        dashboardUrl,
        stripeOnboardingUrl,
      })
    );

    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Creator Profile Approved`,
      html,
      template: 'creator-verification-approved',
      userId: creator.userId,
    });
  }

  /**
   * Send verification rejected email
   */
  async sendVerificationRejectedEmail(creatorId: string, reason: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard`;

    const html = render(
      CreatorVerificationRejectedEmail({
        stageName: creator.stageName,
        reason,
        dashboardUrl,
      })
    );

    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Profile Verification Update`,
      html,
      template: 'creator-verification-rejected',
      userId: creator.userId,
      metadata: { reason },
    });
  }

  /**
   * Send Stripe onboarding reminder
   */
  async sendStripeOnboardingReminder(creatorId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Only send if verification approved but onboarding not completed
    if (creator.verificationStatus !== 'approved' || creator.onboardingStatus === 'completed') {
      return;
    }

    const onboardingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard/settings/payouts`;

    const html = render(
      StripeOnboardingReminderEmail({
        stageName: creator.stageName,
        onboardingUrl,
      })
    );

    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Complete Your Payout Setup`,
      html,
      template: 'stripe-onboarding-reminder',
      userId: creator.userId,
    });
  }

  /**
   * Send Stripe onboarding completed confirmation
   */
  async sendStripeOnboardingCompletedEmail(creatorId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // For now, we'll use a simple text email
    // TODO: Create a dedicated template for this
    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Payout Account Setup Complete`,
      html: `
        <h1>Payout Account Setup Complete</h1>
        <p>Dear ${creator.stageName},</p>
        <p>Your payout account has been successfully set up! You can now receive royalty payments directly to your bank account.</p>
        <p>Start uploading your intellectual property to begin earning.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard">Go to Dashboard</a></p>
      `,
      template: 'stripe-onboarding-completed',
      userId: creator.userId,
    });
  }

  /**
   * Send first license notification
   */
  async sendFirstLicenseNotification(creatorId: string, licenseId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // TODO: Create dedicated template
    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - Your First License!`,
      html: `
        <h1>Congratulations on Your First License!</h1>
        <p>Dear ${creator.stageName},</p>
        <p>Your intellectual property has been licensed for the first time!</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard/licenses/${licenseId}">View License Details</a></p>
      `,
      template: 'first-license-notification',
      userId: creator.userId,
      metadata: { licenseId },
    });
  }

  /**
   * Send monthly performance report
   */
  async sendMonthlyPerformanceReport(
    creatorId: string,
    metrics: {
      monthName: string;
      earningsCents: number;
      newLicenses: number;
      profileViews: number;
      totalActiveLicenses: number;
    }
  ): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    const earnings = (metrics.earningsCents / 100).toFixed(2);

    // TODO: Create dedicated template
    await emailService.send({
      to: creator.user.email,
      subject: `${creator.stageName.toUpperCase()} - ${metrics.monthName} Performance Report`,
      html: `
        <h1>${metrics.monthName} Performance Report</h1>
        <p>Dear ${creator.stageName},</p>
        <h2>Your Monthly Summary</h2>
        <ul>
          <li><strong>Earnings:</strong> $${earnings}</li>
          <li><strong>New Licenses:</strong> ${metrics.newLicenses}</li>
          <li><strong>Profile Views:</strong> ${metrics.profileViews}</li>
          <li><strong>Active Licenses:</strong> ${metrics.totalActiveLicenses}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/dashboard/analytics">View Detailed Analytics</a></p>
      `,
      template: 'monthly-performance-report',
      userId: creator.userId,
      metadata: metrics,
    });
  }
}
