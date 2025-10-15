/**
 * Payout Notification Service
 * Sends confirmation emails and in-app notifications for payouts
 */

import { PrismaClient, PayoutStatus } from '@prisma/client';
import { Redis } from 'ioredis';
import { EmailService } from '@/lib/services/email/email.service';
import { NotificationService } from '@/modules/system/services/notification.service';

const emailService = new EmailService();

export class PayoutNotificationService {
  private notificationService: NotificationService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {
    this.notificationService = new NotificationService(prisma, redis);
  }

  /**
   * Send payout confirmation email and notification
   */
  async sendPayoutConfirmation(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyStatement: {
          include: {
            royaltyRun: true,
          },
        },
      },
    });

    if (!payout || payout.status !== PayoutStatus.COMPLETED) {
      throw new Error('Payout not found or not completed');
    }

    const creator = payout.creator;
    const amountFormatted = `$${((payout as any).amountCents / 100).toFixed(2)}`;
    
    // Calculate estimated arrival (Stripe transfers typically take 2-7 business days)
    const estimatedArrival = new Date();
    estimatedArrival.setDate(estimatedArrival.getDate() + 3); // 3 business days estimate

    // Send email
    await emailService.sendTransactional({
      userId: creator.userId,
      email: creator.user.email,
      subject: `Payout Confirmed: ${amountFormatted}`,
      template: 'payout-confirmation',
      variables: {
        userName: creator.stageName || creator.user.name || 'Creator',
        amount: amountFormatted,
        currency: 'USD',
        period: payout.royaltyStatement
          ? `${new Date(payout.royaltyStatement.royaltyRun.periodStart).toLocaleDateString()} - ${new Date(payout.royaltyStatement.royaltyRun.periodEnd).toLocaleDateString()}`
          : 'Recent earnings',
        transferId: payout.stripeTransferId || 'N/A',
        estimatedArrival: estimatedArrival.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      },
      tags: {
        category: 'payout',
        type: 'confirmation',
      },
    });

    // Send in-app notification
    await this.notificationService.create({
      userId: creator.userId,
      type: 'PAYOUT',
      title: 'Payout Processed',
      message: `Your payout of ${amountFormatted} has been processed and will arrive in 2-7 business days.`,
      actionUrl: `/dashboard/payouts/${payoutId}`,
      priority: 'HIGH',
      metadata: {
        payoutId: payout.id,
        amount: (payout as any).amountCents,
        stripeTransferId: payout.stripeTransferId,
      },
    });
  }

  /**
   * Send payout failure notification
   */
  async sendPayoutFailureNotification(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!payout || payout.status !== PayoutStatus.FAILED) {
      throw new Error('Payout not found or not failed');
    }

    const creator = payout.creator;
    const amountFormatted = `$${((payout as any).amountCents / 100).toFixed(2)}`;

    // Determine user-friendly error message
    const errorMessage = this.getUserFriendlyErrorMessage(payout.failedReason || 'Unknown error');
    const actionSteps = this.getActionSteps(payout.failedReason || '');

    // Send email
    await emailService.sendTransactional({
      userId: creator.userId,
      email: creator.user.email,
      subject: `Payout Failed: ${amountFormatted}`,
      template: 'payout-failed',
      variables: {
        userName: creator.stageName || creator.user.name || 'Creator',
        amount: (payout as any).amountCents / 100,
        currency: 'USD',
        errorMessage,
        actionSteps,
        supportUrl: `${process.env.NEXT_PUBLIC_APP_URL}/support`,
      },
      tags: {
        category: 'payout',
        type: 'failure',
      },
    });

    // Send in-app notification
    await this.notificationService.create({
      userId: creator.userId,
      type: 'PAYOUT',
      title: 'Payout Failed',
      message: `Your payout of ${amountFormatted} could not be processed. ${errorMessage}`,
      actionUrl: `/dashboard/settings/payouts`,
      priority: 'HIGH',
      metadata: {
        payoutId: payout.id,
        amount: (payout as any).amountCents,
        error: payout.failedReason,
      },
    });
  }

  /**
   * Convert technical error to user-friendly message
   */
  private getUserFriendlyErrorMessage(technicalError: string): string {
    const errorMap: Record<string, string> = {
      'account_invalid': 'Your Stripe account setup is incomplete or invalid.',
      'balance_insufficient': 'Insufficient funds in platform account. Please contact support.',
      'account_closed': 'Your connected bank account has been closed.',
      'bank_account_restricted': 'Your bank account is restricted.',
      'invalid_currency': 'Currency mismatch with your account.',
      'No Stripe account connected': 'You haven\'t connected a payout account yet.',
      'Stripe onboarding not completed': 'Please complete your payout account setup.',
    };

    for (const [key, value] of Object.entries(errorMap)) {
      if (technicalError.includes(key)) {
        return value;
      }
    }

    return 'An error occurred while processing your payout. Please try again or contact support.';
  }

  /**
   * Get action steps based on error
   */
  private getActionSteps(error: string): string {
    if (error.includes('account_invalid') || error.includes('onboarding')) {
      return 'Please go to Settings > Payouts and complete your account setup.';
    }
    if (error.includes('bank_account') || error.includes('account_closed')) {
      return 'Please update your bank account information in Settings > Payouts.';
    }
    if (error.includes('No Stripe account')) {
      return 'Please connect a payout account in Settings > Payouts to receive earnings.';
    }
    return 'Please contact our support team for assistance with your payout.';
  }

  /**
   * Send payout retry notification
   */
  async sendPayoutRetryNotification(payoutId: string, retryCount: number): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!payout) {
      return;
    }

    const creator = payout.creator;

    // Only send notification on 3rd retry to avoid spam
    if (retryCount === 3) {
      await this.notificationService.create({
        userId: creator.userId,
        type: 'SYSTEM',
        title: 'Payout Processing Delayed',
        message: `We're experiencing delays processing your payout. We're working to resolve this and will notify you once complete.`,
        priority: 'MEDIUM',
        metadata: {
          payoutId: payout.id,
          retryCount,
        },
      });
    }
  }
}
