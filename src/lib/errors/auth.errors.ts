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
    'Account has been locked due to too many failed login attempts. Please contact support.',
    423
  ),
  ACCOUNT_DELETED: new AuthError(
    'ACCOUNT_DELETED',
    'This account has been deleted',
    410
  ),
  RATE_LIMIT_EXCEEDED: new AuthError(
    'RATE_LIMIT_EXCEEDED',
    'Too many requests. Please try again later.',
    429
  ),
  EMAIL_NOT_VERIFIED: new AuthError(
    'EMAIL_NOT_VERIFIED',
    'Please verify your email address before logging in',
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
    'This token has expired. Please request a new one.',
    401
  ),
  TOKEN_USED: new AuthError(
    'TOKEN_USED',
    'This token has already been used',
    400
  ),
  ALREADY_VERIFIED: new AuthError(
    'ALREADY_VERIFIED',
    'Email address is already verified',
    400
  ),

  // Authorization Errors
  UNAUTHORIZED: new AuthError(
    'UNAUTHORIZED',
    'You must be logged in to access this resource',
    401
  ),
  FORBIDDEN: new AuthError(
    'FORBIDDEN',
    'You do not have permission to access this resource',
    403
  ),
  INVALID_SESSION: new AuthError(
    'INVALID_SESSION',
    'Your session has expired. Please log in again.',
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
    'New password must be different from current password',
    400
  ),

  // Account Deletion Errors
  PENDING_OBLIGATIONS: new AuthError(
    'PENDING_OBLIGATIONS',
    'Cannot delete account with pending financial obligations',
    409
  ),
} as const;

/**
 * Type guard to check if error is AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}
