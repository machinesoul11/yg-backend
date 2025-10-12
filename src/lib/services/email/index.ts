/**
 * Email Service Module
 * 
 * Central export point for email functionality including:
 * - EmailProvider abstract base class with common functionality
 * - Email service for sending transactional and campaign emails
 * - Email templates with React Email components
 * - Email adapter layer with provider-agnostic interface
 * - Bounce and complaint handling
 * - Webhook handlers for email provider events
 * - Email preferences and suppression list management
 * - Email sanitization and validation
 * - Retry queue management
 * - Bulk validation utilities
 * - Type-safe template registry
 */

// Core email service
export { EmailService, emailService } from './email.service';

// Optimization services
export { EmailReputationService, emailReputationService } from './reputation.service';
export { EmailTrackingService, emailTrackingService } from './tracking.service';
export { EmailDeliverabilityService, emailDeliverabilityService } from './deliverability.service';
export { EmailEngagementScoringService, emailEngagementScoringService } from './engagement-scoring.service';
export { EmailAlertsService, emailAlertsService } from './alerts.service';
export { UnsubscribeService, unsubscribeService } from './unsubscribe.service';
export { EmailSchedulingService, emailSchedulingService } from './scheduling.service';
export { ABTestingService, abTestingService } from './ab-testing.service';
export { PersonalizationService, personalizationService } from './personalization.service';
export { EmailRetryService, emailRetryService } from './retry.service';

// Template registry with type-safe variable injection
export {
  renderTemplate,
  getCategoryFromTemplate,
  getAllTemplateKeys,
  templateExists,
  TEMPLATE_REGISTRY,
  type TemplateKey,
  type TemplateVariables,
  type TemplateVariablesMap,
} from './template-registry';

// Bulk validation utilities
export {
  validateEmail,
  validateEmailsBulk,
  validateEmailsQuick,
  deduplicateEmails,
  partitionEmails,
  getEmailDomain,
  groupEmailsByDomain,
  type EmailValidationResult,
  type BulkValidationResult,
} from './bulk-validation.service';

// Sanitization utilities
export {
  sanitizeEmailAddress,
  sanitizeEmailAddresses,
  sanitizeSubject,
  sanitizeHtmlContent,
  sanitizePlainText,
  sanitizeUrl,
} from './sanitization.service';

// Error classes
export {
  EmailError,
  EmailSuppressionError,
  EmailRateLimitError,
  EmailProviderError,
  EmailPreferenceError,
  EmailValidationError,
  EmailTemplateError,
  EmailWebhookError,
  EmailWebhookSignatureError,
} from './errors';

// Types
export type { ReputationMetrics, ReputationAlert } from './reputation.service';
export type { EmailTrackingEvent, EnrichedTrackingData } from './tracking.service';
export type { 
  DeliverabilityMetrics, 
  DeliverabilityAlert, 
  DomainDeliverability 
} from './deliverability.service';
export type { UnsubscribeOptions, EmailPreferenceUpdate } from './unsubscribe.service';
export type { ScheduleEmailParams } from './scheduling.service';
export type { CreateTestParams, TestResults } from './ab-testing.service';
export type { PersonalizationData } from './personalization.service';
export type { RetryableEmail, RetryConfig } from './retry.service';
export type {
  SendTransactionalParams,
  SendCampaignParams,
  SendDigestParams,
} from './email.service';
