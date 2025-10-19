/**
 * Sensitive Action Middleware
 * Enforces 2FA and step-up authentication for sensitive operations
 */

import { TRPCError } from '@trpc/server';
import { prisma } from '@/lib/db';
import { StepUpAuthService, SensitiveActionType } from '../services/step-up-auth.service';
import { AuditService } from '../services/audit.service';

const stepUpAuthService = new StepUpAuthService(prisma, new AuditService(prisma));

export interface SensitiveActionContext {
  userId: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  sessionToken?: string;
}

export interface SensitiveActionOptions {
  actionType: SensitiveActionType;
  requires2FA?: boolean;
  requiresStepUp?: boolean;
  elevatedPermissions?: string[];
}

/**
 * Middleware to enforce authentication requirements for sensitive actions
 */
export async function requireSensitiveAction(
  context: SensitiveActionContext,
  options: SensitiveActionOptions
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: {
      two_factor_enabled: true,
      two_factor_verified_at: true,
    },
  });

  if (!user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User not found',
    });
  }

  // Check if user has 2FA enabled for actions that require it
  const needsPasswordChange = options.actionType === 'password_change';
  const needsEmailChange = options.actionType === 'email_change';
  const needsSecuritySettings = options.actionType === 'security_settings';

  // Always require 2FA for password/email changes if 2FA is enabled
  if (
    user.two_factor_enabled &&
    (needsPasswordChange || needsEmailChange || needsSecuritySettings)
  ) {
    // Check if user has recent 2FA verification
    const hasRecent2FA = await stepUpAuthService.hasRecent2FA(context.userId);

    if (!hasRecent2FA) {
      // Log failed attempt
      await stepUpAuthService.logSensitiveAction({
        userId: context.userId,
        actionType: options.actionType,
        required2fa: true,
        requiredStepUp: false,
        success: false,
        failureReason: 'missing_2fa_verification',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '2FA_REQUIRED',
        cause: {
          errorCode: '2FA_REQUIRED',
          message: 'This action requires two-factor authentication verification',
          action: options.actionType,
        },
      });
    }
  }

  // Check if step-up authentication is required
  if (options.requiresStepUp !== false) {
    const stepUpCheck = await stepUpAuthService.requiresStepUp(
      context.userId,
      options.actionType
    );

    if (stepUpCheck.required) {
      // Log failed attempt
      await stepUpAuthService.logSensitiveAction({
        userId: context.userId,
        actionType: options.actionType,
        required2fa: false,
        requiredStepUp: true,
        success: false,
        failureReason: 'missing_step_up_auth',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'STEP_UP_REQUIRED',
        cause: {
          errorCode: 'STEP_UP_REQUIRED',
          message: 'This action requires re-authentication',
          action: options.actionType,
          reason: stepUpCheck.reason,
        },
      });
    }
  }

  // Log successful verification
  await stepUpAuthService.logSensitiveAction({
    userId: context.userId,
    actionType: options.actionType,
    required2fa: user.two_factor_enabled,
    requiredStepUp: options.requiresStepUp !== false,
    verificationMethod: user.two_factor_enabled ? '2fa_verified' : 'authenticated',
    success: true,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

/**
 * Check if action requires 2FA challenge
 */
export async function check2FARequirement(
  userId: string,
  actionType: SensitiveActionType
): Promise<{
  required: boolean;
  reason?: string;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { two_factor_enabled: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.two_factor_enabled) {
    return { required: false };
  }

  // Check for recent 2FA
  const hasRecent2FA = await stepUpAuthService.hasRecent2FA(userId);

  if (hasRecent2FA) {
    return { required: false, reason: 'recent_verification' };
  }

  // Sensitive actions always require 2FA
  const sensitiveActions: SensitiveActionType[] = [
    'password_change',
    'email_change',
    'security_settings',
    'account_deletion',
  ];

  if (sensitiveActions.includes(actionType)) {
    return { required: true, reason: 'sensitive_action' };
  }

  return { required: false };
}

/**
 * Create 2FA challenge for sensitive action
 */
export async function create2FAChallenge(
  userId: string,
  actionType: SensitiveActionType,
  context?: { ipAddress?: string; userAgent?: string }
): Promise<{
  challengeId: string;
  expiresAt: Date;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      two_factor_enabled: true,
      preferred_2fa_method: true,
    },
  });

  if (!user || !user.two_factor_enabled) {
    throw new Error('2FA not enabled for user');
  }

  // Create temporary auth token for this specific action
  const { MultiStepAuthService } = await import('../services/multi-step-auth.service');
  const multiStepAuth = new MultiStepAuthService(prisma);

  const challengeType = user.preferred_2fa_method === 'SMS' ? 'SMS' : 'TOTP';
  const tokenData = await multiStepAuth.createTemporaryAuthToken(
    userId,
    challengeType,
    context
  );

  return {
    challengeId: tokenData.token,
    expiresAt: tokenData.expiresAt,
  };
}

/**
 * Verify 2FA challenge for sensitive action
 */
export async function verify2FAChallenge(
  challengeId: string,
  code: string,
  actionType: SensitiveActionType
): Promise<{
  userId: string;
  verified: boolean;
}> {
  const { MultiStepAuthService } = await import('../services/multi-step-auth.service');
  const multiStepAuth = new MultiStepAuthService(prisma);

  // Verify the temporary token
  const { userId } = await multiStepAuth.verifyTemporaryAuthToken(challengeId);

  // Verify the TOTP code
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      two_factor_secret: true,
      two_factor_enabled: true,
    },
  });

  if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
    throw new Error('Invalid 2FA configuration');
  }

  const { TotpService } = await import('../auth/totp.service');
  const isValid = TotpService.validateCode(user.two_factor_secret, code);

  if (!isValid) {
    throw new Error('INVALID_2FA_CODE');
  }

  // Mark token as used
  await multiStepAuth.markTemporaryTokenAsUsed(challengeId);

  // Log successful 2FA for sensitive action
  await stepUpAuthService.logSensitiveAction({
    userId,
    actionType,
    required2fa: true,
    requiredStepUp: false,
    verificationMethod: '2fa_totp',
    success: true,
  });

  return {
    userId,
    verified: true,
  };
}

export { stepUpAuthService };
