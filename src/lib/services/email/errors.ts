/**
 * Base class for all email-related errors
 */
export class EmailError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Error thrown when an email address is on the suppression list
 */
export class EmailSuppressionError extends EmailError {
  constructor(email: string) {
    super(`Email ${email} is on suppression list`, 'EMAIL_SUPPRESSED');
    this.name = 'EmailSuppressionError';
  }
}

/**
 * Error thrown when email rate limits are exceeded
 */
export class EmailRateLimitError extends EmailError {
  constructor(
    public userId: string,
    public resetAt: Date,
    public limit?: number
  ) {
    super(
      `Rate limit exceeded for user ${userId}. Resets at ${resetAt.toISOString()}`,
      'RATE_LIMIT_EXCEEDED'
    );
    this.name = 'EmailRateLimitError';
  }
}

/**
 * Error thrown when email provider API fails
 */
export class EmailProviderError extends EmailError {
  constructor(
    public provider: string,
    public details: string,
    public providerCode?: string,
    public retryable: boolean = false
  ) {
    super(`Email provider ${provider} error: ${details}`, 'PROVIDER_ERROR');
    this.name = 'EmailProviderError';
    this.code = providerCode || 'PROVIDER_ERROR';
  }
}

/**
 * Error thrown when email preferences prevent sending
 */
export class EmailPreferenceError extends EmailError {
  constructor(message: string) {
    super(message, 'PREFERENCE_BLOCKED');
    this.name = 'EmailPreferenceError';
  }
}

/**
 * Error thrown when email validation fails
 */
export class EmailValidationError extends EmailError {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'EmailValidationError';
  }
}

/**
 * Error thrown when email template rendering fails
 */
export class EmailTemplateError extends EmailError {
  constructor(
    public templateName: string,
    public details: string,
    public missingVariables?: string[]
  ) {
    super(
      `Template ${templateName} error: ${details}`,
      'TEMPLATE_ERROR'
    );
    this.name = 'EmailTemplateError';
  }
}

/**
 * Error thrown when webhook processing fails
 */
export class EmailWebhookError extends EmailError {
  constructor(
    message: string,
    public webhookProvider?: string,
    public eventId?: string
  ) {
    super(message, 'WEBHOOK_ERROR');
    this.name = 'EmailWebhookError';
  }
}

/**
 * Error thrown when webhook signature verification fails
 */
export class EmailWebhookSignatureError extends EmailWebhookError {
  constructor(provider: string) {
    super(
      `Invalid webhook signature from ${provider}`,
      provider
    );
    this.name = 'EmailWebhookSignatureError';
    this.code = 'INVALID_SIGNATURE';
  }
}

/**
 * Error thrown when a webhook event is a duplicate
 */
export class EmailWebhookDuplicateError extends EmailWebhookError {
  constructor(eventId: string) {
    super(`Duplicate webhook event: ${eventId}`, undefined, eventId);
    this.name = 'EmailWebhookDuplicateError';
    this.code = 'DUPLICATE_EVENT';
  }
}

/**
 * Error thrown when attachment processing fails
 */
export class EmailAttachmentError extends EmailError {
  constructor(
    public filename: string,
    public details: string
  ) {
    super(`Attachment ${filename} error: ${details}`, 'ATTACHMENT_ERROR');
    this.name = 'EmailAttachmentError';
  }
}

/**
 * Circuit breaker error when provider is unavailable
 */
export class EmailCircuitBreakerError extends EmailError {
  constructor(
    public provider: string,
    public resetAt: Date
  ) {
    super(
      `Email provider ${provider} is unavailable. Circuit breaker open until ${resetAt.toISOString()}`,
      'CIRCUIT_BREAKER_OPEN'
    );
    this.name = 'EmailCircuitBreakerError';
  }
}

/**
 * Configuration error for email service setup
 */
export class EmailConfigurationError extends EmailError {
  constructor(
    public setting: string,
    public details: string
  ) {
    super(`Email configuration error for ${setting}: ${details}`, 'CONFIG_ERROR');
    this.name = 'EmailConfigurationError';
  }
}

