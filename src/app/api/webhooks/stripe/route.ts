/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events with signature verification
 * 
 * Handles:
 * - Transfer status updates (payout processing)
 * - Account updates (Connect onboarding)
 * - Payment intents
 * - Customer events
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWebhookVerification, markWebhookProcessed } from '@/lib/middleware';
import { STRIPE_CONFIG } from '@/lib/config';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { queueNotificationDelivery } from '@/jobs/notification-delivery.job';

const auditService = new AuditService(prisma);
const notificationService = new NotificationService(prisma, redis);

export async function POST(req: NextRequest) {
  let eventId: string | undefined;
  
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();

    // Verify webhook signature
    const verification = await requireWebhookVerification(req, rawBody, {
      provider: 'stripe',
      secret: STRIPE_CONFIG.webhookSecret,
      maxAgeSeconds: 300, // 5 minutes
      checkIdempotency: true,
    });

    eventId = verification.eventId;

    // Parse the event
    const event = JSON.parse(rawBody);

    // Log webhook receipt
    await auditService.log({
      action: 'STRIPE_WEBHOOK_RECEIVED',
      entityType: 'webhook',
      entityId: eventId!,
      after: {
        type: event.type,
        livemode: event.livemode,
      },
    });

    // Handle different event types
    switch (event.type) {
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.paid':
      case 'transfer.failed':
      case 'transfer.reversed':
        await handleTransferEvent(event);
        break;

      case 'payout.paid':
        await handlePayoutPaidEvent(event);
        break;

      case 'account.updated':
        await handleAccountUpdated(event);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event);
        break;

      default:
        console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
        
        // Log unhandled events for potential future implementation
        await auditService.log({
          action: 'STRIPE_WEBHOOK_UNHANDLED',
          entityType: 'webhook',
          entityId: eventId!,
          after: {
            eventType: event.type,
            livemode: event.livemode,
            objectType: event.data?.object?.object,
          },
        });
    }

    // Mark as processed
    await markWebhookProcessed('stripe', eventId!, 200, { processed: true });

    return NextResponse.json({ received: true, eventId });
  } catch (error) {
    const err = error as any;

    // Log error
    await auditService.log({
      action: 'STRIPE_WEBHOOK_ERROR',
      entityType: 'webhook',
      entityId: eventId || 'unknown',
      after: {
        error: err.message,
        code: err.code,
      },
    });

    // Handle different error types
    if (err.code === 'INVALID_SIGNATURE' || err.code === 'MISSING_SIGNATURE') {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    if (err.code === 'DUPLICATE_EVENT') {
      // Return success for duplicate events to stop Stripe retries
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200 }
      );
    }

    if (err.code === 'REPLAY_ATTACK') {
      return NextResponse.json(
        { error: 'Request too old' },
        { status: 400 }
      );
    }

    // Return 500 for other errors to trigger Stripe retry
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle Stripe Transfer events (payouts to creators)
 */
async function handleTransferEvent(event: any) {
  const transfer = event.data.object;
  const stripeTransferId = transfer.id;

  try {
    // Find the payout in our database
    const payout = await prisma.payout.findUnique({
      where: { stripeTransferId },
      include: { creator: true },
    });

    if (!payout) {
      // Log for debugging - this could indicate a data synchronization issue
      console.warn(`[StripeWebhook] Payout not found for transfer: ${stripeTransferId}`);
      
      await auditService.log({
        action: 'STRIPE_TRANSFER_ORPHANED',
        entityType: 'transfer',
        entityId: stripeTransferId,
        after: {
          transferData: {
            id: transfer.id,
            amount: transfer.amount,
            currency: transfer.currency,
            destination: transfer.destination,
            eventType: event.type,
          },
          reason: 'No matching payout found in database',
        },
      });
      
      return;
    }

    // Validate payout-transfer consistency
    if (payout.amountCents !== transfer.amount) {
      console.warn(`[StripeWebhook] Amount mismatch for payout ${payout.id}: DB=${payout.amountCents}, Stripe=${transfer.amount}`);
      
      await auditService.log({
        action: 'PAYOUT_AMOUNT_MISMATCH',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          dbAmount: payout.amountCents,
          stripeAmount: transfer.amount,
          stripeTransferId,
        },
      });
    }

  // Update payout status based on event type
  switch (event.type) {
    case 'transfer.created':
      // Update payout status to PROCESSING when Stripe confirms transfer creation
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'PROCESSING',
        },
      });

      await auditService.log({
        action: 'PAYOUT_PROCESSING',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          stripeTransferId,
          amount: payout.amountCents,
          transferAmount: transfer.amount,
        },
      });

      // Create notification for transfer initiated
      try {
        const processingNotification = await notificationService.create({
          userId: payout.creator.userId,
          type: 'PAYOUT' as any,
          priority: 'MEDIUM' as any,
          title: 'Payout Processing',
          message: `Your payout of $${(payout.amountCents / 100).toFixed(2)} is being processed and will arrive in 1-2 business days.`,
          actionUrl: `/payouts/${payout.id}`,
          metadata: {
            payoutId: payout.id,
            amount: payout.amountCents,
            stripeTransferId,
            status: 'PROCESSING',
          },
        });

        // Queue for email delivery (optional for processing notifications)
        if (processingNotification.notificationIds.length > 0) {
          try {
            await queueNotificationDelivery(processingNotification.notificationIds[0]);
          } catch (notificationError) {
            // Don't fail webhook processing for notification queue errors
            console.warn(`[StripeWebhook] Failed to queue processing notification:`, notificationError);
          }
        }
      } catch (notificationError) {
        // Don't fail webhook processing for notification creation errors
        console.warn(`[StripeWebhook] Failed to create processing notification:`, notificationError);
      }
      break;

    case 'transfer.updated':
      // Log transfer updates for audit trail
      await auditService.log({
        action: 'PAYOUT_TRANSFER_UPDATED',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          stripeTransferId,
          transferData: {
            amount: transfer.amount,
            currency: transfer.currency,
            destination: transfer.destination,
            description: transfer.description,
            metadata: transfer.metadata,
          },
        },
      });
      break;

    case 'transfer.paid':
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });

      await auditService.log({
        action: 'PAYOUT_COMPLETED',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          stripeTransferId,
          amount: payout.amountCents,
          transferAmount: transfer.amount,
          arrivalDate: transfer.arrival_date,
        },
      });

      // Create notification for successful payout
      try {
        const successNotification = await notificationService.create({
          userId: payout.creator.userId,
          type: 'PAYOUT' as any,
          priority: 'HIGH' as any,
          title: 'Payout Completed',
          message: `Your payout of $${(payout.amountCents / 100).toFixed(2)} has been successfully processed and is on its way to your account.`,
          actionUrl: `/payouts/${payout.id}`,
          metadata: {
            payoutId: payout.id,
            amount: payout.amountCents,
            stripeTransferId,
            status: 'COMPLETED',
            arrivalDate: transfer.arrival_date,
          },
        });

        // Queue for email delivery
        if (successNotification.notificationIds.length > 0) {
          try {
            await queueNotificationDelivery(successNotification.notificationIds[0]);
          } catch (notificationError) {
            // Don't fail webhook processing for notification queue errors
            console.warn(`[StripeWebhook] Failed to queue success notification:`, notificationError);
          }
        }
      } catch (notificationError) {
        // Don't fail webhook processing for notification creation errors
        console.warn(`[StripeWebhook] Failed to create success notification:`, notificationError);
      }
      break;

    case 'transfer.failed':
      // Update payout status and capture failure details
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failedReason: transfer.failure_message || 'Transfer failed',
          lastRetryAt: new Date(), // Mark when the failure occurred
        },
      });

      await auditService.log({
        action: 'PAYOUT_FAILED',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          stripeTransferId,
          reason: transfer.failure_message,
          failureCode: transfer.failure_code,
          transferAmount: transfer.amount,
          retryCount: payout.retryCount,
        },
      });

      // Create urgent notification for failed payout
      try {
        const failureNotification = await notificationService.create({
          userId: payout.creator.userId,
          type: 'PAYOUT' as any,
          priority: 'URGENT' as any,
          title: 'Payout Failed',
          message: `Your payout of $${(payout.amountCents / 100).toFixed(2)} could not be processed. ${transfer.failure_message || 'Please contact support for assistance.'}`,
          actionUrl: `/payouts/${payout.id}`,
          metadata: {
            payoutId: payout.id,
            amount: payout.amountCents,
            stripeTransferId,
            status: 'FAILED',
            failureReason: transfer.failure_message,
            failureCode: transfer.failure_code,
            canRetry: payout.retryCount < 5, // Max retry limit
          },
        });

        // Queue for immediate email delivery
        if (failureNotification.notificationIds.length > 0) {
          try {
            await queueNotificationDelivery(failureNotification.notificationIds[0]);
          } catch (notificationError) {
            // Don't fail webhook processing for notification queue errors
            console.warn(`[StripeWebhook] Failed to queue failure notification:`, notificationError);
          }
        }
      } catch (notificationError) {
        // Don't fail webhook processing for notification creation errors
        console.warn(`[StripeWebhook] Failed to create failure notification:`, notificationError);
      }

      // Log for potential retry processing by background job
      console.log(`[StripeWebhook] Payout failed: ${payout.id}, retries: ${payout.retryCount}/5, reason: ${transfer.failure_message}`);
      break;

    case 'transfer.reversed':
      // Handle transfer reversals (rare but possible)
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failedReason: `Transfer reversed: ${transfer.reversal?.reason || 'Unknown reason'}`,
          lastRetryAt: new Date(),
        },
      });

      await auditService.log({
        action: 'PAYOUT_REVERSED',
        entityType: 'payout',
        entityId: payout.id,
        userId: payout.creator.userId,
        after: {
          stripeTransferId,
          reversalReason: transfer.reversal?.reason,
          reversalId: transfer.reversal?.id,
          originalAmount: transfer.amount,
          reversedAmount: transfer.reversal?.amount,
        },
      });

      // Create critical notification for reversal
      try {
        const reversalNotification = await notificationService.create({
          userId: payout.creator.userId,
          type: 'PAYOUT' as any,
          priority: 'URGENT' as any,
          title: 'Payout Reversed',
          message: `Your payout of $${(payout.amountCents / 100).toFixed(2)} has been reversed by the bank. Please contact support immediately.`,
          actionUrl: `/support?issue=payout-reversal&payoutId=${payout.id}`,
          metadata: {
            payoutId: payout.id,
            amount: payout.amountCents,
            stripeTransferId,
            status: 'REVERSED',
            reversalReason: transfer.reversal?.reason,
            reversalId: transfer.reversal?.id,
          },
        });

        // Queue for immediate delivery - reversals are critical
        if (reversalNotification.notificationIds.length > 0) {
          try {
            await queueNotificationDelivery(reversalNotification.notificationIds[0]);
          } catch (notificationError) {
            // Don't fail webhook processing for notification queue errors
            console.warn(`[StripeWebhook] Failed to queue reversal notification:`, notificationError);
          }
        }
      } catch (notificationError) {
        // Don't fail webhook processing for notification creation errors
        console.warn(`[StripeWebhook] Failed to create reversal notification:`, notificationError);
      }

      console.error(`[StripeWebhook] Transfer reversed: ${payout.id}, reason: ${transfer.reversal?.reason}`);
      break;
  }
  } catch (error) {
    // Log error but don't throw - we don't want to stop webhook processing
    console.error(`[StripeWebhook] Error handling transfer event ${event.type}:`, error);
    
    await auditService.log({
      action: 'STRIPE_WEBHOOK_TRANSFER_ERROR',
      entityType: 'webhook',
      entityId: event.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        transferId: stripeTransferId,
      },
    });
    
    // Re-throw for critical database operations, but not for notification failures
    if (error instanceof Error && error.message.includes('payout.update')) {
      throw error;
    }
  }
}

/**
 * Handle Stripe Payout Paid events (platform-level payouts)
 * This handles payouts from Stripe to the platform's bank account
 */
async function handlePayoutPaidEvent(event: any) {
  try {
    const payout = event.data.object;

    await auditService.log({
      action: 'STRIPE_PAYOUT_PAID',
      entityType: 'stripe_payout',
      entityId: payout.id,
      after: {
        amount: payout.amount,
        currency: payout.currency,
        arrivalDate: payout.arrival_date,
        method: payout.method,
        type: payout.type,
        status: payout.status,
      },
    });

    // Note: This is for platform-level payouts from Stripe to the platform account
    // For creator payouts (transfers), we use the transfer.* events above
    console.log(`[StripeWebhook] Platform payout paid: ${payout.id}, amount: ${payout.amount / 100} ${payout.currency.toUpperCase()}`);
  } catch (error) {
    console.error(`[StripeWebhook] Error handling payout.paid event:`, error);
    
    await auditService.log({
      action: 'STRIPE_WEBHOOK_PAYOUT_ERROR',
      entityType: 'webhook',
      entityId: event.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        payoutId: event.data?.object?.id,
      },
    });
  }
}

/**
 * Handle Stripe Connect Account updates
 */
async function handleAccountUpdated(event: any) {
  try {
    const account = event.data.object;
    const stripeAccountId = account.id;

    // Find creator with this Stripe account
    const creator = await prisma.creator.findUnique({
      where: { stripeAccountId },
    });

    if (!creator) {
      console.warn(`[StripeWebhook] Creator not found for account: ${stripeAccountId}`);
      
      await auditService.log({
        action: 'STRIPE_ACCOUNT_ORPHANED',
        entityType: 'stripe_account',
        entityId: stripeAccountId,
        after: {
          accountData: {
            id: account.id,
            business_type: account.business_type,
            country: account.country,
            details_submitted: account.details_submitted,
            charges_enabled: account.charges_enabled,
            payouts_enabled: account.payouts_enabled,
          },
          reason: 'No matching creator found in database',
        },
      });
      
      return;
    }

    // Determine new onboarding status based on account details
    const chargesEnabled = account.charges_enabled;
    const payoutsEnabled = account.payouts_enabled;
    const detailsSubmitted = account.details_submitted;
    const requiresAction = account.requirements?.currently_due?.length > 0;

    let onboardingStatus = creator.onboardingStatus;

    if (chargesEnabled && payoutsEnabled && detailsSubmitted && !requiresAction) {
      onboardingStatus = 'completed';
    } else if (detailsSubmitted && !requiresAction) {
      onboardingStatus = 'pending_verification';
    } else if (detailsSubmitted) {
      onboardingStatus = 'in_progress';
    } else {
      onboardingStatus = 'pending';
    }

    // Only update if status has changed
    if (onboardingStatus !== creator.onboardingStatus) {
      await prisma.creator.update({
        where: { id: creator.id },
        data: { onboardingStatus },
      });

      // Send notification if account was completed
      if (onboardingStatus === 'completed' && creator.onboardingStatus !== 'completed') {
        try {
          const completionNotification = await notificationService.create({
            userId: creator.userId,
            type: 'ACCOUNT_UPDATE' as any,
            priority: 'HIGH' as any,
            title: 'Payout Setup Complete',
            message: 'Your Stripe Connect account has been verified and you can now receive payouts.',
            actionUrl: '/dashboard/settings/payouts',
            metadata: {
              creatorId: creator.id,
              stripeAccountId,
              onboardingStatus,
              payoutsEnabled,
            },
          });

          if (completionNotification.notificationIds.length > 0) {
            await queueNotificationDelivery(completionNotification.notificationIds[0]);
          }
        } catch (notificationError) {
          // Don't fail webhook processing for notification errors
          console.warn(`[StripeWebhook] Failed to send completion notification:`, notificationError);
        }
      }

      // Send notification if verification is required
      if (requiresAction && creator.onboardingStatus === 'completed') {
        try {
          const actionRequiredNotification = await notificationService.create({
            userId: creator.userId,
            type: 'ACCOUNT_UPDATE' as any,
            priority: 'URGENT' as any,
            title: 'Action Required - Payout Account',
            message: 'Additional information is required for your payout account. Please complete the verification process.',
            actionUrl: '/dashboard/settings/payouts',
            metadata: {
              creatorId: creator.id,
              stripeAccountId,
              requirementsNeeded: account.requirements?.currently_due || [],
            },
          });

          if (actionRequiredNotification.notificationIds.length > 0) {
            await queueNotificationDelivery(actionRequiredNotification.notificationIds[0]);
          }
        } catch (notificationError) {
          // Don't fail webhook processing for notification errors
          console.warn(`[StripeWebhook] Failed to send action required notification:`, notificationError);
        }
      }
    }

    await auditService.log({
      action: 'STRIPE_ACCOUNT_UPDATED',
      entityType: 'creator',
      entityId: creator.id,
      userId: creator.userId,
      after: {
        stripeAccountId,
        onboardingStatus,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        requiresAction,
        currentlyDue: account.requirements?.currently_due || [],
        errors: account.requirements?.errors || [],
        previousStatus: creator.onboardingStatus,
      },
    });
  } catch (error) {
    console.error(`[StripeWebhook] Error handling account.updated event:`, error);
    
    await auditService.log({
      action: 'STRIPE_WEBHOOK_ACCOUNT_ERROR',
      entityType: 'webhook',
      entityId: event.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        accountId: event.data?.object?.id,
      },
    });
    
    // Re-throw for critical database operations
    if (error instanceof Error && error.message.includes('creator.update')) {
      throw error;
    }
  }
}

/**
 * Handle successful payment intents
 */
async function handlePaymentIntentSucceeded(event: any) {
  try {
    const paymentIntent = event.data.object;

    await auditService.log({
      action: 'PAYMENT_SUCCEEDED',
      entityType: 'payment',
      entityId: paymentIntent.id,
      after: {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        customerId: paymentIntent.customer,
        receiptEmail: paymentIntent.receipt_email,
        paymentMethodId: paymentIntent.payment_method,
      },
    });

    // TODO: Update license payment status, trigger license activation, etc.
    console.log(`[StripeWebhook] Payment succeeded: ${paymentIntent.id}, amount: ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);
  } catch (error) {
    console.error(`[StripeWebhook] Error handling payment_intent.succeeded event:`, error);
    
    await auditService.log({
      action: 'STRIPE_WEBHOOK_PAYMENT_ERROR',
      entityType: 'webhook',
      entityId: event.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        paymentIntentId: event.data?.object?.id,
      },
    });
  }
}

/**
 * Handle failed payment intents
 */
async function handlePaymentIntentFailed(event: any) {
  try {
    const paymentIntent = event.data.object;

    await auditService.log({
      action: 'PAYMENT_FAILED',
      entityType: 'payment',
      entityId: paymentIntent.id,
      after: {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        customerId: paymentIntent.customer,
        failureReason: paymentIntent.last_payment_error?.message,
        failureCode: paymentIntent.last_payment_error?.code,
        declineCode: paymentIntent.last_payment_error?.decline_code,
      },
    });

    // TODO: Handle payment failure (notify user, suspend license, etc.)
    console.log(`[StripeWebhook] Payment failed: ${paymentIntent.id}, reason: ${paymentIntent.last_payment_error?.message}`);
  } catch (error) {
    console.error(`[StripeWebhook] Error handling payment_intent.payment_failed event:`, error);
    
    await auditService.log({
      action: 'STRIPE_WEBHOOK_PAYMENT_FAILED_ERROR',
      entityType: 'webhook',
      entityId: event.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
        paymentIntentId: event.data?.object?.id,
      },
    });
  }
}
