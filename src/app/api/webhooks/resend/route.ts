import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/services/email/email.service';
import { requireWebhookVerification, markWebhookProcessed } from '@/lib/middleware';

export async function POST(req: NextRequest) {
  let eventId: string | undefined;

  try {
    // Get raw body for signature verification
    const rawBody = await req.text();

    // Get Resend webhook secret from environment
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('[ResendWebhook] RESEND_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    // Verify webhook signature
    const verification = await requireWebhookVerification(req, rawBody, {
      provider: 'resend',
      secret: webhookSecret,
      maxAgeSeconds: 300,
      checkIdempotency: true,
    });

    eventId = verification.eventId;

    // Parse the event
    const body = JSON.parse(rawBody);

    // Handle the webhook event
    await emailService.handleEmailEvent({
      type: body.type,
      messageId: body.data.message_id || body.data.email_id,
      timestamp: new Date(body.data.created_at || body.created_at),
      email: body.data.email || body.data.to,
      details: body.data,
    });

    // Mark as processed
    await markWebhookProcessed('resend', eventId!, 200, { processed: true });

    return NextResponse.json({ success: true, eventId });
  } catch (error) {
    const err = error as any;

    console.error('[ResendWebhook] Processing error:', error);

    // Handle different error types
    if (err.code === 'INVALID_SIGNATURE' || err.code === 'MISSING_SIGNATURE') {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    if (err.code === 'DUPLICATE_EVENT') {
      // Return success for duplicate events
      return NextResponse.json(
        { success: true, duplicate: true },
        { status: 200 }
      );
    }

    if (err.code === 'REPLAY_ATTACK') {
      return NextResponse.json(
        { error: 'Request too old' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
