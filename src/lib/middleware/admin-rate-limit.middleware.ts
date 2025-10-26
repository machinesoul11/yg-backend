/**
 * Admin Rate Limiting Middleware
 * tRPC middleware for enforcing admin-specific rate limits
 * 
 * Usage:
 * - Apply to role management endpoints: .use(withAdminRateLimit('role_management'))
 * - Apply to approval endpoints: .use(withAdminRateLimit('approval_actions'))
 * - Apply to read endpoints: .use(withAdminRateLimit('read_operations'))
 */

import { TRPCError } from '@trpc/server';
import { adminRateLimitService, type AdminRateLimitTier } from '../services/admin-rate-limit.service';

/**
 * Middleware function for admin rate limiting
 * 
 * @param tier - Rate limit tier to apply
 * @returns Middleware function compatible with tRPC
 */
export function withAdminRateLimit(tier: AdminRateLimitTier) {
  return async function ({ ctx, next }: any) {
    // Only apply to authenticated users
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const userId = ctx.session.user.id;

    try {
      // Check rate limit
      const result = await adminRateLimitService.checkLimit(userId, tier);

      if (!result.allowed) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Admin rate limit exceeded for ${tier}. Limit: ${result.limit}/hour. Resets at ${result.resetAt.toISOString()}`,
          cause: {
            rateLimitInfo: {
              tier: result.tier,
              limit: result.limit,
              current: result.current,
              remaining: result.remaining,
              resetAt: result.resetAt,
            },
          },
        });
      }

      // Pass through - rate limit check passed
      return next({ ctx });
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }

      console.error('[AdminRateLimitMiddleware] Error:', error);
      
      // Fail open - allow request if rate limiting fails
      return next({ ctx });
    }
  };
}

/**
 * Middleware for role management endpoints (10/hour)
 */
export const withRoleManagementRateLimit = withAdminRateLimit('role_management');

/**
 * Middleware for approval action endpoints (50/hour)
 */
export const withApprovalActionRateLimit = withAdminRateLimit('approval_actions');

/**
 * Middleware for read operation endpoints (500/hour)
 */
export const withReadOperationRateLimit = withAdminRateLimit('read_operations');
