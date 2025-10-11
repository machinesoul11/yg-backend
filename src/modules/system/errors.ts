/**
 * System Module - Custom Errors
 * 
 * Error classes for system operations
 */

export class IdempotencyError extends Error {
  constructor(
    public code: 'PROCESSING' | 'HASH_MISMATCH' | 'EXPIRED',
    message: string
  ) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

export class FeatureFlagError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'INVALID_NAME' | 'DUPLICATE',
    message: string
  ) {
    super(message);
    this.name = 'FeatureFlagError';
  }
}

export class NotificationError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'INVALID_TARGET',
    message: string
  ) {
    super(message);
    this.name = 'NotificationError';
  }
}
