/**
 * Email Service Module
 * 
 * Central export point for email functionality including:
 * - Email service for sending transactional and campaign emails
 * - Email templates with React Email components
 * - Webhook handlers for Resend events
 * - Email preferences and suppression list management
 */

export { emailService, EmailService } from './email.service';
export type {
  SendTransactionalParams,
  SendCampaignParams,
  SendDigestParams,
} from './email.service';

export {
  EmailSuppressionError,
  EmailRateLimitError,
  EmailProviderError,
  EmailPreferenceError,
} from './errors';

export {
  renderTemplate,
  getCategoryFromTemplate,
  EMAIL_TEMPLATES,
} from './templates';
export type { TemplateKey, TemplateVariables } from './templates';
