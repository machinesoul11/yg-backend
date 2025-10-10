import { NextRequest, NextResponse } from 'next/server';
import { emailService } from '@/lib/services/email/email.service';
import { verifyResendWebhook } from '@/lib/utils/verify-resend-webhook';

export async function POST(req: NextRequest) {
  try {
    // Get webhook signature from headers
    const signature = req.headers.get('svix-signature') || undefined;

    // Parse request body
    const body = await req.json();

    // Verify webhook signature
    if (!verifyResendWebhook(signature, body)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Handle the webhook event
    await emailService.handleEmailEvent({
      type: body.type,
      messageId: body.data.message_id || body.data.email_id,
      timestamp: new Date(body.data.created_at || body.created_at),
      email: body.data.email || body.data.to,
      details: body.data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
