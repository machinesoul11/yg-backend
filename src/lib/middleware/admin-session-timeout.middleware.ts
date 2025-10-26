/**
 * Admin Session Timeout Middleware
 * Enforces 30-minute session timeout for admin users
 * 
 * Usage in tRPC routers:
 * - Apply to all admin procedures: adminProcedure.use(checkAdminSessionTimeout)
 */

import { TRPCError } from '@trpc/server';
import { AdminSessionSecurityService } from '../services/admin-session-security.service';
import { prisma } from '../db';

const adminSessionService = new AdminSessionSecurityService(prisma);

/**
 * Middleware to check admin session timeout
 * Enforces 30-minute inactivity timeout for admin users
 */
export async function checkAdminSessionTimeout({ ctx, next }: any) {
  // Only apply to authenticated admin users
  if (!ctx.session?.user) {
    return next({ ctx });
  }

  const user = ctx.session.user;

  // Only check timeout for admin users
  if (user.role !== 'ADMIN') {
    return next({ ctx });
  }

  try {
    // Get session token from request headers or cookies
    // This assumes the session token is available in the context
    const sessionToken = ctx.req?.headers?.get?.('authorization')?.replace('Bearer ', '') || 
                        ctx.session.sessionToken;

    if (!sessionToken) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Session token not found',
      });
    }

    // Check admin session status
    const sessionStatus = await adminSessionService.checkAdminSession(user.id, sessionToken);

    if (!sessionStatus.isActive) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Admin session has expired due to inactivity',
        cause: {
          errorCode: 'SESSION_TIMEOUT',
          reason: 'Admin session timed out after 30 minutes of inactivity',
          requiresLogin: true,
        },
      });
    }

    // Update activity timestamp (rate-limited to once per minute)
    await adminSessionService.updateAdminActivity(sessionToken);

    // Add session info to context for potential use in procedures
    return next({
      ctx: {
        ...ctx,
        adminSession: sessionStatus,
      },
    });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error('[AdminSessionTimeout] Error checking session:', error);
    
    // Fail open for non-timeout errors
    return next({ ctx });
  }
}

/**
 * Middleware to require recent 2FA for sensitive operations
 * Only applies if user has 2FA enabled
 */
export async function requireRecent2FA({ ctx, next }: any) {
  // Only apply to authenticated admin users
  if (!ctx.session?.user || ctx.session.user.role !== 'ADMIN') {
    return next({ ctx });
  }

  const userId = ctx.session.user.id;

  try {
    // Check if 2FA is required
    const requires2FA = await adminSessionService.requires2FA(userId);

    if (!requires2FA) {
      return next({ ctx });
    }

    // Check for recent 2FA verification (within 15 minutes)
    const hasRecent2FA = await adminSessionService.hasRecent2FAVerification(userId);

    if (!hasRecent2FA) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '2FA verification required',
        cause: {
          errorCode: '2FA_REQUIRED',
          reason: 'This sensitive operation requires recent 2FA verification',
          requiresVerification: true,
        },
      });
    }

    return next({ ctx });
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }

    console.error('[RequireRecent2FA] Error:', error);
    
    // Fail open for non-2FA errors
    return next({ ctx });
  }
}
