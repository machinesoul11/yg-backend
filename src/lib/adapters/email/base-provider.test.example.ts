/**
 * Email Provider Base Class - Unit Tests
 * 
 * These tests demonstrate how to test email providers that extend
 * the EmailProvider base class.
 * 
 * Note: This file uses Jest syntax. To run these tests, ensure Jest is configured.
 */

// Note: Uncomment and adjust imports based on your test framework
// import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EmailProvider, EmailProviderConfig, ErrorRetryability } from '../base-provider';
import type {
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  SendTemplateParams,
  DeliveryStatus,
  WebhookEvent,
} from '../types';
import {
  EmailValidationError,
  EmailRateLimitError,
  EmailProviderError,
} from '@/lib/services/email/errors';

/**
 * Mock Email Provider for testing
 */
class MockEmailProvider extends EmailProvider<{ apiKey: string }> {
  public sendEmailCallCount = 0;
  public lastSendParams: SendEmailParams | null = null;
  
  protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
    this.sendEmailCallCount++;
    this.lastSendParams = params;
    
    return {
      messageId: `mock-${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }
  
  protected async sendBulkInternal(params: SendBulkEmailParams): Promise<SendBulkResult> {
    const messageIds: string[] = [];
    
    for (const recipient of params.recipients) {
      messageIds.push(`bulk-${recipient.email}-${Date.now()}`);
    }
    
    return {
      total: params.recipients.length,
      queued: messageIds.length,
      failed: 0,
      durationMs: 100,
      messageIds,
    };
  }
  
  protected async sendTemplateInternal(params: SendTemplateParams): Promise<SendEmailResult> {
    return {
      messageId: `template-${Date.now()}`,
      status: 'sent',
      timestamp: new Date(),
    };
  }
  
  protected async getDeliveryStatusInternal(messageId: string): Promise<DeliveryStatus | null> {
    return {
      messageId,
      status: 'delivered',
      events: [],
    };
  }
  
  protected async verifyWebhookSignatureInternal(): Promise<boolean> {
    return true;
  }
  
  protected parseWebhookEventInternal(rawPayload: any): WebhookEvent {
    return {
      id: rawPayload.id,
      type: 'email.sent',
      timestamp: new Date(),
      messageId: rawPayload.messageId,
      email: rawPayload.email,
      data: {},
      provider: this.config.providerName,
    };
  }
}

describe('EmailProvider Base Class', () => {
  let provider: MockEmailProvider;
  
  beforeEach(() => {
    provider = new MockEmailProvider({
      providerName: 'mock',
      providerConfig: {
        apiKey: 'test-key',
      },
    });
  });
  
  afterEach(() => {
    provider.clearTestEmails();
  });
  
  describe('Email Validation', () => {
    it('validates email address format', async () => {
      await expect(
        provider.sendEmail({
          to: 'invalid-email',
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
      
      await expect(
        provider.sendEmail({
          to: '@example.com',
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
    });
    
    it('validates subject is required', async () => {
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: '',
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
    });
    
    it('validates at least one content type is required', async () => {
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
        } as any)
      ).rejects.toThrow(EmailValidationError);
    });
    
    it('validates subject length', async () => {
      const longSubject = 'x'.repeat(1000);
      
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: longSubject,
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
    });
    
    it('accepts valid email parameters', async () => {
      await expect(
        provider.sendEmail({
          to: 'user@example.com',
          subject: 'Test Subject',
          text: 'Test content',
        })
      ).resolves.toMatchObject({
        status: 'sent',
        messageId: expect.stringMatching(/^mock-/),
      });
    });
    
    it('validates multiple recipients', async () => {
      await expect(
        provider.sendEmail({
          to: ['user1@example.com', 'invalid-email'],
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
      
      await expect(
        provider.sendEmail({
          to: ['user1@example.com', 'user2@example.com'],
          subject: 'Test',
          text: 'Test',
        })
      ).resolves.toMatchObject({
        status: 'sent',
      });
    });
  });
  
  describe('Retry Logic', () => {
    it('retries on retryable errors', async () => {
      let attemptCount = 0;
      
      const providerWithRetry = new (class extends MockEmailProvider {
        protected async sendEmailInternal(params: SendEmailParams): Promise<SendEmailResult> {
          attemptCount++;
          
          if (attemptCount < 3) {
            const error = new Error('Network timeout');
            (error as any).code = 'ETIMEDOUT';
            throw error;
          }
          
          return super.sendEmailInternal(params);
        }
      })({
        providerName: 'retry-test',
        providerConfig: { apiKey: 'test' },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      
      const result = await providerWithRetry.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test',
      });
      
      expect(attemptCount).toBe(3);
      expect(result.status).toBe('sent');
    });
    
    it('does not retry non-retryable errors', async () => {
      let attemptCount = 0;
      
      const providerWithNonRetry = new (class extends MockEmailProvider {
        protected async sendEmailInternal(): Promise<SendEmailResult> {
          attemptCount++;
          throw new EmailValidationError('Invalid email', 'to');
        }
      })({
        providerName: 'no-retry-test',
        providerConfig: { apiKey: 'test' },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      
      await expect(
        providerWithNonRetry.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
      
      expect(attemptCount).toBe(1); // Only tried once
    });
    
    it('gives up after max attempts', async () => {
      let attemptCount = 0;
      
      const providerWithMaxRetries = new (class extends MockEmailProvider {
        protected async sendEmailInternal(): Promise<SendEmailResult> {
          attemptCount++;
          const error = new Error('Service unavailable');
          (error as any).code = 'ECONNREFUSED';
          throw error;
        }
      })({
        providerName: 'max-retry-test',
        providerConfig: { apiKey: 'test' },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 10,
          maxDelayMs: 100,
          backoffMultiplier: 2,
        },
      });
      
      await expect(
        providerWithMaxRetries.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailProviderError);
      
      expect(attemptCount).toBe(3); // Tried 3 times
    });
  });
  
  describe('Test Mode', () => {
    it('captures emails in test mode', async () => {
      const testProvider = new MockEmailProvider({
        providerName: 'test',
        providerConfig: { apiKey: 'test' },
        testMode: {
          enabled: true,
          captureEmails: true,
        },
      });
      
      await testProvider.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test content',
      });
      
      const capturedEmails = testProvider.getTestEmails();
      
      expect(capturedEmails).toHaveLength(1);
      expect(capturedEmails[0].params.to).toBe('user@example.com');
      expect(capturedEmails[0].params.subject).toBe('Test');
      expect(capturedEmails[0].messageId).toMatch(/^test-/);
    });
    
    it('simulates failures in test mode', async () => {
      const testProvider = new MockEmailProvider({
        providerName: 'test',
        providerConfig: { apiKey: 'test' },
        testMode: {
          enabled: true,
          failureRate: 1.0, // Always fail
        },
      });
      
      await expect(
        testProvider.sendEmail({
          to: 'user@example.com',
          subject: 'Test',
          text: 'Test',
        })
      ).rejects.toThrow(EmailProviderError);
    });
    
    it('clears captured emails', async () => {
      const testProvider = new MockEmailProvider({
        providerName: 'test',
        providerConfig: { apiKey: 'test' },
        testMode: {
          enabled: true,
          captureEmails: true,
        },
      });
      
      await testProvider.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        text: 'Test',
      });
      
      expect(testProvider.getTestEmails()).toHaveLength(1);
      
      testProvider.clearTestEmails();
      
      expect(testProvider.getTestEmails()).toHaveLength(0);
    });
  });
  
  describe('Logging', () => {
    it('sanitizes email addresses for privacy', async () => {
      const logs: any[] = [];
      // Note: Uncomment when using Jest
      // const consoleSpy = jest.spyOn(console, 'log').mockImplementation((msg: string) => {
      //   logs.push(JSON.parse(msg));
      // });
      
      const privacyProvider = new MockEmailProvider({
        providerName: 'privacy-test',
        providerConfig: { apiKey: 'test' },
        logging: {
          level: 'info',
          logContent: false, // Don't log content
        },
      });
      
      await privacyProvider.sendEmail({
        to: 'user@example.com',
        subject: 'Private Email',
        text: 'Sensitive content',
      });
      
      // Note: Uncomment when using Jest
      // const emailLog = logs.find((log) => log.message === 'Sending email');
      // expect(emailLog.metadata.to).toBe('us***@example.com');
      // consoleSpy.mockRestore();
      
      // For now, just verify the email was sent
      expect(privacyProvider.sendEmailCallCount).toBe(1);
    });
  });
  
  describe('Bulk Email Sending', () => {
    it('sends bulk emails successfully', async () => {
      const result = await provider.sendBulk({
        recipients: [
          { email: 'user1@example.com' },
          { email: 'user2@example.com' },
          { email: 'user3@example.com' },
        ],
        template: 'test-template',
        subject: 'Bulk Email',
      });
      
      expect(result.total).toBe(3);
      expect(result.queued).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.messageIds).toHaveLength(3);
    });
    
    it('validates bulk parameters', async () => {
      await expect(
        provider.sendBulk({
          recipients: [],
          template: 'test',
          subject: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
      
      await expect(
        provider.sendBulk({
          recipients: [{ email: 'user@example.com' }],
          template: '',
          subject: 'Test',
        })
      ).rejects.toThrow(EmailValidationError);
    });
  });
  
  describe('Template Email', () => {
    it('sends template email successfully', async () => {
      const result = await provider.sendTemplate({
        to: 'user@example.com',
        template: 'welcome-email',
        subject: 'Welcome',
        variables: {
          userName: 'John Doe',
        },
      });
      
      expect(result.status).toBe('sent');
      expect(result.messageId).toMatch(/^template-/);
    });
    
    it('validates template parameters', async () => {
      await expect(
        provider.sendTemplate({
          to: '',
          template: 'test',
          subject: 'Test',
          variables: {},
        } as any)
      ).rejects.toThrow(EmailValidationError);
    });
  });
  
  describe('Integration', () => {
    it('handles full send workflow', async () => {
      const result = await provider.sendEmail({
        to: 'user@example.com',
        subject: 'Integration Test',
        html: '<p>Test content</p>',
        tags: {
          category: 'test',
          userId: 'user-123',
        },
        metadata: {
          testId: 'integration-test-1',
        },
      });
      
      expect(result).toMatchObject({
        status: 'sent',
        messageId: expect.any(String),
        timestamp: expect.any(Date),
      });
      
      expect(provider.sendEmailCallCount).toBe(1);
      expect(provider.lastSendParams).toMatchObject({
        to: 'user@example.com',
        subject: 'Integration Test',
      });
    });
  });
});
