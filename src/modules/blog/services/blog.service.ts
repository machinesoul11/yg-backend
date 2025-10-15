/**
 * Blog Service
 * Core business logic for blog management operations
 */

import { PrismaClient, Prisma } from '@prisma/client';
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
import { BlogUtilityService } from './blog-utility.service';
import { ContentOptimizationService } from './content-optimization.service';
import type {
  Category,
  Post,
  PostRevision,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreatePostRequest,
  UpdatePostRequest,
  CreatePostRevisionRequest,
  PostFilters,
  CategoryFilters,
  PostsQueryOptions,
  CategoriesQueryOptions,
  PostsResponse,
  CategoriesResponse,
} from '../types/blog.types';
import { SEOIntegrationService, createSEOTrigger } from '@/modules/seo/services/seo-integration.service';

export class BlogService {
  private contentOptimizationService: ContentOptimizationService;
  private seoIntegrationService: SEOIntegrationService;
  
  constructor(private prisma: PrismaClient) {
    this.contentOptimizationService = new ContentOptimizationService(this.prisma);
    this.seoIntegrationService = new SEOIntegrationService(this.prisma);
  }

  // ========================================
  // CATEGORY OPERATIONS
  // ========================================

  /**
   * Create a new category
   */
  async createCategory(
    data: CreateCategoryRequest,
    authorId: string
  ): Promise<Category> {
    try {
      // Generate slug if not provided
      const slug = data.slug || BlogUtilityService.generateSlug(data.name);
      
      // Check for duplicate slug
      const existingCategory = await this.prisma.category.findUnique({
        where: { slug },
      });
      
      if (existingCategory) {
        throw new DuplicateSlugError(slug, 'category', existingCategory.id);
      }
      
      // Validate parent category hierarchy if parentCategoryId is provided
      if (data.parentCategoryId) {
        const parentExists = await this.prisma.category.findUnique({
          where: { id: data.parentCategoryId },
        });
        
        if (!parentExists) {
          throw new CategoryNotFoundError(data.parentCategoryId);
        }
      }
      
      // Create category
      const category = await this.prisma.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description || null,
          parentCategoryId: data.parentCategoryId || null,
          displayOrder: data.displayOrder ?? 0,
          isActive: data.isActive ?? true,
        },
        include: {
          parentCategory: true,
          _count: {
            select: { posts: true },
          },
        },
      });
      
      return this.mapCategoryWithCount(category);
    } catch (error) {
      if (error instanceof DuplicateSlugError || error instanceof CategoryNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('create category', error as Error);
    }
  }

  /**
   * Update an existing category
   */
  async updateCategory(
    categoryId: string,
    data: UpdateCategoryRequest,
    authorId: string
  ): Promise<Category> {
    try {
      // Check if category exists
      const existingCategory = await this.prisma.category.findUnique({
        where: { id: categoryId },
      });
      
      if (!existingCategory) {
        throw new CategoryNotFoundError(categoryId);
      }
      
      // Generate new slug if name is being updated
      let slug = data.slug;
      if (data.name && !slug) {
        slug = BlogUtilityService.generateSlug(data.name);
      }
      
      // Check for duplicate slug if slug is being changed
      if (slug && slug !== existingCategory.slug) {
        const duplicateCategory = await this.prisma.category.findUnique({
          where: { slug },
        });
        
        if (duplicateCategory && duplicateCategory.id !== categoryId) {
          throw new DuplicateSlugError(slug, 'category', duplicateCategory.id);
        }
      }
      
      // Validate parent category hierarchy if parentCategoryId is being changed
      if (data.parentCategoryId !== undefined) {
        if (data.parentCategoryId) {
          // Check if parent exists
          const parentExists = await this.prisma.category.findUnique({
            where: { id: data.parentCategoryId },
          });
          
          if (!parentExists) {
            throw new CategoryNotFoundError(data.parentCategoryId);
          }
          
          // Check for circular reference
          const allCategories = await this.prisma.category.findMany({
            select: { id: true, parentCategoryId: true },
          });
          
          if (!BlogUtilityService.validateCategoryHierarchy(
            categoryId,
            data.parentCategoryId,
            allCategories
          )) {
            throw new CircularCategoryReferenceError(categoryId, data.parentCategoryId);
          }
        }
      }
      
      // Update category
      const updatedCategory = await this.prisma.category.update({
        where: { id: categoryId },
        data: {
          ...(data.name && { name: data.name }),
          ...(slug && { slug }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.parentCategoryId !== undefined && { parentCategoryId: data.parentCategoryId }),
          ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        include: {
          parentCategory: true,
          _count: {
            select: { posts: true },
          },
        },
      });
      
      return this.mapCategoryWithCount(updatedCategory);
    } catch (error) {
      if (
        error instanceof CategoryNotFoundError ||
        error instanceof DuplicateSlugError ||
        error instanceof CircularCategoryReferenceError
      ) {
        throw error;
      }
      throw new BlogDatabaseError('update category', error as Error);
    }
  }

  /**
   * Get a category by ID
   */
  async getCategoryById(
    categoryId: string,
    options: { includeChildren?: boolean; includePostCount?: boolean } = {}
  ): Promise<Category> {
    try {
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          parentCategory: true,
          ...(options.includeChildren && {
            childCategories: {
              orderBy: { displayOrder: 'asc' },
            },
          }),
          ...(options.includePostCount && {
            _count: {
              select: { posts: true },
            },
          }),
        },
      });
      
      if (!category) {
        throw new CategoryNotFoundError(categoryId);
      }
      
      return this.mapCategoryWithCount(category);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get category', error as Error);
    }
  }

  /**
   * Get categories with filtering and pagination
   */
  async getCategories(options: CategoriesQueryOptions = {}): Promise<CategoriesResponse> {
    try {
      const {
        parentCategoryId,
        includeChildren = false,
        includePostCount = false,
        filters = {},
        sortBy = 'displayOrder',
        sortOrder = 'asc',
      } = options;
      
      const where: Prisma.CategoryWhereInput = {
        ...(parentCategoryId !== undefined && { parentCategoryId }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      };
      
      const orderBy: Prisma.CategoryOrderByWithRelationInput = {
        [sortBy]: sortOrder,
      };
      
      const [categories, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          orderBy,
          include: {
            parentCategory: true,
            ...(includeChildren && {
              childCategories: {
                orderBy: { displayOrder: 'asc' },
              },
            }),
            ...(includePostCount && {
              _count: {
                select: { posts: true },
              },
            }),
          },
        }),
        this.prisma.category.count({ where }),
      ]);
      
      return {
        categories: categories.map(cat => this.mapCategoryWithCount(cat)),
        total,
      };
    } catch (error) {
      throw new BlogDatabaseError('get categories', error as Error);
    }
  }

  /**
   * Delete a category
   */
  async deleteCategory(
    categoryId: string,
    authorId: string,
    options: { reassignPostsTo?: string } = {}
  ): Promise<void> {
    try {
      // Check if category exists
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          _count: {
            select: { 
              posts: true,
              childCategories: true,
            },
          },
        },
      });
      
      if (!category) {
        throw new CategoryNotFoundError(categoryId);
      }
      
      // Check if category has posts
      if (category._count.posts > 0) {
        if (options.reassignPostsTo) {
          // Verify the reassignment category exists
          const reassignCategory = await this.prisma.category.findUnique({
            where: { id: options.reassignPostsTo },
          });
          
          if (!reassignCategory) {
            throw new CategoryNotFoundError(options.reassignPostsTo);
          }
          
          // Reassign posts to the new category
          await this.prisma.post.updateMany({
            where: { categoryId },
            data: { categoryId: options.reassignPostsTo },
          });
        } else {
          throw new CategoryInUseError(categoryId, category._count.posts);
        }
      }
      
      // Handle child categories by setting their parent to null
      if (category._count.childCategories > 0) {
        await this.prisma.category.updateMany({
          where: { parentCategoryId: categoryId },
          data: { parentCategoryId: null },
        });
      }
      
      // Delete the category
      await this.prisma.category.delete({
        where: { id: categoryId },
      });
    } catch (error) {
      if (
        error instanceof CategoryNotFoundError ||
        error instanceof CategoryInUseError
      ) {
        throw error;
      }
      throw new BlogDatabaseError('delete category', error as Error);
    }
  }

  // ========================================
  // POST OPERATIONS
  // ========================================

  /**
   * Create a new post
   */
  async createPost(data: CreatePostRequest, authorId: string): Promise<Post> {
    try {
      // 1. Content Validation - Rich Text Editor Validation
      const contentValidation = BlogUtilityService.validateRichTextContent(data.content);
      if (!contentValidation.isValid) {
        throw new Error(`Content validation failed: ${contentValidation.errors.map(e => e.message).join(', ')}`);
      }

      // Use sanitized content from validation
      const sanitizedContent = contentValidation.sanitizedContent || data.content;

      // Generate slug if not provided
      const slug = data.slug || BlogUtilityService.generateSlug(data.title);
      
      // Check for duplicate slug with conflict resolution
      let finalSlug = slug;
      const existingSlugs = await this.prisma.post.findMany({
        where: { 
          slug: { startsWith: slug },
          deletedAt: null 
        },
        select: { slug: true }
      });
      
      if (existingSlugs.length > 0) {
        const existingSlugStrings = existingSlugs.map(p => p.slug);
        finalSlug = BlogUtilityService.generateSlug(data.title, { 
          existingSlugs: existingSlugStrings 
        });
      }
      
      // Validate category if provided
      if (data.categoryId) {
        const categoryExists = await this.prisma.category.findUnique({
          where: { id: data.categoryId, isActive: true },
        });
        
        if (!categoryExists) {
          throw new CategoryNotFoundError(data.categoryId);
        }
      }
      
      // Validate scheduled date
      if (data.status === 'SCHEDULED') {
        if (!data.scheduledFor) {
          throw new Error('Scheduled date is required when status is SCHEDULED');
        }
        
        if (!BlogUtilityService.isFutureDate(new Date(data.scheduledFor))) {
          throw new ScheduledDateInPastError(new Date(data.scheduledFor));
        }
      }
      
      // 2. Calculate read time (enhanced - 250 words/minute)
      const readTimeMinutes = BlogUtilityService.calculateReadTime(sanitizedContent, { 
        wordsPerMinute: 250 
      });
      
      // 3. Enhanced excerpt generation
      let excerpt = data.excerpt;
      if (!excerpt) {
        const excerptResult = BlogUtilityService.generateEnhancedExcerpt(sanitizedContent, {
          maxLength: 160,
          strategy: 'auto-best',
          targetKeywords: data.seoKeywords ? data.seoKeywords.split(',').map(k => k.trim()) : undefined
        });
        excerpt = excerptResult.excerpt;
      }
      
      // 4. SEO Validation and Content Optimization Analysis
      const seoValidation = BlogUtilityService.validateSEO({
        title: data.title,
        slug: finalSlug,
        content: sanitizedContent,
        excerpt,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        seoKeywords: data.seoKeywords,
        featuredImageUrl: data.featuredImageUrl,
        tags: data.tags
      });

      // If SEO score is too low, add warnings but don't block creation
      if (seoValidation.score < 50) {
        console.warn(`Post "${data.title}" has low SEO score (${seoValidation.score}): ${seoValidation.errors.map(e => e.message).join(', ')}`);
      }

      // 5. Run comprehensive content optimization analysis (async, non-blocking)
      let contentOptimizationResults = null;
      try {
        contentOptimizationResults = await this.contentOptimizationService.analyzeContent(sanitizedContent, {
          title: data.title,
          contentType: data.categoryId ? 'default' : 'default', // Will be determined by category lookup
          targetKeywords: data.seoKeywords ? data.seoKeywords.split(',').map(k => k.trim()) : undefined
        });

        // Log content optimization insights for admin review
        if (contentOptimizationResults.overallScore < 70) {
          console.warn(`Post "${data.title}" content optimization score: ${contentOptimizationResults.overallScore}/100`);
          console.warn('Priority fixes:', contentOptimizationResults.summary.priority_fixes.join(', '));
        }
      } catch (optimizationError) {
        console.warn('Content optimization analysis failed:', optimizationError instanceof Error ? optimizationError.message : 'Unknown error');
      }
      
      // Normalize tags
      const normalizedTags = BlogUtilityService.normalizeTags(data.tags || []);
      
      // Set publish date if status is PUBLISHED
      const publishedAt = data.status === 'PUBLISHED' 
        ? data.publishedAt ? new Date(data.publishedAt) : new Date()
        : null;
      
      // Create post with validated and optimized content
      const post = await this.prisma.post.create({
        data: {
          title: data.title,
          slug: finalSlug,
          content: sanitizedContent,
          excerpt,
          authorId,
          categoryId: data.categoryId || null,
          featuredImageUrl: data.featuredImageUrl || null,
          status: data.status || 'DRAFT',
          publishedAt,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          readTimeMinutes,
          isFeatured: data.isFeatured || false,
          tags: normalizedTags as any,
          seoTitle: data.seoTitle || null,
          seoDescription: data.seoDescription || null,
          seoKeywords: data.seoKeywords || null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });
      
      // Create initial revision
      await this.prisma.postRevision.create({
        data: {
          postId: post.id,
          content: data.content,
          authorId,
          revisionNote: 'Initial version',
        },
      });
      
      // Trigger SEO updates if post is published
      if (data.status === 'PUBLISHED') {
        const seoTrigger = createSEOTrigger('post_published', authorId, { postId: post.id });
        this.seoIntegrationService.handleSEOUpdate(seoTrigger).catch(error => {
          console.error('SEO trigger failed for post creation:', error);
        });
      }
      
      return this.mapPostWithRelations(post);
    } catch (error) {
      if (
        error instanceof DuplicateSlugError ||
        error instanceof CategoryNotFoundError ||
        error instanceof ScheduledDateInPastError
      ) {
        throw error;
      }
      throw new BlogDatabaseError('create post', error as Error);
    }
  }

  /**
   * Update an existing post
   */
  async updatePost(
    postId: string,
    data: UpdatePostRequest,
    authorId: string
  ): Promise<Post> {
    try {
      // Check if post exists
      const existingPost = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
      });

      if (!existingPost) {
        throw new PostNotFoundError(postId);
      }

      // Generate new slug if title is being updated
      let slug = data.slug;
      if (data.title && !slug) {
        slug = BlogUtilityService.generateSlug(data.title);
      }

      // Check for duplicate slug if slug is being changed
      if (slug && slug !== existingPost.slug) {
        const duplicatePost = await this.prisma.post.findUnique({
          where: { slug, deletedAt: null },
        });

        if (duplicatePost && duplicatePost.id !== postId) {
          throw new DuplicateSlugError(slug, 'post', duplicatePost.id);
        }
      }

      // Create redirect mapping if slug is changing and post is published
      const isSlugChanging = slug && slug !== existingPost.slug;
      if (isSlugChanging && existingPost.status === 'PUBLISHED') {
        try {
          // Import the redirect creation function
          const { createSlugRedirect } = await import('@/middleware/blog-redirect.middleware');
          await createSlugRedirect(existingPost.slug, slug!, authorId); // slug is guaranteed to be defined here
        } catch (redirectError) {
          console.error('Failed to create redirect for slug change:', redirectError);
          // Don't block the post update for redirect creation failure
        }
      }

      // Validate category if provided
      if (data.categoryId !== undefined && data.categoryId) {
        const categoryExists = await this.prisma.category.findUnique({
          where: { id: data.categoryId, isActive: true },
        });

        if (!categoryExists) {
          throw new CategoryNotFoundError(data.categoryId);
        }
      }

      // Validate status transitions
      if (data.status && data.status !== existingPost.status) {
        if (!BlogUtilityService.isValidStatusTransition(existingPost.status, data.status)) {
          throw new InvalidStatusTransitionError(existingPost.status, data.status, postId);
        }

        // Don't allow republishing already published posts
        if (existingPost.status === 'PUBLISHED' && data.status === 'PUBLISHED') {
          throw new PostAlreadyPublishedError(postId, existingPost.publishedAt!);
        }
      }

      // Validate scheduled date
      if (data.status === 'SCHEDULED') {
        if (!data.scheduledFor) {
          throw new Error('Scheduled date is required when status is SCHEDULED');
        }

        if (!BlogUtilityService.isFutureDate(new Date(data.scheduledFor))) {
          throw new ScheduledDateInPastError(new Date(data.scheduledFor));
        }
      }

      // Calculate read time if content is being updated
      let readTimeMinutes = existingPost.readTimeMinutes;
      if (data.content) {
        readTimeMinutes = BlogUtilityService.calculateReadTime(data.content);
        
        // Run content optimization analysis for content updates (async, non-blocking)
        try {
          const contentOptimizationResults = await this.contentOptimizationService.analyzeContent(data.content, {
            title: data.title || existingPost.title,
            contentType: 'default',
            targetKeywords: data.seoKeywords ? data.seoKeywords.split(',').map(k => k.trim()) : undefined,
            excludePostId: postId
          });

          // Log insights for significant content optimization issues
          if (contentOptimizationResults.overallScore < 60) {
            console.warn(`Post "${existingPost.title}" updated content optimization score: ${contentOptimizationResults.overallScore}/100`);
            
            if (contentOptimizationResults.summary.priority_fixes.length > 0) {
              console.warn('Priority fixes needed:', contentOptimizationResults.summary.priority_fixes.join(', '));
            }
          }
        } catch (optimizationError) {
          console.warn('Content optimization analysis failed for post update:', optimizationError instanceof Error ? optimizationError.message : 'Unknown error');
        }
      }

      // Generate excerpt if not provided and content is being updated
      let excerpt = data.excerpt;
      if (data.content && !excerpt) {
        excerpt = BlogUtilityService.generateExcerpt(data.content);
      }

      // Normalize tags if provided
      let normalizedTags = existingPost.tags;
      if (data.tags) {
        normalizedTags = BlogUtilityService.normalizeTags(data.tags);
      }

      // Set publish date if status is changing to PUBLISHED
      let publishedAt = existingPost.publishedAt;
      if (data.status === 'PUBLISHED' && existingPost.status !== 'PUBLISHED') {
        publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date();
      }

      // Create revision if content is being updated
      if (data.content && data.content !== existingPost.content) {
        await this.prisma.postRevision.create({
          data: {
            postId,
            content: data.content,
            authorId,
            revisionNote: data.revisionNote || 'Content updated',
          },
        });
      }

      // Update post
      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: {
          ...(data.title && { title: data.title }),
          ...(slug && { slug }),
          ...(data.content && { content: data.content }),
          ...(excerpt && { excerpt }),
          ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          ...(data.featuredImageUrl !== undefined && { featuredImageUrl: data.featuredImageUrl }),
          ...(data.status && { status: data.status }),
          ...(publishedAt && { publishedAt }),
          ...(data.scheduledFor !== undefined && { 
            scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null 
          }),
          ...(data.content && { readTimeMinutes }),
          ...(data.isFeatured !== undefined && { isFeatured: data.isFeatured }),
          ...(normalizedTags && { tags: normalizedTags }),
          ...(data.seoTitle !== undefined && { seoTitle: data.seoTitle }),
          ...(data.seoDescription !== undefined && { seoDescription: data.seoDescription }),
          ...(data.seoKeywords !== undefined && { seoKeywords: data.seoKeywords }),
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      // Trigger SEO updates based on what changed
      if (data.status === 'PUBLISHED' && existingPost.status !== 'PUBLISHED') {
        // Post was just published
        const seoTrigger = createSEOTrigger('post_published', authorId, { postId });
        this.seoIntegrationService.handleSEOUpdate(seoTrigger).catch(error => {
          console.error('SEO trigger failed for post publication:', error);
        });
      } else if (existingPost.status === 'PUBLISHED') {
        // Published post was updated
        const seoTrigger = createSEOTrigger('post_updated', authorId, { postId });
        this.seoIntegrationService.handleSEOUpdate(seoTrigger).catch(error => {
          console.error('SEO trigger failed for post update:', error);
        });
      }

      return this.mapPostWithRelations(updatedPost);
    } catch (error) {
      if (
        error instanceof PostNotFoundError ||
        error instanceof DuplicateSlugError ||
        error instanceof CategoryNotFoundError ||
        error instanceof InvalidStatusTransitionError ||
        error instanceof ScheduledDateInPastError ||
        error instanceof PostAlreadyPublishedError
      ) {
        throw error;
      }
      throw new BlogDatabaseError('update post', error as Error);
    }
  }

  /**
   * Get a post by ID
   */
  async getPostById(
    postId: string,
    options: { includeRevisions?: boolean; incrementViews?: boolean } = {}
  ): Promise<Post> {
    try {
      // Increment view count if requested
      if (options.incrementViews) {
        await this.prisma.post.update({
          where: { id: postId, deletedAt: null },
          data: { viewCount: { increment: 1 } },
        });
      }

      const post = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          ...(options.includeRevisions && {
            revisions: {
              orderBy: { createdAt: 'desc' },
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          }),
          _count: {
            select: { revisions: true },
          },
        },
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      return this.mapPostWithRelations(post);
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get post', error as Error);
    }
  }

  /**
   * Get a post by slug
   */
  async getPostBySlug(
    slug: string,
    options: { includeRevisions?: boolean; incrementViews?: boolean } = {}
  ): Promise<Post> {
    try {
      // Increment view count if requested
      if (options.incrementViews) {
        await this.prisma.post.updateMany({
          where: { slug, deletedAt: null },
          data: { viewCount: { increment: 1 } },
        });
      }

      const post = await this.prisma.post.findUnique({
        where: { slug },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          ...(options.includeRevisions && {
            revisions: {
              orderBy: { createdAt: 'desc' },
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          }),
          _count: {
            select: { revisions: true },
          },
        },
      });

      if (!post || post.deletedAt) {
        throw new PostNotFoundError(slug);
      }

      return this.mapPostWithRelations(post);
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get post by slug', error as Error);
    }
  }

  /**
   * Get posts with filtering and pagination
   */
  async getPosts(options: PostsQueryOptions = {}): Promise<PostsResponse> {
    try {
      const {
        filters = {},
        sortBy = 'publishedAt',
        sortOrder = 'desc',
        page = 1,
        limit = 10,
        includeRevisions = false,
      } = options;

      const skip = (page - 1) * limit;

      const where: Prisma.PostWhereInput = {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.authorId && { authorId: filters.authorId }),
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.published !== undefined && {
          status: filters.published ? 'PUBLISHED' : { not: 'PUBLISHED' },
        }),
        ...(filters.tags && filters.tags.length > 0 && {
          tags: {
            array_contains: filters.tags,
          },
        }),
        ...(filters.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { content: { contains: filters.search, mode: 'insensitive' } },
            { excerpt: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
        ...(filters.dateRange && {
          publishedAt: {
            gte: new Date(filters.dateRange.start),
            lte: new Date(filters.dateRange.end),
          },
        }),
      };

      const orderBy: Prisma.PostOrderByWithRelationInput = {
        [sortBy]: sortOrder,
      };

      const [posts, total] = await Promise.all([
        this.prisma.post.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
            category: true,
            ...(includeRevisions && {
              revisions: {
                orderBy: { createdAt: 'desc' },
                take: 5, // Limit revisions in list view
              },
            }),
            _count: {
              select: { revisions: true },
            },
          },
        }),
        this.prisma.post.count({ where }),
      ]);

      return {
        posts: posts.map(post => this.mapPostWithRelations(post)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new BlogDatabaseError('get posts', error as Error);
    }
  }

  /**
   * Delete a post (soft delete)
   */
  async deletePost(postId: string, authorId: string): Promise<void> {
    try {
      // Check if post exists
      const post = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      // Soft delete the post
      await this.prisma.post.update({
        where: { id: postId },
        data: { deletedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('delete post', error as Error);
    }
  }

  /**
   * Restore a deleted post
   */
  async restorePost(postId: string, authorId: string): Promise<Post> {
    try {
      // Check if post exists and is deleted
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      if (!post.deletedAt) {
        throw new Error('Post is not deleted');
      }

      // Restore the post
      const restoredPost = await this.prisma.post.update({
        where: { id: postId },
        data: { deletedAt: null },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      return this.mapPostWithRelations(restoredPost);
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('restore post', error as Error);
    }
  }

  // ========================================
  // POST REVISION OPERATIONS
  // ========================================

  /**
   * Create a post revision
   */
  async createPostRevision(
    data: CreatePostRevisionRequest,
    authorId: string
  ): Promise<PostRevision> {
    try {
      // Check if post exists
      const postExists = await this.prisma.post.findUnique({
        where: { id: data.postId, deletedAt: null },
      });

      if (!postExists) {
        throw new PostNotFoundError(data.postId);
      }

      // Create revision
      const revision = await this.prisma.postRevision.create({
        data: {
          postId: data.postId,
          content: data.content,
          authorId,
          revisionNote: data.revisionNote || null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return {
        id: revision.id,
        postId: revision.postId,
        content: revision.content,
        authorId: revision.authorId,
        revisionNote: revision.revisionNote,
        createdAt: revision.createdAt,
        author: revision.author,
      };
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('create post revision', error as Error);
    }
  }

  /**
   * Get post revisions
   */
  async getPostRevisions(
    postId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ revisions: PostRevision[]; total: number; page: number; limit: number }> {
    try {
      const { page = 1, limit = 10 } = options;
      const skip = (page - 1) * limit;

      // Check if post exists
      const postExists = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
      });

      if (!postExists) {
        throw new PostNotFoundError(postId);
      }

      const [revisions, total] = await Promise.all([
        this.prisma.postRevision.findMany({
          where: { postId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        }),
        this.prisma.postRevision.count({ where: { postId } }),
      ]);

      return {
        revisions: revisions.map(revision => ({
          id: revision.id,
          postId: revision.postId,
          content: revision.content,
          authorId: revision.authorId,
          revisionNote: revision.revisionNote,
          createdAt: revision.createdAt,
          author: revision.author,
        })),
        total,
        page,
        limit,
      };
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get post revisions', error as Error);
    }
  }

  /**
   * Get a specific revision
   */
  async getRevisionById(revisionId: string): Promise<PostRevision> {
    try {
      const revision = await this.prisma.postRevision.findUnique({
        where: { id: revisionId },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!revision) {
        throw new PostRevisionNotFoundError(revisionId);
      }

      return {
        id: revision.id,
        postId: revision.postId,
        content: revision.content,
        authorId: revision.authorId,
        revisionNote: revision.revisionNote,
        createdAt: revision.createdAt,
        author: revision.author,
      };
    } catch (error) {
      if (error instanceof PostRevisionNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get revision', error as Error);
    }
  }

  /**
   * Duplicate an existing post
   */
  async duplicatePost(
    postId: string,
    authorId: string,
    overrides: Partial<CreatePostRequest> = {}
  ): Promise<Post> {
    try {
      // Get the source post
      const sourcePost = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
        include: {
          category: true,
        },
      });

      if (!sourcePost) {
        throw new PostNotFoundError(postId);
      }

      // Generate a unique slug for the duplicate
      const baseTitleSuffix = overrides.title ? '' : ' (Copy)';
      const duplicateTitle = overrides.title || `${sourcePost.title}${baseTitleSuffix}`;
      
      // Get existing slugs to ensure uniqueness
      const existingSlugs = await this.prisma.post.findMany({
        where: { deletedAt: null },
        select: { slug: true },
      }).then(posts => posts.map(p => p.slug));

      const slug = BlogUtilityService.generateSlug(duplicateTitle, { existingSlugs });

      // Calculate read time for the content
      const readTimeMinutes = BlogUtilityService.calculateReadTime(
        overrides.content || sourcePost.content
      );

      // Generate excerpt
      const excerpt = overrides.excerpt || 
        BlogUtilityService.generateExcerpt(overrides.content || sourcePost.content);

      // Normalize tags
      const tags = overrides.tags ? 
        BlogUtilityService.normalizeTags(overrides.tags) : 
        sourcePost.tags;

      // Create the duplicate post with draft status
      const duplicatePost = await this.prisma.post.create({
        data: {
          title: duplicateTitle,
          slug,
          content: overrides.content || sourcePost.content,
          excerpt,
          authorId, // Set the current user as the author of the duplicate
          categoryId: overrides.categoryId || sourcePost.categoryId,
          featuredImageUrl: overrides.featuredImageUrl || sourcePost.featuredImageUrl,
          status: 'DRAFT', // Always start as draft
          publishedAt: null, // Clear publication date
          scheduledFor: overrides.scheduledFor ? new Date(overrides.scheduledFor) : null,
          readTimeMinutes,
          tags: tags as any,
          seoTitle: overrides.seoTitle || sourcePost.seoTitle,
          seoDescription: overrides.seoDescription || sourcePost.seoDescription,
          seoKeywords: overrides.seoKeywords || sourcePost.seoKeywords,
          viewCount: 0, // Reset view count
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      // Create initial revision for the duplicate
      await this.prisma.postRevision.create({
        data: {
          postId: duplicatePost.id,
          content: duplicatePost.content,
          authorId,
          revisionNote: `Duplicated from post: ${sourcePost.title}`,
        },
      });

      return this.mapPostWithRelations(duplicatePost);
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('duplicate post', error as Error);
    }
  }

  /**
   * Upload and set featured image for a post
   */
  async uploadFeaturedImage(
    postId: string,
    imageFile: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
    authorId: string
  ): Promise<{ imageUrl: string; storageKey: string }> {
    try {
      // Verify post exists and user has permission
      const post = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      // Validate image file
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimeTypes.includes(imageFile.mimetype)) {
        throw new Error('Invalid image format. Only JPEG, PNG, WebP, and GIF are allowed.');
      }

      const maxFileSize = 5 * 1024 * 1024; // 5MB
      if (imageFile.size > maxFileSize) {
        throw new Error('Image file size must be less than 5MB.');
      }

      // Generate unique storage key
      const fileExtension = imageFile.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const storageKey = `blog/featured-images/${post.slug}-${timestamp}-${randomString}.${fileExtension}`;

      // Note: This is a placeholder for actual storage integration
      // In a real implementation, you would:
      // 1. Upload to your storage provider (AWS S3, Cloudflare R2, etc.)
      // 2. Generate optimized versions (thumbnails, WebP variants)
      // 3. Return the public URL
      
      // For now, we'll simulate the upload
      const imageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/uploads/${storageKey}`;
      
      // Update post with featured image URL
      await this.prisma.post.update({
        where: { id: postId },
        data: { featuredImageUrl: imageUrl },
      });

      // Create revision to track the image update
      await this.prisma.postRevision.create({
        data: {
          postId,
          content: post.content,
          authorId,
          revisionNote: `Featured image updated: ${imageFile.originalname}`,
        },
      });

      return { imageUrl, storageKey };
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('upload featured image', error as Error);
    }
  }

  /**
   * Remove featured image from a post
   */
  async removeFeaturedImage(postId: string, authorId: string): Promise<void> {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId, deletedAt: null },
      });

      if (!post) {
        throw new PostNotFoundError(postId);
      }

      if (!post.featuredImageUrl) {
        throw new Error('Post does not have a featured image to remove.');
      }

      // Update post to remove featured image
      await this.prisma.post.update({
        where: { id: postId },
        data: { featuredImageUrl: null },
      });

      // Create revision to track the removal
      await this.prisma.postRevision.create({
        data: {
          postId,
          content: post.content,
          authorId,
          revisionNote: 'Featured image removed',
        },
      });

      // Note: In a real implementation, you would also:
      // 1. Delete the image from storage
      // 2. Clean up any generated variants/thumbnails
      
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('remove featured image', error as Error);
    }
  }

  // ========================================
  // CONTENT OPTIMIZATION OPERATIONS
  // ========================================

  /**
   * Get comprehensive content optimization analysis for a post
   */
  async getPostContentOptimization(postId: string): Promise<{
    post: Post;
    optimization: any; // ContentOptimizationResult
  }> {
    try {
      const post = await this.getPostById(postId);
      
      const optimization = await this.contentOptimizationService.analyzeContent(post.content, {
        title: post.title,
        contentType: post.category?.name?.toLowerCase() || 'default',
        targetKeywords: post.seoKeywords ? post.seoKeywords.split(',').map(k => k.trim()) : undefined,
        excludePostId: postId
      });

      return {
        post,
        optimization
      };
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('get post content optimization', error as Error);
    }
  }

  /**
   * Get content optimization analysis for multiple posts (bulk analysis)
   */
  async bulkContentOptimizationAnalysis(
    filters: {
      status?: string;
      categoryId?: string;
      authorId?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
    } = {}
  ): Promise<{
    posts: Array<{
      id: string;
      title: string;
      slug: string;
      status: string;
      optimization: any;
    }>;
    summary: {
      totalAnalyzed: number;
      averageScore: number;
      commonIssues: Array<{ issue: string; count: number }>;
      recommendations: Array<{ recommendation: string; priority: 'high' | 'medium' | 'low' }>;
    };
  }> {
    try {
      const { limit = 50, ...otherFilters } = filters;
      
      // Get posts for analysis
      const postsResult = await this.getPosts({
        filters: otherFilters,
        limit: Math.min(limit, 100), // Cap at 100 for performance
        sortBy: 'updatedAt',
        sortOrder: 'desc'
      });

      const posts = postsResult.posts;
      const analyses = [];
      const issues = new Map<string, number>();
      let totalScore = 0;

      for (const post of posts) {
        try {
          const optimization = await this.contentOptimizationService.analyzeContent(post.content, {
            title: post.title,
            contentType: post.category?.name?.toLowerCase() || 'default',
            excludePostId: post.id
          });

          analyses.push({
            id: post.id,
            title: post.title,
            slug: post.slug,
            status: post.status,
            optimization
          });

          totalScore += optimization.overallScore;

          // Collect common issues
          optimization.summary.issues.forEach((issue: string) => {
            issues.set(issue, (issues.get(issue) || 0) + 1);
          });

        } catch (analysisError) {
          console.warn(`Failed to analyze post ${post.id}:`, analysisError instanceof Error ? analysisError.message : 'Unknown error');
        }
      }

      // Generate summary
      const averageScore = analyses.length > 0 ? Math.round(totalScore / analyses.length) : 0;
      
      const commonIssues = Array.from(issues.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([issue, count]) => ({ issue, count }));

      // Generate high-level recommendations
      const recommendations = [];
      if (averageScore < 70) {
        recommendations.push({ 
          recommendation: 'Overall content quality needs improvement across multiple posts', 
          priority: 'high' as const 
        });
      }
      if (commonIssues.some(issue => issue.issue.includes('readability'))) {
        recommendations.push({ 
          recommendation: 'Focus on improving content readability and structure', 
          priority: 'medium' as const 
        });
      }
      if (commonIssues.some(issue => issue.issue.includes('image'))) {
        recommendations.push({ 
          recommendation: 'Improve image alt text compliance across posts', 
          priority: 'medium' as const 
        });
      }

      return {
        posts: analyses,
        summary: {
          totalAnalyzed: analyses.length,
          averageScore,
          commonIssues,
          recommendations
        }
      };

    } catch (error) {
      throw new BlogDatabaseError('bulk content optimization analysis', error as Error);
    }
  }

  /**
   * Generate content optimization report for admin dashboard
   */
  async generateContentOptimizationReport(
    dateRange?: { from: Date; to: Date }
  ): Promise<{
    overview: {
      totalPosts: number;
      averageOptimizationScore: number;
      postsNeedingAttention: number;
      trendsOverTime: Array<{ period: string; averageScore: number; postCount: number }>;
    };
    topIssues: Array<{ issue: string; affectedPosts: number; severity: 'high' | 'medium' | 'low' }>;
    recommendations: Array<{ 
      category: string; 
      recommendation: string; 
      impact: 'high' | 'medium' | 'low';
      effort: 'easy' | 'moderate' | 'difficult';
    }>;
    categoryBreakdown: Array<{
      categoryName: string;
      averageScore: number;
      postCount: number;
      commonIssues: string[];
    }>;
  }> {
    try {
      // Get posts within date range
      const filters: any = { status: 'PUBLISHED' };
      if (dateRange) {
        filters.dateRange = { start: dateRange.from, end: dateRange.to };
      }

      const bulkAnalysis = await this.bulkContentOptimizationAnalysis(filters);
      
      // Calculate overview metrics
      const totalPosts = bulkAnalysis.summary.totalAnalyzed;
      const averageOptimizationScore = bulkAnalysis.summary.averageScore;
      const postsNeedingAttention = bulkAnalysis.posts.filter(p => p.optimization.overallScore < 70).length;

      // Generate category breakdown
      const categoryMap = new Map<string, { scores: number[]; issues: string[] }>();
      
      for (const post of bulkAnalysis.posts) {
        const categoryName = 'General'; // Would get from post.category if available
        if (!categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, { scores: [], issues: [] });
        }
        
        const categoryData = categoryMap.get(categoryName)!;
        categoryData.scores.push(post.optimization.overallScore);
        categoryData.issues.push(...post.optimization.summary.issues);
      }

      const categoryBreakdown = Array.from(categoryMap.entries()).map(([categoryName, data]) => ({
        categoryName,
        averageScore: Math.round(data.scores.reduce((sum, score) => sum + score, 0) / data.scores.length),
        postCount: data.scores.length,
        commonIssues: [...new Set(data.issues)].slice(0, 3)
      }));

      // Convert common issues to top issues with severity
      const topIssues = bulkAnalysis.summary.commonIssues.map(({ issue, count }) => ({
        issue,
        affectedPosts: count,
        severity: (count / totalPosts > 0.5 ? 'high' : count / totalPosts > 0.2 ? 'medium' : 'low') as 'high' | 'medium' | 'low'
      }));

      // Generate high-level recommendations
      const recommendations = [
        {
          category: 'Content Quality',
          recommendation: 'Implement content review checklist focusing on readability and structure',
          impact: 'high' as const,
          effort: 'easy' as const
        },
        {
          category: 'SEO Optimization',
          recommendation: 'Optimize heading structure and keyword density across posts',
          impact: 'medium' as const,
          effort: 'moderate' as const
        },
        {
          category: 'Accessibility',
          recommendation: 'Improve image alt text quality and consistency',
          impact: 'medium' as const,
          effort: 'easy' as const
        }
      ];

      return {
        overview: {
          totalPosts,
          averageOptimizationScore,
          postsNeedingAttention,
          trendsOverTime: [] // Would implement time-based trending if historical data available
        },
        topIssues,
        recommendations,
        categoryBreakdown
      };

    } catch (error) {
      throw new BlogDatabaseError('generate content optimization report', error as Error);
    }
  }

  // ========================================
  // POST STATUS TRANSITION OPERATIONS
  // ========================================

  /**
   * Publish a draft or scheduled post
   */
  async publishPost(postId: string, authorId: string, publishedAt?: Date): Promise<Post> {
    try {
      // Get existing post
      const existingPost = await this.prisma.post.findFirst({
        where: {
          id: postId,
          deletedAt: null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      if (!existingPost) {
        throw new PostNotFoundError(postId);
      }

      // Check if post is already published
      if (existingPost.status === 'PUBLISHED') {
        throw new PostAlreadyPublishedError(postId, existingPost.publishedAt || new Date());
      }

      // Validate status transition
      if (!BlogUtilityService.isValidStatusTransition(existingPost.status, 'PUBLISHED')) {
        throw new InvalidStatusTransitionError(existingPost.status, 'PUBLISHED', postId);
      }

      // Check permissions (author or admin can publish)
      if (existingPost.authorId !== authorId) {
        // TODO: Add role check for admin users once auth context is available
        throw new InsufficientPermissionsError('publish', 'post', postId);
      }

      // Create revision before status change
      await this.createPostRevision({
        postId,
        content: existingPost.content,
        revisionNote: `Post published by ${authorId}`,
      }, authorId);

      // Update post to published status
      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: {
          status: 'PUBLISHED',
          publishedAt: publishedAt || new Date(),
          scheduledFor: null, // Clear scheduled date if it was set
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      return this.mapPostWithRelations(updatedPost);
    } catch (error) {
      if (
        error instanceof PostNotFoundError ||
        error instanceof PostAlreadyPublishedError ||
        error instanceof InvalidStatusTransitionError ||
        error instanceof InsufficientPermissionsError
      ) {
        throw error;
      }
      throw new BlogDatabaseError(`Failed to publish post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Schedule a draft post for future publication
   */
  async schedulePost(postId: string, scheduledFor: Date, authorId: string): Promise<Post> {
    try {
      // Validate scheduled date is in the future
      if (!BlogUtilityService.isFutureDate(scheduledFor)) {
        throw new ScheduledDateInPastError(scheduledFor);
      }

      // Get existing post
      const existingPost = await this.prisma.post.findFirst({
        where: {
          id: postId,
          deletedAt: null,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      if (!existingPost) {
        throw new PostNotFoundError(postId);
      }

      // Check if post is already published
      if (existingPost.status === 'PUBLISHED') {
        throw new PostAlreadyPublishedError(postId, existingPost.publishedAt || new Date());
      }

      // Validate status transition
      if (!BlogUtilityService.isValidStatusTransition(existingPost.status, 'SCHEDULED')) {
        throw new InvalidStatusTransitionError(existingPost.status, 'SCHEDULED', postId);
      }

      // Check permissions (author or admin can schedule)
      if (existingPost.authorId !== authorId) {
        // TODO: Add role check for admin users once auth context is available
        throw new InsufficientPermissionsError('schedule', 'post', postId);
      }

      // Create revision before status change
      await this.createPostRevision({
        postId,
        content: existingPost.content,
        revisionNote: `Post scheduled for ${scheduledFor.toISOString()} by ${authorId}`,
      }, authorId);

      // Update post to scheduled status
      const updatedPost = await this.prisma.post.update({
        where: { id: postId },
        data: {
          status: 'SCHEDULED',
          scheduledFor,
          publishedAt: null, // Clear published date
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: true,
          _count: {
            select: { revisions: true },
          },
        },
      });

      return this.mapPostWithRelations(updatedPost);
    } catch (error) {
      if (
        error instanceof PostNotFoundError ||
        error instanceof PostAlreadyPublishedError ||
        error instanceof InvalidStatusTransitionError ||
        error instanceof InsufficientPermissionsError ||
        error instanceof ScheduledDateInPastError
      ) {
        throw error;
      }
      throw new BlogDatabaseError(`Failed to schedule post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method to map category with count
  private mapCategoryWithCount(category: any): Category {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parentCategoryId: category.parentCategoryId,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      ...(category.parentCategory && { parentCategory: category.parentCategory }),
      ...(category.childCategories && { childCategories: category.childCategories }),
      ...(category._count && { postCount: category._count.posts }),
    };
  }

  // Helper method to map post with relations
  private mapPostWithRelations(post: any): Post {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      authorId: post.authorId,
      categoryId: post.categoryId,
      featuredImageUrl: post.featuredImageUrl,
      status: post.status,
      publishedAt: post.publishedAt,
      scheduledFor: post.scheduledFor,
      readTimeMinutes: post.readTimeMinutes,
      viewCount: post.viewCount,
      isFeatured: post.isFeatured,
      tags: Array.isArray(post.tags) ? post.tags : [],
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      seoKeywords: post.seoKeywords,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      deletedAt: post.deletedAt,
      ...(post.author && { author: post.author }),
      ...(post.category && { category: post.category }),
      ...(post.revisions && { revisions: post.revisions }),
      ...(post._count && { revisionCount: post._count.revisions }),
    };
  }

  // ========================================
  // CONTENT DISCOVERY OPERATIONS
  // ========================================

  /**
   * Get featured posts for homepage and content discovery
   */
  async getFeaturedPosts(options: {
    limit?: number;
    categoryId?: string;
  } = {}): Promise<Post[]> {
    const { limit = 6, categoryId } = options;

    try {
      const posts = await this.prisma.post.findMany({
        where: {
          isFeatured: true,
          status: 'PUBLISHED',
          publishedAt: {
            lte: new Date()
          },
          deletedAt: null,
          ...(categoryId && { categoryId }),
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [
          { publishedAt: 'desc' },
        ],
        take: Math.min(limit, 20), // Max 20 featured posts
      });

      return posts.map(post => this.mapPostWithRelations(post));
    } catch (error) {
      throw new BlogDatabaseError('Failed to fetch featured posts', error as Error);
    }
  }

  /**
   * Get posts related to a specific post based on category, tags, and author
   */
  async getRelatedPosts(postId: string, options: {
    limit?: number;
  } = {}): Promise<Post[]> {
    const { limit = 5 } = options;

    try {
      // First, get the target post to understand its characteristics
      const targetPost = await this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          categoryId: true,
          authorId: true,
          tags: true,
          publishedAt: true,
        },
      });

      if (!targetPost) {
        throw new PostNotFoundError(postId);
      }

      // Build related posts query with scoring logic
      const relatedPosts = await this.prisma.post.findMany({
        where: {
          id: { not: postId }, // Exclude the original post
          status: 'PUBLISHED',
          publishedAt: {
            lte: new Date()
          },
          deletedAt: null,
          OR: [
            // Same category (highest priority)
            ...(targetPost.categoryId ? [{ categoryId: targetPost.categoryId }] : []),
            // Shared tags
            ...(Array.isArray(targetPost.tags) && targetPost.tags.length > 0 ? 
              targetPost.tags.map(tag => ({
                tags: {
                  path: '$',
                  array_contains: tag
                }
              })) : []
            ),
            // Same author
            { authorId: targetPost.authorId },
          ],
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [
          { publishedAt: 'desc' },
        ],
        take: Math.min(limit * 3, 60), // Get more to score and filter
      });

      // Score and sort related posts
      const scoredPosts = relatedPosts.map(post => {
        let score = 0;
        
        // Same category gets highest score
        if (post.categoryId === targetPost.categoryId) {
          score += 10;
        }
        
        // Count matching tags
        if (Array.isArray(targetPost.tags) && Array.isArray(post.tags)) {
          const targetTags = targetPost.tags as string[];
          const postTags = post.tags as string[];
          const matchingTags = targetTags.filter(tag => postTags.includes(tag));
          score += matchingTags.length * 3;
        }
        
        // Same author gets points
        if (post.authorId === targetPost.authorId) {
          score += 5;
        }
        
        // Recent posts get slight boost
        if (post.publishedAt && targetPost.publishedAt) {
          const daysDiff = Math.abs(
            (post.publishedAt.getTime() - targetPost.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysDiff <= 30) {
            score += 2;
          }
        }

        return { post, score };
      });

      // Sort by score and take top results
      const topRelatedPosts = scoredPosts
        .filter(item => item.score > 0) // Only include posts with some relevance
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => this.mapPostWithRelations(item.post));

      return topRelatedPosts;
    } catch (error) {
      if (error instanceof PostNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to fetch related posts', error as Error);
    }
  }

  /**
   * Get all categories with post counts (hierarchical structure)
   */
  async getAllCategories(options: {
    includeEmpty?: boolean;
    activeOnly?: boolean;
    flat?: boolean;
  } = {}): Promise<Category[]> {
    const { includeEmpty = false, activeOnly = true, flat = false } = options;

    try {
      const categories = await this.prisma.category.findMany({
        where: {
          ...(activeOnly && { isActive: true }),
        },
        include: {
          _count: {
            select: {
              posts: {
                where: {
                  status: 'PUBLISHED',
                  deletedAt: null,
                  publishedAt: {
                    lte: new Date()
                  }
                }
              }
            }
          },
          parentCategory: true,
        },
        orderBy: [
          { displayOrder: 'asc' },
          { name: 'asc' },
        ],
      });

      let filteredCategories = categories;

      // Filter out empty categories if requested
      if (!includeEmpty) {
        filteredCategories = categories.filter(cat => cat._count.posts > 0);
      }

      if (flat) {
        return filteredCategories.map(cat => this.mapCategoryWithCount(cat));
      }

      // Build hierarchical structure
      const categoryMap = new Map();
      const topLevelCategories: any[] = [];

      // First pass: create map and identify top-level categories
      filteredCategories.forEach(category => {
        const mappedCategory = {
          ...this.mapCategoryWithCount(category),
          children: [],
        };
        categoryMap.set(category.id, mappedCategory);

        if (!category.parentCategoryId) {
          topLevelCategories.push(mappedCategory);
        }
      });

      // Second pass: build parent-child relationships
      filteredCategories.forEach(category => {
        if (category.parentCategoryId && categoryMap.has(category.parentCategoryId)) {
          const parent = categoryMap.get(category.parentCategoryId);
          const child = categoryMap.get(category.id);
          if (parent && child) {
            parent.children.push(child);
          }
        }
      });

      return topLevelCategories;
    } catch (error) {
      throw new BlogDatabaseError('Failed to fetch categories', error as Error);
    }
  }

  /**
   * Get posts by category slug with filtering and pagination
   */
  async getPostsByCategorySlug(
    categorySlug: string,
    options: {
      includeSubcategories?: boolean;
      page?: number;
      limit?: number;
      sortBy?: 'publishedAt' | 'viewCount' | 'readTimeMinutes' | 'title';
      sortOrder?: 'asc' | 'desc';
      authorId?: string;
      tags?: string[];
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<{
    category: Category;
    posts: Post[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const {
      includeSubcategories = true,
      page = 1,
      limit = 20,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      authorId,
      tags,
      dateFrom,
      dateTo,
    } = options;

    try {
      // Find the category
      const category = await this.prisma.category.findUnique({
        where: { slug: categorySlug },
        include: {
          _count: {
            select: {
              posts: {
                where: {
                  status: 'PUBLISHED',
                  deletedAt: null,
                  publishedAt: {
                    lte: new Date()
                  }
                }
              }
            }
          },
        },
      });

      if (!category) {
        throw new CategoryNotFoundError(`Category with slug "${categorySlug}" not found`);
      }

      if (!category.isActive) {
        throw new CategoryNotFoundError(`Category "${categorySlug}" is not active`);
      }

      // Get category IDs to include
      let categoryIds = [category.id];
      
      if (includeSubcategories) {
        const getAllChildCategoryIds = async (parentId: string): Promise<string[]> => {
          const children = await this.prisma.category.findMany({
            where: { parentCategoryId: parentId, isActive: true },
            select: { id: true },
          });
          
          let allIds: string[] = [];
          for (const child of children) {
            allIds.push(child.id);
            const grandchildren = await getAllChildCategoryIds(child.id);
            allIds = allIds.concat(grandchildren);
          }
          return allIds;
        };

        const childIds = await getAllChildCategoryIds(category.id);
        categoryIds = categoryIds.concat(childIds);
      }

      // Build where clause
      const whereClause: any = {
        categoryId: { in: categoryIds },
        status: 'PUBLISHED',
        publishedAt: {
          lte: new Date(),
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo && { lte: dateTo }),
        },
        deletedAt: null,
        ...(authorId && { authorId }),
      };

      // Add tags filter
      if (tags && tags.length > 0) {
        whereClause.AND = tags.map(tag => ({
          tags: {
            path: '$',
            array_contains: tag
          }
        }));
      }

      // Get total count
      const total = await this.prisma.post.count({ where: whereClause });

      // Get posts with pagination
      const posts = await this.prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: Math.min(limit, 100), // Max 100 per page
      });

      const totalPages = Math.ceil(total / limit);

      return {
        category: this.mapCategoryWithCount(category),
        posts: posts.map(post => this.mapPostWithRelations(post)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        throw error;
      }
      throw new BlogDatabaseError('Failed to fetch posts by category', error as Error);
    }
  }

  /**
   * Search posts using full-text search with relevance scoring
   */
  async searchPosts(
    searchQuery: string,
    options: {
      page?: number;
      limit?: number;
      categoryId?: string;
      authorId?: string;
      tags?: string[];
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<{
    posts: (Post & { relevanceScore?: number })[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    searchQuery: string;
  }> {
    const {
      page = 1,
      limit = 20,
      categoryId,
      authorId,
      tags,
      dateFrom,
      dateTo,
    } = options;

    try {
      // Sanitize search query
      const sanitizedQuery = searchQuery.trim().replace(/[<>&'"]/g, '');
      
      if (sanitizedQuery.length < 2) {
        return {
          posts: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
          searchQuery: sanitizedQuery,
        };
      }

      // Build where clause for additional filters
      const additionalFilters: any = {
        status: 'PUBLISHED',
        publishedAt: {
          lte: new Date(),
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo && { lte: dateTo }),
        },
        deletedAt: null,
        ...(categoryId && { categoryId }),
        ...(authorId && { authorId }),
      };

      // Add tags filter
      if (tags && tags.length > 0) {
        additionalFilters.AND = tags.map(tag => ({
          tags: {
            path: '$',
            array_contains: tag
          }
        }));
      }

      // Use PostgreSQL full-text search with ranking
      const posts = await this.prisma.$queryRaw<any[]>`
        SELECT 
          p.*,
          (
            ts_rank(to_tsvector('english', p.title), plainto_tsquery('english', ${sanitizedQuery})) * 4 +
            ts_rank(to_tsvector('english', p.content), plainto_tsquery('english', ${sanitizedQuery})) * 2 +
            ts_rank(to_tsvector('english', COALESCE(p.excerpt, '')), plainto_tsquery('english', ${sanitizedQuery}))
          ) AS relevance_score
        FROM posts p
        WHERE 
          p.status = 'PUBLISHED'
          AND p.published_at <= NOW()
          AND p.deleted_at IS NULL
          AND (
            to_tsvector('english', p.title) @@ plainto_tsquery('english', ${sanitizedQuery}) OR
            to_tsvector('english', p.content) @@ plainto_tsquery('english', ${sanitizedQuery}) OR
            to_tsvector('english', COALESCE(p.excerpt, '')) @@ plainto_tsquery('english', ${sanitizedQuery})
          )
          ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}` : Prisma.empty}
          ${authorId ? Prisma.sql`AND p.author_id = ${authorId}` : Prisma.empty}
        ORDER BY relevance_score DESC, p.published_at DESC
        LIMIT ${Math.min(limit, 100)}
        OFFSET ${(page - 1) * limit}
      `;

      // Get total count for pagination
      const totalResult = await this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*) as count
        FROM posts p
        WHERE 
          p.status = 'PUBLISHED'
          AND p.published_at <= NOW()
          AND p.deleted_at IS NULL
          AND (
            to_tsvector('english', p.title) @@ plainto_tsquery('english', ${sanitizedQuery}) OR
            to_tsvector('english', p.content) @@ plainto_tsquery('english', ${sanitizedQuery}) OR
            to_tsvector('english', COALESCE(p.excerpt, '')) @@ plainto_tsquery('english', ${sanitizedQuery})
          )
          ${categoryId ? Prisma.sql`AND p.category_id = ${categoryId}` : Prisma.empty}
          ${authorId ? Prisma.sql`AND p.author_id = ${authorId}` : Prisma.empty}
      `;

      const total = Number(totalResult[0]?.count || 0);

      // Enrich posts with author and category data
      const enrichedPosts = await Promise.all(
        posts.map(async (post) => {
          const fullPost = await this.prisma.post.findUnique({
            where: { id: post.id },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                },
              },
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          });

          return {
            ...this.mapPostWithRelations(fullPost!),
            relevanceScore: parseFloat(post.relevance_score || '0'),
          };
        })
      );

      const totalPages = Math.ceil(total / limit);

      return {
        posts: enrichedPosts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        searchQuery: sanitizedQuery,
      };
    } catch (error) {
      throw new BlogDatabaseError('Failed to search posts', error as Error);
    }
  }

  /**
   * Get posts by tag with filtering and pagination
   */
  async getPostsByTag(
    tag: string,
    options: {
      page?: number;
      limit?: number;
      sortBy?: 'publishedAt' | 'viewCount' | 'readTimeMinutes' | 'title';
      sortOrder?: 'asc' | 'desc';
      categoryId?: string;
      authorId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<{
    tag: string;
    postCount: number;
    posts: Post[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
      categoryId,
      authorId,
      dateFrom,
      dateTo,
    } = options;

    try {
      // Normalize tag for consistent searching
      const normalizedTag = tag.toLowerCase().trim();

      // Build where clause
      const whereClause: any = {
        tags: {
          path: '$',
          array_contains: normalizedTag
        },
        status: 'PUBLISHED',
        publishedAt: {
          lte: new Date(),
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo && { lte: dateTo }),
        },
        deletedAt: null,
        ...(categoryId && { categoryId }),
        ...(authorId && { authorId }),
      };

      // Get total count
      const total = await this.prisma.post.count({ where: whereClause });

      if (total === 0) {
        return {
          tag: normalizedTag,
          postCount: 0,
          posts: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        };
      }

      // Get posts with pagination
      const posts = await this.prisma.post.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: Math.min(limit, 100), // Max 100 per page
      });

      const totalPages = Math.ceil(total / limit);

      return {
        tag: normalizedTag,
        postCount: total,
        posts: posts.map(post => this.mapPostWithRelations(post)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      throw new BlogDatabaseError('Failed to fetch posts by tag', error as Error);
    }
  }
}
