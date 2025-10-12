import type React from 'react';

/**
 * Core email provider interface that all email service adapters must implement.
 * This interface provides a provider-agnostic contract for email operations,
 * enabling the application to switch between email providers (Resend, Postmark, etc.)
 * without modifying dependent code.
 * 
 * @interface IEmailProvider
 */
export interface IEmailProvider {
  /**
   * Send a single email to one or more recipients.
   * This is the fundamental email operation for transactional messages.
   * 
   * @param params - Email parameters including recipients, content, and metadata
   * @returns Promise resolving to send result with message ID and status
   * @throws {EmailProviderError} When the provider API fails
   * @throws {EmailValidationError} When email parameters are invalid
   */
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Send bulk emails for campaigns or broadcast notifications.
   * Automatically handles batching and rate limiting based on provider capabilities.
   * For Resend, batches are chunked into groups of 100 emails per request.
   * 
   * @param params - Bulk email parameters including recipient list and template
   * @returns Promise resolving to bulk send results with individual statuses
   * @throws {EmailProviderError} When the provider API fails
   * @throws {EmailRateLimitError} When rate limits are exceeded
   */
  sendBulk(params: SendBulkEmailParams): Promise<SendBulkResult>;

  /**
   * Send an email using a React Email component template.
   * Handles template rendering, compilation, and caching for optimal performance.
   * 
   * @param params - Template email parameters including template reference and variables
   * @returns Promise resolving to send result
   * @throws {EmailTemplateError} When template rendering fails
   * @throws {EmailProviderError} When the provider API fails
   */
  sendTemplate(params: SendTemplateParams): Promise<SendEmailResult>;

  /**
   * Query the delivery status of a previously sent email.
   * Returns detailed tracking information including delivery state and engagement.
   * 
   * Note: Some providers require webhook-based status updates. In such cases,
   * this method queries cached status from the database rather than the provider API.
   * 
   * @param messageId - The unique message identifier returned from sendEmail
   * @returns Promise resolving to detailed delivery status or null if not found
   * @throws {EmailProviderError} When status query fails
   */
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus | null>;

  /**
   * Verify the authenticity of a webhook payload from the email provider.
   * Validates signatures using provider-specific mechanisms (HMAC, etc.).
   * 
   * @param payload - Raw webhook payload as received
   * @param signature - Signature header from the webhook request
   * @param secret - Webhook signing secret for verification
   * @returns Promise resolving to true if signature is valid
   * @throws {EmailWebhookError} When signature verification fails
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean>;

  /**
   * Parse and normalize webhook events from provider-specific format
   * into a standardized internal format.
   * 
   * @param rawPayload - Raw webhook payload from the provider
   * @returns Normalized webhook event
   * @throws {EmailWebhookError} When payload parsing fails
   */
  parseWebhookEvent(rawPayload: any): WebhookEvent;
}

/**
 * Parameters for sending a single email
 */
export interface SendEmailParams {
  /** Recipient email address(es) - single string or array for multiple recipients */
  to: string | string[];
  
  /** Carbon copy recipients */
  cc?: string | string[];
  
  /** Blind carbon copy recipients */
  bcc?: string | string[];
  
  /** Sender email address (defaults to configured from address) */
  from?: string;
  
  /** Reply-to email address */
  replyTo?: string | string[];
  
  /** Email subject line */
  subject: string;
  
  /** React Email component for rendering (preferred method) */
  react?: React.ReactElement;
  
  /** HTML email body (alternative to react) */
  html?: string;
  
  /** Plain text email body (fallback for non-HTML clients) */
  text?: string;
  
  /** File attachments */
  attachments?: EmailAttachment[];
  
  /** Custom email headers */
  headers?: Record<string, string>;
  
  /** Tags for categorization and filtering */
  tags?: Record<string, string>;
  
  /** Arbitrary metadata for tracking */
  metadata?: Record<string, any>;
  
  /** Schedule email for future delivery */
  scheduledAt?: Date;
  
  /** Priority level for email delivery */
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Email attachment specification
 */
export interface EmailAttachment {
  /** Filename to display */
  filename: string;
  
  /** File content (base64 encoded or Buffer) */
  content: string | Buffer;
  
  /** MIME type */
  contentType?: string;
  
  /** Inline content ID for embedding in HTML */
  cid?: string;
}

/**
 * Result from sending a single email
 */
export interface SendEmailResult {
  /** Unique message identifier from the provider */
  messageId: string;
  
  /** Current delivery status */
  status: 'queued' | 'sent' | 'failed';
  
  /** Timestamp when email was accepted by provider */
  timestamp: Date;
  
  /** Error message if sending failed */
  error?: string;
  
  /** Provider-specific error code */
  errorCode?: string;
  
  /** Provider-specific metadata */
  providerMetadata?: Record<string, any>;
}

/**
 * Parameters for sending bulk emails
 */
export interface SendBulkEmailParams {
  /** List of recipients with optional personalization variables */
  recipients: Array<{
    email: string;
    name?: string;
    variables?: Record<string, any>;
    metadata?: Record<string, any>;
  }>;
  
  /** Template identifier or name */
  template: string;
  
  /** Sender email address */
  from?: string;
  
  /** Email subject line (supports variable interpolation) */
  subject: string;
  
  /** Tags applied to all emails in the batch */
  tags?: Record<string, string>;
  
  /** Default variables for all recipients */
  defaultVariables?: Record<string, any>;
  
  /** Maximum batch size for chunking (defaults to provider limit) */
  batchSize?: number;
  
  /** Delay between batches in milliseconds */
  batchDelay?: number;
  
  /** Progress callback for long-running operations */
  onProgress?: (progress: BulkSendProgress) => void;
}

/**
 * Progress tracking for bulk send operations
 */
export interface BulkSendProgress {
  /** Total emails to send */
  total: number;
  
  /** Successfully sent so far */
  sent: number;
  
  /** Failed so far */
  failed: number;
  
  /** Percentage complete (0-100) */
  percentComplete: number;
  
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Result from bulk email send operation
 */
export interface SendBulkResult {
  /** Total number of emails attempted */
  total: number;
  
  /** Successfully queued for delivery */
  queued: number;
  
  /** Number of failures */
  failed: number;
  
  /** Processing duration in milliseconds */
  durationMs: number;
  
  /** Message IDs for successful sends */
  messageIds: string[];
  
  /** Detailed error information for failures */
  errors?: Array<{
    email: string;
    error: string;
    errorCode?: string;
    retryable: boolean;
  }>;
  
  /** Rate limiting information encountered */
  rateLimitInfo?: {
    delaysEncountered: number;
    totalDelayMs: number;
  };
}

/**
 * Parameters for sending templated emails
 */
export interface SendTemplateParams {
  /** Recipients */
  to: string | string[];
  
  /** Template identifier or React component */
  template: string | React.ComponentType<any>;
  
  /** Variables for template rendering */
  variables: Record<string, any>;
  
  /** Email subject */
  subject: string;
  
  /** Sender address */
  from?: string;
  
  /** Reply-to address */
  replyTo?: string | string[];
  
  /** Tags for categorization */
  tags?: Record<string, string>;
  
  /** Metadata */
  metadata?: Record<string, any>;
  
  /** Template version (for A/B testing) */
  templateVersion?: string;
  
  /** Whether to preview without sending */
  previewOnly?: boolean;
}

/**
 * Detailed delivery status for an email
 */
export interface DeliveryStatus {
  /** Message identifier */
  messageId: string;
  
  /** Current delivery state */
  status: DeliveryState;
  
  /** Recipient email address */
  email?: string;
  
  /** Subject line */
  subject?: string;
  
  /** Timeline of delivery events */
  events: DeliveryEvent[];
  
  /** Engagement metrics if available */
  engagement?: {
    opened?: boolean;
    openCount?: number;
    firstOpenedAt?: Date;
    lastOpenedAt?: Date;
    clicked?: boolean;
    clickCount?: number;
    firstClickedAt?: Date;
    lastClickedAt?: Date;
    clickedUrls?: string[];
  };
  
  /** Bounce information if applicable */
  bounce?: BounceInfo;
  
  /** Complaint information if applicable */
  complaint?: ComplaintInfo;
}

/**
 * Possible delivery states for an email
 */
export type DeliveryState =
  | 'pending'     // Email is being processed
  | 'queued'      // Email is queued for sending
  | 'sent'        // Email sent to recipient's mail server
  | 'delivered'   // Email delivered to inbox
  | 'deferred'    // Delivery temporarily delayed
  | 'bounced'     // Email bounced (hard or soft)
  | 'failed'      // Permanent delivery failure
  | 'complained'  // Recipient marked as spam
  | 'opened'      // Recipient opened email
  | 'clicked';    // Recipient clicked link

/**
 * Individual delivery event in the email lifecycle
 */
export interface DeliveryEvent {
  /** Event type */
  type: DeliveryState | string;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Event-specific details */
  details?: {
    url?: string;              // For click events
    userAgent?: string;        // For open/click events
    ipAddress?: string;        // For open/click events
    location?: string;         // Geographic location
    reason?: string;           // For bounce/failure events
    diagnosticCode?: string;   // SMTP diagnostic code
    [key: string]: any;
  };
}

/**
 * Detailed bounce information
 */
export interface BounceInfo {
  /** Bounce type classification */
  type: BounceType;
  
  /** Bounce sub-type */
  subType?: string;
  
  /** Human-readable bounce reason */
  reason: string;
  
  /** SMTP diagnostic code */
  diagnosticCode?: string;
  
  /** Bounce timestamp */
  timestamp: Date;
  
  /** Whether address should be suppressed */
  suppressionRecommended: boolean;
}

/**
 * Types of email bounces
 */
export type BounceType =
  | 'hard'        // Permanent failure (invalid address, domain doesn't exist)
  | 'soft'        // Temporary failure (mailbox full, server down)
  | 'technical'   // Technical issue (message too large, content rejected)
  | 'undetermined'; // Unable to classify

/**
 * Complaint (spam report) information
 */
export interface ComplaintInfo {
  /** Complaint type */
  type: ComplaintType;
  
  /** Complaint timestamp */
  timestamp: Date;
  
  /** Feedback report if available */
  feedbackType?: string;
  
  /** User agent of complaint source */
  userAgent?: string;
  
  /** Whether address should be suppressed */
  suppressionRecommended: boolean;
}

/**
 * Types of complaints
 */
export type ComplaintType =
  | 'abuse'       // Marked as spam/abuse
  | 'fraud'       // Reported as fraud
  | 'virus'       // Reported as containing virus
  | 'not-spam'    // Marked as not spam (whitelist)
  | 'other';      // Other complaint type

/**
 * Normalized webhook event from email provider
 */
export interface WebhookEvent {
  /** Event unique identifier */
  id: string;
  
  /** Event type */
  type: WebhookEventType;
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Message identifier */
  messageId: string;
  
  /** Recipient email */
  email: string;
  
  /** Subject line */
  subject?: string;
  
  /** Event-specific data */
  data: DeliveryEvent['details'] | BounceInfo | ComplaintInfo | any;
  
  /** Provider that generated the event */
  provider: string;
  
  /** Raw payload from provider */
  rawPayload?: any;
}

/**
 * Types of webhook events
 */
export type WebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.deferred'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'
  | 'email.unsubscribed'
  | 'email.failed';

/**
 * Configuration for webhook handling
 */
export interface WebhookConfig {
  /** Webhook signing secret */
  secret: string;
  
  /** Maximum age of webhook in seconds (prevents replay attacks) */
  maxAgeSeconds?: number;
  
  /** Whether to check for duplicate events */
  checkIdempotency?: boolean;
  
  /** Custom event handlers */
  handlers?: Partial<Record<WebhookEventType, WebhookHandler>>;
}

/**
 * Webhook event handler function
 */
export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

/**
 * Bounce handling interface
 */
export interface IBounceHandler {
  /**
   * Process a bounce event
   */
  handleBounce(bounce: BounceInfo & { email: string }): Promise<void>;
  
  /**
   * Check if an email should be suppressed due to bounces
   */
  shouldSuppress(email: string): Promise<boolean>;
  
  /**
   * Get bounce statistics for an email
   */
  getBounceStats(email: string): Promise<BounceStats | null>;
}

/**
 * Bounce statistics for an email address
 */
export interface BounceStats {
  /** Email address */
  email: string;
  
  /** Total bounce count */
  totalBounces: number;
  
  /** Hard bounce count */
  hardBounces: number;
  
  /** Soft bounce count */
  softBounces: number;
  
  /** Last bounce timestamp */
  lastBounceAt: Date;
  
  /** Last bounce type */
  lastBounceType: BounceType;
  
  /** Whether address is suppressed */
  isSuppressed: boolean;
}

/**
 * Complaint handling interface
 */
export interface IComplaintHandler {
  /**
   * Process a spam complaint
   */
  handleComplaint(complaint: ComplaintInfo & { email: string }): Promise<void>;
  
  /**
   * Check if an email has complained
   */
  hasComplained(email: string): Promise<boolean>;
  
  /**
   * Get complaint rate for a campaign or time period
   */
  getComplaintRate(params: {
    startDate: Date;
    endDate: Date;
    tags?: Record<string, string>;
  }): Promise<number>;
}

/**
 * Suppression list management interface
 */
export interface ISuppressionList {
  /**
   * Add an email to the suppression list
   */
  add(params: {
    email: string;
    reason: SuppressionReason;
    bounceType?: BounceType;
    bounceReason?: string;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  /**
   * Remove an email from the suppression list
   */
  remove(email: string): Promise<void>;
  
  /**
   * Check if an email is suppressed
   */
  isSuppressed(email: string): Promise<boolean>;
  
  /**
   * Get suppression details for an email
   */
  getSuppressionInfo(email: string): Promise<SuppressionInfo | null>;
  
  /**
   * List all suppressed emails with optional filtering
   */
  list(params?: {
    reason?: SuppressionReason;
    limit?: number;
    offset?: number;
  }): Promise<SuppressionInfo[]>;
}

/**
 * Reasons for email suppression
 */
export type SuppressionReason =
  | 'BOUNCE'        // Hard bounce
  | 'COMPLAINT'     // Spam complaint
  | 'UNSUBSCRIBE'   // User unsubscribed
  | 'MANUAL';       // Manually added by admin

/**
 * Suppression list entry information
 */
export interface SuppressionInfo {
  /** Email address */
  email: string;
  
  /** Suppression reason */
  reason: SuppressionReason;
  
  /** When suppression was added */
  suppressedAt: Date;
  
  /** Bounce type if applicable */
  bounceType?: BounceType;
  
  /** Bounce reason if applicable */
  bounceReason?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}
