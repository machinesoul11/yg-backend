/**
 * Approval Workflow Middleware for tRPC
 * 
 * Provides middleware for conditional execution based on user seniority and approval requirements.
 * This middleware intercepts actions that require approval and either:
 * - Executes immediately if user has senior-level authorization
 * - Creates an approval request if user requires authorization
 * 
 * Integrates with existing approval system in @/permissions/approvalRules
 * 
 * @module middleware/approval
 * 
 * @example
 * ```typescript
 * import { requireApprovalOrExecute } from '@/lib/middleware/approval.middleware';
 * import { PERMISSIONS } from '@/lib/constants/permissions';
 * 
 * const deleteUserProcedure = protectedProcedure
 *   .use(requireApprovalOrExecute({
 *     actionType: PERMISSIONS.USERS_DELETE_USER,
 *     getDepartment: (ctx) => ctx.session.user.department,
 *     getDataPayload: (input) => ({ userId: input.userId }),
 *   }))
 *   .mutation(async ({ ctx, input }) => {
 *     // This code only executes if:
 *     // 1. User is senior and allowed immediate execution, OR
 *     // 2. Approval was already granted
 *     return await deleteUser(input.userId);
 *   });
 * ```
 */

import { TRPCError } from '@trpc/server';
import { Department } from '@prisma/client';
import { Permission } from '@/lib/constants/permissions';
import { PermissionService } from '@/lib/services/permission.service';
import { AuditService } from '@/lib/services/audit.service';
import { approvalRequestService } from '@/lib/services/approval-request.service';
import { prisma } from '@/lib/db';
import {
  requiresApproval,
  type ApprovalRequest,
} from '@/permissions/approvalRules';

// Initialize services
const auditService = new AuditService(prisma);
const permissionService = new PermissionService(prisma, auditService);

/**
 * Context shape for approval middleware
 */
interface ApprovalContext {
  session: {
    user: {
      id: string;
      role: string;
      department?: Department;
      [key: string]: any;
    };
  };
  db: typeof prisma;
}

/**
 * Configuration for requireApprovalOrExecute middleware
 */
export interface ApprovalOrExecuteConfig<TInput = any> {
  /**
   * The action type/permission that may require approval
   * Should match a key in REQUIRES_SENIOR_APPROVAL configuration
   */
  actionType: Permission | string;

  /**
   * Function to extract the department for the approval request
   * Required for routing approval to correct department
   */
  getDepartment: (ctx: ApprovalContext) => Department | Promise<Department>;

  /**
   * Function to extract data payload from input
   * This data is stored with the approval request and used for execution
   */
  getDataPayload: (input: TInput) => Record<string, any> | Promise<Record<string, any>>;

  /**
   * Optional metadata to include with approval request
   */
  getMetadata?: (input: TInput, ctx: ApprovalContext) => Record<string, any> | Promise<Record<string, any>>;

  /**
   * Custom message when approval is required
   */
  approvalRequiredMessage?: string;

  /**
   * Whether to skip approval check and always execute
   * Useful for testing or emergency override scenarios
   */
  skipApprovalCheck?: boolean;
}

/**
 * Response type when action requires approval
 */
export interface ApprovalRequiredResponse {
  requiresApproval: true;
  approvalRequestId: string;
  message: string;
  approvalRequest: ApprovalRequest;
}

/**
 * Type guard to check if response is an approval-required response
 */
export function isApprovalRequired(result: any): result is ApprovalRequiredResponse {
  return result && result.requiresApproval === true && !!result.approvalRequestId;
}

/**
 * Middleware: Require Approval or Execute
 * 
 * This middleware determines whether an action can be executed immediately or requires approval.
 * It checks:
 * 1. Whether the action type is configured to require approval
 * 2. Whether the specific action context triggers approval requirements (thresholds, conditions)
 * 3. Whether the current user has senior-level authority to bypass approval
 * 
 * If approval is required and user is not senior:
 * - Creates an approval request in the database
 * - Returns approval-required response (does NOT execute the procedure)
 * - Response includes approval request ID for tracking
 * 
 * If user is senior or approval not required:
 * - Allows normal procedure execution
 * - Procedure handler executes as normal
 * 
 * @param config - Configuration for approval workflow
 * @returns Middleware function for tRPC
 * 
 * @example
 * ```typescript
 * // Large payout that requires approval for junior staff
 * const initiatePayoutProcedure = protectedProcedure
 *   .input(z.object({
 *     amountCents: z.number(),
 *     payoutId: z.string(),
 *   }))
 *   .use(requireApprovalOrExecute({
 *     actionType: PERMISSIONS.FINANCE_INITIATE_PAYOUTS,
 *     getDepartment: () => Department.FINANCE_LICENSING,
 *     getDataPayload: (input) => ({
 *       amountCents: input.amountCents,
 *       payoutId: input.payoutId,
 *     }),
 *   }))
 *   .mutation(async ({ ctx, input }) => {
 *     // Only executes if senior or approved
 *     return await processPayout(input.payoutId);
 *   });
 * ```
 */
export function requireApprovalOrExecute<TInput = any>(
  config: ApprovalOrExecuteConfig<TInput>
) {
  return async ({ 
    ctx, 
    input, 
    next 
  }: { 
    ctx: ApprovalContext; 
    input: TInput; 
    next: any 
  }): Promise<any> => {
    try {
      // Step 1: Verify authentication
      if (!ctx.session?.user?.id) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
      }

      const userId = ctx.session.user.id;

      // Step 2: Skip approval check if configured (emergency override)
      if (config.skipApprovalCheck) {
        return next({ ctx });
      }

      // Step 3: Extract data payload and department
      const dataPayload = await Promise.resolve(config.getDataPayload(input));
      const department = await Promise.resolve(config.getDepartment(ctx));

      // Step 4: Get user's admin roles for approval checking
      const userWithRoles = await ctx.db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          adminRoles: {
            where: { 
              isActive: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
            select: {
              department: true,
              seniority: true,
              isActive: true,
            },
          },
        },
      });

      if (!userWithRoles) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not found',
        });
      }

      // Step 5: Check if this action requires approval for this user
      const needsApproval = await requiresApproval(
        config.actionType,
        dataPayload,
        {
          id: userId,
          role: userWithRoles.role,
          adminRoles: userWithRoles.adminRoles,
        }
      );

      // Step 6: If approval not required, proceed with execution
      if (!needsApproval) {
        // Log that action was executed without approval requirement
        await auditService.log({
          action: 'ACTION_EXECUTED_WITHOUT_APPROVAL',
          entityType: 'approval',
          entityId: userId,
          userId,
          after: {
            actionType: config.actionType,
            reason: 'Action does not meet approval criteria',
          },
        });

        return next({ ctx });
      }

      // Step 7: Action requires approval - check if user is senior
      const isSenior = await permissionService.isSenior(userId);

      // Step 8: Senior users can execute immediately
      if (isSenior) {
        // Log senior-level execution
        await auditService.log({
          action: 'SENIOR_DIRECT_EXECUTION',
          entityType: 'approval',
          entityId: userId,
          userId,
          after: {
            actionType: config.actionType,
            dataPayload,
            reason: 'User has senior-level authority for immediate execution',
          },
        });

        return next({ ctx });
      }

      // Step 9: User is not senior - create approval request
      const metadata = config.getMetadata 
        ? await Promise.resolve(config.getMetadata(input, ctx))
        : undefined;

      // Extract request context for audit trail
      const requestContext = {
        ipAddress: (ctx as any).ip || (ctx as any).req?.ip,
        userAgent: (ctx as any).userAgent || (ctx as any).req?.headers?.['user-agent'],
        sessionId: ctx.session?.user?.sessionId,
        requestId: (ctx as any).requestId,
        timestamp: new Date(),
      };

      // Create approval request with full context using the service
      const result = await approvalRequestService.createApprovalRequest({
        actionType: config.actionType,
        requestedBy: userId,
        department,
        dataPayload,
        context: requestContext,
        metadata: {
          ...metadata,
          userEmail: userWithRoles.email,
        },
      });

      // Step 10: Return approval-required response instead of executing
      // This prevents the procedure handler from running
      const response: ApprovalRequiredResponse = {
        requiresApproval: true,
        approvalRequestId: result.approvalRequest.id,
        message: config.approvalRequiredMessage || 
          `This action requires senior approval. Approval request #${result.approvalRequest.id} has been created and is pending review. ${result.notificationsSent} admin(s) have been notified.`,
        approvalRequest: result.approvalRequest,
      };

      // Return the approval response directly, bypassing next()
      // This prevents procedure handler execution
      return response;

    } catch (error) {
      // Handle known errors
      if (error instanceof TRPCError) {
        throw error;
      }

      // Log unexpected errors
      console.error('[ApprovalMiddleware] Unexpected error in requireApprovalOrExecute:', error);

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while processing approval workflow',
        cause: error,
      });
    }
  };
}

/**
 * Middleware: Require Senior Level
 * 
 * Simpler middleware that just checks if user has senior seniority.
 * Does not create approval requests - simply blocks non-senior users.
 * 
 * @param customMessage - Optional custom error message
 * @returns Middleware function
 * 
 * @example
 * ```typescript
 * const criticalOperationProcedure = protectedProcedure
 *   .use(requireSenior())
 *   .mutation(async ({ ctx, input }) => {
 *     // Only senior users can execute this
 *     return await performCriticalOperation();
 *   });
 * ```
 */
export function requireSenior(customMessage?: string) {
  return async ({ ctx, next }: { ctx: ApprovalContext; next: any }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    const isSenior = await permissionService.isSenior(ctx.session.user.id);

    if (!isSenior) {
      // Log denied access
      await auditService.log({
        action: 'SENIOR_ACCESS_DENIED',
        entityType: 'user',
        entityId: ctx.session.user.id,
        userId: ctx.session.user.id,
        after: {
          reason: 'User does not have senior-level seniority',
        },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: customMessage || 'This action requires senior-level access',
      });
    }

    // Log senior access granted
    await auditService.log({
      action: 'SENIOR_ACCESS_GRANTED',
      entityType: 'user',
      entityId: ctx.session.user.id,
      userId: ctx.session.user.id,
      after: {
        reason: 'User has senior-level seniority',
      },
    });

    return next({ ctx });
  };
}

/**
 * Export permission service for direct use
 */
export { permissionService };
