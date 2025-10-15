/**
 * Blog tRPC Router
 * API endpoints for blog management operations
 */

import { z } from 'zod';
import { createTRPCRouter, adminProcedure, protectedProcedure, publicProcedure } from '@/lib/trpc';
import { BlogService } from '../services/blog.service';
import { prisma } from '@/lib/db';
import {
  createCategorySchema,
  updateCategorySchema,
  createPostSchema,
  updatePostSchema,
  createPostRevisionSchema,
  postFiltersSchema,
  categoryFiltersSchema,
} from '../schemas/blog.schema';
import {
  PostNotFoundError,
  CategoryNotFoundError,
  PostRevisionNotFoundError,
  DuplicateSlugError,
  CategoryInUseError,
  CircularCategoryReferenceError,
  InsufficientPermissionsError,
  InvalidStatusTransitionError,
  ScheduledDateInPastError,
  PostAlreadyPublishedError,
  BlogDatabaseError,
} from '../errors/blog.errors';
import { TRPCError } from '@trpc/server';

const blogService = new BlogService(prisma);

// Helper function to convert blog errors to tRPC errors
function handleBlogError(error: unknown): never {
  if (error instanceof PostNotFoundError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  
  if (error instanceof CategoryNotFoundError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  
  if (error instanceof PostRevisionNotFoundError) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }
  
  if (error instanceof DuplicateSlugError) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: error.message,
    });
  }
  
  if (error instanceof CategoryInUseError) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: error.message,
    });
  }
  
  if (error instanceof CircularCategoryReferenceError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  
  if (error instanceof InsufficientPermissionsError) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }
  
  if (error instanceof InvalidStatusTransitionError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  
  if (error instanceof ScheduledDateInPastError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  
  if (error instanceof PostAlreadyPublishedError) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }
  
  if (error instanceof BlogDatabaseError) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }
  
  // Unknown error
  console.error('Unknown blog error:', error);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}

export const blogRouter = createTRPCRouter({
  // ========================================
  // CATEGORY ENDPOINTS
  // ========================================

  categories: createTRPCRouter({
    /**
     * Create a new category
     */
    create: adminProcedure
      .input(createCategorySchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await blogService.createCategory(input, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Update a category
     */
    update: adminProcedure
      .input(z.object({
        id: z.string().cuid(),
        data: updateCategorySchema,
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await blogService.updateCategory(input.id, input.data, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get category by ID
     */
    getById: publicProcedure
      .input(z.object({
        id: z.string().cuid(),
        includeChildren: z.boolean().optional(),
        includePostCount: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getCategoryById(input.id, {
            includeChildren: input.includeChildren,
            includePostCount: input.includePostCount,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get categories with filtering
     */
    list: publicProcedure
      .input(z.object({
        parentCategoryId: z.string().cuid().nullable().optional(),
        includeChildren: z.boolean().optional(),
        includePostCount: z.boolean().optional(),
        filters: categoryFiltersSchema.optional(),
        sortBy: z.enum(['name', 'displayOrder', 'createdAt']).optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getCategories({
            parentCategoryId: input.parentCategoryId,
            includeChildren: input.includeChildren,
            includePostCount: input.includePostCount,
            filters: input.filters,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Delete a category
     */
    delete: adminProcedure
      .input(z.object({
        id: z.string().cuid(),
        reassignPostsTo: z.string().cuid().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await blogService.deleteCategory(input.id, ctx.session.user.id, {
            reassignPostsTo: input.reassignPostsTo,
          });
          return { success: true };
        } catch (error) {
          handleBlogError(error);
        }
      }),
  }),

  // ========================================
  // POST ENDPOINTS
  // ========================================

  posts: createTRPCRouter({
    /**
     * Create a new post
     */
    create: protectedProcedure
      .input(createPostSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          // Transform string dates to Date objects
          const transformedInput = {
            ...input,
            publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
            scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
          };
          return await blogService.createPost(transformedInput, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Update a post
     */
    update: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
        data: updatePostSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Transform string dates to Date objects
          const transformedData = {
            ...input.data,
            publishedAt: input.data.publishedAt ? new Date(input.data.publishedAt) : undefined,
            scheduledFor: input.data.scheduledFor ? new Date(input.data.scheduledFor) : undefined,
          };
          return await blogService.updatePost(input.id, transformedData, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get post by ID
     */
    getById: publicProcedure
      .input(z.object({
        id: z.string().cuid(),
        includeRevisions: z.boolean().optional(),
        incrementViews: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getPostById(input.id, {
            includeRevisions: input.includeRevisions,
            incrementViews: input.incrementViews,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get post by slug
     */
    getBySlug: publicProcedure
      .input(z.object({
        slug: z.string().min(1),
        includeRevisions: z.boolean().optional(),
        incrementViews: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getPostBySlug(input.slug, {
            includeRevisions: input.includeRevisions,
            incrementViews: input.incrementViews,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get posts with filtering and pagination
     */
    list: publicProcedure
      .input(z.object({
        filters: postFiltersSchema.optional(),
        sortBy: z.enum(['title', 'publishedAt', 'createdAt', 'updatedAt', 'viewCount']).optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        includeRevisions: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getPosts({
            filters: input.filters,
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
            page: input.page,
            limit: input.limit,
            includeRevisions: input.includeRevisions,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Delete a post (soft delete)
     */
    delete: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await blogService.deletePost(input.id, ctx.session.user.id);
          return { success: true };
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Restore a deleted post
     */
    restore: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await blogService.restorePost(input.id, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Duplicate a post
     */
    duplicate: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
        overrides: z.object({
          title: z.string().min(1).max(500).optional(),
          content: z.string().optional(),
          excerpt: z.string().max(1000).optional(),
          categoryId: z.string().cuid().optional(),
          featuredImageUrl: z.string().url().optional(),
          scheduledFor: z.string().datetime().optional(),
          tags: z.array(z.string()).optional(),
          seoTitle: z.string().max(70).optional(),
          seoDescription: z.string().max(160).optional(),
          seoKeywords: z.string().max(255).optional(),
        }).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Transform string dates to Date objects in overrides
          const transformedOverrides = input.overrides ? {
            ...input.overrides,
            scheduledFor: input.overrides.scheduledFor ? new Date(input.overrides.scheduledFor) : undefined,
          } : undefined;
          return await blogService.duplicatePost(input.id, ctx.session.user.id, transformedOverrides);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Upload featured image for a post
     */
    uploadFeaturedImage: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        imageFile: z.object({
          buffer: z.any(), // File buffer
          mimetype: z.string(),
          originalname: z.string(),
          size: z.number(),
        }),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await blogService.uploadFeaturedImage(
            input.postId,
            input.imageFile,
            ctx.session.user.id
          );
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Remove featured image from a post
     */
    removeFeaturedImage: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await blogService.removeFeaturedImage(input.postId, ctx.session.user.id);
          return { success: true };
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Publish a draft or scheduled post
     */
    publish: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
        publishedAt: z.string().datetime().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;
          return await blogService.publishPost(input.id, ctx.session.user.id, publishedAt);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Schedule a post for future publication
     */
    schedule: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
        scheduledFor: z.string().datetime(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const scheduledFor = new Date(input.scheduledFor);
          return await blogService.schedulePost(input.id, scheduledFor, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),
  }),

  // ========================================
  // POST REVISION ENDPOINTS
  // ========================================

  revisions: createTRPCRouter({
    /**
     * Create a post revision
     */
    create: protectedProcedure
      .input(createPostRevisionSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          return await blogService.createPostRevision(input, ctx.session.user.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get post revisions
     */
    list: protectedProcedure
      .input(z.object({
        postId: z.string().cuid(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getPostRevisions(input.postId, {
            page: input.page,
            limit: input.limit,
          });
        } catch (error) {
          handleBlogError(error);
        }
      }),

    /**
     * Get revision by ID
     */
    getById: protectedProcedure
      .input(z.object({
        id: z.string().cuid(),
      }))
      .query(async ({ input }) => {
        try {
          return await blogService.getRevisionById(input.id);
        } catch (error) {
          handleBlogError(error);
        }
      }),
  }),

  // ========================================
  // CONTENT OPTIMIZATION ENDPOINTS
  // ========================================

  /**
   * Get content optimization analysis for a specific post
   */
  getPostOptimization: protectedProcedure
    .input(z.object({
      postId: z.string().cuid()
    }))
    .query(async ({ input, ctx }) => {
      try {
        return await blogService.getPostContentOptimization(input.postId);
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Generate bulk content optimization report
   */
  bulkOptimizationAnalysis: adminProcedure
    .input(z.object({
      filters: z.object({
        status: z.string().optional(),
        categoryId: z.string().optional(),
        authorId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().min(1).max(100).default(50)
      }).optional()
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await blogService.bulkContentOptimizationAnalysis(input.filters);
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Generate comprehensive content optimization report for admin dashboard
   */
  generateOptimizationReport: adminProcedure
    .input(z.object({
      dateRange: z.object({
        from: z.date(),
        to: z.date()
      }).optional()
    }))
    .query(async ({ input, ctx }) => {
      try {
        return await blogService.generateContentOptimizationReport(input.dateRange);
      } catch (error) {
        handleBlogError(error);
      }
    }),

  // ========================================
  // CONTENT DISCOVERY AND PUBLIC ENDPOINTS
  // ========================================

  /**
   * Get featured posts for homepage and content discovery
   */
  featured: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(20).optional().default(6),
      categoryId: z.string().cuid().optional(),
    }))
    .query(async ({ input }) => {
      try {
        return await blogService.getFeaturedPosts(input);
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Get posts related to a specific post
   */
  related: publicProcedure
    .input(z.object({
      postId: z.string().cuid(),
      limit: z.number().int().min(1).max(10).optional().default(5),
    }))
    .query(async ({ input }) => {
      try {
        return await blogService.getRelatedPosts(input.postId, {
          limit: input.limit,
        });
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Get all categories with hierarchical structure and post counts
   */
  allCategories: publicProcedure
    .input(z.object({
      includeEmpty: z.boolean().optional().default(false),
      activeOnly: z.boolean().optional().default(true),
      flat: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      try {
        return await blogService.getAllCategories(input);
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Get posts by category slug with filtering and pagination
   */
  postsByCategory: publicProcedure
    .input(z.object({
      categorySlug: z.string().min(1),
      includeSubcategories: z.boolean().optional().default(true),
      page: z.number().int().min(1).optional().default(1),
      limit: z.number().int().min(1).max(100).optional().default(20),
      sortBy: z.enum(['publishedAt', 'viewCount', 'readTimeMinutes', 'title']).optional().default('publishedAt'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      authorId: z.string().cuid().optional(),
      tags: z.array(z.string().min(1)).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { dateFrom, dateTo, ...rest } = input;
        return await blogService.getPostsByCategorySlug(input.categorySlug, {
          ...rest,
          ...(dateFrom && { dateFrom: new Date(dateFrom) }),
          ...(dateTo && { dateTo: new Date(dateTo) }),
        });
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Search posts with full-text search and filtering
   */
  searchPosts: publicProcedure
    .input(z.object({
      query: z.string().min(2).max(200),
      page: z.number().int().min(1).optional().default(1),
      limit: z.number().int().min(1).max(100).optional().default(20),
      categoryId: z.string().cuid().optional(),
      authorId: z.string().cuid().optional(),
      tags: z.array(z.string().min(1)).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { query, dateFrom, dateTo, ...rest } = input;
        return await blogService.searchPosts(query, {
          ...rest,
          ...(dateFrom && { dateFrom: new Date(dateFrom) }),
          ...(dateTo && { dateTo: new Date(dateTo) }),
        });
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Get posts by tag with filtering and pagination
   */
  postsByTag: publicProcedure
    .input(z.object({
      tag: z.string().min(1),
      page: z.number().int().min(1).optional().default(1),
      limit: z.number().int().min(1).max(100).optional().default(20),
      sortBy: z.enum(['publishedAt', 'viewCount', 'readTimeMinutes', 'title']).optional().default('publishedAt'),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
      categoryId: z.string().cuid().optional(),
      authorId: z.string().cuid().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { tag, dateFrom, dateTo, ...rest } = input;
        return await blogService.getPostsByTag(tag, {
          ...rest,
          ...(dateFrom && { dateFrom: new Date(dateFrom) }),
          ...(dateTo && { dateTo: new Date(dateTo) }),
        });
      } catch (error) {
        handleBlogError(error);
      }
    }),

  // ========================================
  // UTILITY ENDPOINTS
  // ========================================

  /**
   * Search posts and categories
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      type: z.enum(['posts', 'categories', 'all']).optional().default('all'),
      limit: z.number().int().min(1).max(50).optional().default(10),
    }))
    .query(async ({ input }) => {
      try {
        const results: {
          posts?: any[];
          categories?: any[];
        } = {};

        if (input.type === 'posts' || input.type === 'all') {
          const postsResult = await blogService.getPosts({
            filters: { search: input.query, published: true },
            limit: input.limit,
            sortBy: 'publishedAt',
            sortOrder: 'desc',
          });
          results.posts = postsResult.posts;
        }

        if (input.type === 'categories' || input.type === 'all') {
          const categoriesResult = await blogService.getCategories({
            filters: { search: input.query, isActive: true },
          });
          results.categories = categoriesResult.categories;
        }

        return results;
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Trigger scheduled publishing (Admin only)
   */
  triggerScheduledPublishing: adminProcedure
    .input(z.object({
      postId: z.string().cuid().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Import the trigger function (dynamic to avoid circular dependencies)
        const { triggerPostPublishing } = await import('@/jobs/scheduled-blog-publishing.job');
        
        if (input.postId) {
          await triggerPostPublishing(input.postId);
          return { success: true, message: `Triggered publishing for post: ${input.postId}` };
        } else {
          // Trigger general scheduled publishing check
          const { scheduledBlogPublishingQueue } = await import('@/jobs/scheduled-blog-publishing.job');
          await scheduledBlogPublishingQueue.add('manual-check-scheduled-posts', {});
          return { success: true, message: 'Triggered scheduled publishing check for all posts' };
        }
      } catch (error) {
        handleBlogError(error);
      }
    }),

  /**
   * Get blog statistics
   */
  stats: adminProcedure
    .query(async () => {
      try {
        const [
          totalPosts,
          publishedPosts,
          draftPosts,
          scheduledPosts,
          totalCategories,
          activeCategories,
          totalRevisions,
          totalViews,
        ] = await Promise.all([
          prisma.post.count({ where: { deletedAt: null } }),
          prisma.post.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
          prisma.post.count({ where: { status: 'DRAFT', deletedAt: null } }),
          prisma.post.count({ where: { status: 'SCHEDULED', deletedAt: null } }),
          prisma.category.count(),
          prisma.category.count({ where: { isActive: true } }),
          prisma.postRevision.count(),
          prisma.post.aggregate({
            _sum: { viewCount: true },
            where: { deletedAt: null },
          }).then(result => result._sum.viewCount || 0),
        ]);

        return {
          posts: {
            total: totalPosts,
            published: publishedPosts,
            draft: draftPosts,
            scheduled: scheduledPosts,
          },
          categories: {
            total: totalCategories,
            active: activeCategories,
          },
          revisions: {
            total: totalRevisions,
          },
          engagement: {
            totalViews,
          },
        };
      } catch (error) {
        handleBlogError(error);
      }
    }),
});

export type BlogRouter = typeof blogRouter;
