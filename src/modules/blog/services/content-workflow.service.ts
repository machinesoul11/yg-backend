/**
 * Content Workflow Service
 * Handles content workflow operations including author assignment, 
 * approval workflows, and state transitions
 */

import { PrismaClient, PostStatus, Prisma } from '@prisma/client';
import { 
  PostNotFoundError,
  InvalidStatusTransitionError,
  InsufficientPermissionsError,
  BlogDatabaseError,
} from '../errors/blog.errors';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { redis } from '@/lib/db/redis';

export interface WorkflowTransition {
  from: PostStatus[];
  to: PostStatus;
  requiredRoles: string[];
  notificationRecipients: ('author' | 'assignee' | 'editors' | 'admins')[];
}

export interface WorkflowContext {
  userId: string;
  userRole: string;
  comments?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface AssignmentRequest {
  postId: string;
  assignedToId: string;
  reason?: string;
}

export interface BulkOperationRequest {
  postIds: string[];
  operation: 'publish' | 'delete' | 'archive' | 'assign' | 'categorize';
  parameters?: Record<string, any>;
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{ postId: string; error: string }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export class ContentWorkflowService {
  private auditService: AuditService;
  private notificationService: NotificationService;

  // Define valid workflow transitions
  private transitions: Record<string, WorkflowTransition> = {
    'submit_for_review': {
      from: ['DRAFT'],
      to: 'PENDING_REVIEW',
      requiredRoles: ['AUTHOR', 'EDITOR', 'ADMIN'],
      notificationRecipients: ['assignee', 'editors']
    },
    'approve': {
      from: ['PENDING_REVIEW'],
      to: 'APPROVED',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author']
    },
    'reject': {
      from: ['PENDING_REVIEW', 'APPROVED'],
      to: 'REJECTED',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author', 'assignee']
    },
    'request_changes': {
      from: ['PENDING_REVIEW'],
      to: 'DRAFT',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author', 'assignee']
    },
    'publish': {
      from: ['APPROVED', 'DRAFT'],
      to: 'PUBLISHED',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author']
    },
    'schedule': {
      from: ['APPROVED', 'DRAFT'],
      to: 'SCHEDULED',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author']
    },
    'archive': {
      from: ['PUBLISHED', 'DRAFT', 'REJECTED'],
      to: 'ARCHIVED',
      requiredRoles: ['EDITOR', 'ADMIN'],
      notificationRecipients: ['author']
    },
    'restore_to_draft': {
      from: ['ARCHIVED', 'REJECTED'],
      to: 'DRAFT',
      requiredRoles: ['AUTHOR', 'EDITOR', 'ADMIN'],
      notificationRecipients: []
    }
  };

  constructor(private prisma: PrismaClient) {
    this.auditService = new AuditService(this.prisma);
    this.notificationService = new NotificationService(this.prisma, redis);
  }

  // ========================================
  // AUTHOR ASSIGNMENT OPERATIONS
  // ========================================

  /**
   * Assign a post to a user
   */
  async assignPost(request: AssignmentRequest, context: WorkflowContext): Promise<void> {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: request.postId },
        include: {
          author: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } }
        }
      });

      if (!post) {
        throw new PostNotFoundError(request.postId);
      }

      // Verify assignee exists and has appropriate role
      const assignee = await this.prisma.user.findUnique({
        where: { id: request.assignedToId },
        select: { id: true, name: true, email: true, role: true }
      });

      if (!assignee) {
        throw new Error(`User with ID ${request.assignedToId} not found`);
      }

      if (!['EDITOR', 'ADMIN'].includes(assignee.role)) {
        throw new InsufficientPermissionsError('ASSIGN_POST', assignee.role);
      }

      // Update assignment
      await this.prisma.post.update({
        where: { id: request.postId },
        data: { assignedToId: request.assignedToId }
      });

      // Create audit log
      await this.auditService.logEvent({
        action: 'POST_ASSIGNED',
        entityType: 'Post',
        entityId: request.postId,
        userId: context.userId,
        metadata: {
          assignedToId: request.assignedToId,
          assignedToName: assignee.name,
          reason: request.reason,
          previousAssignee: post.assignedTo?.id
        }
      });

      // Send notification to assignee
      await this.notificationService.create({
        userId: request.assignedToId,
        type: 'POST_ASSIGNED',
        title: 'Post Assigned to You',
        message: `You have been assigned to review "${post.title}"`,
        actionUrl: `/admin/blog/posts/${post.id}`,
        metadata: {
          postId: post.id,
          postTitle: post.title,
          assignedBy: context.userId
        }
      });

    } catch (error) {
      throw new BlogDatabaseError('Failed to assign post', error as Error);
    }
  }

  /**
   * Reassign multiple posts to a new user
   */
  async bulkReassignPosts(
    postIds: string[], 
    newAssigneeId: string, 
    context: WorkflowContext
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: postIds.length, successful: 0, failed: 0 }
    };

    for (const postId of postIds) {
      try {
        await this.assignPost({ postId, assignedToId: newAssigneeId }, context);
        result.successful.push(postId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({ 
          postId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        result.summary.failed++;
      }
    }

    return result;
  }

  // ========================================
  // WORKFLOW TRANSITION OPERATIONS
  // ========================================

  /**
   * Execute a workflow transition
   */
  async transitionPostStatus(
    postId: string,
    transitionKey: string,
    context: WorkflowContext
  ): Promise<void> {
    try {
      const transition = this.transitions[transitionKey];
      if (!transition) {
        throw new Error(`Invalid transition: ${transitionKey}`);
      }

      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } }
        }
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      // Validate current status allows this transition
      if (!transition.from.includes(post.status)) {
        throw new InvalidStatusTransitionError(post.status, transition.to);
      }

      // Validate user has required role
      if (!transition.requiredRoles.includes(context.userRole)) {
        throw new InsufficientPermissionsError(transitionKey, context.userRole);
      }

      // Execute transition in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Update post status
        await tx.post.update({
          where: { id: postId },
          data: { 
            status: transition.to,
            ...(transition.to === 'PUBLISHED' && { publishedAt: new Date() })
          }
        });

        // Record workflow history
        await tx.postWorkflowHistory.create({
          data: {
            postId,
            fromStatus: post.status,
            toStatus: transition.to,
            userId: context.userId,
            comments: context.comments,
            reason: context.reason,
            metadata: context.metadata || {}
          }
        });
      });

      // Create audit log
      await this.auditService.logEvent({
        action: 'POST_STATUS_CHANGED',
        entityType: 'Post',
        entityId: postId,
        userId: context.userId,
        metadata: {
          fromStatus: post.status,
          toStatus: transition.to,
          transitionKey,
          comments: context.comments,
          reason: context.reason
        }
      });

      // Send notifications
      await this.sendWorkflowNotifications(post, transition, context);

    } catch (error) {
      if (error instanceof PostNotFoundError || 
          error instanceof InvalidStatusTransitionError || 
          error instanceof InsufficientPermissionsError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to transition post status', error as Error);
    }
  }

  /**
   * Get workflow history for a post
   */
  async getPostWorkflowHistory(postId: string): Promise<any[]> {
    return this.prisma.postWorkflowHistory.findMany({
      where: { postId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // ========================================
  // BULK OPERATIONS
  // ========================================

  /**
   * Execute bulk operations on multiple posts
   */
  async executeBulkOperation(
    request: BulkOperationRequest,
    context: WorkflowContext
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: request.postIds.length, successful: 0, failed: 0 }
    };

    // Validate operation limit
    if (request.postIds.length > 100) {
      throw new Error('Bulk operation limit exceeded: maximum 100 posts per operation');
    }

    switch (request.operation) {
      case 'publish':
        return this.bulkPublish(request.postIds, context);
      case 'delete':
        return this.bulkDelete(request.postIds, context);
      case 'archive':
        return this.bulkArchive(request.postIds, context);
      case 'assign':
        if (!request.parameters?.assignedToId) {
          throw new Error('assignedToId parameter required for assign operation');
        }
        return this.bulkReassignPosts(request.postIds, request.parameters.assignedToId, context);
      case 'categorize':
        if (!request.parameters?.categoryId) {
          throw new Error('categoryId parameter required for categorize operation');
        }
        return this.bulkCategorize(request.postIds, request.parameters.categoryId, context);
      default:
        throw new Error(`Unsupported bulk operation: ${request.operation}`);
    }
  }

  /**
   * Bulk publish posts
   */
  private async bulkPublish(postIds: string[], context: WorkflowContext): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: postIds.length, successful: 0, failed: 0 }
    };

    for (const postId of postIds) {
      try {
        await this.transitionPostStatus(postId, 'publish', context);
        result.successful.push(postId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({ 
          postId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        result.summary.failed++;
      }
    }

    return result;
  }

  /**
   * Bulk soft delete posts
   */
  private async bulkDelete(postIds: string[], context: WorkflowContext): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: postIds.length, successful: 0, failed: 0 }
    };

    for (const postId of postIds) {
      try {
        await this.prisma.post.update({
          where: { id: postId },
          data: { deletedAt: new Date() }
        });

        await this.auditService.logEvent({
          action: 'POST_DELETED',
          entityType: 'Post',
          entityId: postId,
          userId: context.userId,
          metadata: { bulkOperation: true }
        });

        result.successful.push(postId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({ 
          postId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        result.summary.failed++;
      }
    }

    return result;
  }

  /**
   * Bulk archive posts
   */
  private async bulkArchive(postIds: string[], context: WorkflowContext): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: postIds.length, successful: 0, failed: 0 }
    };

    for (const postId of postIds) {
      try {
        await this.transitionPostStatus(postId, 'archive', context);
        result.successful.push(postId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({ 
          postId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        result.summary.failed++;
      }
    }

    return result;
  }

  /**
   * Bulk categorize posts
   */
  private async bulkCategorize(
    postIds: string[], 
    categoryId: string, 
    context: WorkflowContext
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: postIds.length, successful: 0, failed: 0 }
    };

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      throw new Error(`Category with ID ${categoryId} not found`);
    }

    for (const postId of postIds) {
      try {
        await this.prisma.post.update({
          where: { id: postId },
          data: { categoryId }
        });

        await this.auditService.logEvent({
          action: 'POST_CATEGORIZED',
          entityType: 'Post',
          entityId: postId,
          userId: context.userId,
          metadata: { 
            categoryId, 
            categoryName: category.name,
            bulkOperation: true 
          }
        });

        result.successful.push(postId);
        result.summary.successful++;
      } catch (error) {
        result.failed.push({ 
          postId, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        result.summary.failed++;
      }
    }

    return result;
  }

  // ========================================
  // NOTIFICATION HELPERS
  // ========================================

  /**
   * Send workflow notifications
   */
  private async sendWorkflowNotifications(
    post: any,
    transition: WorkflowTransition,
    context: WorkflowContext
  ): Promise<void> {
    for (const recipient of transition.notificationRecipients) {
      let targetUserId: string | null = null;
      let notificationTitle = '';
      let notificationMessage = '';

      switch (recipient) {
        case 'author':
          targetUserId = post.author.id;
          notificationTitle = `Post Status Updated: ${transition.to}`;
          notificationMessage = `Your post "${post.title}" status has been changed to ${transition.to}`;
          break;
        case 'assignee':
          if (post.assignedTo) {
            targetUserId = post.assignedTo.id;
            notificationTitle = `Assigned Post Status Updated: ${transition.to}`;
            notificationMessage = `Post "${post.title}" (assigned to you) status has been changed to ${transition.to}`;
          }
          break;
        case 'editors':
          // This would typically query for users with EDITOR role
          // For now, we'll skip this implementation
          break;
        case 'admins':
          // This would typically query for users with ADMIN role
          // For now, we'll skip this implementation
          break;
      }

      if (targetUserId) {
        await this.notificationService.create({
          userId: targetUserId,
          type: 'POST_STATUS_CHANGED',
          title: notificationTitle,
          message: notificationMessage,
          actionUrl: `/admin/blog/posts/${post.id}`,
          metadata: {
            postId: post.id,
            postTitle: post.title,
            fromStatus: post.status,
            toStatus: transition.to,
            changedBy: context.userId,
            comments: context.comments
          }
        });
      }
    }
  }
}
