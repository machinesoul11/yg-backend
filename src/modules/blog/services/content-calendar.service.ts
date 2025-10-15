/**
 * Content Calendar Service
 * Handles scheduled content management and calendar view functionality
 */

import { PrismaClient, PostStatus } from '@prisma/client';
import { PostNotFoundError, ScheduledDateInPastError, BlogDatabaseError } from '../errors/blog.errors';
import { AuditService } from '@/lib/services/audit.service';
import { NotificationService } from '@/modules/system/services/notification.service';
import { redis } from '@/lib/db/redis';

export interface ScheduleRequest {
  postId: string;
  scheduledFor: Date;
  userId: string;
  reason?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  scheduledFor: Date;
  publishedAt: Date | null;
  authorId: string;
  authorName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  excerpt: string | null;
  tags: string[];
  isFeatured: boolean;
}

export interface CalendarView {
  events: CalendarEvent[];
  summary: {
    total: number;
    scheduled: number;
    published: number;
    draft: number;
    pendingReview: number;
  };
  period: {
    start: Date;
    end: Date;
  };
}

export interface CalendarFilters {
  authorId?: string;
  categoryId?: string;
  status?: PostStatus[];
  tags?: string[];
  isFeatured?: boolean;
}

export class ContentCalendarService {
  private auditService: AuditService;
  private notificationService: NotificationService;

  constructor(private prisma: PrismaClient) {
    this.auditService = new AuditService(this.prisma);
    this.notificationService = new NotificationService(this.prisma, redis);
  }

  /**
   * Schedule a post for future publication
   */
  async schedulePost(request: ScheduleRequest): Promise<any> {
    try {
      // Validate scheduled date is in the future
      if (request.scheduledFor <= new Date()) {
        throw new ScheduledDateInPastError(request.scheduledFor);
      }

      // Get the post
      const post = await this.prisma.post.findUnique({
        where: { id: request.postId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      });

      if (!post) {
        throw new PostNotFoundError(request.postId);
      }

      // Update post with schedule
      const updatedPost = await this.prisma.post.update({
        where: { id: request.postId },
        data: {
          scheduledFor: request.scheduledFor,
          status: 'SCHEDULED'
        },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        }
      });

      // Create audit log
      await this.auditService.log({
        action: 'POST_SCHEDULED',
        entityType: 'Post',
        entityId: request.postId,
        userId: request.userId,
        before: {
          scheduledFor: post.scheduledFor,
          status: post.status
        },
        after: {
          scheduledFor: request.scheduledFor,
          status: 'SCHEDULED',
          reason: request.reason
        }
      });

      // Send notification to author if different from scheduler
      if (post.authorId !== request.userId) {
        await this.notificationService.create({
          userId: post.authorId,
          type: 'SYSTEM',
          title: 'Post Scheduled for Publication',
          message: `Your post "${post.title}" has been scheduled for publication on ${request.scheduledFor.toLocaleDateString()}`,
          actionUrl: `/admin/blog/posts/${post.id}`,
          metadata: {
            postId: post.id,
            postTitle: post.title,
            scheduledFor: request.scheduledFor.toISOString(),
            scheduledBy: request.userId
          }
        });
      }

      return updatedPost;

    } catch (error) {
      if (error instanceof PostNotFoundError || error instanceof ScheduledDateInPastError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to schedule post', error as Error);
    }
  }

  /**
   * Cancel scheduled publication
   */
  async cancelScheduledPost(postId: string, userId: string, reason?: string): Promise<any> {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          author: { select: { id: true, name: true, email: true } }
        }
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      if (post.status !== 'SCHEDULED') {
        throw new Error('Post is not scheduled for publication');
      }

      // Update post status back to draft
      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: {
          scheduledFor: null,
          status: 'DRAFT'
        },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        }
      });

      // Create audit log
      await this.auditService.log({
        action: 'POST_SCHEDULE_CANCELLED',
        entityType: 'Post',
        entityId: postId,
        userId,
        before: {
          scheduledFor: post.scheduledFor,
          status: post.status
        },
        after: {
          scheduledFor: null,
          status: 'DRAFT',
          reason
        }
      });

      return updatedPost;

    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to cancel scheduled post', error as Error);
    }
  }

  /**
   * Reschedule a post
   */
  async reschedulePost(postId: string, newScheduledFor: Date, userId: string, reason?: string): Promise<any> {
    try {
      // Validate new scheduled date is in the future
      if (newScheduledFor <= new Date()) {
        throw new ScheduledDateInPastError(newScheduledFor);
      }

      const post = await this.prisma.post.findUnique({
        where: { id: postId }
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: {
          scheduledFor: newScheduledFor,
          status: 'SCHEDULED'
        },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        }
      });

      // Create audit log
      await this.auditService.log({
        action: 'POST_RESCHEDULED',
        entityType: 'Post',
        entityId: postId,
        userId,
        before: {
          scheduledFor: post.scheduledFor,
          status: post.status
        },
        after: {
          scheduledFor: newScheduledFor,
          status: 'SCHEDULED',
          reason
        }
      });

      return updatedPost;

    } catch (error) {
      if (error instanceof PostNotFoundError || error instanceof ScheduledDateInPastError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to reschedule post', error as Error);
    }
  }

  /**
   * Get calendar view for a specific period
   */
  async getCalendarView(
    startDate: Date,
    endDate: Date,
    filters: CalendarFilters = {}
  ): Promise<CalendarView> {
    try {
      // Build where clause
      const whereClause: any = {
        deletedAt: null,
        OR: [
          {
            scheduledFor: {
              gte: startDate,
              lte: endDate
            }
          },
          {
            publishedAt: {
              gte: startDate,
              lte: endDate
            }
          }
        ]
      };

      // Apply filters
      if (filters.authorId) {
        whereClause.authorId = filters.authorId;
      }

      if (filters.categoryId) {
        whereClause.categoryId = filters.categoryId;
      }

      if (filters.status && filters.status.length > 0) {
        whereClause.status = { in: filters.status };
      }

      if (filters.isFeatured !== undefined) {
        whereClause.isFeatured = filters.isFeatured;
      }

      if (filters.tags && filters.tags.length > 0) {
        whereClause.tags = {
          hasAll: filters.tags
        };
      }

      // Get posts
      const posts = await this.prisma.post.findMany({
        where: whereClause,
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        },
        orderBy: [
          { scheduledFor: 'asc' },
          { publishedAt: 'asc' },
          { createdAt: 'asc' }
        ]
      });

      // Transform to calendar events
      const events: CalendarEvent[] = posts.map(post => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        scheduledFor: post.scheduledFor!,
        publishedAt: post.publishedAt,
        authorId: post.authorId,
        authorName: post.author.name,
        categoryId: post.categoryId,
        categoryName: post.category?.name || null,
        excerpt: post.excerpt,
        tags: Array.isArray(post.tags) ? post.tags as string[] : [],
        isFeatured: false // TODO: Update after schema regeneration
      }));

      // Calculate summary
      const summary = {
        total: events.length,
        scheduled: events.filter(e => e.status === 'SCHEDULED').length,
        published: events.filter(e => e.status === 'PUBLISHED').length,
        draft: events.filter(e => e.status === 'DRAFT').length,
        pendingReview: events.filter(e => e.status === 'PENDING_REVIEW').length
      };

      return {
        events,
        summary,
        period: {
          start: startDate,
          end: endDate
        }
      };

    } catch (error) {
      throw new BlogDatabaseError('Failed to get calendar view', error as Error);
    }
  }

  /**
   * Get calendar view by month
   */
  async getMonthlyCalendar(year: number, month: number, filters: CalendarFilters = {}): Promise<CalendarView> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    return this.getCalendarView(startDate, endDate, filters);
  }

  /**
   * Get calendar view by week
   */
  async getWeeklyCalendar(date: Date, filters: CalendarFilters = {}): Promise<CalendarView> {
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // End of week (Saturday)
    endDate.setHours(23, 59, 59, 999);
    
    return this.getCalendarView(startDate, endDate, filters);
  }

  /**
   * Get posts scheduled for today
   */
  async getTodaysScheduledPosts(): Promise<CalendarEvent[]> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
    
    const calendarView = await this.getCalendarView(startOfDay, endOfDay, {
      status: ['SCHEDULED']
    });
    
    return calendarView.events;
  }

  /**
   * Get upcoming scheduled posts (next 7 days)
   */
  async getUpcomingScheduledPosts(days: number = 7): Promise<CalendarEvent[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + days);
    
    const calendarView = await this.getCalendarView(startDate, endDate, {
      status: ['SCHEDULED']
    });
    
    return calendarView.events;
  }

  /**
   * Get overdue scheduled posts (should have been published but weren't)
   */
  async getOverdueScheduledPosts(): Promise<CalendarEvent[]> {
    try {
      const posts = await this.prisma.post.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledFor: {
            lt: new Date()
          },
          deletedAt: null
        },
        include: {
          author: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } }
        },
        orderBy: { scheduledFor: 'asc' }
      });

      return posts.map(post => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        scheduledFor: post.scheduledFor!,
        publishedAt: post.publishedAt,
        authorId: post.authorId,
        authorName: post.author.name,
        categoryId: post.categoryId,
        categoryName: post.category?.name || null,
        excerpt: post.excerpt,
        tags: Array.isArray(post.tags) ? post.tags as string[] : [],
        isFeatured: false // TODO: Update after schema regeneration
      }));

    } catch (error) {
      throw new BlogDatabaseError('Failed to get overdue scheduled posts', error as Error);
    }
  }

  /**
   * Get publishing statistics for a date range
   */
  async getPublishingStatistics(startDate: Date, endDate: Date): Promise<any> {
    try {
      const stats = await this.prisma.post.groupBy({
        by: ['status'],
        where: {
          deletedAt: null,
          OR: [
            {
              scheduledFor: {
                gte: startDate,
                lte: endDate
              }
            },
            {
              publishedAt: {
                gte: startDate,
                lte: endDate
              }
            },
            {
              createdAt: {
                gte: startDate,
                lte: endDate
              }
            }
          ]
        },
        _count: {
          id: true
        }
      });

      // Transform to a more usable format
      const result = {
        total: 0,
        byStatus: {} as Record<string, number>
      };

      stats.forEach(stat => {
        result.byStatus[stat.status] = stat._count.id;
        result.total += stat._count.id;
      });

      return result;

    } catch (error) {
      throw new BlogDatabaseError('Failed to get publishing statistics', error as Error);
    }
  }
}
