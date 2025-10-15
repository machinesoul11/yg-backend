/**
 * Stripe Webhook Handler Tests
 * Tests the webhook event handling implementation
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/stripe/route';

// Mock dependencies
jest.mock('@/lib/middleware', () => ({
  requireWebhookVerification: jest.fn(),
  markWebhookProcessed: jest.fn(),
}));

jest.mock('@/lib/config', () => ({
  STRIPE_CONFIG: {
    webhookSecret: 'whsec_test_secret',
  },
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    payout: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    creator: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/redis', () => ({
  redis: {},
}));

jest.mock('@/lib/services/audit.service', () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
  })),
}));

jest.mock('@/modules/system/services/notification.service', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      notificationIds: ['notification-id'],
    }),
  })),
}));

jest.mock('@/jobs/notification-delivery.job', () => ({
  queueNotificationDelivery: jest.fn(),
}));

describe('Stripe Webhook Handler', () => {
  const mockVerification = require('@/lib/middleware').requireWebhookVerification;
  const mockMarkProcessed = require('@/lib/middleware').markWebhookProcessed;
  const mockPrisma = require('@/lib/db').prisma;
  const mockAuditService = require('@/lib/services/audit.service').AuditService;
  const mockNotificationService = require('@/modules/system/services/notification.service').NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    mockVerification.mockResolvedValue({
      verified: true,
      eventId: 'evt_test_123',
    });
    
    mockMarkProcessed.mockResolvedValue(undefined);
  });

  describe('Transfer Events', () => {
    const mockPayout = {
      id: 'payout_123',
      amountCents: 5000,
      retryCount: 0,
      creator: {
        userId: 'user_123',
      },
    };

    beforeEach(() => {
      mockPrisma.payout.findUnique.mockResolvedValue(mockPayout);
      mockPrisma.payout.update.mockResolvedValue(mockPayout);
    });

    it('should handle transfer.created event', async () => {
      const transferEvent = {
        id: 'evt_test_123',
        type: 'transfer.created',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 5000,
            currency: 'usd',
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(transferEvent),
      });

      // Mock text() method
      request.text = jest.fn().mockResolvedValue(JSON.stringify(transferEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(mockPrisma.payout.update).toHaveBeenCalledWith({
        where: { id: mockPayout.id },
        data: { status: 'PROCESSING' },
      });
    });

    it('should handle transfer.paid event', async () => {
      const transferEvent = {
        id: 'evt_test_123',
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 5000,
            currency: 'usd',
            arrival_date: new Date(),
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(transferEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(transferEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(mockPrisma.payout.update).toHaveBeenCalledWith({
        where: { id: mockPayout.id },
        data: {
          status: 'COMPLETED',
          processedAt: expect.any(Date),
        },
      });
    });

    it('should handle transfer.failed event', async () => {
      const transferEvent = {
        id: 'evt_test_123',
        type: 'transfer.failed',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 5000,
            currency: 'usd',
            failure_message: 'Insufficient funds',
            failure_code: 'insufficient_funds',
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(transferEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(transferEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(mockPrisma.payout.update).toHaveBeenCalledWith({
        where: { id: mockPayout.id },
        data: {
          status: 'FAILED',
          failedReason: 'Insufficient funds',
          lastRetryAt: expect.any(Date),
        },
      });
    });

    it('should handle transfer.reversed event', async () => {
      const transferEvent = {
        id: 'evt_test_123',
        type: 'transfer.reversed',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 5000,
            currency: 'usd',
            reversal: {
              id: 'trr_test_123',
              reason: 'fraudulent',
              amount: 5000,
            },
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(transferEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(transferEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(mockPrisma.payout.update).toHaveBeenCalledWith({
        where: { id: mockPayout.id },
        data: {
          status: 'FAILED',
          failedReason: 'Transfer reversed: fraudulent',
          lastRetryAt: expect.any(Date),
        },
      });
    });
  });

  describe('Account Events', () => {
    const mockCreator = {
      id: 'creator_123',
      userId: 'user_123',
      onboardingStatus: 'pending',
    };

    beforeEach(() => {
      mockPrisma.creator.findUnique.mockResolvedValue(mockCreator);
      mockPrisma.creator.update.mockResolvedValue(mockCreator);
    });

    it('should handle account.updated event', async () => {
      const accountEvent = {
        id: 'evt_test_123',
        type: 'account.updated',
        data: {
          object: {
            id: 'acct_test_123',
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
            requirements: {
              currently_due: [],
              errors: [],
            },
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(accountEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(accountEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      expect(mockPrisma.creator.update).toHaveBeenCalledWith({
        where: { id: mockCreator.id },
        data: { onboardingStatus: 'completed' },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle verification failure', async () => {
      mockVerification.mockRejectedValue(new Error('Invalid signature'));

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      request.text = jest.fn().mockResolvedValue('{}');

      const response = await POST(request);

      expect(response.status).toBe(500);
    });

    it('should handle missing payout gracefully', async () => {
      mockPrisma.payout.findUnique.mockResolvedValue(null);

      const transferEvent = {
        id: 'evt_test_123',
        type: 'transfer.paid',
        data: {
          object: {
            id: 'tr_test_123',
            amount: 5000,
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(transferEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(transferEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      // Should not attempt to update payout
      expect(mockPrisma.payout.update).not.toHaveBeenCalled();
    });
  });

  describe('Payout Events', () => {
    it('should handle payout.paid event', async () => {
      const payoutEvent = {
        id: 'evt_test_123',
        type: 'payout.paid',
        data: {
          object: {
            id: 'po_test_123',
            amount: 10000,
            currency: 'usd',
            arrival_date: 1234567890,
            method: 'standard',
            type: 'bank_account',
            status: 'paid',
          },
        },
        livemode: false,
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(payoutEvent),
      });

      request.text = jest.fn().mockResolvedValue(JSON.stringify(payoutEvent));

      const response = await POST(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.received).toBe(true);
      // Should log the platform payout
      expect(mockAuditService).toHaveBeenCalled();
    });
  });
});
