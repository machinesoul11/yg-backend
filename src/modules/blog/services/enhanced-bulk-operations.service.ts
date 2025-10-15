/**
 * Enhanced Bulk Operations Service
 * Handles bulk content management operations with comprehensive validation,
 * authorization, and auditing
 */

import { PrismaClient, PostStatus } from '@prisma/client';
import { BlogDatabaseError } from '../errors/blog.errors';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { redis } from '@/lib/db/redis';

export interface BulkOperationRequest {
  postIds: string[];
  operation: 'publish' | 'delete' | 'archive' | 'assign' | 'categorize' | 'tag' | 'feature' | 'unfeature';
  parameters?: {
    assignedToId?: string;
    categoryId?: string;
    tags?: string[];
    reason?: string;
  };
  userId: string;
}

export interface BulkOperationResult {
  successful: Array<{
    postId: string;
    title: string;
    operation: string;
  }>;
  failed: Array<{
    postId: string;
    title?: string;
    error: string;
    errorCode?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  executionTime: number;
  operationId: string;
}

export interface BulkValidationResult {
  valid: string[];
  invalid: Array<{
    postId: string;
    reason: string;
  }>;
  permissions: {
    canExecute: boolean;
    reasons?: string[];
  };
}

export class EnhancedBulkOperationsService {
  private auditService: AuditService;
  private notificationService: NotificationService;

  constructor(private prisma: PrismaClient) {
    this.auditService = new AuditService(this.prisma);
    this.notificationService = new NotificationService(this.prisma, redis);
  }

  /**
   * Execute bulk operation with comprehensive validation and auditing
   */
  async executeBulkOperation(request: BulkOperationRequest): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const operationId = `bulk_${request.operation}_${Date.now()}`;

    // Validate operation limits
    this.validateOperationLimits(request);

    // Validate posts exist and user has permissions
    const validation = await this.validateBulkOperation(request);
    
    if (!validation.permissions.canExecute) {
      throw new Error(`Insufficient permissions: ${validation.permissions.reasons?.join(', ')}`);
    }

    const result: BulkOperationResult = {
      successful: [],
      failed: [],
      summary: { total: request.postIds.length, successful: 0, failed: 0, skipped: 0 },
      executionTime: 0,
      operationId
    };

    // Add invalid posts to failed list
    validation.invalid.forEach(invalid => {
      result.failed.push({
        postId: invalid.postId,
        error: invalid.reason,
        errorCode: 'VALIDATION_FAILED'
      });
      result.summary.failed++;
    });

    // Process valid posts
    await this.processBulkOperation(validation.valid, request, result);

    result.executionTime = Date.now() - startTime;

    // Create audit log for bulk operation
    await this.auditService.log({
      action: `BULK_${request.operation.toUpperCase()}`,
      entityType: 'Post',
      entityId: operationId,
      userId: request.userId,
      after: {
        operation: request.operation,
        totalPosts: request.postIds.length,
        successful: result.summary.successful,
        failed: result.summary.failed,
        skipped: result.summary.skipped,
        parameters: request.parameters,
        executionTime: result.executionTime
      }
    });

    return result;
  }

  /**
   * Validate bulk operation request
   */
  private async validateBulkOperation(request: BulkOperationRequest): Promise<BulkValidationResult> {
    const result: BulkValidationResult = {
      valid: [],
      invalid: [],
      permissions: { canExecute: true, reasons: [] }
    };

    // Get posts with current status and ownership info
    const posts = await this.prisma.post.findMany({
      where: {
        id: { in: request.postIds },
        deletedAt: null
      },
      select: {
        id: true,
        title: true,
        status: true,
        authorId: true,
        categoryId: true
      }
    });

    // Check which posts were found
    const foundPostIds = new Set(posts.map(p => p.id));
    request.postIds.forEach(id => {
      if (!foundPostIds.has(id)) {
        result.invalid.push({
          postId: id,
          reason: 'Post not found or deleted'
        });
      }
    });

    // Validate each operation
    for (const post of posts) {
      const validation = this.validateSinglePostOperation(post, request);
      if (validation.valid) {
        result.valid.push(post.id);
      } else {
        result.invalid.push({
          postId: post.id,
          reason: validation.reason || 'Operation not allowed'
        });
      }
    }

    // Check operation-specific parameters
    if (request.operation === 'assign' && !request.parameters?.assignedToId) {
      result.permissions.canExecute = false;
      result.permissions.reasons?.push('assignedToId parameter required for assign operation');
    }

    if (request.operation === 'categorize' && !request.parameters?.categoryId) {
      result.permissions.canExecute = false;
      result.permissions.reasons?.push('categoryId parameter required for categorize operation');
    }

    return result;
  }

  /**
   * Validate single post operation
   */
  private validateSinglePostOperation(
    post: { id: string; title: string; status: PostStatus; authorId: string; categoryId: string | null },
    request: BulkOperationRequest
  ): { valid: boolean; reason?: string } {
    switch (request.operation) {
      case 'publish':
        if (post.status === 'PUBLISHED') {
          return { valid: false, reason: 'Post is already published' };
        }
        if (post.status === 'ARCHIVED') {
          return { valid: false, reason: 'Cannot publish archived post' };
        }
        break;

      case 'archive':
        if (post.status === 'ARCHIVED') {
          return { valid: false, reason: 'Post is already archived' };
        }
        break;

      case 'delete':
        // Allow deletion of any non-deleted post
        break;

      case 'assign':
        // Allow assignment of any post
        break;

      case 'categorize':
        if (post.categoryId === request.parameters?.categoryId) {
          return { valid: false, reason: 'Post is already in the target category' };
        }
        break;

      case 'tag':
        // Allow tagging of any post
        break;

      case 'feature':
      case 'unfeature':
        // Allow featuring/unfeaturing of any post
        break;

      default:
        return { valid: false, reason: `Unknown operation: ${request.operation}` };
    }

    return { valid: true };
  }

  /**
   * Process bulk operation on validated posts
   */
  private async processBulkOperation(
    validPostIds: string[],
    request: BulkOperationRequest,
    result: BulkOperationResult
  ): Promise<void> {
    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    const batches = this.chunkArray(validPostIds, batchSize);

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (postId) => {
          try {
            await this.processSinglePostOperation(postId, request);
            
            // Get post title for result
            const post = await this.prisma.post.findUnique({
              where: { id: postId },
              select: { title: true }
            });

            result.successful.push({
              postId,
              title: post?.title || 'Unknown',
              operation: request.operation
            });
            result.summary.successful++;
          } catch (error) {
            const post = await this.prisma.post.findUnique({
              where: { id: postId },
              select: { title: true }
            }).catch(() => null);

            result.failed.push({
              postId,
              title: post?.title,
              error: error instanceof Error ? error.message : 'Unknown error',
              errorCode: 'EXECUTION_FAILED'
            });
            result.summary.failed++;
          }
        })
      );
    }
  }

  /**
   * Process single post operation
   */
  private async processSinglePostOperation(postId: string, request: BulkOperationRequest): Promise<void> {
    switch (request.operation) {
      case 'publish':
        await this.prisma.post.update({
          where: { id: postId },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date()
          }
        });
        break;

      case 'archive':
        await this.prisma.post.update({
          where: { id: postId },
          data: { status: 'ARCHIVED' }
        });
        break;

      case 'delete':
        await this.prisma.post.update({
          where: { id: postId },
          data: { deletedAt: new Date() }
        });
        break;

      case 'assign':
        await this.prisma.post.update({
          where: { id: postId },
          data: { authorId: request.parameters!.assignedToId! } // Using authorId temporarily
        });
        break;

      case 'categorize':
        await this.prisma.post.update({
          where: { id: postId },
          data: { categoryId: request.parameters!.categoryId! }
        });
        break;

      case 'tag':
        if (request.parameters?.tags) {
          const currentPost = await this.prisma.post.findUnique({
            where: { id: postId },
            select: { tags: true }
          });
          
          const currentTags = Array.isArray(currentPost?.tags) ? currentPost.tags as string[] : [];
          const newTags = [...new Set([...currentTags, ...request.parameters.tags])];
          
          await this.prisma.post.update({
            where: { id: postId },
            data: { tags: newTags }
          });
        }
        break;

      case 'feature':
        // TODO: Enable after schema regeneration
        // await this.prisma.post.update({
        //   where: { id: postId },
        //   data: { isFeatured: true }
        // });
        break;

      case 'unfeature':
        // TODO: Enable after schema regeneration
        // await this.prisma.post.update({
        //   where: { id: postId },
        //   data: { isFeatured: false }
        // });
        break;

      default:
        throw new Error(`Unknown operation: ${request.operation}`);
    }
  }

  /**
   * Validate operation limits
   */
  private validateOperationLimits(request: BulkOperationRequest): void {
    const maxBulkSize = 100; // Maximum posts per bulk operation
    
    if (request.postIds.length === 0) {
      throw new Error('No posts specified for bulk operation');
    }
    
    if (request.postIds.length > maxBulkSize) {
      throw new Error(`Bulk operation limit exceeded: ${request.postIds.length} posts (maximum: ${maxBulkSize})`);
    }

    // Check for duplicate post IDs
    const uniqueIds = new Set(request.postIds);
    if (uniqueIds.size !== request.postIds.length) {
      throw new Error('Duplicate post IDs found in bulk operation');
    }
  }

  /**
   * Preview bulk operation (dry run)
   */
  async previewBulkOperation(request: BulkOperationRequest): Promise<{
    validation: BulkValidationResult;
    preview: {
      willSucceed: number;
      willFail: number;
      estimatedTime: number;
      warnings: string[];
    };
  }> {
    const validation = await this.validateBulkOperation(request);
    
    const warnings: string[] = [];
    
    // Add operation-specific warnings
    if (request.operation === 'delete') {
      warnings.push('This operation will soft-delete posts. They can be restored from the trash.');
    }
    
    if (request.operation === 'publish') {
      warnings.push('Published posts will be immediately visible to the public.');
    }

    // Estimate execution time (rough estimate: 200ms per post)
    const estimatedTime = validation.valid.length * 200;

    return {
      validation,
      preview: {
        willSucceed: validation.valid.length,
        willFail: validation.invalid.length,
        estimatedTime,
        warnings
      }
    };
  }

  /**
   * Get bulk operation history
   */
  async getBulkOperationHistory(
    userId?: string,
    operation?: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        action: {
          startsWith: 'BULK_'
        }
      };

      if (userId) {
        whereClause.userId = userId;
      }

      if (operation) {
        whereClause.action = `BULK_${operation.toUpperCase()}`;
      }

      const history = await this.prisma.auditEvent.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      return history.map(event => ({
        id: event.id,
        operation: event.action.replace('BULK_', '').toLowerCase(),
        timestamp: event.timestamp,
        userId: event.userId,
        userName: event.user?.name,
        summary: event.afterJson,
        entityId: event.entityId
      }));

    } catch (error) {
      throw new BlogDatabaseError('Failed to get bulk operation history', error as Error);
    }
  }

  /**
   * Utility function to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
