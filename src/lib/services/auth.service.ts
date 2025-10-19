/**
 * Authentication Service
 * Core business logic for user authentication and authorization
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthErrors } from '../errors/auth.errors';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { EmailService } from './email/email.service';
import { PasswordHistoryService } from '../auth/password-history.service';
import { AccountLockoutService } from '../auth/account-lockout.service';
import { validatePasswordStrength } from '../auth/password';
import { TotpService } from '../auth/totp.service';
import { MultiStepAuthService } from './multi-step-auth.service';
import { LoginSecurityService } from './login-security.service';
import { captchaService } from './captcha.service';
import { securityLoggingService } from './security-logging.service';
import type { TotpSecret } from '../auth/totp.service';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
  VerifyTotpInput,
  ConfirmTotpSetupInput,
  DisableTotpInput,
  VerifyBackupCodeInput,
  Verify2FALoginInput,
  VerifyBackupCodeLoginInput,
  LoginWithTrustedDeviceInput,
  RevokeTrustedDeviceInput,
} from '../validators/auth.validators';

const BCRYPT_ROUNDS = 12;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

export type RegisterOutput = {
  userId: string;
  email: string;
  emailVerified: boolean;
};

export type LoginOutput = {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    emailVerified: boolean;
  };
};

export type MultiStepLoginOutput = {
  requiresTwoFactor: true;
  temporaryToken: string;
  challengeType: 'TOTP' | 'SMS';
  expiresAt: Date;
  userId: string;
};

export class AuthService {
  private passwordHistory: PasswordHistoryService;
  private accountLockout: AccountLockoutService;
  private multiStepAuth: MultiStepAuthService;
  private loginSecurity: LoginSecurityService;

  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private auditService: AuditService
  ) {
    this.passwordHistory = new PasswordHistoryService(prisma);
    this.accountLockout = new AccountLockoutService(prisma, emailService);
    this.multiStepAuth = new MultiStepAuthService(prisma);
    this.loginSecurity = new LoginSecurityService(prisma, emailService);
  }

  /**
   * Register a new user
   */
  async registerUser(
    input: RegisterInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<RegisterOutput> {
    const { email, password, name, role } = input;

    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.REGISTER_FAILED,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'EMAIL_EXISTS' },
      });
      throw AuthErrors.EMAIL_EXISTS;
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user in transaction with verification token
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || null,
          role,
          password_hash: passwordHash,
          email_verified: null,
        },
      });

      // Generate verification token
      const token = this.generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

      await tx.verificationToken.create({
        data: {
          userId: newUser.id,
          token,
          expires: expiresAt,
        },
      });

      return { user: newUser, token };
    });

    // Send verification email
    try {
      await this.emailService.sendVerificationEmail({
        email: user.user.email,
        name: user.user.name || 'User',
        verificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${user.token}`,
      });

      await this.auditService.log({
        action: AUDIT_ACTIONS.EMAIL_VERIFICATION_SENT,
        userId: user.user.id,
        email: user.user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Don't throw - user is created, they can request another email
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.REGISTER_SUCCESS,
      userId: user.user.id,
      email: user.user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      afterJson: {
        role: user.user.role,
        hasName: !!user.user.name,
      },
    });

    return {
      userId: user.user.id,
      email: user.user.email,
      emailVerified: false,
    };
  }

  /**
   * Verify email with token
   */
  async verifyEmail(
    token: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const verificationToken = await this.prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken) {
      throw AuthErrors.TOKEN_INVALID;
    }

    if (verificationToken.expires < new Date()) {
      throw AuthErrors.TOKEN_EXPIRED;
    }

    if (verificationToken.user.email_verified) {
      throw AuthErrors.ALREADY_VERIFIED;
    }

    // Update user and delete token in transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { email_verified: new Date() },
      }),
      this.prisma.verificationToken.delete({
        where: { id: verificationToken.id },
      }),
    ]);

    // Send welcome email
    try {
      await this.emailService.sendWelcomeEmail({
        email: verificationToken.user.email,
        name: verificationToken.user.name || 'User',
      });
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.EMAIL_VERIFIED,
      userId: verificationToken.userId,
      email: verificationToken.user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(
    email: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Silent fail - don't leak user existence
      return;
    }

    if (user.email_verified) {
      throw AuthErrors.ALREADY_VERIFIED;
    }

    // Delete old tokens and create new one
    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id },
    });

    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + VERIFICATION_TOKEN_EXPIRY_HOURS);

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        token,
        expires: expiresAt,
      },
    });

    // Send verification email
    await this.emailService.sendVerificationEmail({
      email: user.email,
      name: user.name || 'User',
      verificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${token}`,
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.EMAIL_VERIFICATION_SENT,
      userId: user.id,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Login user (Step 1: Validate password)
   * Returns user data if 2FA is not enabled
   * Returns temporary token if 2FA is enabled
   */
  async loginUser(
    input: LoginInput & { trustedDeviceToken?: string; captchaToken?: string },
    context?: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
  ): Promise<LoginOutput | MultiStepLoginOutput> {
    const { email, password, trustedDeviceToken, captchaToken } = input;

    // Step 1: Check login security (progressive delays, CAPTCHA, lockout)
    const securityCheck = await this.loginSecurity.checkLoginSecurity(email, context || {});

    // Apply progressive delay before proceeding
    if (securityCheck.requiredDelay > 0) {
      await this.loginSecurity.applyProgressiveDelay(securityCheck.requiredDelay);
    }

    // Check if account is locked
    if (securityCheck.isLocked) {
      await this.loginSecurity.recordFailedAttempt(
        email,
        'ACCOUNT_LOCKED',
        context || {},
        false,
        false
      );
      throw AuthErrors.ACCOUNT_LOCKED;
    }

    // Check if CAPTCHA is required
    if (securityCheck.requiresCaptcha) {
      if (!captchaToken) {
        // CAPTCHA required but not provided
        await this.loginSecurity.recordFailedAttempt(
          email,
          'CAPTCHA_REQUIRED',
          context || {},
          true,
          false
        );
        throw new Error('CAPTCHA_REQUIRED');
      }

      // Verify CAPTCHA
      const captchaResult = await captchaService.verify(captchaToken, context?.ipAddress);
      if (!captchaResult.success) {
        await this.loginSecurity.recordFailedAttempt(
          email,
          'CAPTCHA_FAILED',
          context || {},
          true,
          false
        );
        throw new Error('CAPTCHA_FAILED');
      }
    }

    // Step 2: Find user and validate credentials
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Generic error message to prevent user enumeration
    if (!user) {
      await this.loginSecurity.recordFailedAttempt(
        email,
        'USER_NOT_FOUND',
        context || {},
        securityCheck.requiresCaptcha,
        !!captchaToken
      );
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: 'unknown',
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'USER_NOT_FOUND' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    // Check if account is soft-deleted
    if (user.deleted_at) {
      await this.loginSecurity.recordFailedAttempt(
        email,
        'ACCOUNT_DELETED',
        context || {},
        securityCheck.requiresCaptcha,
        !!captchaToken
      );
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'ACCOUNT_DELETED' },
      });
      throw AuthErrors.ACCOUNT_DELETED;
    }

    // Check if account is inactive
    if (!user.isActive) {
      await this.loginSecurity.recordFailedAttempt(
        email,
        'ACCOUNT_INACTIVE',
        context || {},
        securityCheck.requiresCaptcha,
        !!captchaToken
      );
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'ACCOUNT_INACTIVE' },
      });
      throw AuthErrors.ACCOUNT_LOCKED;
    }

    // Verify password
    if (!user.password_hash) {
      // OAuth-only account
      await this.loginSecurity.recordFailedAttempt(
        email,
        'OAUTH_ONLY_ACCOUNT',
        context || {},
        securityCheck.requiresCaptcha,
        !!captchaToken
      );
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'OAUTH_ONLY_ACCOUNT' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    const isValidPassword = await this.verifyPassword(
      password,
      user.password_hash
    );

    if (!isValidPassword) {
      // Record failed attempt with new login security service
      await this.loginSecurity.recordFailedAttempt(
        email,
        'INVALID_PASSWORD',
        context || {},
        securityCheck.requiresCaptcha,
        !!captchaToken
      );

      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_PASSWORD' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    // Successful password validation - record successful attempt with anomaly detection
    await this.loginSecurity.recordSuccessfulAttempt(user.id, email, context || {});

    // Check if user has 2FA enabled
    const has2FA = user.two_factor_enabled;
    
    // Check if they provided a trusted device token
    if (trustedDeviceToken && has2FA) {
      const isTrusted = await this.multiStepAuth.verifyTrustedDevice(
        user.id,
        trustedDeviceToken,
        context
      );

      if (isTrusted) {
        // Trusted device - allow login without 2FA
        await this.auditService.log({
          action: AUDIT_ACTIONS.LOGIN_SUCCESS,
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
          email: user.email,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          after: {
            role: user.role,
            emailVerified: !!user.email_verified,
            trustedDevice: true,
          },
        });

        // Update last login
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: !!user.email_verified,
          },
        };
      }
    }

    // If 2FA is enabled and no trusted device, require 2FA verification
    if (has2FA) {
      // Determine challenge type (TOTP or SMS)
      const challengeType = user.preferred_2fa_method === 'SMS' ? 'SMS' : 'TOTP';

      // For SMS, send the code
      if (challengeType === 'SMS') {
        // TODO: Implement SMS sending logic
        // This would involve creating an SMS verification code and sending it
        // For now, we'll just indicate TOTP is required
      }

      // Create temporary auth token
      const tempTokenData = await this.multiStepAuth.createTemporaryAuthToken(
        user.id,
        challengeType,
        context
      );

      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_SUCCESS,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: {
          role: user.role,
          emailVerified: !!user.email_verified,
          requires2FA: true,
          challengeType,
        },
      });

      return {
        requiresTwoFactor: true,
        temporaryToken: tempTokenData.token,
        challengeType,
        expiresAt: tempTokenData.expiresAt,
        userId: user.id,
      };
    }

    // No 2FA - complete login
    await this.auditService.log({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        role: user.role,
        emailVerified: !!user.email_verified,
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: !!user.email_verified,
      },
    };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(
    email: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Silent fail if user doesn't exist (security best practice)
    if (!user || user.deleted_at) {
      return;
    }

    // Delete old reset tokens
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Create new reset token
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expires: expiresAt,
      },
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail({
      email: user.email,
      name: user.name || 'User',
      resetUrl: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`,
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
      userId: user.id,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Reset password with token
   */
  async resetPassword(
    input: ResetPasswordInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const { token, newPassword } = input;

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw AuthErrors.TOKEN_INVALID;
    }

    if (resetToken.expires < new Date()) {
      throw AuthErrors.TOKEN_EXPIRED;
    }

    if (resetToken.usedAt) {
      throw AuthErrors.TOKEN_USED;
    }

    // Check password history
    const isReused = await this.passwordHistory.isPasswordReused(
      resetToken.userId,
      newPassword
    );

    if (isReused) {
      throw AuthErrors.PASSWORD_REUSE;
    }

    // Add current password to history before changing
    if (resetToken.user.password_hash) {
      await this.passwordHistory.addToHistory(
        resetToken.userId,
        resetToken.user.password_hash
      );
    }

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password and mark token as used in transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password_hash: passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all existing sessions
      this.prisma.session.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    // Revoke all remember-me tokens for security
    // This will require the user to login again everywhere
    // Uncomment when RememberMeService is integrated:
    // await this.rememberMe.revokeAllUserTokens(resetToken.userId);

    // Send confirmation email
    try {
      await this.emailService.sendPasswordChangedEmail({
        email: resetToken.user.email,
        name: resetToken.user.name || 'User',
      });
    } catch (error) {
      console.error('Failed to send password changed email:', error);
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.PASSWORD_RESET_SUCCESS,
      entityType: 'user',
      entityId: resetToken.userId,
      userId: resetToken.userId,
      email: resetToken.user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Change password (for authenticated users)
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput & { keepCurrentSession?: boolean; currentSessionToken?: string },
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ sessionsRevoked: number }> {
    const { currentPassword, newPassword, keepCurrentSession, currentSessionToken } = input;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password_hash) {
      throw AuthErrors.UNAUTHORIZED;
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(
      currentPassword,
      user.password_hash
    );

    if (!isValidPassword) {
      throw AuthErrors.INVALID_CURRENT_PASSWORD;
    }

    // Check if new password is same as current
    const isSamePassword = await this.verifyPassword(
      newPassword,
      user.password_hash
    );

    if (isSamePassword) {
      throw AuthErrors.PASSWORD_REUSE;
    }

    // Check password history
    const isReused = await this.passwordHistory.isPasswordReused(userId, newPassword);
    if (isReused) {
      throw AuthErrors.PASSWORD_REUSE;
    }

    // Additional password strength validation
    const strengthErrors = validatePasswordStrength(newPassword, user.email, user.name || undefined);
    if (strengthErrors.length > 0) {
      throw new Error(strengthErrors.join('. '));
    }

    // Add current password to history
    await this.passwordHistory.addToHistory(userId, user.password_hash);

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });

    // Invalidate sessions based on user preference
    const { SessionManagementService } = await import('./session-management.service');
    const sessionService = new SessionManagementService(this.prisma);
    
    const sessionsRevoked = await sessionService.revokeSessionsOnPasswordChange(
      userId,
      keepCurrentSession ?? true,
      currentSessionToken
    );

    // Revoke all remember-me tokens for security
    try {
      await this.prisma.rememberMeToken.updateMany({
        where: { userId },
        data: { expiresAt: new Date() },
      });
    } catch (error) {
      console.error('Failed to revoke remember-me tokens:', error);
    }

    // Revoke all trusted devices
    try {
      await this.prisma.trustedDevice.updateMany({
        where: { userId },
        data: { expiresAt: new Date() },
      });
    } catch (error) {
      console.error('Failed to revoke trusted devices:', error);
    }

    // Send confirmation email
    try {
      await this.emailService.sendPasswordChangedEmail({
        email: user.email,
        name: user.name || 'User',
      });
    } catch (error) {
      console.error('Failed to send password changed email:', error);
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      afterJson: {
        sessionsRevoked,
        keptCurrentSession: keepCurrentSession ?? true,
      },
    });

    return { sessionsRevoked };
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    const beforeData = { name: user.name, avatar: user.avatar };

    await this.prisma.user.update({
      where: { id: userId },
      data: input,
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.PROFILE_UPDATED,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      beforeJson: beforeData,
      afterJson: input,
    });
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteAccount(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        talent: {
          include: {
            royalties: {
              where: {
                status: { in: ['PENDING', 'PROCESSING'] },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    // Check for pending financial obligations
    if (user.talent && user.talent.royalties.length > 0) {
      throw AuthErrors.PENDING_OBLIGATIONS;
    }

    // Soft delete
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deleted_at: new Date(),
          isActive: false,
        },
      }),
      // Invalidate all sessions
      this.prisma.session.deleteMany({
        where: { userId },
      }),
    ]);

    await this.auditService.log({
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  }

  /**
   * Hash password
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * Verify password
   */
  private async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate secure token
   */
  private generateToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * ======================================================================
   * TOTP (Two-Factor Authentication) Methods
   * ======================================================================
   */

  /**
   * Initialize TOTP setup for user
   * Returns QR code and secret for authenticator app setup
   */
  async initiateTotpSetup(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<TotpSecret> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (user.two_factor_enabled && user.two_factor_secret) {
      throw AuthErrors.TOTP_ALREADY_ENABLED;
    }

    // Generate TOTP setup data
    const setupData = await TotpService.generateSetupData(
      user.email,
      user.name || undefined
    );

    // Store encrypted secret temporarily (not yet verified)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        two_factor_secret: setupData.encryptedSecret,
        // Don't enable yet - wait for verification
      },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.TOTP_SETUP_INITIATED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    // Log security event
    await securityLoggingService.logTwoFactorSetupInitiated(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'TOTP',
        initiatedBy: 'USER',
      }
    );

    // Don't return the plain secret or encrypted secret
    return {
      secret: '', // Don't expose
      encryptedSecret: '', // Don't expose
      qrCodeDataUrl: setupData.qrCodeDataUrl,
      manualEntryKey: setupData.manualEntryKey,
    };
  }

  /**
   * Confirm TOTP setup by verifying a code
   * Enables TOTP for the user and generates backup codes
   */
  async confirmTotpSetup(
    userId: string,
    input: ConfirmTotpSetupInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (user.two_factor_enabled) {
      throw AuthErrors.TOTP_ALREADY_ENABLED;
    }

    if (!user.two_factor_secret) {
      throw AuthErrors.TOTP_SETUP_REQUIRED;
    }

    // Verify the TOTP code
    const isValid = TotpService.validateCode(user.two_factor_secret, input.code);

    if (!isValid) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.TOTP_VERIFICATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_CODE' },
      });

      // Log security event for failed verification
      await securityLoggingService.logTwoFactorVerificationFailed(
        {
          userId,
          email: user.email,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        {
          method: 'TOTP',
          success: false,
          failureReason: 'INVALID_CODE',
        }
      );

      throw AuthErrors.TOTP_INVALID;
    }

    // Generate backup codes
    const backupCodes = await TotpService.generateBackupCodes(10);

    // Enable TOTP and store backup codes
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: true,
          two_factor_verified_at: new Date(),
          preferred_2fa_method: 'AUTHENTICATOR',
        },
      }),
      // Store backup codes
      ...backupCodes.map(({ hashedCode }) =>
        this.prisma.twoFactorBackupCode.create({
          data: {
            userId,
            code: hashedCode,
          },
        })
      ),
    ]);

    await this.auditService.log({
      action: AUDIT_ACTIONS.TOTP_ENABLED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        backupCodesGenerated: backupCodes.length,
      },
    });

    // Log security events
    await securityLoggingService.logTwoFactorSetupCompleted(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'TOTP',
        success: true,
      }
    );

    await securityLoggingService.logBackupCodesGenerated(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        isRegeneration: false,
        count: backupCodes.length,
      }
    );

    // Send 2FA enabled notification email
    try {
      await this.emailService.send2FAEnabledEmail({
        email: user.email,
        name: user.name || 'User',
        enabledAt: new Date(),
        method: 'Authenticator App (TOTP)',
        ipAddress: context?.ipAddress,
        device: context?.userAgent,
        backupCodesCount: backupCodes.length,
      });
    } catch (error) {
      // Log error but don't fail the 2FA setup
      console.error('[Auth] Failed to send 2FA enabled email:', error);
    }

    // Return plain text backup codes (only time user will see them)
    return {
      backupCodes: backupCodes.map((bc) => bc.code),
    };
  }

  /**
   * Verify TOTP code during login
   * This is called after password authentication succeeds
   */
  async verifyTotpForLogin(
    userId: string,
    input: VerifyTotpInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (!user.two_factor_enabled || !user.two_factor_secret) {
      throw AuthErrors.TOTP_NOT_ENABLED;
    }

    // Verify the TOTP code
    const isValid = TotpService.validateCode(user.two_factor_secret, input.code);

    if (!isValid) {
      // Record failed attempt
      await this.auditService.log({
        action: AUDIT_ACTIONS.TOTP_VERIFICATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_CODE', context: 'LOGIN' },
      });
      throw AuthErrors.TOTP_INVALID;
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.TOTP_VERIFICATION_SUCCESS,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: { context: 'LOGIN' },
    });

    // Log security event
    await securityLoggingService.logTwoFactorVerificationSuccess(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'TOTP',
        success: true,
      }
    );
  }

  /**
   * Verify backup code during login
   * Can be used if user doesn't have access to authenticator app
   */
  async verifyBackupCodeForLogin(
    userId: string,
    input: VerifyBackupCodeInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        twoFactorBackupCodes: {
          where: { used: false },
        },
      },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (!user.two_factor_enabled) {
      throw AuthErrors.TOTP_NOT_ENABLED;
    }

    const backupCodes = user.twoFactorBackupCodes;

    if (backupCodes.length === 0) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'NO_CODES_REMAINING' },
      });
      throw AuthErrors.NO_BACKUP_CODES_REMAINING;
    }

    // Check each unused backup code
    let matchedCodeId: string | null = null;
    for (const backupCode of backupCodes) {
      const isValid = await TotpService.verifyBackupCode(input.code, backupCode.code);
      if (isValid) {
        matchedCodeId = backupCode.id;
        break;
      }
    }

    if (!matchedCodeId) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_CODE' },
      });

      // Log security event for failed backup code verification
      await securityLoggingService.logTwoFactorVerificationFailed(
        {
          userId,
          email: user.email,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
        {
          method: 'BACKUP_CODE',
          success: false,
          failureReason: 'INVALID_CODE',
        }
      );

      throw AuthErrors.BACKUP_CODE_INVALID;
    }

    // Mark backup code as used with race condition protection
    // Use updateMany with WHERE condition to ensure code hasn't been used concurrently
    const updateResult = await this.prisma.twoFactorBackupCode.updateMany({
      where: {
        id: matchedCodeId,
        used: false, // Only update if still unused (prevents race condition)
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // If no rows were updated, the code was already used in a concurrent request
    if (updateResult.count === 0) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'CODE_ALREADY_USED' },
      });
      throw AuthErrors.BACKUP_CODE_ALREADY_USED;
    }

    const remainingCodes = backupCodes.length - 1;

    await this.auditService.log({
      action: AUDIT_ACTIONS.BACKUP_CODE_VERIFICATION_SUCCESS,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        remainingCodes,
      },
    });

    // Log security event for backup code usage
    await securityLoggingService.logBackupCodeUsed(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'BACKUP_CODE',
        success: true,
        remainingBackupCodes: remainingCodes,
      }
    );

    // Send alert if backup codes are running low (<3 remaining)
    if (remainingCodes > 0 && remainingCodes < 3) {
      await this.sendLowBackupCodesAlert(user, remainingCodes);
    }
  }

  /**
   * Disable TOTP for user
   * Requires password and optionally a TOTP code
   */
  async disableTotp(
    userId: string,
    input: DisableTotpInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (!user.two_factor_enabled) {
      throw AuthErrors.TOTP_NOT_ENABLED;
    }

    // Verify password
    if (!user.password_hash) {
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    const isValidPassword = await this.verifyPassword(
      input.password,
      user.password_hash
    );

    if (!isValidPassword) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.TOTP_DISABLE_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_PASSWORD' },
      });
      throw AuthErrors.INVALID_CURRENT_PASSWORD;
    }

    // If TOTP code provided, verify it
    if (input.code && user.two_factor_secret) {
      const isValidTotp = TotpService.validateCode(user.two_factor_secret, input.code);
      if (!isValidTotp) {
        await this.auditService.log({
          action: AUDIT_ACTIONS.TOTP_DISABLE_FAILED,
          entityType: 'user',
          entityId: userId,
          userId,
          email: user.email,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          after: { reason: 'INVALID_TOTP_CODE' },
        });
        throw AuthErrors.TOTP_INVALID;
      }
    }

    // Disable TOTP and remove backup codes
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_verified_at: null,
          preferred_2fa_method: null,
        },
      }),
      this.prisma.twoFactorBackupCode.deleteMany({
        where: { userId },
      }),
    ]);

    await this.auditService.log({
      action: AUDIT_ACTIONS.TOTP_DISABLED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    // Log security events
    await securityLoggingService.logTwoFactorDisableInitiated(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'TOTP',
        initiatedBy: 'USER',
      }
    );

    await securityLoggingService.logTwoFactorDisableCompleted(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        method: 'TOTP',
        success: true,
      }
    );

    // Send 2FA disabled notification email
    try {
      await this.emailService.send2FADisabledEmail({
        email: user.email,
        name: user.name || 'User',
        disabledAt: new Date(),
        method: 'Authenticator App (TOTP)',
        ipAddress: context?.ipAddress,
        device: context?.userAgent,
      });
    } catch (error) {
      // Log error but don't fail the 2FA disable
      console.error('[Auth] Failed to send 2FA disabled email:', error);
    }
  }

  /**
   * Generate new backup codes
   * Replaces existing unused codes
   */
  async regenerateBackupCodes(
    userId: string,
    password: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    if (!user.two_factor_enabled) {
      throw AuthErrors.TOTP_NOT_ENABLED;
    }

    // Verify password
    if (!user.password_hash) {
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    const isValidPassword = await this.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.BACKUP_CODES_REGENERATION_FAILED,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: { reason: 'INVALID_PASSWORD' },
      });
      throw AuthErrors.INVALID_CURRENT_PASSWORD;
    }

    // Generate new backup codes
    const backupCodes = await TotpService.generateBackupCodes(10);

    // Delete old codes and create new ones
    await this.prisma.$transaction([
      this.prisma.twoFactorBackupCode.deleteMany({
        where: { userId },
      }),
      ...backupCodes.map(({ hashedCode }) =>
        this.prisma.twoFactorBackupCode.create({
          data: {
            userId,
            code: hashedCode,
          },
        })
      ),
    ]);

    await this.auditService.log({
      action: AUDIT_ACTIONS.BACKUP_CODES_REGENERATED,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        codesGenerated: backupCodes.length,
      },
    });

    // Log security event
    await securityLoggingService.logBackupCodesGenerated(
      {
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      {
        isRegeneration: true,
        count: backupCodes.length,
      }
    );

    // Send backup codes regenerated notification email
    try {
      await this.emailService.sendBackupCodesRegeneratedEmail({
        email: user.email,
        name: user.name || 'User',
        regeneratedAt: new Date(),
        newCodesCount: backupCodes.length,
        ipAddress: context?.ipAddress,
        device: context?.userAgent,
      });
    } catch (error) {
      // Log error but don't fail the regeneration
      console.error('[Auth] Failed to send backup codes regenerated email:', error);
    }

    return {
      backupCodes: backupCodes.map((bc) => bc.code),
    };
  }

  /**
   * Get TOTP status for user
   */
  async getTotpStatus(userId: string): Promise<{
    enabled: boolean;
    verifiedAt: Date | null;
    backupCodesRemaining: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        twoFactorBackupCodes: {
          where: { used: false },
        },
      },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    return {
      enabled: user.two_factor_enabled,
      verifiedAt: user.two_factor_verified_at,
      backupCodesRemaining: user.twoFactorBackupCodes.length,
    };
  }

  /**
   * Send low backup codes alert email to user
   * Uses Redis to prevent duplicate alerts within 24 hours
   */
  private async sendLowBackupCodesAlert(
    user: { id: string; email: string; name: string | null },
    remainingCodes: number
  ): Promise<void> {
    try {
      // Check if we've already sent an alert recently (within 24 hours)
      const { redis } = await import('@/lib/redis');
      const alertKey = `backup-codes-alert:${user.id}`;
      
      const alreadyAlerted = await redis.get(alertKey);
      if (alreadyAlerted) {
        // Already sent alert recently, skip
        return;
      }

      // Send the alert email
      await this.emailService.sendLowBackupCodesAlert({
        email: user.email,
        name: user.name || 'User',
        remainingCodes,
      });

      // Set flag to prevent duplicate alerts for 24 hours
      await redis.set(alertKey, 'true', 'EX', 86400);

      await this.auditService.log({
        action: AUDIT_ACTIONS.BACKUP_CODE_LOW_ALERT_SENT,
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
        email: user.email,
        after: {
          remainingCodes,
        },
      });
    } catch (error) {
      // Log error but don't fail the authentication flow
      console.error('Failed to send low backup codes alert:', error);
    }
  }

  /**
   * ======================================================================
   * Multi-Step Authentication Methods
   * ======================================================================
   */

  /**
   * Verify 2FA code and complete multi-step login (Step 2)
   * Upgrades temporary token to full session
   */
  async verify2FALogin(
    input: Verify2FALoginInput,
    context?: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
  ): Promise<{
    user: LoginOutput['user'];
    trustedDeviceToken?: string;
  }> {
    // Verify temporary token
    const { userId } = await this.multiStepAuth.verifyTemporaryAuthToken(
      input.temporaryToken
    );

    // Get user and verify TOTP code
    await this.verifyTotpForLogin(userId, { code: input.code }, context);

    // Mark temporary token as used
    await this.multiStepAuth.markTemporaryTokenAsUsed(input.temporaryToken);

    // Get user data
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    let trustedDeviceToken: string | undefined;

    // Create trusted device if requested
    if (input.trustDevice) {
      const deviceData = await this.multiStepAuth.createTrustedDevice(
        userId,
        context
      );
      trustedDeviceToken = deviceData.token;

      await this.auditService.log({
        action: 'TRUSTED_DEVICE_CREATED' as any,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: {
          deviceId: deviceData.deviceId,
          expiresAt: deviceData.expiresAt,
        },
      });

      // Send new device login notification email
      try {
        const deviceInfo = this.parseUserAgent(context?.userAgent);
        await this.emailService.sendNewDeviceLoginEmail({
          email: user.email,
          name: user.name || 'User',
          loginTime: new Date(),
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          browser: deviceInfo.browser,
          operatingSystem: deviceInfo.os,
          ipAddress: context?.ipAddress,
          location: await this.getLocationFromIP(context?.ipAddress),
        });
      } catch (error) {
        // Log error but don't fail the login
        console.error('[Auth] Failed to send new device login email:', error);
      }
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        role: user.role,
        emailVerified: !!user.email_verified,
        twoFactorVerified: true,
        trustedDeviceCreated: !!trustedDeviceToken,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: !!user.email_verified,
      },
      trustedDeviceToken,
    };
  }

  /**
   * Verify backup code and complete multi-step login (Step 2 alternative)
   */
  async verifyBackupCodeLogin(
    input: VerifyBackupCodeLoginInput,
    context?: { ipAddress?: string; userAgent?: string; deviceFingerprint?: string }
  ): Promise<{
    user: LoginOutput['user'];
    trustedDeviceToken?: string;
  }> {
    // Verify temporary token
    const { userId } = await this.multiStepAuth.verifyTemporaryAuthToken(
      input.temporaryToken
    );

    // Verify backup code
    await this.verifyBackupCodeForLogin(userId, { code: input.code }, context);

    // Mark temporary token as used
    await this.multiStepAuth.markTemporaryTokenAsUsed(input.temporaryToken);

    // Get user data
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AuthErrors.UNAUTHORIZED;
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    let trustedDeviceToken: string | undefined;

    // Create trusted device if requested
    if (input.trustDevice) {
      const deviceData = await this.multiStepAuth.createTrustedDevice(
        userId,
        context
      );
      trustedDeviceToken = deviceData.token;

      await this.auditService.log({
        action: 'TRUSTED_DEVICE_CREATED' as any,
        entityType: 'user',
        entityId: userId,
        userId,
        email: user.email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        after: {
          deviceId: deviceData.deviceId,
          expiresAt: deviceData.expiresAt,
        },
      });

      // Send new device login notification email
      try {
        const deviceInfo = this.parseUserAgent(context?.userAgent);
        await this.emailService.sendNewDeviceLoginEmail({
          email: user.email,
          name: user.name || 'User',
          loginTime: new Date(),
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          browser: deviceInfo.browser,
          operatingSystem: deviceInfo.os,
          ipAddress: context?.ipAddress,
          location: await this.getLocationFromIP(context?.ipAddress),
        });
      } catch (error) {
        // Log error but don't fail the login
        console.error('[Auth] Failed to send new device login email:', error);
      }
    }

    await this.auditService.log({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      entityType: 'user',
      entityId: userId,
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        role: user.role,
        emailVerified: !!user.email_verified,
        backupCodeUsed: true,
        trustedDeviceCreated: !!trustedDeviceToken,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: !!user.email_verified,
      },
      trustedDeviceToken,
    };
  }

  /**
   * Get all trusted devices for a user
   */
  async getTrustedDevices(userId: string) {
    return this.multiStepAuth.getTrustedDevices(userId);
  }

  /**
   * Revoke a specific trusted device
   */
  async revokeTrustedDevice(
    userId: string,
    input: RevokeTrustedDeviceInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await this.multiStepAuth.revokeTrustedDevice(userId, input.deviceId);

    await this.auditService.log({
      action: 'TRUSTED_DEVICE_REVOKED' as any,
      entityType: 'user',
      entityId: userId,
      userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        deviceId: input.deviceId,
      },
    });
  }

  /**
   * Revoke all trusted devices for a user
   */
  async revokeAllTrustedDevices(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<number> {
    const count = await this.multiStepAuth.revokeAllTrustedDevices(userId);

    await this.auditService.log({
      action: 'ALL_TRUSTED_DEVICES_REVOKED' as any,
      entityType: 'user',
      entityId: userId,
      userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      after: {
        devicesRevoked: count,
      },
    });

    return count;
  }

  /**
   * Parse user agent string to extract device information
   * Simple implementation - for production, consider using ua-parser-js
   */
  private parseUserAgent(userAgent?: string): {
    deviceName: string;
    deviceType: string;
    browser: string;
    os: string;
  } {
    if (!userAgent) {
      return {
        deviceName: 'Unknown Device',
        deviceType: 'Unknown',
        browser: 'Unknown',
        os: 'Unknown',
      };
    }

    let deviceName = 'Unknown Device';
    let deviceType = 'Desktop';
    let browser = 'Unknown';
    let os = 'Unknown';

    // Detect device type and name
    if (userAgent.includes('iPhone')) {
      deviceName = 'iPhone';
      deviceType = 'Mobile';
    } else if (userAgent.includes('iPad')) {
      deviceName = 'iPad';
      deviceType = 'Tablet';
    } else if (userAgent.includes('Android')) {
      deviceName = 'Android Device';
      deviceType = userAgent.includes('Mobile') ? 'Mobile' : 'Tablet';
    } else if (userAgent.includes('Macintosh')) {
      deviceName = 'Mac';
      deviceType = 'Desktop';
    } else if (userAgent.includes('Windows')) {
      deviceName = 'Windows PC';
      deviceType = 'Desktop';
    } else if (userAgent.includes('Linux')) {
      deviceName = 'Linux PC';
      deviceType = 'Desktop';
    }

    // Detect browser
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browser = 'Chrome';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'Safari';
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
    } else if (userAgent.includes('Edg')) {
      browser = 'Edge';
    }

    // Detect OS
    if (userAgent.includes('Windows NT 10')) {
      os = 'Windows 10/11';
    } else if (userAgent.includes('Windows')) {
      os = 'Windows';
    } else if (userAgent.includes('Mac OS X')) {
      const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
      os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
    } else if (userAgent.includes('Android')) {
      const match = userAgent.match(/Android (\d+)/);
      os = match ? `Android ${match[1]}` : 'Android';
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      const match = userAgent.match(/OS (\d+_\d+)/);
      os = match ? `iOS ${match[1].replace('_', '.')}` : 'iOS';
    } else if (userAgent.includes('Linux')) {
      os = 'Linux';
    }

    return { deviceName, deviceType, browser, os };
  }

  /**
   * Get approximate location from IP address
   * Simple implementation - returns 'Unknown' for now
   * For production, integrate with IP geolocation service (e.g., ipapi.co, ipstack)
   */
  private async getLocationFromIP(ipAddress?: string): Promise<string> {
    if (!ipAddress) {
      return 'Unknown';
    }

    // Skip localhost and private IPs
    if (
      ipAddress === '::1' ||
      ipAddress === '127.0.0.1' ||
      ipAddress.startsWith('192.168.') ||
      ipAddress.startsWith('10.') ||
      ipAddress.startsWith('172.')
    ) {
      return 'Local Network';
    }

    // In production, integrate with IP geolocation API
    // For now, return a placeholder
    return 'Unknown';
  }
}

