/**
 * SMS 2FA Router (tRPC)
 * API endpoints for SMS-based two-factor authentication
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { twilioSmsService, smsCostMonitorService } from '@/lib/services/sms';
import { prisma } from '@/lib/db';
import { TwoFactorMethod } from '@prisma/client';
import { securityLoggingService, SecurityLoggingService } from '@/lib/services/security-logging.service';

// Validation schemas
const enableSms2FASchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number format'),
});

const verifySmsCodeSchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits'),
});

const requestSmsCodeSchema = z.object({
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number format').optional(),
});

const updatePreferred2FASchema = z.object({
  method: z.enum(['SMS', 'AUTHENTICATOR']), // BOTH is not a valid preference - must choose one as primary
});

const disableSms2FASchema = z.object({
  password: z.string().min(1, 'Password is required for security confirmation'),
});

/**
 * SMS 2FA Router
 */
export const sms2FARouter = createTRPCRouter({
  /**
   * Enable SMS 2FA for the current user
   */
  enable: protectedProcedure
    .input(enableSms2FASchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { phoneNumber } = input;

      // Check if phone number is already in use
      const existingUser = await prisma.user.findFirst({
        where: {
          phone_number: phoneNumber,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Phone number is already in use by another account',
        });
      }

      // Send verification code
      const result = await twilioSmsService.sendVerificationCode(
        userId,
        phoneNumber,
        'phoneVerification'
      );

      if (!result.success) {
        if (result.rateLimitExceeded) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: result.error || 'Rate limit exceeded',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to send verification code',
        });
      }

      // Update user phone number (not verified yet)
      await prisma.user.update({
        where: { id: userId },
        data: {
          phone_number: phoneNumber,
          phone_verified: false,
        },
      });

      // Log security event
      const ipAddress = (ctx.req?.headers as any)?.['x-forwarded-for'] || (ctx.req?.headers as any)?.['x-real-ip'];
      const userAgent = (ctx.req?.headers as any)?.['user-agent'];

      await securityLoggingService.logTwoFactorSetupInitiated(
        {
          userId,
          email: ctx.session.user.email,
          ipAddress,
          userAgent,
        },
        {
          method: 'SMS',
          phoneNumber: SecurityLoggingService.maskPhoneNumber(phoneNumber),
          initiatedBy: 'USER',
        }
      );

      await securityLoggingService.logPhoneNumberAdded(
        {
          userId,
          email: ctx.session.user.email,
          ipAddress,
          userAgent,
        },
        {
          phoneNumber: SecurityLoggingService.maskPhoneNumber(phoneNumber),
        }
      );

      return {
        success: true,
        message: 'Verification code sent to your phone',
        messageId: result.messageId,
      };
    }),

  /**
   * Verify SMS code and enable 2FA
   */
  verify: protectedProcedure
    .input(verifySmsCodeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { code } = input;

      // Verify the code
      const result = await twilioSmsService.verifyCode(userId, code);

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Invalid verification code',
        });
      }

      // Enable SMS 2FA for the user
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          phone_verified: true,
          two_factor_enabled: true,
          preferred_2fa_method: TwoFactorMethod.SMS,
        },
      });

      // Log security events
      const ipAddress = (ctx.req?.headers as any)?.['x-forwarded-for'] || (ctx.req?.headers as any)?.['x-real-ip'];
      const userAgent = (ctx.req?.headers as any)?.['user-agent'];

      await securityLoggingService.logPhoneNumberVerified(
        {
          userId,
          email: user.email,
          ipAddress,
          userAgent,
        },
        {
          phoneNumber: user.phone_number ? SecurityLoggingService.maskPhoneNumber(user.phone_number) : undefined,
          success: true,
        }
      );

      await securityLoggingService.logTwoFactorSetupCompleted(
        {
          userId,
          email: user.email,
          ipAddress,
          userAgent,
        },
        {
          method: 'SMS',
          success: true,
        }
      );

      return {
        success: true,
        message: 'SMS 2FA enabled successfully',
        user: {
          id: user.id,
          email: user.email,
          twoFactorEnabled: user.two_factor_enabled,
          preferredMethod: user.preferred_2fa_method,
          phoneVerified: user.phone_verified,
        },
      };
    }),

  /**
   * Request SMS code for login (when 2FA is already enabled)
   */
  requestLoginCode: protectedProcedure
    .input(requestSmsCodeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get user's phone number
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          phone_number: true,
          phone_verified: true,
          two_factor_enabled: true,
          preferred_2fa_method: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.two_factor_enabled || !user.phone_verified || !user.phone_number) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'SMS 2FA is not enabled for this account',
        });
      }

      const phoneNumber = input.phoneNumber || user.phone_number;

      // Send login verification code
      const result = await twilioSmsService.sendVerificationCode(
        userId,
        phoneNumber,
        'loginVerification'
      );

      if (!result.success) {
        if (result.rateLimitExceeded) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: result.error || 'Rate limit exceeded',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to send verification code',
        });
      }

      return {
        success: true,
        message: 'Verification code sent',
        messageId: result.messageId,
      };
    }),

  /**
   * Disable SMS 2FA (requires password confirmation)
   */
  disable: protectedProcedure
    .input(disableSms2FASchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { password } = input;

      // Get user with password hash
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          password_hash: true,
          two_factor_enabled: true,
          phone_number: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (!user.password_hash) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Password authentication not available for this account',
        });
      }

      // Verify password using bcrypt
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid password',
        });
      }

      // Store phone number before changes for logging
      const previousPhoneNumber = user.phone_number;

      // Disable SMS 2FA
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: false,
          preferred_2fa_method: null,
          phone_verified: false,
        },
      });

      // Log security events
      const ipAddress = (ctx.req?.headers as any)?.['x-forwarded-for'] || (ctx.req?.headers as any)?.['x-real-ip'];
      const userAgent = (ctx.req?.headers as any)?.['user-agent'];

      await securityLoggingService.logTwoFactorDisableInitiated(
        {
          userId,
          email: user.email,
          ipAddress,
          userAgent,
        },
        {
          method: 'SMS',
          initiatedBy: 'USER',
        }
      );

      await securityLoggingService.logTwoFactorDisableCompleted(
        {
          userId,
          email: user.email,
          ipAddress,
          userAgent,
        },
        {
          method: 'SMS',
          success: true,
        }
      );

      return {
        success: true,
        message: 'SMS 2FA disabled successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          twoFactorEnabled: updatedUser.two_factor_enabled,
        },
      };
    }),

  /**
   * Update phone number
   */
  updatePhoneNumber: protectedProcedure
    .input(enableSms2FASchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { phoneNumber } = input;

      // Check if phone number is already in use
      const existingUser = await prisma.user.findFirst({
        where: {
          phone_number: phoneNumber,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Phone number is already in use by another account',
        });
      }

      // Send verification code to new number
      const result = await twilioSmsService.sendVerificationCode(
        userId,
        phoneNumber,
        'phoneVerification'
      );

      if (!result.success) {
        if (result.rateLimitExceeded) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: result.error || 'Rate limit exceeded',
          });
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error || 'Failed to send verification code',
        });
      }

      // Update phone number (mark as unverified)
      await prisma.user.update({
        where: { id: userId },
        data: {
          phone_number: phoneNumber,
          phone_verified: false,
        },
      });

      return {
        success: true,
        message: 'Verification code sent to new phone number',
        messageId: result.messageId,
      };
    }),

  /**
   * Update preferred 2FA method
   * Note: This endpoint is deprecated in favor of the REST API endpoint /api/auth/2fa/set-preferred-method
   * which requires verification for security. This tRPC endpoint is kept for backward compatibility.
   */
  updatePreferredMethod: protectedProcedure
    .input(updatePreferred2FASchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { method } = input;

      // Validate that user has the required methods enabled
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          phone_verified: true,
          two_factor_secret: true,
          two_factor_verified_at: true,
          two_factor_enabled: true,
          preferred_2fa_method: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const hasTOTP = user.two_factor_enabled && !!user.two_factor_secret;
      const hasSMS = user.phone_verified;

      // For setting preferred method, both methods must be enabled
      if (!hasTOTP || !hasSMS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Both SMS and Authenticator 2FA must be enabled before setting a preference',
        });
      }

      // Update preferred method
      await prisma.user.update({
        where: { id: userId },
        data: {
          preferred_2fa_method: method as TwoFactorMethod,
        },
      });

      return {
        success: true,
        message: `Preferred 2FA method updated to ${method}`,
        method,
      };
    }),

  /**
   * Get SMS 2FA status
   */
  getStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          phone_number: true,
          phone_verified: true,
          two_factor_enabled: true,
          preferred_2fa_method: true,
        },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Check rate limit status
      const rateLimit = await twilioSmsService.checkRateLimit(userId);

      return {
        enabled: user.two_factor_enabled,
        phoneNumber: user.phone_number,
        phoneVerified: user.phone_verified,
        preferredMethod: user.preferred_2fa_method,
        rateLimit: {
          allowed: rateLimit.allowed,
          remaining: rateLimit.remaining,
          resetAt: rateLimit.resetAt,
        },
      };
    }),

  /**
   * Get user's SMS cost statistics
   */
  getMyCosts: protectedProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return twilioSmsService.getUserSmsCosts(userId, input.startDate, input.endDate);
    }),

  // Admin endpoints

  /**
   * Get aggregate SMS costs (admin only)
   */
  getAggregateCosts: adminProcedure
    .input(z.object({
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input }) => {
      return twilioSmsService.getAggregateCosts(input.startDate, input.endDate);
    }),

  /**
   * Generate cost report (admin only)
   */
  generateCostReport: adminProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ input }) => {
      return smsCostMonitorService.generateCostReport(input.startDate, input.endDate);
    }),

  /**
   * Check cost alerts (admin only)
   */
  checkCostAlerts: adminProcedure
    .query(async () => {
      return smsCostMonitorService.checkAllCosts();
    }),

  /**
   * Detect anomalies (admin only)
   */
  detectAnomalies: adminProcedure
    .query(async () => {
      return smsCostMonitorService.detectAnomalies();
    }),

  /**
   * Manual alert trigger (admin only)
   */
  sendCostAlerts: adminProcedure
    .mutation(async () => {
      const alerts = await smsCostMonitorService.checkAllCosts();
      await smsCostMonitorService.sendCostAlerts(alerts);

      return {
        success: true,
        alertsSent: alerts.length,
        alerts,
      };
    }),
});
