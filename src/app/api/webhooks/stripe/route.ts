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
import { AuditService } from '@/lib/services/audit.service';

const auditService = new AuditService(prisma);

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
        await handleTransferEvent(event);
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

  // Find the payout in our database
  const payout = await prisma.payout.findUnique({
    where: { stripeTransferId },
    include: { creator: true },
  });

  if (!payout) {
    console.warn(`[StripeWebhook] Payout not found for transfer: ${stripeTransferId}`);
    return;
  }

  // Update payout status based on event type
  switch (event.type) {
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
        },
      });
      break;

    case 'transfer.failed':
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failedReason: transfer.failure_message || 'Transfer failed',
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
        },
      });
      break;
  }
}

/**
 * Handle Stripe Connect Account updates
 */
async function handleAccountUpdated(event: any) {
  const account = event.data.object;
  const stripeAccountId = account.id;

  // Find creator with this Stripe account
  const creator = await prisma.creator.findUnique({
    where: { stripeAccountId },
  });

  if (!creator) {
    console.warn(`[StripeWebhook] Creator not found for account: ${stripeAccountId}`);
    return;
  }

  // Update onboarding status based on account details
  const chargesEnabled = account.charges_enabled;
  const detailsSubmitted = account.details_submitted;

  let onboardingStatus = creator.onboardingStatus;

  if (chargesEnabled && detailsSubmitted) {
    onboardingStatus = 'completed';
  } else if (detailsSubmitted) {
    onboardingStatus = 'pending_verification';
  }

  await prisma.creator.update({
    where: { id: creator.id },
    data: { onboardingStatus },
  });

  await auditService.log({
    action: 'STRIPE_ACCOUNT_UPDATED',
    entityType: 'creator',
    entityId: creator.id,
    userId: creator.userId,
    after: {
      stripeAccountId,
      onboardingStatus,
      chargesEnabled,
      detailsSubmitted,
    },
  });
}

/**
 * Handle successful payment intents
 */
async function handlePaymentIntentSucceeded(event: any) {
  const paymentIntent = event.data.object;

  await auditService.log({
    action: 'PAYMENT_SUCCEEDED',
    entityType: 'payment',
    entityId: paymentIntent.id,
    after: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      customerId: paymentIntent.customer,
    },
  });

  // TODO: Update license payment status, trigger license activation, etc.
}

/**
 * Handle failed payment intents
 */
async function handlePaymentIntentFailed(event: any) {
  const paymentIntent = event.data.object;

  await auditService.log({
    action: 'PAYMENT_FAILED',
    entityType: 'payment',
    entityId: paymentIntent.id,
    after: {
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      failureReason: paymentIntent.last_payment_error?.message,
    },
  });

  // TODO: Handle payment failure (notify user, suspend license, etc.)
}
