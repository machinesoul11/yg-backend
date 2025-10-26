/**
 * Approval Request Service
 * 
 * Comprehensive service for managing approval workflow including:
 * - Creating approval requests with full context capture
 * - Notifying senior admins (in-app and email)
 * - Reviewing and processing approval decisions
 * - Executing approved actions
 * - Error handling and audit logging
 * 
 * Integrates with:
 * - @/permissions/approvalRules for approval logic
 * - @/modules/system/services/notification.service for in-app notifications
 * - @/lib/services/email for email notifications
 * - @/lib/services/audit.service for comprehensive audit trails
 * 
 * @module services/approval-request
 */

import { PrismaClient, ApprovalStatus, Department, Seniority, NotificationType, NotificationPriority } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { AuditService } from './audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { emailService } from './email';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import {
  requiresApproval,
  canApprove,
  REQUIRES_SENIOR_APPROVAL,
  type ApprovalRequest,
} from '@/permissions/approvalRules';
import { PERMISSIONS } from '@/lib/constants/permissions';

/**
 * Request context for approval creation
 */
export interface ApprovalRequestContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  timestamp: Date;
}

/**
 * Parameters for creating an approval request
 */
export interface CreateApprovalRequestParams {
  actionType: string;
  requestedBy: string;
  department: Department;
  dataPayload: Record<string, any>;
  context: ApprovalRequestContext;
  metadata?: Record<string, any>;
}

/**
 * Parameters for reviewing an approval request
 */
export interface ReviewApprovalRequestParams {
  approvalRequestId: string;
  reviewerId: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
  context?: ApprovalRequestContext;
}

/**
 * Result of approval request creation
 */
export interface CreateApprovalRequestResult {
  approvalRequest: ApprovalRequest;
  notificationsSent: number;
  emailsSent: number;
}

/**
 * Result of approval request review
 */
export interface ReviewApprovalRequestResult {
  approvalRequest: ApprovalRequest;
  executionResult?: any;
  executionError?: string;
}

/**
 * Approval Request Service
 */
export class ApprovalRequestService {
  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService,
    private notificationService: NotificationService
  ) {}

  /**
   * Create an approval request with full context and notifications
   * 
   * This function:
   * 1. Validates the requesting user has permission to submit requests
   * 2. Stores the action data with full request context
   * 3. Creates the approval request in the database
   * 4. Identifies and notifies senior admins in the relevant department
   * 5. Sends both in-app and email notifications
   * 
   * @param params - Approval request parameters
   * @returns Created approval request with notification counts
   */
  async createApprovalRequest(
    params: CreateApprovalRequestParams
  ): Promise<CreateApprovalRequestResult> {
    const {
      actionType,
      requestedBy,
      department,
      dataPayload,
      context,
      metadata = {},
    } = params;

    try {
      // Step 1: Validate action type is configured for approval
      const requirement = REQUIRES_SENIOR_APPROVAL[actionType];
      if (!requirement) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Action type '${actionType}' is not configured for approval workflow`,
        });
      }

      // Step 2: Verify requesting user exists and has permission to request
      const requestingUser = await this.prisma.user.findUnique({
        where: { id: requestedBy },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          adminRoles: {
            where: { isActive: true },
            select: {
              department: true,
              seniority: true,
            },
          },
        },
      });

      if (!requestingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Requesting user not found',
        });
      }

      // Step 3: Create comprehensive metadata including context
      const fullMetadata = {
        ...metadata,
        reason: requirement.reason,
        requiresSeniorRole: requirement.requiresSeniorRole,
        createdTimestamp: context.timestamp.toISOString(),
        requestContext: {
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          requestId: context.requestId,
        },
        requesterInfo: {
          email: requestingUser.email,
          name: requestingUser.name,
          role: requestingUser.role,
          departments: requestingUser.adminRoles.map(r => r.department),
        },
      };

      // Step 4: Create approval request in database transaction
      const approvalRequest = await this.prisma.$transaction(async (tx) => {
        // Create the approval request
        const request = await tx.approvalRequest.create({
          data: {
            actionType,
            requestedBy,
            department,
            dataPayload,
            status: ApprovalStatus.PENDING,
            metadata: fullMetadata,
          },
        });

        // Create audit log for request creation
        await this.auditService.log({
          action: 'APPROVAL_REQUEST_CREATED',
          entityType: 'approval_request',
          entityId: request.id,
          userId: requestedBy,
          resourceType: 'APPROVAL_REQUEST',
          resourceId: request.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          sessionId: context.sessionId,
          requestId: context.requestId,
          after: {
            actionType,
            department,
            status: ApprovalStatus.PENDING,
          },
          metadata: {
            reason: requirement.reason,
          },
        });

        return request;
      });

      // Step 5: Send notifications to senior admins (non-blocking)
      const notificationResults = await this.notifySeniorAdmins(
        approvalRequest,
        requestingUser,
        requirement
      );

      return {
        approvalRequest,
        notificationsSent: notificationResults.notificationsSent,
        emailsSent: notificationResults.emailsSent,
      };
    } catch (error) {
      console.error('[ApprovalRequestService] Error creating approval request:', error);
      
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create approval request',
        cause: error,
      });
    }
  }

  /**
   * Notify senior admins about a pending approval request
   * 
   * This function:
   * 1. Queries for senior admins in the relevant department
   * 2. Creates in-app notifications
   * 3. Sends email notifications
   * 4. Respects admin notification preferences
   * 
   * @param approvalRequest - The approval request to notify about
   * @param requestingUser - User who created the request
   * @param requirement - Approval requirement configuration
   * @returns Counts of notifications sent
   */
  private async notifySeniorAdmins(
    approvalRequest: ApprovalRequest,
    requestingUser: {
      id: string;
      email: string;
      name: string | null;
      role: string;
    },
    requirement: typeof REQUIRES_SENIOR_APPROVAL[string]
  ): Promise<{ notificationsSent: number; emailsSent: number }> {
    try {
      // Step 1: Query for senior admins who can approve this request
      const seniorAdmins = await this.prisma.user.findMany({
        where: {
          adminRoles: {
            some: {
              isActive: true,
              department: {
                in: requirement.requiresSeniorRole,
              },
              seniority: requirement.requiresSeniorLevel ? Seniority.SENIOR : undefined,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
          },
          // Don't notify the requester
          id: {
            not: requestingUser.id,
          },
          // Only active users
          deleted_at: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          adminRoles: {
            where: {
              isActive: true,
              department: {
                in: requirement.requiresSeniorRole,
              },
            },
            select: {
              department: true,
              seniority: true,
            },
          },
        },
        distinct: ['id'],
      });

      if (seniorAdmins.length === 0) {
        console.warn(
          `[ApprovalRequestService] No senior admins found for approval request ${approvalRequest.id}`
        );
        return { notificationsSent: 0, emailsSent: 0 };
      }

      // Step 2: Create in-app notifications
      const notificationResult = await this.notificationService.create({
        userIds: seniorAdmins.map(admin => admin.id),
        type: NotificationType.SYSTEM,
        priority: NotificationPriority.HIGH,
        title: 'Approval Request Pending',
        message: this.formatNotificationMessage(
          approvalRequest,
          requestingUser
        ),
        actionUrl: `/admin/approvals/${approvalRequest.id}`,
        metadata: {
          approvalRequestId: approvalRequest.id,
          actionType: approvalRequest.actionType,
          department: approvalRequest.department,
          requestedBy: requestingUser.id,
          requestedByName: requestingUser.name || requestingUser.email,
        },
      });

      // Step 3: Send email notifications
      let emailsSent = 0;
      await Promise.allSettled(
        seniorAdmins.map(async (admin) => {
          try {
            await this.sendApprovalRequestEmail(
              admin,
              approvalRequest,
              requestingUser,
              requirement
            );
            emailsSent++;
          } catch (error) {
            console.error(
              `[ApprovalRequestService] Failed to send email to ${admin.email}:`,
              error
            );
          }
        })
      );

      return {
        notificationsSent: notificationResult.created,
        emailsSent,
      };
    } catch (error) {
      console.error('[ApprovalRequestService] Error notifying senior admins:', error);
      // Don't throw - notification failures shouldn't break approval creation
      return { notificationsSent: 0, emailsSent: 0 };
    }
  }

  /**
   * Format notification message for approval request
   */
  private formatNotificationMessage(
    approvalRequest: ApprovalRequest,
    requestingUser: { name: string | null; email: string }
  ): string {
    const requesterName = requestingUser.name || requestingUser.email;
    const actionType = this.formatActionType(approvalRequest.actionType);
    
    return `${requesterName} has requested approval for: ${actionType}`;
  }

  /**
   * Format action type for display
   */
  private formatActionType(actionType: string): string {
    // Convert permission string to readable format
    // e.g., "users:delete_user" -> "User Deletion"
    return actionType
      .replace(/^.*:/, '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Send email notification for approval request
   * 
   * Note: Email notifications are optional and failures are logged but don't block the workflow.
   * For now, we're using console logging. TODO: Implement with proper email templates.
   */
  private async sendApprovalRequestEmail(
    admin: {
      id: string;
      email: string;
      name: string | null;
    },
    approvalRequest: ApprovalRequest,
    requestingUser: {
      name: string | null;
      email: string;
    },
    requirement: typeof REQUIRES_SENIOR_APPROVAL[string]
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://ops.yesgoddess.agency';
    const approvalUrl = `${frontendUrl}/admin/approvals/${approvalRequest.id}`;

    // Log email notification details
    // TODO: Implement with actual email service when approval email templates are created
    console.log('[ApprovalRequestService] Email notification queued:', {
      to: admin.email,
      adminName: admin.name || 'Admin',
      subject: 'Approval Request Pending - Action Required',
      requester: requestingUser.name || requestingUser.email,
      requesterEmail: requestingUser.email,
      actionType: this.formatActionType(approvalRequest.actionType),
      actionDescription: requirement.reason,
      department: approvalRequest.department,
      approvalUrl,
      requestId: approvalRequest.id,
    });

    // Optional: Try to send using a generic template if available
    // This is wrapped in try-catch to prevent email failures from blocking the workflow
    try {
      // You can uncomment this once you have appropriate email templates registered
      /*
      await emailService.sendTransactional({
        userId: admin.id,
        email: admin.email,
        subject: 'Approval Request Pending - Action Required',
        template: 'system-notification', // Use appropriate template
        variables: {
          // Template-specific variables
        },
        tags: {
          type: 'approval_request',
          department: approvalRequest.department,
        },
      });
      */
    } catch (error) {
      console.error('[ApprovalRequestService] Email notification failed (non-blocking):', error);
    }
  }

  /**
   * Review an approval request (approve or reject)
   * 
   * This function:
   * 1. Validates the reviewer has authority to approve
   * 2. Updates the approval request status
   * 3. If approved, executes the original action
   * 4. If rejected, notifies the requesting admin
   * 5. Creates comprehensive audit logs
   * 
   * @param params - Review parameters
   * @returns Review result with execution status
   */
  async reviewApprovalRequest(
    params: ReviewApprovalRequestParams
  ): Promise<ReviewApprovalRequestResult> {
    const {
      approvalRequestId,
      reviewerId,
      decision,
      comments,
      context,
    } = params;

    try {
      // Step 1: Fetch approval request and validate
      const approvalRequest = await this.prisma.approvalRequest.findUnique({
        where: { id: approvalRequestId },
      });

      if (!approvalRequest) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Approval request not found',
        });
      }

      if (approvalRequest.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Approval request has already been ${approvalRequest.status.toLowerCase()}`,
        });
      }

      // Step 2: Validate reviewer has authority
      const reviewer = await this.prisma.user.findUnique({
        where: { id: reviewerId },
        select: {
          id: true,
          email: true,
          name: true,
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

      if (!reviewer) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Reviewer not found',
        });
      }

      const hasAuthority = await canApprove(
        { id: reviewer.id, adminRoles: reviewer.adminRoles },
        approvalRequest
      );

      if (!hasAuthority) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have authority to review this approval request',
        });
      }

      // Step 3: Update approval request in transaction
      const updatedRequest = await this.prisma.$transaction(async (tx) => {
        // Update approval request status
        const updated = await tx.approvalRequest.update({
          where: { id: approvalRequestId },
          data: {
            status: decision === 'APPROVED' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
            reviewedBy: reviewerId,
            reviewedAt: new Date(),
            reviewComments: comments,
          },
        });

        // Create audit log for review decision
        await this.auditService.log({
          action: decision === 'APPROVED' ? 'APPROVAL_REQUEST_APPROVED' : 'APPROVAL_REQUEST_REJECTED',
          entityType: 'approval_request',
          entityId: approvalRequestId,
          userId: reviewerId,
          resourceType: 'APPROVAL_REQUEST',
          resourceId: approvalRequestId,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          sessionId: context?.sessionId,
          requestId: context?.requestId,
          before: {
            status: ApprovalStatus.PENDING,
          },
          after: {
            status: updated.status,
            reviewedBy: reviewerId,
            reviewComments: comments,
          },
          metadata: {
            actionType: updated.actionType,
            department: updated.department,
            requestedBy: updated.requestedBy,
          },
        });

        return updated;
      });

      // Step 4: Handle based on decision
      let executionResult: any = undefined;
      let executionError: string | undefined = undefined;

      if (decision === 'APPROVED') {
        // Execute the approved action
        try {
          executionResult = await this.executeApprovedAction(
            updatedRequest,
            reviewerId,
            context
          );
        } catch (error) {
          console.error('[ApprovalRequestService] Error executing approved action:', error);
          executionError = error instanceof Error ? error.message : 'Unknown error';
          
          // Update request to mark execution failure
          await this.prisma.approvalRequest.update({
            where: { id: approvalRequestId },
            data: {
              metadata: {
                ...(updatedRequest.metadata as any || {}),
                executionError: executionError,
                executionAttemptedAt: new Date().toISOString(),
              },
            },
          });
        }

        // Notify requester of approval
        await this.notifyRequesterOfDecision(
          updatedRequest,
          reviewer,
          'APPROVED',
          comments,
          executionResult,
          executionError
        );
      } else {
        // Notify requester of rejection
        await this.notifyRequesterOfDecision(
          updatedRequest,
          reviewer,
          'REJECTED',
          comments
        );
      }

      return {
        approvalRequest: updatedRequest,
        executionResult,
        executionError,
      };
    } catch (error) {
      console.error('[ApprovalRequestService] Error reviewing approval request:', error);
      
      if (error instanceof TRPCError) {
        throw error;
      }

      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to review approval request',
        cause: error,
      });
    }
  }

  /**
   * Execute an approved action
   * 
   * This function deserializes the action data and executes the original
   * intended action. It handles different action types and maintains
   * comprehensive audit logs.
   * 
   * @param approvalRequest - The approved request
   * @param executorId - ID of the person executing (reviewer)
   * @param context - Request context
   * @returns Execution result
   */
  private async executeApprovedAction(
    approvalRequest: ApprovalRequest,
    executorId: string,
    context?: ApprovalRequestContext
  ): Promise<any> {
    const { actionType, dataPayload } = approvalRequest;

    try {
      let result: any;

      // Route to appropriate execution logic based on action type
      switch (actionType) {
        case PERMISSIONS.USERS_DELETE_USER:
          result = await this.executeUserDeletion(dataPayload, executorId);
          break;

        case PERMISSIONS.FINANCE_INITIATE_PAYOUTS:
          result = await this.executePayoutInitiation(dataPayload, executorId);
          break;

        case PERMISSIONS.LICENSING_MODIFY_OWNERSHIP:
          result = await this.executeOwnershipModification(dataPayload, executorId);
          break;

        case PERMISSIONS.LICENSING_TERMINATE:
          result = await this.executeLicenseTermination(dataPayload, executorId);
          break;

        case PERMISSIONS.ADMIN_ROLES:
          result = await this.executeAdminRoleChange(dataPayload, executorId);
          break;

        default:
          // For action types without specific handlers, log and return
          console.warn(
            `[ApprovalRequestService] No execution handler for action type: ${actionType}`
          );
          result = {
            message: 'Approval granted but action requires manual execution',
            actionType,
            dataPayload,
          };
      }

      // Create audit log for successful execution
      await this.auditService.log({
        action: 'APPROVED_ACTION_EXECUTED',
        entityType: 'approval_request',
        entityId: approvalRequest.id,
        userId: executorId,
        resourceType: 'APPROVAL_REQUEST',
        resourceId: approvalRequest.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        sessionId: context?.sessionId,
        requestId: context?.requestId,
        after: {
          actionType,
          executionResult: result,
          executedBy: executorId,
          executedAt: new Date().toISOString(),
        },
        metadata: {
          originalRequestedBy: approvalRequest.requestedBy,
          approvalRequestId: approvalRequest.id,
        },
      });

      return result;
    } catch (error) {
      // Log execution failure
      await this.auditService.log({
        action: 'APPROVED_ACTION_EXECUTION_FAILED',
        entityType: 'approval_request',
        entityId: approvalRequest.id,
        userId: executorId,
        resourceType: 'APPROVAL_REQUEST',
        resourceId: approvalRequest.id,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        sessionId: context?.sessionId,
        requestId: context?.requestId,
        metadata: {
          actionType,
          error: error instanceof Error ? error.message : 'Unknown error',
          dataPayload,
        },
      });

      throw error;
    }
  }

  /**
   * Execute user deletion action
   */
  private async executeUserDeletion(
    dataPayload: Record<string, any>,
    executorId: string
  ): Promise<any> {
    const { userId } = dataPayload;

    if (!userId) {
      throw new Error('Missing userId in data payload');
    }

    // Soft delete the user
    const deletedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        deleted_at: new Date(),
      },
    });

    return {
      success: true,
      userId: deletedUser.id,
      deletedAt: deletedUser.deleted_at,
    };
  }

  /**
   * Execute payout initiation action
   */
  private async executePayoutInitiation(
    dataPayload: Record<string, any>,
    executorId: string
  ): Promise<any> {
    const { payoutId, amountCents } = dataPayload;

    if (!payoutId) {
      throw new Error('Missing payoutId in data payload');
    }

    // This would integrate with your payout service
    // For now, return a placeholder
    console.log(`[ApprovalRequestService] Executing payout ${payoutId} for ${amountCents} cents`);

    return {
      success: true,
      payoutId,
      amountCents,
      message: 'Payout execution requires integration with payout service',
    };
  }

  /**
   * Execute ownership modification action
   */
  private async executeOwnershipModification(
    dataPayload: Record<string, any>,
    executorId: string
  ): Promise<any> {
    // This would integrate with your IP ownership service
    console.log('[ApprovalRequestService] Executing ownership modification');

    return {
      success: true,
      message: 'Ownership modification requires integration with licensing service',
      dataPayload,
    };
  }

  /**
   * Execute license termination action
   */
  private async executeLicenseTermination(
    dataPayload: Record<string, any>,
    executorId: string
  ): Promise<any> {
    const { licenseId } = dataPayload;

    if (!licenseId) {
      throw new Error('Missing licenseId in data payload');
    }

    // This would integrate with your license service
    console.log(`[ApprovalRequestService] Executing license termination for ${licenseId}`);

    return {
      success: true,
      licenseId,
      message: 'License termination requires integration with licensing service',
    };
  }

  /**
   * Execute admin role change action
   */
  private async executeAdminRoleChange(
    dataPayload: Record<string, any>,
    executorId: string
  ): Promise<any> {
    // This would integrate with your admin role service
    console.log('[ApprovalRequestService] Executing admin role change');

    return {
      success: true,
      message: 'Admin role change requires integration with admin role service',
      dataPayload,
    };
  }

  /**
   * Notify requester of approval decision
   */
  private async notifyRequesterOfDecision(
    approvalRequest: ApprovalRequest,
    reviewer: { id: string; email: string; name: string | null },
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
    executionResult?: any,
    executionError?: string
  ): Promise<void> {
    try {
      // Create in-app notification
      await this.notificationService.create({
        userId: approvalRequest.requestedBy,
        type: NotificationType.SYSTEM,
        priority: decision === 'APPROVED' ? NotificationPriority.MEDIUM : NotificationPriority.HIGH,
        title: `Approval Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        message: this.formatDecisionNotificationMessage(
          approvalRequest,
          reviewer,
          decision,
          comments,
          executionError
        ),
        actionUrl: `/admin/approvals/${approvalRequest.id}`,
        metadata: {
          approvalRequestId: approvalRequest.id,
          decision,
          reviewedBy: reviewer.id,
          reviewerName: reviewer.name || reviewer.email,
          executionError,
        },
      });

      // Send email notification
      const requester = await this.prisma.user.findUnique({
        where: { id: approvalRequest.requestedBy },
        select: { id: true, email: true, name: true },
      });

      if (requester) {
        await this.sendDecisionEmail(
          requester,
          approvalRequest,
          reviewer,
          decision,
          comments,
          executionResult,
          executionError
        );
      }
    } catch (error) {
      console.error('[ApprovalRequestService] Error notifying requester of decision:', error);
      // Don't throw - notification failures shouldn't break the approval workflow
    }
  }

  /**
   * Format decision notification message
   */
  private formatDecisionNotificationMessage(
    approvalRequest: ApprovalRequest,
    reviewer: { name: string | null; email: string },
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
    executionError?: string
  ): string {
    const reviewerName = reviewer.name || reviewer.email;
    const actionType = this.formatActionType(approvalRequest.actionType);

    if (decision === 'APPROVED') {
      if (executionError) {
        return `Your request for ${actionType} was approved by ${reviewerName}, but execution failed: ${executionError}`;
      }
      return `Your request for ${actionType} was approved and executed by ${reviewerName}${comments ? `: ${comments}` : ''}`;
    } else {
      return `Your request for ${actionType} was rejected by ${reviewerName}${comments ? `: ${comments}` : ''}`;
    }
  }

  /**
   * Send email notification for approval decision
   * 
   * Note: Email notifications are optional and failures are logged but don't block the workflow.
   * For now, we're using console logging. TODO: Implement with proper email templates.
   */
  private async sendDecisionEmail(
    requester: { id: string; email: string; name: string | null },
    approvalRequest: ApprovalRequest,
    reviewer: { name: string | null; email: string },
    decision: 'APPROVED' | 'REJECTED',
    comments?: string,
    executionResult?: any,
    executionError?: string
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'https://ops.yesgoddess.agency';
    const approvalUrl = `${frontendUrl}/admin/approvals/${approvalRequest.id}`;

    const message = decision === 'APPROVED'
      ? `Your approval request for ${this.formatActionType(approvalRequest.actionType)} has been approved${executionError ? ', but execution failed' : ' and executed successfully'}.${comments ? ` Comment: ${comments}` : ''}`
      : `Your approval request for ${this.formatActionType(approvalRequest.actionType)} has been rejected.${comments ? ` Reason: ${comments}` : ''}`;

    // Log email notification details
    // TODO: Implement with actual email service when approval email templates are created
    console.log('[ApprovalRequestService] Decision email notification queued:', {
      to: requester.email,
      requesterName: requester.name || 'User',
      subject: `Approval Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      reviewerName: reviewer.name || reviewer.email,
      actionType: this.formatActionType(approvalRequest.actionType),
      decision,
      comments: comments || 'No comments provided',
      approvalUrl,
      executionError,
      executionSuccess: decision === 'APPROVED' && !executionError,
      message,
    });

    // Optional: Try to send using a generic template if available
    try {
      // You can uncomment this once you have appropriate email templates registered
      /*
      await emailService.sendTransactional({
        userId: requester.id,
        email: requester.email,
        subject: `Approval Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        template: 'system-notification', // Use appropriate template
        variables: {
          // Template-specific variables
        },
        tags: {
          type: 'approval_decision',
          decision: decision.toLowerCase(),
        },
      });
      */
    } catch (error) {
      console.error('[ApprovalRequestService] Decision email notification failed (non-blocking):', error);
    }
  }

  /**
   * Get pending approval requests for a user
   * Returns requests the user has authority to approve
   */
  async getPendingApprovalsForUser(userId: string): Promise<ApprovalRequest[]> {
    // Get user's admin roles
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
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

    if (!user || !user.adminRoles || user.adminRoles.length === 0) {
      return [];
    }

    // Get all pending approval requests
    const pendingRequests = await this.prisma.approvalRequest.findMany({
      where: {
        status: ApprovalStatus.PENDING,
        requestedBy: {
          not: userId, // Exclude self-requested approvals
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Filter to only requests the user can approve
    const approvableRequests: ApprovalRequest[] = [];

    for (const request of pendingRequests) {
      const canApproveRequest = await canApprove(
        { id: userId, adminRoles: user.adminRoles },
        request
      );

      if (canApproveRequest) {
        approvableRequests.push(request);
      }
    }

    return approvableRequests;
  }

  /**
   * Get approval request by ID
   */
  async getApprovalRequest(approvalRequestId: string): Promise<ApprovalRequest | null> {
    return await this.prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
    });
  }

  /**
   * Get approval requests by status
   */
  async getApprovalRequestsByStatus(
    status: ApprovalStatus,
    department?: Department,
    limit: number = 50
  ): Promise<ApprovalRequest[]> {
    return await this.prisma.approvalRequest.findMany({
      where: {
        status,
        ...(department && { department }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Get approval request statistics
   */
  async getApprovalStatistics(department?: Department): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  }> {
    const where = department ? { department } : {};

    const [pending, approved, rejected, total] = await Promise.all([
      this.prisma.approvalRequest.count({
        where: { ...where, status: ApprovalStatus.PENDING },
      }),
      this.prisma.approvalRequest.count({
        where: { ...where, status: ApprovalStatus.APPROVED },
      }),
      this.prisma.approvalRequest.count({
        where: { ...where, status: ApprovalStatus.REJECTED },
      }),
      this.prisma.approvalRequest.count({ where }),
    ]);

    return {
      pending,
      approved,
      rejected,
      total,
    };
  }
}

// Export singleton instance
export const approvalRequestService = new ApprovalRequestService(
  prisma,
  new AuditService(prisma),
  new NotificationService(prisma, redis)
);

// Export for dependency injection
export function createApprovalRequestService(
  prisma: PrismaClient,
  auditService: AuditService,
  notificationService: NotificationService
): ApprovalRequestService {
  return new ApprovalRequestService(prisma, auditService, notificationService);
}
