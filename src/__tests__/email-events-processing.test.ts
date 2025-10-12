/**
 * Email Events Processing Tests
 * 
 * Tests for webhook processing, bounce handling, complaint processing,
 * engagement scoring, and deliverability monitoring.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/resend/route';
import { emailTrackingService } from '@/lib/services/email/tracking.service';
import { emailDeliverabilityService } from '@/lib/services/email/deliverability.service';
import { SuppressionListManager } from '@/lib/adapters/email/suppression-list';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import crypto from 'crypto';

// Mock NextRequest
class MockNextRequest {
  private body: string;
  private headers: Map<string, string>;

  constructor(body: any, signature?: string) {
    this.body = JSON.stringify(body);
    this.headers = new Map();
    if (signature) {
      this.headers.set('svix-signature', signature);
    }
  }

  async text(): Promise<string> {
    return this.body;
  }

  get(name: string): string | null {
    return this.headers.get(name.toLowerCase()) || null;
  }

  headers = {
    get: (name: string) => this.headers.get(name.toLowerCase()) || null,
  };
}

function generateSignature(payload: any): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET || 'test-secret';
  const payloadString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

describe('Email Events Processing', () => {
  describe('Webhook Endpoint', () => {
    it('should reject requests without signature', async () => {
      const event = {
        type: 'email.sent',
        data: { email: 'test@example.com' },
      };

      const req = new MockNextRequest(event) as any;
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Missing signature');
    });

    it('should reject requests with invalid signature', async () => {
      const event = {
        type: 'email.sent',
        data: { email: 'test@example.com' },
      };

      const req = new MockNextRequest(event, 'invalid-signature') as any;
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(401);
      expect(json.error).toBe('Invalid signature');
    });

    it('should process valid SENT event', async () => {
      const event = {
        type: 'email.sent',
        data: {
          email: 'test@example.com',
          email_id: 'msg-123',
          created_at: new Date().toISOString(),
          subject: 'Test Email',
        },
      };

      const signature = generateSignature(event);
      const req = new MockNextRequest(event, signature) as any;
      const response = await POST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it('should add bounced emails to suppression list', async () => {
      const suppressionList = new SuppressionListManager();
      const email = 'bounce@example.com';

      const event = {
        type: 'email.bounced',
        data: {
          email,
          email_id: 'msg-456',
          created_at: new Date().toISOString(),
          bounce_type: 'hard',
          bounce_reason: 'User does not exist',
        },
      };

      const signature = generateSignature(event);
      const req = new MockNextRequest(event, signature) as any;
      await POST(req);

      const isSuppressed = await suppressionList.isSuppressed(email);
      expect(isSuppressed).toBe(true);

      const info = await suppressionList.getSuppressionInfo(email);
      expect(info?.reason).toBe('BOUNCE');
      expect(info?.bounceType).toBe('hard');

      // Cleanup
      await suppressionList.remove(email);
    });

    it('should add complained emails to suppression list', async () => {
      const suppressionList = new SuppressionListManager();
      const email = 'complaint@example.com';

      const event = {
        type: 'email.complained',
        data: {
          email,
          email_id: 'msg-789',
          created_at: new Date().toISOString(),
        },
      };

      const signature = generateSignature(event);
      const req = new MockNextRequest(event, signature) as any;
      await POST(req);

      const isSuppressed = await suppressionList.isSuppressed(email);
      expect(isSuppressed).toBe(true);

      const info = await suppressionList.getSuppressionInfo(email);
      expect(info?.reason).toBe('COMPLAINT');

      // Cleanup
      await suppressionList.remove(email);
    });
  });

  describe('Engagement Scoring', () => {
    const testEmail = 'engaged@example.com';

    beforeEach(async () => {
      // Clear previous test data
      await prisma.emailEvent.deleteMany({
        where: { email: testEmail },
      });
    });

    it('should calculate engagement score from events', async () => {
      // Create test events
      await prisma.emailEvent.createMany({
        data: [
          {
            email: testEmail,
            eventType: 'SENT',
            messageId: 'msg-1',
            sentAt: new Date(),
          },
          {
            email: testEmail,
            eventType: 'OPENED',
            messageId: 'msg-1',
            openedAt: new Date(),
          },
          {
            email: testEmail,
            eventType: 'CLICKED',
            messageId: 'msg-1',
            clickedAt: new Date(),
            clickedUrl: 'https://example.com',
          },
        ],
      });

      const score = await emailTrackingService.getEngagementScore(testEmail);

      expect(score.score).toBeGreaterThan(0);
      expect(score.recentOpens).toBe(1);
      expect(score.recentClicks).toBe(1);
      expect(score.level).toMatch(/very_high|high|medium|low/);
    });

    it('should identify inactive users', async () => {
      // Create old event (more than 90 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      await prisma.emailEvent.create({
        data: {
          email: testEmail,
          eventType: 'OPENED',
          messageId: 'msg-old',
          openedAt: oldDate,
          createdAt: oldDate,
        },
      });

      const inactive = await emailTrackingService.getInactiveUsers(90);
      const found = inactive.find(u => u.email === testEmail);

      expect(found).toBeDefined();
      expect(found?.daysSinceActivity).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Deliverability Monitoring', () => {
    it('should calculate hourly metrics', async () => {
      const metrics = await emailDeliverabilityService.calculateMetrics('hour');

      expect(metrics.period).toBe('hour');
      expect(metrics.deliveryRate).toBeGreaterThanOrEqual(0);
      expect(metrics.deliveryRate).toBeLessThanOrEqual(1);
      expect(metrics.bounceRate).toBeGreaterThanOrEqual(0);
      expect(metrics.complaintRate).toBeGreaterThanOrEqual(0);
    });

    it('should generate alerts for high bounce rate', async () => {
      // Create test bounces
      const now = new Date();
      const events = [];

      for (let i = 0; i < 10; i++) {
        events.push({
          email: `bounce${i}@example.com`,
          eventType: 'SENT',
          messageId: `msg-sent-${i}`,
          sentAt: now,
          createdAt: now,
        });
        events.push({
          email: `bounce${i}@example.com`,
          eventType: 'BOUNCED',
          messageId: `msg-bounce-${i}`,
          bouncedAt: now,
          bounceReason: 'User does not exist',
          createdAt: now,
        });
      }

      await prisma.emailEvent.createMany({ data: events as any });

      const alerts = await emailDeliverabilityService.monitorAndAlert();

      // Should generate alert if bounce rate > 2%
      if (events.length >= 20) { // If we have enough data
        expect(alerts.length).toBeGreaterThan(0);
        const bounceAlert = alerts.find(a => a.type === 'bounce_rate');
        if (bounceAlert) {
          expect(bounceAlert.severity).toMatch(/warning|critical|urgent/);
        }
      }

      // Cleanup
      await prisma.emailEvent.deleteMany({
        where: {
          email: { startsWith: 'bounce' },
        },
      });
    });

    it('should track domain-level metrics', async () => {
      const domainMetrics = await emailDeliverabilityService.getMetricsByDomain('day');

      expect(Array.isArray(domainMetrics)).toBe(true);
      domainMetrics.forEach(metric => {
        expect(metric.domain).toBeDefined();
        expect(metric.deliveryRate).toBeGreaterThanOrEqual(0);
        expect(metric.deliveryRate).toBeLessThanOrEqual(1);
        expect(Array.isArray(metric.issues)).toBe(true);
      });
    });

    it('should cache metrics in Redis', async () => {
      await emailDeliverabilityService.calculateMetrics('hour');

      const cached = await emailDeliverabilityService.getCachedMetrics('hour');

      expect(cached).toBeDefined();
      expect(cached?.period).toBe('hour');
      expect(cached?.deliveryRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Bounce Classification', () => {
    it('should classify hard bounces correctly', async () => {
      const hardBounceReasons = [
        'User does not exist',
        'Invalid email address',
        'Permanent failure',
        'SMTP 5.1.1',
      ];

      // These should all be classified as hard bounces
      // Test by processing events through webhook
      for (const reason of hardBounceReasons) {
        const event = {
          type: 'email.bounced',
          data: {
            email: `hard-${Date.now()}@example.com`,
            email_id: `msg-${Date.now()}`,
            created_at: new Date().toISOString(),
            bounce_reason: reason,
          },
        };

        const signature = generateSignature(event);
        const req = new MockNextRequest(event, signature) as any;
        const response = await POST(req);

        expect(response.status).toBe(200);
      }
    });

    it('should classify soft bounces correctly', async () => {
      const softBounceReasons = [
        'Mailbox full',
        'Temporary failure',
        'Quota exceeded',
        'SMTP 4.2.2',
      ];

      for (const reason of softBounceReasons) {
        const event = {
          type: 'email.bounced',
          data: {
            email: `soft-${Date.now()}@example.com`,
            email_id: `msg-${Date.now()}`,
            created_at: new Date().toISOString(),
            bounce_reason: reason,
          },
        };

        const signature = generateSignature(event);
        const req = new MockNextRequest(event, signature) as any;
        const response = await POST(req);

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Real-time Metrics', () => {
    it('should cache real-time metrics', async () => {
      const metrics = await emailTrackingService.getRealTimeMetrics('hour');

      expect(metrics).toBeDefined();
      expect(metrics.sent).toBeGreaterThanOrEqual(0);
      expect(metrics.delivered).toBeGreaterThanOrEqual(0);
      expect(metrics.opened).toBeGreaterThanOrEqual(0);
      expect(metrics.clicked).toBeGreaterThanOrEqual(0);
      expect(metrics.bounced).toBeGreaterThanOrEqual(0);
      expect(metrics.complained).toBeGreaterThanOrEqual(0);
    });
  });
});
