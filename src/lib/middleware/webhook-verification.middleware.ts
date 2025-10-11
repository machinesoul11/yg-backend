/**
 * Webhook Signature Verification Middleware
 * Verifies webhook signatures from external services
 * 
 * Supports:
 * - Stripe webhooks
 * - Resend email webhooks
 * - Generic HMAC signature verification
 * - Replay attack prevention
 * - Idempotency checking
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { IdempotencyService } from '@/modules/system/services/idempotency.service';
import { AuditService } from '@/lib/services/audit.service';

const idempotencyService = new IdempotencyService(prisma);
const auditService = new AuditService(prisma);

/**
 * Webhook provider type
 */
export type WebhookProvider = 'stripe' | 'resend' | 'generic';

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  verified: boolean;
  eventId?: string;
  timestamp?: number;
  error?: string;
  errorCode?: 'INVALID_SIGNATURE' | 'MISSING_SIGNATURE' | 'REPLAY_ATTACK' | 'DUPLICATE_EVENT';
}

/**
 * Webhook verification options
 */
export interface WebhookVerificationOptions {
  provider: WebhookProvider;
  secret: string;
  maxAgeSeconds?: number; // Max age for timestamp validation (default: 300 = 5 minutes)
  checkIdempotency?: boolean; // Check if event was already processed (default: true)
}

/**
 * Verify Stripe webhook signature
 * Stripe uses the Stripe-Signature header with format: t=timestamp,v1=signature
 */
export async function verifyStripeWebhook(
  req: NextRequest,
  rawBody: string,
  secret: string,
  maxAgeSeconds: number = 300
): Promise<WebhookVerificationResult> {
  const signatureHeader = req.headers.get('stripe-signature');

  if (!signatureHeader) {
    return {
      verified: false,
      error: 'Missing Stripe-Signature header',
      errorCode: 'MISSING_SIGNATURE',
    };
  }

  try {
    // Parse signature header
    const signatures: Record<string, string> = {};
    signatureHeader.split(',').forEach((pair) => {
      const [key, value] = pair.split('=');
      signatures[key] = value;
    });

    const timestamp = parseInt(signatures.t);
    const signature = signatures.v1;

    if (!timestamp || !signature) {
      return {
        verified: false,
        error: 'Invalid signature header format',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Check timestamp to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > maxAgeSeconds) {
      await auditService.log({
        action: 'WEBHOOK_REPLAY_ATTEMPT',
        entityType: 'webhook',
        entityId: 'stripe',
        after: {
          timestamp,
          currentTime: now,
          age: Math.abs(now - timestamp),
        },
      });

      return {
        verified: false,
        error: 'Timestamp outside acceptable range',
        errorCode: 'REPLAY_ATTACK',
      };
    }

    // Construct signed payload: timestamp.rawBody
    const signedPayload = `${timestamp}.${rawBody}`;

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      await auditService.log({
        action: 'WEBHOOK_INVALID_SIGNATURE',
        entityType: 'webhook',
        entityId: 'stripe',
        after: { timestamp },
      });

      return {
        verified: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Parse body to get event ID
    const event = JSON.parse(rawBody);
    const eventId = event.id;

    return {
      verified: true,
      eventId,
      timestamp,
    };
  } catch (error) {
    console.error('[WebhookVerification] Stripe verification error:', error);
    return {
      verified: false,
      error: 'Signature verification failed',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}

/**
 * Verify Resend webhook signature
 * Resend uses Svix for webhook signing
 */
export async function verifyResendWebhook(
  req: NextRequest,
  rawBody: string,
  secret: string,
  maxAgeSeconds: number = 300
): Promise<WebhookVerificationResult> {
  const signatureHeader = req.headers.get('svix-signature');

  if (!signatureHeader) {
    return {
      verified: false,
      error: 'Missing svix-signature header',
      errorCode: 'MISSING_SIGNATURE',
    };
  }

  try {
    // Parse Svix signature header
    const signatures: Record<string, string> = {};
    signatureHeader.split(' ').forEach((pair) => {
      const [key, value] = pair.split(',')[0].split('=');
      if (key && value) {
        signatures[key] = value;
      }
    });

    const timestamp = req.headers.get('svix-timestamp');
    const svixId = req.headers.get('svix-id');

    if (!timestamp) {
      return {
        verified: false,
        error: 'Missing timestamp header',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Check timestamp
    const webhookTimestamp = parseInt(timestamp);
    const now = Math.floor(Date.now() / 1000);
    
    if (Math.abs(now - webhookTimestamp) > maxAgeSeconds) {
      return {
        verified: false,
        error: 'Timestamp outside acceptable range',
        errorCode: 'REPLAY_ATTACK',
      };
    }

    // Construct signed content: svix-id.svix-timestamp.rawBody
    const signedContent = `${svixId}.${timestamp}.${rawBody}`;

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedContent)
      .digest('base64');

    // Svix includes multiple signature versions, check v1
    const providedSignature = signatures.v1;

    if (!providedSignature) {
      return {
        verified: false,
        error: 'Missing v1 signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Compare signatures
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      await auditService.log({
        action: 'WEBHOOK_INVALID_SIGNATURE',
        entityType: 'webhook',
        entityId: 'resend',
        after: { timestamp },
      });

      return {
        verified: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Parse body to get event ID
    const event = JSON.parse(rawBody);
    const eventId = event.data?.email_id || event.data?.message_id || svixId;

    return {
      verified: true,
      eventId,
      timestamp: webhookTimestamp,
    };
  } catch (error) {
    console.error('[WebhookVerification] Resend verification error:', error);
    return {
      verified: false,
      error: 'Signature verification failed',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}

/**
 * Generic HMAC-SHA256 webhook verification
 */
export async function verifyGenericWebhook(
  req: NextRequest,
  rawBody: string,
  secret: string,
  signatureHeader: string = 'x-webhook-signature',
  timestampHeader: string = 'x-webhook-timestamp',
  maxAgeSeconds: number = 300
): Promise<WebhookVerificationResult> {
  const signature = req.headers.get(signatureHeader);
  const timestamp = req.headers.get(timestampHeader);

  if (!signature) {
    return {
      verified: false,
      error: `Missing ${signatureHeader} header`,
      errorCode: 'MISSING_SIGNATURE',
    };
  }

  try {
    // Verify timestamp if provided
    if (timestamp) {
      const webhookTimestamp = parseInt(timestamp);
      const now = Math.floor(Date.now() / 1000);

      if (Math.abs(now - webhookTimestamp) > maxAgeSeconds) {
        return {
          verified: false,
          error: 'Timestamp outside acceptable range',
          errorCode: 'REPLAY_ATTACK',
        };
      }
    }

    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      return {
        verified: false,
        error: 'Invalid signature',
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // Generate event ID from request
    const event = JSON.parse(rawBody);
    const eventId = event.id || event.event_id || crypto.randomUUID();

    return {
      verified: true,
      eventId,
      timestamp: timestamp ? parseInt(timestamp) : undefined,
    };
  } catch (error) {
    console.error('[WebhookVerification] Generic verification error:', error);
    return {
      verified: false,
      error: 'Signature verification failed',
      errorCode: 'INVALID_SIGNATURE',
    };
  }
}

/**
 * Main webhook verification function with idempotency checking
 */
export async function verifyWebhook(
  req: NextRequest,
  rawBody: string,
  options: WebhookVerificationOptions
): Promise<WebhookVerificationResult> {
  const { provider, secret, maxAgeSeconds = 300, checkIdempotency = true } = options;

  let result: WebhookVerificationResult;

  // Verify signature based on provider
  switch (provider) {
    case 'stripe':
      result = await verifyStripeWebhook(req, rawBody, secret, maxAgeSeconds);
      break;
    case 'resend':
      result = await verifyResendWebhook(req, rawBody, secret, maxAgeSeconds);
      break;
    case 'generic':
      result = await verifyGenericWebhook(req, rawBody, secret, undefined, undefined, maxAgeSeconds);
      break;
    default:
      return {
        verified: false,
        error: 'Unknown webhook provider',
        errorCode: 'INVALID_SIGNATURE',
      };
  }

  // If signature verification failed, return immediately
  if (!result.verified || !result.eventId) {
    return result;
  }

  // Check idempotency to prevent duplicate processing
  if (checkIdempotency) {
    try {
      const idempotencyKey = `webhook:${provider}:${result.eventId}`;
      const existingEvent = await idempotencyService.check(idempotencyKey);

      if (existingEvent && existingEvent.processed) {
        await auditService.log({
          action: 'WEBHOOK_DUPLICATE',
          entityType: 'webhook',
          entityId: result.eventId,
          after: {
            provider,
            eventId: result.eventId,
          },
        });

        return {
          verified: false,
          eventId: result.eventId,
          error: 'Event already processed',
          errorCode: 'DUPLICATE_EVENT',
        };
      }

      // Mark as processing
      if (!existingEvent) {
        await idempotencyService.startProcessing({
          key: idempotencyKey,
          entityType: `webhook_${provider}`,
          requestHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
        });
      }
    } catch (error) {
      console.error('[WebhookVerification] Idempotency check error:', error);
      // Continue processing even if idempotency check fails
    }
  }

  // Audit successful verification
  await auditService.log({
    action: 'WEBHOOK_VERIFIED',
    entityType: 'webhook',
    entityId: result.eventId,
    after: {
      provider,
      eventId: result.eventId,
      timestamp: result.timestamp,
    },
  });

  return result;
}

/**
 * Mark webhook event as processed (for idempotency)
 */
export async function markWebhookProcessed(
  provider: WebhookProvider,
  eventId: string,
  responseStatus: number = 200,
  responseBody?: any
): Promise<void> {
  const idempotencyKey = `webhook:${provider}:${eventId}`;

  try {
    await idempotencyService.completeProcessing({
      key: idempotencyKey,
      entityId: eventId,
      responseStatus,
      responseBody,
    });
  } catch (error) {
    console.error('[WebhookVerification] Failed to mark webhook as processed:', error);
  }
}

/**
 * Middleware wrapper for webhook verification
 * 
 * @example
 * ```typescript
 * export async function POST(req: NextRequest) {
 *   const rawBody = await req.text();
 *   const result = await requireWebhookVerification(req, rawBody, {
 *     provider: 'stripe',
 *     secret: process.env.STRIPE_WEBHOOK_SECRET!,
 *   });
 *   
 *   // Process webhook...
 *   
 *   await markWebhookProcessed('stripe', result.eventId!);
 *   return NextResponse.json({ received: true });
 * }
 * ```
 */
export async function requireWebhookVerification(
  req: NextRequest,
  rawBody: string,
  options: WebhookVerificationOptions
): Promise<WebhookVerificationResult> {
  const result = await verifyWebhook(req, rawBody, options);

  if (!result.verified) {
    const error = new Error(result.error || 'Webhook verification failed');
    (error as any).code = result.errorCode || 'INVALID_SIGNATURE';
    throw error;
  }

  return result;
}
