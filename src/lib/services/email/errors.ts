// Custom error classes for email service
export class EmailSuppressionError extends Error {
  constructor(email: string) {
    super(`Email ${email} is on suppression list`);
    this.name = 'EmailSuppressionError';
  }
}

export class EmailRateLimitError extends Error {
  constructor(userId: string, resetAt: Date) {
    super(`Rate limit exceeded for user ${userId}. Resets at ${resetAt}`);
    this.name = 'EmailRateLimitError';
  }
}

export class EmailProviderError extends Error {
  constructor(provider: string, details: string) {
    super(`Email provider ${provider} error: ${details}`);
    this.name = 'EmailProviderError';
  }
}

export class EmailPreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailPreferenceError';
  }
}
