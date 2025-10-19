/**
 * Twilio Webhook Handler
 * Handles delivery status callbacks from Twilio
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { twilioSmsService } from '@/lib/services/sms';

const TWILIO_WEBHOOK_SECRET = process.env.TWILIO_WEBHOOK_SECRET;

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(signature: string, url: string, params: Record<string, any>): boolean {
  if (!TWILIO_WEBHOOK_SECRET) {
    console.warn('[Twilio Webhook] No webhook secret configured, skipping verification');
    return true; // In development, allow requests without verification
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return false;
  }

  // Sort params alphabetically and concatenate
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  // Create HMAC SHA1 signature
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(data);
  const expectedSignature = hmac.digest('base64');

  return signature === expectedSignature;
}

/**
 * POST /api/webhooks/twilio/status
 * Handle SMS delivery status updates from Twilio
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const params: Record<string, any> = {};
    
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const signature = req.headers.get('x-twilio-signature') || '';
    const url = req.url;

    // Verify webhook signature
    if (!verifyTwilioSignature(signature, url, params)) {
      console.error('[Twilio Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const {
      MessageSid: messageId,
      MessageStatus: status,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage,
    } = params;

    if (!messageId || !status) {
      console.error('[Twilio Webhook] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update delivery status in database
    await twilioSmsService.updateDeliveryStatus(
      messageId,
      status,
      errorCode,
      errorMessage
    );

    console.log(`[Twilio Webhook] Updated status for message ${messageId}: ${status}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Twilio Webhook] Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
