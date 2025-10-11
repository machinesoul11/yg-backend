/**
 * OAuth Error Handling
 * User-friendly error messages for OAuth authentication failures
 */

export type OAuthProvider = 'google' | 'github' | 'linkedin' | 'credentials';

export interface OAuthError {
  error: string;
  error_description?: string;
  provider?: OAuthProvider;
}

/**
 * Get user-friendly error message for OAuth errors
 * Maintains YES GODDESS brand voice: direct, clear, authoritative
 */
export function getOAuthErrorMessage(error: OAuthError): string {
  const { error: errorCode, error_description, provider } = error;

  // Map technical OAuth errors to user-friendly messages
  switch (errorCode) {
    case 'OAuthSignin':
      return 'Authentication could not be initiated. Please try again.';

    case 'OAuthCallback':
      return 'Authentication could not be completed. Please try again or use another method.';

    case 'OAuthCreateAccount':
      return 'Account creation failed. Please try another authentication method.';

    case 'EmailCreateAccount':
      return 'Could not create account with this email address.';

    case 'Callback':
      return 'Authentication callback failed. Please try again.';

    case 'OAuthAccountNotLinked':
      return 'This account is already connected to another user. Please sign in with your original authentication method.';

    case 'EmailSignin':
      return 'Email authentication failed. Please check your email address.';

    case 'CredentialsSignin':
      return 'Invalid email or password. Please try again.';

    case 'SessionRequired':
      return 'Authentication required. Please sign in to continue.';

    case 'AccessDenied':
      return 'Access denied. Please grant the necessary permissions to continue.';

    case 'Verification':
      return 'Verification token is invalid or has expired. Please request a new one.';

    // Provider-specific errors
    case 'OAuthProviderError':
      const providerName = getProviderDisplayName(provider);
      return `${providerName} authentication is temporarily unavailable. Please try again or use another method.`;

    default:
      // Generic fallback that doesn't expose technical details
      return 'Authentication failed. Please try again or contact support if the issue persists.';
  }
}

/**
 * Get display name for OAuth provider
 */
export function getProviderDisplayName(provider?: OAuthProvider): string {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'github':
      return 'GitHub';
    case 'linkedin':
      return 'LinkedIn';
    case 'credentials':
      return 'Email';
    default:
      return 'Authentication';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(errorCode: string): boolean {
  const retryableErrors = [
    'OAuthSignin',
    'OAuthCallback',
    'Callback',
    'OAuthProviderError',
  ];
  return retryableErrors.includes(errorCode);
}

/**
 * Check if error requires user action
 */
export function requiresUserAction(errorCode: string): boolean {
  const actionRequiredErrors = [
    'AccessDenied',
    'OAuthAccountNotLinked',
    'Verification',
  ];
  return actionRequiredErrors.includes(errorCode);
}

/**
 * Get error severity for logging
 */
export function getErrorSeverity(
  errorCode: string
): 'info' | 'warning' | 'error' | 'critical' {
  // User cancelled or denied permission - not really an error
  if (errorCode === 'AccessDenied') {
    return 'info';
  }

  // Verification issues - warning level
  if (errorCode === 'Verification') {
    return 'warning';
  }

  // OAuth provider errors - could indicate outage
  if (errorCode === 'OAuthProviderError') {
    return 'error';
  }

  // Account linking conflicts - needs investigation
  if (errorCode === 'OAuthAccountNotLinked') {
    return 'warning';
  }

  // All other errors are standard errors
  return 'error';
}

/**
 * Get suggested action for error
 */
export function getSuggestedAction(error: OAuthError): string {
  const { error: errorCode } = error;

  switch (errorCode) {
    case 'OAuthAccountNotLinked':
      return 'Sign in with your original authentication method, then link this account from your settings.';

    case 'AccessDenied':
      return 'Grant the necessary permissions when signing in.';

    case 'Verification':
      return 'Request a new verification email from the sign-in page.';

    case 'CredentialsSignin':
      return 'Double-check your email and password, or use password reset if needed.';

    case 'OAuthProviderError':
      return 'Try again in a few moments, or use an alternative sign-in method.';

    default:
      return 'Try again, or contact support if the problem continues.';
  }
}

/**
 * Format error for display in UI
 */
export interface FormattedOAuthError {
  title: string;
  message: string;
  action: string;
  canRetry: boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export function formatOAuthError(error: OAuthError): FormattedOAuthError {
  const message = getOAuthErrorMessage(error);
  const action = getSuggestedAction(error);
  const canRetry = isRetryableError(error.error);
  const severity = getErrorSeverity(error.error);

  // Determine title based on severity
  let title: string;
  switch (severity) {
    case 'info':
      title = 'Authentication Cancelled';
      break;
    case 'warning':
      title = 'Action Required';
      break;
    case 'error':
    case 'critical':
      title = 'Authentication Failed';
      break;
  }

  return {
    title,
    message,
    action,
    canRetry,
    severity,
  };
}
