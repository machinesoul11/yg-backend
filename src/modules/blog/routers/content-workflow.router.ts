/**
 * Content Workflow Router
 * API endpoints for editorial workflow features including author assignment,
 * approval workflows, revision comparison, content calendar, and bulk operations
 */

import { z } from 'zod';
import { createTRPCRouter, adminProcedure, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { RevisionComparisonService } from '../services/revision-comparison.service';
import { ContentCalendarService } from '../services/content-calendar.service';
import { EnhancedBulkOperationsService } from '../services/enhanced-bulk-operations.service';
import { TRPCError } from '@trpc/server';

// Initialize services
const revisionService = new RevisionComparisonService(prisma);
const calendarService = new ContentCalendarService(prisma);
const bulkOpsService = new EnhancedBulkOperationsService(prisma);

// Validation schemas
const createRevisionSchema = z.object({
  postId: z.string().cuid(),
  content: z.string().min(1),
  revisionNote: z.string().optional()
});

const compareRevisionsSchema = z.object({
  postId: z.string().cuid(),
  oldRevisionId: z.string().cuid(),
  newRevisionId: z.string().cuid()
});

const restoreRevisionSchema = z.object({
  postId: z.string().cuid(),
  revisionId: z.string().cuid(),
  reason: z.string().optional()
});

const schedulePostSchema = z.object({
  postId: z.string().cuid(),
  scheduledFor: z.date(),
  reason: z.string().optional()
});

const calendarViewSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  filters: z.object({
    authorId: z.string().cuid().optional(),
    categoryId: z.string().cuid().optional(),
    status: z.array(z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'])).optional(),
    tags: z.array(z.string()).optional(),
    isFeatured: z.boolean().optional()
  }).optional()
});

const bulkOperationSchema = z.object({
  postIds: z.array(z.string().cuid()).min(1).max(100),
  operation: z.enum(['publish', 'delete', 'archive', 'assign', 'categorize', 'tag', 'feature', 'unfeature']),
  parameters: z.object({
    assignedToId: z.string().cuid().optional(),
    categoryId: z.string().cuid().optional(),
    tags: z.array(z.string()).optional(),
    reason: z.string().optional()
  }).optional()
});

export const contentWorkflowRouter = createTRPCRouter({
  // ========================================
  // REVISION MANAGEMENT
  // ========================================
  
  revisions: createTRPCRouter({
    /**
     * Create a new revision for a post
     */
    create: protectedProcedure
      .input(createRevisionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await revisionService.createRevision({
            ...input,
            authorId: ctx.session.user.id
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to create revision'
          });
        }
      }),

    /**
     * Get all revisions for a post
     */
    list: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional()
      }))
      .query(async ({ input }) => {
        try {
          return await revisionService.getPostRevisions(input.postId, {
            page: input.page,
            limit: input.limit
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get revisions'
          });
        }
      }),

    /**
     * Compare two revisions
     */
    compare: protectedProcedure
      .input(compareRevisionsSchema)
      .query(async ({ input }) => {
        try {
          return await revisionService.compareRevisions(
            input.postId,
            input.oldRevisionId,
            input.newRevisionId
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to compare revisions'
          });
        }
      }),

    /**
     * Compare revision with current content
     */
    compareWithCurrent: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        revisionId: z.string().cuid()
      }))
      .query(async ({ input }) => {
        try {
          return await revisionService.compareWithCurrent(
            input.postId,
            input.revisionId
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to compare with current'
          });
        }
      }),

    /**
     * Restore a post to a previous revision
     */
    restore: protectedProcedure
      .input(restoreRevisionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await revisionService.restoreRevision({
            ...input,
            authorId: ctx.session.user.id
          });
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to restore revision'
          });
        }
      })
  }),

  // ========================================
  // CONTENT CALENDAR
  // ========================================

  calendar: createTRPCRouter({
    /**
     * Schedule a post for publication
     */
    schedulePost: protectedProcedure
      .input(schedulePostSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await calendarService.schedulePost({
            ...input,
            userId: ctx.session.user.id
          });
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to schedule post'
          });
        }
      }),

    /**
     * Cancel scheduled publication
     */
    cancelScheduled: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        reason: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await calendarService.cancelScheduledPost(
            input.postId,
            ctx.session.user.id,
            input.reason
          );
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to cancel scheduled post'
          });
        }
      }),

    /**
     * Reschedule a post
     */
    reschedule: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        newScheduledFor: z.date(),
        reason: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await calendarService.reschedulePost(
            input.postId,
            input.newScheduledFor,
            ctx.session.user.id,
            input.reason
          );
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to reschedule post'
          });
        }
      }),

    /**
     * Get calendar view for date range
     */
    getView: protectedProcedure
      .input(calendarViewSchema)
      .query(async ({ input }) => {
        try {
          return await calendarService.getCalendarView(
            input.startDate,
            input.endDate,
            input.filters as any || {}
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get calendar view'
          });
        }
      }),

    /**
     * Get monthly calendar
     */
    getMonthly: protectedProcedure
      .input(z.object({
        year: z.number().int().min(2020).max(2030),
        month: z.number().int().min(1).max(12),
        filters: calendarViewSchema.shape.filters.optional()
      }))
      .query(async ({ input }) => {
        try {
          return await calendarService.getMonthlyCalendar(
            input.year,
            input.month,
            input.filters as any || {}
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get monthly calendar'
          });
        }
      }),

    /**
     * Get posts scheduled for today
     */
    getToday: protectedProcedure
      .query(async () => {
        try {
          return await calendarService.getTodaysScheduledPosts();
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get today\'s posts'
          });
        }
      }),

    /**
     * Get upcoming scheduled posts
     */
    getUpcoming: protectedProcedure
      .input(z.object({
        days: z.number().int().min(1).max(30).optional()
      }))
      .query(async ({ input }) => {
        try {
          return await calendarService.getUpcomingScheduledPosts(input.days);
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get upcoming posts'
          });
        }
      }),

    /**
     * Get overdue scheduled posts
     */
    getOverdue: adminProcedure
      .query(async () => {
        try {
          return await calendarService.getOverdueScheduledPosts();
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get overdue posts'
          });
        }
      })
  }),

  // ========================================
  // BULK OPERATIONS
  // ========================================

  bulk: createTRPCRouter({
    /**
     * Preview bulk operation (dry run)
     */
    preview: protectedProcedure
      .input(bulkOperationSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await bulkOpsService.previewBulkOperation({
            ...input,
            userId: ctx.session.user.id
          });
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to preview bulk operation'
          });
        }
      }),

    /**
     * Execute bulk operation
     */
    execute: protectedProcedure
      .input(bulkOperationSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await bulkOpsService.executeBulkOperation({
            ...input,
            userId: ctx.session.user.id
          });
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error instanceof Error ? error.message : 'Failed to execute bulk operation'
          });
        }
      }),

    /**
     * Get bulk operation history
     */
    getHistory: adminProcedure
      .input(z.object({
        userId: z.string().cuid().optional(),
        operation: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional()
      }))
      .query(async ({ input }) => {
        try {
          return await bulkOpsService.getBulkOperationHistory(
            input.userId,
            input.operation,
            input.limit
          );
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get bulk operation history'
          });
        }
      })
  })
});
