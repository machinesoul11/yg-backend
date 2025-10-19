/**
 * Authentication Router (tRPC)
 * API endpoints for user authentication and authorization
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '@/lib/trpc';
import { AuthService } from '@/lib/services/auth.service';
import { AuditService } from '@/lib/services/audit.service';
import { emailService } from '@/lib/services/email/email.service';
import { prisma } from '@/lib/db';
import { isAuthError } from '@/lib/errors/auth.errors';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  resendVerificationSchema,
  verifyTotpSchema,
  confirmTotpSetupSchema,
  disableTotpSchema,
  verifyBackupCodeSchema,
  verify2FALoginSchema,
  verifyBackupCodeLoginSchema,
  revokeTrustedDeviceSchema,
  loginWithTrustedDeviceSchema,
} from '@/lib/validators/auth.validators';

// Initialize services
const auditService = new AuditService(prisma);
const authService = new AuthService(prisma, emailService, auditService);

/**
 * Helper to extract request context
 */
function getRequestContext(ctx: any) {
  return {
    ipAddress: ctx.req?.ip || ctx.req?.headers?.['x-forwarded-for'] || 'unknown',
    userAgent: ctx.req?.headers?.['user-agent'] || 'unknown',
  };
}

/**
 * Authentication Router
 */
export const authRouter = createTRPCRouter({
  /**
   * Register a new user
   */
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        const result = await authService.registerUser(input, context);

        return {
          success: true,
          data: result,
          meta: {
            message: `Verification email sent to ${result.email}`,
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Registration failed',
        });
      }
    }),

  /**
   * Verify email with token
   */
  verifyEmail: publicProcedure
    .input(verifyEmailSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        await authService.verifyEmail(input.token, context);

        return {
          success: true,
          data: {
            message: 'Email verified successfully',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Email verification failed',
        });
      }
    }),

  /**
   * Resend verification email
   */
  resendVerification: publicProcedure
    .input(resendVerificationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        await authService.resendVerificationEmail(input.email, context);

        return {
          success: true,
          data: {
            message: 'Verification email sent',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        // Silent fail for security
        return {
          success: true,
          data: {
            message: 'If the email exists, a verification email has been sent',
          },
        };
      }
    }),

  /**
   * Login user
   */
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    try {
      const context = getRequestContext(ctx);
      const result = await authService.loginUser(input, context);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if (isAuthError(error)) {
        throw new TRPCError({
          code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
          message: error.message,
          cause: {
            code: error.code,
            statusCode: error.statusCode,
          },
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Login failed',
      });
    }
  }),

  /**
   * Request password reset
   */
  requestPasswordReset: publicProcedure
    .input(requestPasswordResetSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        await authService.requestPasswordReset(input.email, context);

        return {
          success: true,
          data: {
            message:
              'If an account exists with this email, a password reset link has been sent',
          },
        };
      } catch (error) {
        // Always return success for security (don't leak user existence)
        return {
          success: true,
          data: {
            message:
              'If an account exists with this email, a password reset link has been sent',
          },
        };
      }
    }),

  /**
   * Reset password with token
   */
  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        await authService.resetPassword(input, context);

        return {
          success: true,
          data: {
            message: 'Password reset successfully',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Password reset failed',
        });
      }
    }),

  /**
   * Get current session user
   */
  getSession: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    return {
      data: {
        user,
      },
    };
  }),

  /**
   * Update user profile
   */
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.updateProfile(ctx.session.user.id, input, context);

        const updatedUser = await prisma.user.findUnique({
          where: { id: ctx.session.user.id },
          select: {
            id: true,
            email: true,
            name: true,
            avatar: true,
            role: true,
            updatedAt: true,
          },
        });

        return {
          success: true,
          data: {
            user: updatedUser,
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Profile update failed',
        });
      }
    }),

  /**
   * Change password
   */
  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.changePassword(ctx.session.user.id, input, context);

        return {
          success: true,
          data: {
            message: 'Password changed successfully',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code:
              error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Password change failed',
        });
      }
    }),

  /**
   * Delete account (soft delete)
   */
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      const context = getRequestContext(ctx);
      await authService.deleteAccount(ctx.session.user.id, context);

      return {
        success: true,
        data: {
          message: 'Account deletion scheduled. Your data will be permanently deleted in 30 days.',
        },
      };
    } catch (error) {
      if (isAuthError(error)) {
        throw new TRPCError({
          code: error.statusCode === 409 ? 'CONFLICT' : 'BAD_REQUEST',
          message: error.message,
          cause: {
            code: error.code,
            statusCode: error.statusCode,
          },
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Account deletion failed',
      });
    }
  }),

  /**
   * ======================================================================
   * TOTP (Two-Factor Authentication) Endpoints
   * ======================================================================
   */

  /**
   * Initiate TOTP setup
   * Returns QR code and manual entry key
   */
  totpSetup: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      const context = getRequestContext(ctx);
      const setupData = await authService.initiateTotpSetup(
        ctx.session.user.id,
        context
      );

      return {
        success: true,
        data: {
          qrCodeDataUrl: setupData.qrCodeDataUrl,
          manualEntryKey: setupData.manualEntryKey,
          message: 'Scan QR code with your authenticator app or enter the key manually',
        },
      };
    } catch (error) {
      if (isAuthError(error)) {
        throw new TRPCError({
          code: error.statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: error.message,
          cause: {
            code: error.code,
            statusCode: error.statusCode,
          },
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'TOTP setup failed',
      });
    }
  }),

  /**
   * Confirm TOTP setup with verification code
   * Enables TOTP and returns backup codes
   */
  totpConfirm: protectedProcedure
    .input(confirmTotpSetupSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        const result = await authService.confirmTotpSetup(
          ctx.session.user.id,
          input,
          context
        );

        return {
          success: true,
          data: {
            backupCodes: result.backupCodes,
            message: 'Two-factor authentication enabled successfully. Save your backup codes in a secure location.',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'TOTP confirmation failed',
        });
      }
    }),

  /**
   * Verify TOTP code during login
   */
  totpVerify: protectedProcedure
    .input(verifyTotpSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.verifyTotpForLogin(
          ctx.session.user.id,
          input,
          context
        );

        return {
          success: true,
          data: {
            message: 'Two-factor authentication verified',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'TOTP verification failed',
        });
      }
    }),

  /**
   * Verify backup code during login
   */
  backupCodeVerify: protectedProcedure
    .input(verifyBackupCodeSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.verifyBackupCodeForLogin(
          ctx.session.user.id,
          input,
          context
        );

        return {
          success: true,
          data: {
            message: 'Backup code verified',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Backup code verification failed',
        });
      }
    }),

  /**
   * Disable TOTP
   */
  totpDisable: protectedProcedure
    .input(disableTotpSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.disableTotp(ctx.session.user.id, input, context);

        return {
          success: true,
          data: {
            message: 'Two-factor authentication disabled',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'TOTP disable failed',
        });
      }
    }),

  /**
   * Regenerate backup codes
   */
  backupCodesRegenerate: protectedProcedure
    .input(z.object({ password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        const result = await authService.regenerateBackupCodes(
          ctx.session.user.id,
          input.password,
          context
        );

        return {
          success: true,
          data: {
            backupCodes: result.backupCodes,
            message: 'New backup codes generated. Save them in a secure location.',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Backup code regeneration failed',
        });
      }
    }),

  /**
   * Get TOTP status
   */
  totpStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      const status = await authService.getTotpStatus(ctx.session.user.id);

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      if (isAuthError(error)) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: error.message,
        });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get TOTP status',
      });
    }
  }),

  /**
   * ======================================================================
   * Multi-Step Login Endpoints
   * ======================================================================
   */

  /**
   * Verify 2FA code and complete login (Step 2)
   */
  verify2FALogin: publicProcedure
    .input(verify2FALoginSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        const result = await authService.verify2FALogin(input, context);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '2FA verification failed',
        });
      }
    }),

  /**
   * Verify backup code and complete login (Step 2 alternative)
   */
  verifyBackupCodeLogin: publicProcedure
    .input(verifyBackupCodeLoginSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const context = getRequestContext(ctx);
        const result = await authService.verifyBackupCodeLogin(input, context);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: error.statusCode === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST',
            message: error.message,
            cause: {
              code: error.code,
              statusCode: error.statusCode,
            },
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Backup code verification failed',
        });
      }
    }),

  /**
   * ======================================================================
   * Trusted Device Management Endpoints
   * ======================================================================
   */

  /**
   * Get all trusted devices for current user
   */
  getTrustedDevices: protectedProcedure.query(async ({ ctx }) => {
    try {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      const devices = await authService.getTrustedDevices(ctx.session.user.id);

      return {
        success: true,
        data: devices,
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get trusted devices',
      });
    }
  }),

  /**
   * Revoke a specific trusted device
   */
  revokeTrustedDevice: protectedProcedure
    .input(revokeTrustedDeviceSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.session?.user) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          });
        }

        const context = getRequestContext(ctx);
        await authService.revokeTrustedDevice(ctx.session.user.id, input, context);

        return {
          success: true,
          data: {
            message: 'Trusted device revoked successfully',
          },
        };
      } catch (error) {
        if (isAuthError(error)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to revoke trusted device',
        });
      }
    }),

  /**
   * Revoke all trusted devices
   */
  revokeAllTrustedDevices: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      if (!ctx.session?.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      const context = getRequestContext(ctx);
      const count = await authService.revokeAllTrustedDevices(
        ctx.session.user.id,
        context
      );

      return {
        success: true,
        data: {
          message: `Successfully revoked ${count} trusted device(s)`,
          devicesRevoked: count,
        },
      };
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to revoke trusted devices',
      });
    }
  }),
});
