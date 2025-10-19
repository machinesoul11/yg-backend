/**
 * Authentication Error Classes
 * Structured error handling for authentication operations
 */

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Predefined Authentication Errors
 */
export const AuthErrors = {
  // Registration Errors
  EMAIL_EXISTS: new AuthError(
    'EMAIL_EXISTS',
    'An account with this email already exists',
    409
  ),
  WEAK_PASSWORD: new AuthError(
    'WEAK_PASSWORD',
    'Password does not meet security requirements',
    400
  ),
  EMAIL_SEND_FAILED: new AuthError(
    'EMAIL_SEND_FAILED',
    'Failed to send verification email. Please try again.',
    500
  ),

  // Login Errors
  INVALID_CREDENTIALS: new AuthError(
    'INVALID_CREDENTIALS',
    'Invalid email or password',
    401
  ),
  ACCOUNT_LOCKED: new AuthError(
    'ACCOUNT_LOCKED',
    'Account has been locked due to too many failed login attempts',
    423
  ),
  ACCOUNT_DELETED: new AuthError(
    'ACCOUNT_DELETED',
    'This account has been deleted',
    410
  ),
  RATE_LIMIT_EXCEEDED: new AuthError(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Try again later',
    429
  ),
  EMAIL_NOT_VERIFIED: new AuthError(
    'EMAIL_NOT_VERIFIED',
    'Email verification required',
    403
  ),

  // Token Errors
  TOKEN_INVALID: new AuthError(
    'TOKEN_INVALID',
    'Invalid or expired token',
    401
  ),
  TOKEN_EXPIRED: new AuthError(
    'TOKEN_EXPIRED',
    'Token has expired',
    401
  ),
  TOKEN_USED: new AuthError(
    'TOKEN_USED',
    'Token has already been used',
    400
  ),
  ALREADY_VERIFIED: new AuthError(
    'ALREADY_VERIFIED',
    'Email already verified',
    400
  ),

  // Authorization Errors
  UNAUTHORIZED: new AuthError(
    'UNAUTHORIZED',
    'Authentication required',
    401
  ),
  FORBIDDEN: new AuthError(
    'FORBIDDEN',
    'Access denied',
    403
  ),
  INVALID_SESSION: new AuthError(
    'INVALID_SESSION',
    'Session expired',
    401
  ),

  // Password Errors
  INVALID_CURRENT_PASSWORD: new AuthError(
    'INVALID_CURRENT_PASSWORD',
    'Current password is incorrect',
    401
  ),
  PASSWORD_REUSE: new AuthError(
    'PASSWORD_REUSE',
    'Password cannot be the same as your last 10 passwords',
    400
  ),
  WEAK_PASSWORD_STRENGTH: new AuthError(
    'WEAK_PASSWORD_STRENGTH',
    'Password does not meet security requirements',
    400
  ),

  // Account Management Errors
  PENDING_OBLIGATIONS: new AuthError(
    'PENDING_OBLIGATIONS',
    'Cannot delete account with pending financial obligations',
    409
  ),

  // Two-Factor Authentication Errors
  TOTP_REQUIRED: new AuthError(
    'TOTP_REQUIRED',
    'Two-factor authentication code required',
    403
  ),
  TOTP_INVALID: new AuthError(
    'TOTP_INVALID',
    'Invalid two-factor authentication code',
    401
  ),
  TOTP_ALREADY_ENABLED: new AuthError(
    'TOTP_ALREADY_ENABLED',
    'Two-factor authentication is already enabled',
    400
  ),
  TOTP_NOT_ENABLED: new AuthError(
    'TOTP_NOT_ENABLED',
    'Two-factor authentication is not enabled',
    400
  ),
  TOTP_SETUP_REQUIRED: new AuthError(
    'TOTP_SETUP_REQUIRED',
    'Two-factor authentication setup required',
    400
  ),
  TOTP_SETUP_PENDING: new AuthError(
    'TOTP_SETUP_PENDING',
    'Two-factor authentication setup in progress',
    400
  ),
  BACKUP_CODE_INVALID: new AuthError(
    'BACKUP_CODE_INVALID',
    'Invalid backup code',
    401
  ),
  BACKUP_CODE_ALREADY_USED: new AuthError(
    'BACKUP_CODE_ALREADY_USED',
    'This backup code has already been used',
    400
  ),
  NO_BACKUP_CODES_REMAINING: new AuthError(
    'NO_BACKUP_CODES_REMAINING',
    'No backup codes remaining. Please contact support.',
    400
  ),

  // Multi-Step Login Errors
  TEMP_TOKEN_INVALID: new AuthError(
    'TEMP_TOKEN_INVALID',
    'Invalid temporary authentication token',
    401
  ),
  TEMP_TOKEN_EXPIRED: new AuthError(
    'TEMP_TOKEN_EXPIRED',
    'Temporary authentication token has expired',
    401
  ),
  TEMP_TOKEN_ALREADY_USED: new AuthError(
    'TEMP_TOKEN_ALREADY_USED',
    'Temporary authentication token has already been used',
    401
  ),
  DEVICE_NOT_FOUND: new AuthError(
    'DEVICE_NOT_FOUND',
    'Trusted device not found',
    404
  ),
} as const;

/**
 * Type guard to check if error is AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
