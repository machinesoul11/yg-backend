/**
 * Email Adapter Layer
 * 
 * This module provides a provider-agnostic email interface that abstracts
 * the underlying email service provider (Resend, Postmark, Azure Communication Services).
 * 
 * Architecture:
 * - EmailProvider: Abstract base class with common functionality
 * - IEmailProvider: Core interface for email operations
 * - ResendAdapter: Resend implementation extending EmailProvider
 * - BounceHandler: Manages email bounces and suppression
 * - ComplaintHandler: Manages spam complaints and sender reputation
 * - SuppressionListManager: Centralized suppression list management
 * 
 * Usage:
 * ```typescript
 * import { emailAdapter, bounceHandler, complaintHandler } from '@/lib/adapters/email';
 * 
 * // Send email
 * const result = await emailAdapter.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   react: <WelcomeEmail name="User" />
 * });
 * 
 * // Handle bounce
 * await bounceHandler.handleBounce({
 *   email: 'bounced@example.com',
 *   type: 'hard',
 *   reason: 'Mailbox does not exist',
 *   timestamp: new Date(),
 *   suppressionRecommended: true
 * });
 * ```
 * 
 * @module email-adapter
 */

// Core base class and interfaces
export { EmailProvider, ErrorRetryability } from './base-provider';
export type { EmailProviderConfig } from './base-provider';
export type {
  IEmailProvider,
  IBounceHandler,
  IComplaintHandler,
  ISuppressionList,
  SendEmailParams,
  SendEmailResult,
  SendBulkEmailParams,
  SendBulkResult,
  SendTemplateParams,
  DeliveryStatus,
  DeliveryState,
  DeliveryEvent,
  EmailAttachment,
  WebhookEvent,
  WebhookEventType,
  WebhookConfig,
  WebhookHandler,
  BounceInfo,
  BounceType,
  BounceStats,
  ComplaintInfo,
  ComplaintType,
  SuppressionReason,
  SuppressionInfo,
  BulkSendProgress,
} from './types';

// Implementations
export { ResendAdapter } from './resend-adapter';
export { BounceHandler } from './bounce-handler';
export { ComplaintHandler } from './complaint-handler';
export { SuppressionListManager } from './suppression-list';

// Singleton instances (lazy initialization)
let _emailAdapter: import('./resend-adapter').ResendAdapter | null = null;
let _bounceHandler: import('./bounce-handler').BounceHandler | null = null;
let _complaintHandler: import('./complaint-handler').ComplaintHandler | null = null;
let _suppressionList: import('./suppression-list').SuppressionListManager | null = null;

/**
 * Get the configured email adapter instance
 * Defaults to Resend adapter
 */
export function getEmailAdapter(): import('./resend-adapter').ResendAdapter {
  if (!_emailAdapter) {
    const { ResendAdapter } = require('./resend-adapter');
    _emailAdapter = new ResendAdapter({
      apiKey: process.env.RESEND_API_KEY!,
      fromAddress: process.env.RESEND_SENDER_EMAIL!,
      fromName: process.env.EMAIL_FROM_NAME || 'YES GODDESS',
    });
  }
  return _emailAdapter!;
}

/**
 * Get the bounce handler instance
 */
export function getBounceHandler(): import('./bounce-handler').BounceHandler {
  if (!_bounceHandler) {
    const { BounceHandler } = require('./bounce-handler');
    _bounceHandler = new BounceHandler();
  }
  return _bounceHandler!;
}

/**
 * Get the complaint handler instance
 */
export function getComplaintHandler(): import('./complaint-handler').ComplaintHandler {
  if (!_complaintHandler) {
    const { ComplaintHandler } = require('./complaint-handler');
    _complaintHandler = new ComplaintHandler();
  }
  return _complaintHandler!;
}

/**
 * Get the suppression list manager instance
 */
export function getSuppressionList(): import('./suppression-list').SuppressionListManager {
  if (!_suppressionList) {
    const { SuppressionListManager } = require('./suppression-list');
    _suppressionList = new SuppressionListManager();
  }
  return _suppressionList!;
}

// Export singletons as default instances
export const emailAdapter = getEmailAdapter();
export const bounceHandler = getBounceHandler();
export const complaintHandler = getComplaintHandler();
export const suppressionList = getSuppressionList();
