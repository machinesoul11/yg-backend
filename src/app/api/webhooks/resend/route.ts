import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emailTrackingService } from '@/lib/services/email/tracking.service';
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';
import { verifyResendWebhook } from '@/lib/utils/verify-resend-webhook';
import { enqueueEmailEvent } from '@/jobs/email-events-processor.job';
import type { EmailEventType } from '@prisma/client';

// Initialize suppression list manager
const suppressionList = new SuppressionListManager();

export async function POST(req: NextRequest) {
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
    const signature = req.headers.get('svix-signature') || req.headers.get('resend-signature');
    
    if (!signature) {
      console.warn('[ResendWebhook] Missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    // Parse the event
    const event = JSON.parse(rawBody);
    
    // Verify signature
    const isValid = verifyResendWebhook(signature, event);
    
    if (!isValid) {
      console.warn('[ResendWebhook] Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Map Resend event types to our EmailEventType
    const eventTypeMap: Record<string, EmailEventType> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.delivery_delayed': 'SENT', // Track as sent until delivered
      'email.opened': 'OPENED',
      'email.clicked': 'CLICKED',
      'email.bounced': 'BOUNCED',
      'email.complained': 'COMPLAINED',
    };

    const eventType = eventTypeMap[event.type];
    
    if (!eventType) {
      console.warn(`[ResendWebhook] Unknown event type: ${event.type}`);
      return NextResponse.json({ success: true, message: 'Event type not processed' });
    }

    // Extract event data
    const data = event.data;
    const emailAddress = data.to || data.email || '';
    
    // Handle bounces - add to suppression list
    if (eventType === 'BOUNCED') {
      const bounceType = determineBounceType(data.bounce_type || data.bounce?.type || data.error);
      const bounceReason = data.bounce_reason || data.bounce?.message || data.error || 'Unknown bounce reason';
      
      await suppressionList.add({
        email: emailAddress,
        reason: 'BOUNCE',
        bounceType,
        bounceReason,
        metadata: {
          messageId: data.email_id || data.message_id,
          timestamp: new Date(data.created_at || event.created_at).toISOString(),
          rawBounceData: data.bounce || data.error,
        },
      });
      
      console.log(`[ResendWebhook] Added ${emailAddress} to suppression list (bounce: ${bounceType})`);
    }
    
    // Handle complaints - add to suppression list immediately
    if (eventType === 'COMPLAINED') {
      await suppressionList.add({
        email: emailAddress,
        reason: 'COMPLAINT',
        metadata: {
          messageId: data.email_id || data.message_id,
          timestamp: new Date(data.created_at || event.created_at).toISOString(),
          complaintType: data.complaint_type || 'spam',
        },
      });
      
      console.log(`[ResendWebhook] Added ${emailAddress} to suppression list (spam complaint)`);
    }
    
    // Process tracking event (this stores the event in the database)
    const storedEvent = await emailTrackingService.processTrackingEvent({
      messageId: data.email_id || data.message_id || '',
      eventType,
      email: emailAddress,
      userId: data.metadata?.userId,
      timestamp: new Date(data.created_at || event.created_at),
      userAgent: data.user_agent,
      ipAddress: data.ip_address,
      clickedUrl: data.click?.link,
      metadata: {
        subject: data.subject,
        template: data.metadata?.template,
        campaignId: data.metadata?.campaignId,
        testId: data.metadata?.testId,
        bounceReason: eventType === 'BOUNCED' ? (data.bounce_reason || data.bounce?.message || data.error) : undefined,
      },
    });

    // Enqueue event for background processing (bounce handling, engagement scoring, etc.)
    // We retrieve the event ID from the stored event
    const eventRecord = await prisma.emailEvent.findFirst({
      where: {
        messageId: data.email_id || data.message_id || '',
        eventType,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    if (eventRecord) {
      await enqueueEmailEvent({
        eventId: eventRecord.id,
        eventType,
        email: emailAddress,
        messageId: data.email_id || data.message_id || '',
        timestamp: new Date(data.created_at || event.created_at),
        metadata: {
          subject: data.subject,
          template: data.metadata?.template,
          campaignId: data.metadata?.campaignId,
          testId: data.metadata?.testId,
          bounceReason: eventType === 'BOUNCED' ? (data.bounce_reason || data.bounce?.message || data.error) : undefined,
          bounceType: eventType === 'BOUNCED' ? determineBounceType(data.bounce_type || data.bounce?.type || data.error) : undefined,
        },
      });
    }

    console.log(`[ResendWebhook] Processed ${event.type} for ${emailAddress}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as any;

    console.error('[ResendWebhook] Processing error:', error);

    return NextResponse.json(
      { error: 'Webhook processing failed', details: err.message },
      { status: 500 }
    );
  }
}

/**
 * Determine if a bounce is hard or soft based on bounce data
 */
function determineBounceType(bounceInfo: any): 'hard' | 'soft' {
  if (!bounceInfo) return 'hard'; // Default to hard bounce for safety
  
  const bounceStr = typeof bounceInfo === 'string' ? bounceInfo.toLowerCase() : JSON.stringify(bounceInfo).toLowerCase();
  
  // Hard bounce indicators
  const hardBounceIndicators = [
    'permanent',
    'invalid',
    'does not exist',
    'user unknown',
    'address rejected',
    'no such user',
    'recipient rejected',
    '5.1.1', // SMTP code for user unknown
    '5.4.1', // SMTP code for no answer from host
  ];
  
  // Soft bounce indicators
  const softBounceIndicators = [
    'temporary',
    'mailbox full',
    'quota exceeded',
    'timeout',
    'deferred',
    'try again',
    '4.', // SMTP 4xx codes are temporary
  ];
  
  // Check for soft bounce first (less risky to retry)
  if (softBounceIndicators.some(indicator => bounceStr.includes(indicator))) {
    return 'soft';
  }
  
  // Default to hard bounce for safety
  return 'hard';
}
