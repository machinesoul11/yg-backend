import crypto from 'crypto';

/**
 * Verify Resend webhook signature using HMAC-SHA256
 */
export function verifyResendWebhook(
  signature: string | string[] | undefined,
  payload: any
): boolean {
  if (!signature || Array.isArray(signature)) {
    return false;
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured');
    return false;
  }

  const payloadString = JSON.stringify(payload);

  // Resend uses HMAC-SHA256
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
