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
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput,
  UpdateProfileInput,
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

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private auditService: AuditService
  ) {}

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
   * Login user
   */
  async loginUser(
    input: LoginInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<LoginOutput> {
    const { email, password } = input;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Generic error message to prevent user enumeration
    if (!user) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'USER_NOT_FOUND' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    // Check if account is soft-deleted
    if (user.deleted_at) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'ACCOUNT_DELETED' },
      });
      throw AuthErrors.ACCOUNT_DELETED;
    }

    // Check if account is inactive
    if (!user.isActive) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'ACCOUNT_LOCKED' },
      });
      throw AuthErrors.ACCOUNT_LOCKED;
    }

    // Verify password
    if (!user.password_hash) {
      // OAuth-only account
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'OAUTH_ONLY_ACCOUNT' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    const isValidPassword = await this.verifyPassword(
      password,
      user.password_hash
    );

    if (!isValidPassword) {
      await this.auditService.log({
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        userId: user.id,
        email,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        afterJson: { reason: 'INVALID_PASSWORD' },
      });
      throw AuthErrors.INVALID_CREDENTIALS;
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      userId: user.id,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      afterJson: {
        role: user.role,
        emailVerified: !!user.email_verified,
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
    input: ChangePasswordInput,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const { currentPassword, newPassword } = input;

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

    // Hash new password
    const passwordHash = await this.hashPassword(newPassword);

    // Update password and invalidate other sessions
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password_hash: passwordHash },
      }),
      // Keep current session, invalidate others
      // Note: This requires session tracking in context
    ]);

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
      userId,
      email: user.email,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
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
}
