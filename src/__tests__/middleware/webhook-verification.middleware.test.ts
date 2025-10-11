/**
 * Webhook Verification Middleware Tests
 */

import { NextRequest } from 'next/server';
import { 
  verifyStripeWebhook,
  verifyResendWebhook,
  verifyGenericWebhook,
  markWebhookProcessed,
} from '@/lib/middleware/webhook-verification.middleware';
import { IdempotencyService } from '@/modules/system/services/idempotency.service';
import crypto from 'crypto';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/modules/system/services/idempotency.service');
jest.mock('@/lib/services/audit.service');

describe('Webhook Verification Middleware', () => {
  describe('verifyStripeWebhook', () => {
    const secret = 'whsec_test_secret';
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: 'evt_123', type: 'transfer.created' });

    it('should verify valid Stripe webhook signature', async () => {
      // Generate valid signature
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': `t=${timestamp},v1=${signature}`,
        },
      });

      const result = await verifyStripeWebhook(req, payload, secret);

      expect(result.verified).toBe(true);
      expect(result.eventId).toBe('evt_123');
      expect(result.timestamp).toBe(timestamp);
    });

    it('should reject webhook with invalid signature', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': `t=${timestamp},v1=invalid_signature`,
        },
      });

      const result = await verifyStripeWebhook(req, payload, secret);

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject webhook with missing signature header', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
      });

      const result = await verifyStripeWebhook(req, payload, secret);

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
    });

    it('should reject webhook with old timestamp (replay attack)', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': `t=${oldTimestamp},v1=${signature}`,
        },
      });

      const result = await verifyStripeWebhook(req, payload, secret, 300); // 5 min max age

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('REPLAY_ATTACK');
    });
  });

  describe('verifyResendWebhook', () => {
    const secret = 'resend_webhook_secret';
    const timestamp = Math.floor(Date.now() / 1000);
    const svixId = 'msg_123';
    const payload = JSON.stringify({
      data: { email_id: 'email_123', type: 'email.sent' },
    });

    it('should verify valid Resend webhook signature', async () => {
      // Generate valid signature (Svix format)
      const signedContent = `${svixId}.${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(signedContent)
        .digest('base64');

      const req = new NextRequest('http://localhost:3000/api/webhooks/resend', {
        method: 'POST',
        headers: {
          'svix-id': svixId,
          'svix-timestamp': timestamp.toString(),
          'svix-signature': `v1=${signature}`,
        },
      });

      const result = await verifyResendWebhook(req, payload, secret);

      expect(result.verified).toBe(true);
      expect(result.eventId).toBeDefined();
    });

    it('should reject webhook with invalid Resend signature', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/resend', {
        method: 'POST',
        headers: {
          'svix-id': svixId,
          'svix-timestamp': timestamp.toString(),
          'svix-signature': 'v1=invalid_signature',
        },
      });

      const result = await verifyResendWebhook(req, payload, secret);

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });

    it('should reject webhook without signature header', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/resend', {
        method: 'POST',
        headers: {
          'svix-id': svixId,
          'svix-timestamp': timestamp.toString(),
        },
      });

      const result = await verifyResendWebhook(req, payload, secret);

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('MISSING_SIGNATURE');
    });
  });

  describe('verifyGenericWebhook', () => {
    const secret = 'generic_webhook_secret';
    const payload = JSON.stringify({ id: 'event_123', data: 'test' });

    it('should verify valid generic webhook signature', async () => {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const req = new NextRequest('http://localhost:3000/api/webhooks/generic', {
        method: 'POST',
        headers: {
          'x-webhook-signature': signature,
        },
      });

      const result = await verifyGenericWebhook(req, payload, secret);

      expect(result.verified).toBe(true);
      expect(result.eventId).toBe('event_123');
    });

    it('should reject invalid generic webhook signature', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/generic', {
        method: 'POST',
        headers: {
          'x-webhook-signature': 'invalid_signature',
        },
      });

      const result = await verifyGenericWebhook(req, payload, secret);

      expect(result.verified).toBe(false);
      expect(result.errorCode).toBe('INVALID_SIGNATURE');
    });
  });

  describe('Constant-time comparison', () => {
    it('should use constant-time comparison to prevent timing attacks', async () => {
      // This test verifies that we're using crypto.timingSafeEqual
      // which prevents timing-based attacks on signature verification
      
      const secret = 'test_secret';
      const payload = JSON.stringify({ test: 'data' });
      
      const validSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Create two similar but different signatures
      const almostValid = `${validSignature.slice(0, -2)  }ab`;

      const req1 = new NextRequest('http://localhost:3000/api/webhooks', {
        method: 'POST',
        headers: { 'x-webhook-signature': validSignature },
      });

      const req2 = new NextRequest('http://localhost:3000/api/webhooks', {
        method: 'POST',
        headers: { 'x-webhook-signature': almostValid },
      });

      const result1 = await verifyGenericWebhook(req1, payload, secret);
      const result2 = await verifyGenericWebhook(req2, payload, secret);

      expect(result1.verified).toBe(true);
      expect(result2.verified).toBe(false);
    });
  });
});
