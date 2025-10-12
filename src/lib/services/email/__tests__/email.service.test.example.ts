/**
 * Email Service Tests
 * 
 * Comprehensive test suite for transactional email functionality
 * 
 * Run tests with: npm test src/lib/services/email/__tests__/email.service.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { emailService } from '../email.service';
import { emailRetryService } from '../retry.service';
import { 
  sanitizeEmailAddress,
  sanitizeSubject,
  sanitizeHtmlContent,
  sanitizeUrl,
  validateAndSanitizeEmailParams 
} from '../sanitization.service';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

// Mock external dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/redis');
vi.mock('resend');

describe('Email Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendTransactional', () => {
    it('should send email successfully', async () => {
      const result = await emailService.sendTransactional({
        email: 'test@example.com',
        subject: 'Test Email',
        template: 'welcome-email',
        variables: {
          userName: 'Test User',
        },
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should reject suppressed email addresses', async () => {
      // Mock suppression check
      vi.mocked(redis.get).mockResolvedValue('true');

      const result = await emailService.sendTransactional({
        email: 'suppressed@example.com',
        subject: 'Test',
        template: 'welcome-email',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('suppression');
    });

    it('should respect user email preferences', async () => {
      // Mock preferences check
      vi.mocked(prisma.emailPreferences.findUnique).mockResolvedValue({
        userId: 'user_123',
        newsletters: false, // Opted out
        globalUnsubscribe: false,
      } as any);

      const result = await emailService.sendTransactional({
        userId: 'user_123',
        email: 'user@example.com',
        subject: 'Newsletter',
        template: 'monthly-newsletter',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('opted out');
    });

    it('should create email event on successful send', async () => {
      await emailService.sendTransactional({
        email: 'test@example.com',
        subject: 'Test',
        template: 'welcome-email',
      });

      expect(prisma.emailEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'SENT',
            email: 'test@example.com',
          }),
        })
      );
    });
  });

  describe('Email Verification', () => {
    it('should send verification email with correct template', async () => {
      const result = await emailService.sendVerificationEmail({
        email: 'newuser@example.com',
        name: 'New User',
        verificationUrl: 'https://yesgoddess.com/verify?token=abc123',
      });

      expect(result.success).toBe(true);
      // Verify correct template was used
      expect(result.messageId).toBeDefined();
    });
  });

  describe('Password Reset', () => {
    it('should send password reset email', async () => {
      const result = await emailService.sendPasswordResetEmail({
        email: 'user@example.com',
        name: 'User',
        resetUrl: 'https://yesgoddess.com/reset?token=xyz789',
      });

      expect(result.success).toBe(true);
    });
  });
});

describe('Email Sanitization', () => {
  describe('sanitizeEmailAddress', () => {
    it('should normalize email addresses', () => {
      expect(sanitizeEmailAddress('  USER@EXAMPLE.COM  ')).toBe('user@example.com');
      expect(sanitizeEmailAddress('User.Name+Tag@Example.Com')).toBe('user.name+tag@example.com');
    });

    it('should reject invalid email addresses', () => {
      expect(() => sanitizeEmailAddress('invalid')).toThrow();
      expect(() => sanitizeEmailAddress('missing@')).toThrow();
      expect(() => sanitizeEmailAddress('@nodomain.com')).toThrow();
    });

    it('should reject emails with consecutive dots', () => {
      expect(() => sanitizeEmailAddress('user..name@example.com')).toThrow();
      expect(() => sanitizeEmailAddress('.user@example.com')).toThrow();
      expect(() => sanitizeEmailAddress('user.@example.com')).toThrow();
    });
  });

  describe('sanitizeSubject', () => {
    it('should remove control characters', () => {
      expect(sanitizeSubject('Hello\x00World')).toBe('Hello World');
      expect(sanitizeSubject('Test\x1FSubject')).toBe('Test Subject');
    });

    it('should prevent header injection', () => {
      expect(sanitizeSubject('Subject\r\nBcc: evil@example.com')).toBe('Subject Bcc: evil@example.com');
      expect(sanitizeSubject('Test\nSubject')).toBe('Test Subject');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeSubject('  Multiple   Spaces  ')).toBe('Multiple Spaces');
      expect(sanitizeSubject('Tab\t\tSubject')).toBe('Tab Subject');
    });

    it('should enforce maximum length', () => {
      const longSubject = 'a'.repeat(300);
      const sanitized = sanitizeSubject(longSubject);
      expect(sanitized.length).toBeLessThanOrEqual(200);
    });

    it('should throw on empty subject', () => {
      expect(() => sanitizeSubject('')).toThrow();
      expect(() => sanitizeSubject('   ')).toThrow();
    });
  });

  describe('sanitizeHtmlContent', () => {
    it('should remove script tags', () => {
      const html = '<p>Safe</p><script>alert("xss")</script>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).toBe('<p>Safe</p>');
      expect(sanitized).not.toContain('script');
    });

    it('should remove event handlers', () => {
      const html = '<button onclick="alert(\'xss\')">Click</button>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('onclick');
    });

    it('should remove dangerous protocols', () => {
      const html = '<a href="javascript:alert(\'xss\')">Link</a>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove dangerous tags', () => {
      const html = '<iframe src="evil.com"></iframe><p>Safe</p>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).not.toContain('iframe');
      expect(sanitized).toContain('Safe');
    });

    it('should preserve safe HTML', () => {
      const html = '<p>Text</p><strong>Bold</strong><a href="https://example.com">Link</a>';
      const sanitized = sanitizeHtmlContent(html);
      expect(sanitized).toContain('<p>Text</p>');
      expect(sanitized).toContain('<strong>Bold</strong>');
      expect(sanitized).toContain('https://example.com');
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow valid http/https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
      expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
    });

    it('should reject dangerous protocols', () => {
      expect(() => sanitizeUrl('javascript:alert("xss")')).toThrow();
      expect(() => sanitizeUrl('data:text/html,<script>alert("xss")</script>')).toThrow();
      expect(() => sanitizeUrl('vbscript:msgbox("xss")')).toThrow();
      expect(() => sanitizeUrl('file:///etc/passwd')).toThrow();
    });

    it('should reject invalid URLs', () => {
      expect(() => sanitizeUrl('not a url')).toThrow();
      expect(() => sanitizeUrl('ftp://example.com')).toThrow();
    });

    it('should trim whitespace', () => {
      expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });
  });

  describe('validateAndSanitizeEmailParams', () => {
    it('should sanitize all email parameters', () => {
      const params = {
        to: '  USER@EXAMPLE.COM  ',
        subject: 'Test\r\nSubject',
        html: '<script>bad</script><p>Good</p>',
        variables: {
          name: '<script>xss</script>Alice',
        },
      };

      const sanitized = validateAndSanitizeEmailParams(params);

      expect(sanitized.to).toEqual(['user@example.com']);
      expect(sanitized.subject).toBe('Test Subject');
      expect(sanitized.html).not.toContain('script');
      expect(sanitized.variables?.name).not.toContain('<script>');
    });

    it('should handle multiple recipients', () => {
      const params = {
        to: ['user1@example.com', '  USER2@EXAMPLE.COM  '],
        subject: 'Test',
      };

      const sanitized = validateAndSanitizeEmailParams(params);

      expect(sanitized.to).toEqual(['user1@example.com', 'user2@example.com']);
    });
  });
});

describe('Email Retry Service', () => {
  describe('addToRetryQueue', () => {
    it('should queue retryable errors', async () => {
      const jobId = await emailRetryService.addToRetryQueue({
        recipientEmail: 'user@example.com',
        subject: 'Test',
        template: 'welcome-email',
        error: new Error('Network timeout'),
        attemptCount: 1,
      });

      expect(jobId).toBeDefined();
    });

    it('should not queue non-retryable errors', async () => {
      const jobId = await emailRetryService.addToRetryQueue({
        recipientEmail: 'invalid@example.com',
        subject: 'Test',
        template: 'welcome-email',
        error: new Error('Invalid email address'),
        attemptCount: 1,
      });

      expect(jobId).toBeNull();
    });

    it('should move to DLQ after max attempts', async () => {
      const jobId = await emailRetryService.addToRetryQueue({
        recipientEmail: 'user@example.com',
        subject: 'Test',
        template: 'welcome-email',
        error: new Error('Timeout'),
        attemptCount: 5, // Max attempts reached
      });

      expect(jobId).toBeNull();
      // Verify DLQ insert
      expect(prisma.$executeRaw).toHaveBeenCalledWith(
        expect.stringContaining('email_dead_letter_queue')
      );
    });
  });

  describe('calculateRetryDelay', () => {
    it('should use exponential backoff', () => {
      const service = new emailRetryService.constructor();
      
      // Attempt 1: ~1 minute
      const delay1 = service.calculateRetryDelay(1);
      expect(delay1).toBeGreaterThanOrEqual(54000); // 1 min - 10% jitter
      expect(delay1).toBeLessThanOrEqual(66000); // 1 min + 10% jitter

      // Attempt 2: ~2 minutes
      const delay2 = service.calculateRetryDelay(2);
      expect(delay2).toBeGreaterThanOrEqual(108000); // 2 min - 10%
      expect(delay2).toBeLessThanOrEqual(132000); // 2 min + 10%
    });

    it('should cap at maximum delay', () => {
      const service = new emailRetryService.constructor();
      
      const delay = service.calculateRetryDelay(10); // Would be > 1 hour
      expect(delay).toBeLessThanOrEqual(3600000 * 1.1); // 1 hour + jitter
    });
  });

  describe('getRetryStats', () => {
    it('should return retry queue statistics', async () => {
      const stats = await emailRetryService.getRetryStats();

      expect(stats).toHaveProperty('totalInQueue');
      expect(stats).toHaveProperty('byAttemptCount');
      expect(stats).toHaveProperty('oldestRetry');
      expect(stats).toHaveProperty('retryRate');
    });
  });
});

describe('Email Tracking', () => {
  it('should detect unique opens', async () => {
    // First open - should be unique
    vi.mocked(redis.exists).mockResolvedValue(0);
    
    const isUnique1 = await emailTrackingService.isUniqueOpen('msg_123', 'user@example.com');
    expect(isUnique1).toBe(true);

    // Second open - not unique
    vi.mocked(redis.exists).mockResolvedValue(1);
    
    const isUnique2 = await emailTrackingService.isUniqueOpen('msg_123', 'user@example.com');
    expect(isUnique2).toBe(false);
  });

  it('should enrich tracking data with device info', () => {
    const event = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    };

    const enriched = emailTrackingService.enrichTrackingData(event);

    expect(enriched.deviceType).toBe('mobile');
  });
});

describe('Integration Tests', () => {
  it('should handle complete email send flow', async () => {
    // 1. Send email
    const sendResult = await emailService.sendTransactional({
      email: 'user@example.com',
      subject: 'Test Email',
      template: 'welcome-email',
      variables: { userName: 'Test' },
    });

    expect(sendResult.success).toBe(true);
    const messageId = sendResult.messageId!;

    // 2. Simulate webhook events
    await emailTrackingService.processTrackingEvent({
      messageId,
      eventType: 'DELIVERED',
      email: 'user@example.com',
      timestamp: new Date(),
    });

    await emailTrackingService.processTrackingEvent({
      messageId,
      eventType: 'OPENED',
      email: 'user@example.com',
      timestamp: new Date(),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    // 3. Check delivery status
    const status = await emailService.getDeliveryStatus(messageId);

    expect(status).toBeDefined();
    expect(status?.status).toBe('opened');
    expect(status?.events).toHaveLength(2);
  });
});
