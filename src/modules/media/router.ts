import { z } from 'zod';
import { TRPCError } from '@trpc/server';

import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { MediaService } from './services/MediaService';
import { logger } from '@/lib/logger';

import {
  searchSchema,
  createCollectionSchema,
  updateMediaSchema,
  bulkDeleteSchema,
  initiateUploadSchema
} from './validation';

export const mediaRouter = createTRPCRouter({
  // ========================================
  // UPLOAD ENDPOINTS
  // ========================================

  uploadMedia: protectedProcedure
    .input(z.object({
      filename: z.string(),
      mimeType: z.string(),
      file: z.union([z.string(), z.instanceof(Buffer)]),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      collectionId: z.string().optional(),
      generateVariants: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const mediaService = new MediaService(ctx.db);
        
        // Convert base64 to buffer if needed
        let buffer: Buffer;
        if (typeof input.file === 'string') {
          // Assume base64 encoded
          const base64Data = input.file.replace(/^data:[^;]+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
        } else {
          buffer = input.file;
        }

        const result = await mediaService.uploadMedia(
          buffer,
          input.filename,
          input.mimeType,
          ctx.session.user.id,
          {
            title: input.title,
            description: input.description,
            tags: input.tags,
            collectionId: input.collectionId,
            generateVariants: input.generateVariants
          }
        );

        logger.info('Media uploaded via API', { 
          mediaItemId: result.mediaItem.id,
          userId: ctx.session.user.id,
          filename: input.filename
        });

        return result;

      } catch (error) {
        logger.error('Media upload API error', { 
          error, 
          userId: ctx.session.user.id,
          filename: input.filename
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to upload media'
        });
      }
    }),

  // ========================================
  // RETRIEVAL ENDPOINTS
  // ========================================

  getMediaItems: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
      search: z.string().optional(),
      type: z.string().optional(),
      tags: z.array(z.string()).optional()
    }))
    .query(async ({ ctx, input }) => {
      try {
        const mediaService = new MediaService(ctx.db);
        
        return await mediaService.getMediaItems(
          {
            search: input.search,
            type: input.type,
            tags: input.tags
          },
          ctx.session.user.id,
          input.page,
          input.limit
        );

      } catch (error) {
        logger.error('Get media items API error', { 
          error, 
          userId: ctx.session.user.id
        });
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve media items'
        });
      }
    }),

  getMediaItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const mediaService = new MediaService(ctx.db);
        
        return await mediaService.getMediaItem(input.id, ctx.session.user.id);

      } catch (error) {
        logger.error('Get media item API error', { 
          error, 
          userId: ctx.session.user.id,
          mediaItemId: input.id
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve media item'
        });
      }
    }),

  getMediaStats: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const stats = await ctx.db.mediaItem.aggregate({
          where: { 
            deletedAt: null,
            uploadedBy: ctx.session.user.id 
          },
          _count: { id: true },
          _sum: { fileSize: true }
        });

        const typeBreakdown = await ctx.db.mediaItem.groupBy({
          by: ['type'],
          where: { 
            deletedAt: null,
            uploadedBy: ctx.session.user.id 
          },
          _count: { id: true },
          _sum: { fileSize: true }
        });

        return {
          totalItems: stats._count.id,
          totalSize: stats._sum.fileSize?.toString() || '0',
          typeBreakdown: typeBreakdown.map((item: any) => ({
            type: item.type,
            count: item._count.id,
            size: item._sum.fileSize?.toString() || '0'
          }))
        };

      } catch (error) {
        logger.error('Get media stats API error', { 
          error, 
          userId: ctx.session.user.id
        });
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve media statistics'
        });
      }
    }),

  // ========================================
  // MANAGEMENT ENDPOINTS
  // ========================================

  updateMediaItem: protectedProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if user owns the media item or is admin
        const mediaItem = await ctx.db.mediaItem.findFirst({
          where: { 
            id: input.id,
            deletedAt: null 
          }
        });

        if (!mediaItem) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media item not found'
          });
        }

        if (mediaItem.uploadedBy !== ctx.session.user.id && ctx.session.user.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only edit your own media items'
          });
        }

        const updatedItem = await ctx.db.mediaItem.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description,
            tags: input.tags
          },
          include: {
            uploader: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            variants: true,
            collections: {
              include: {
                collection: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              }
            }
          }
        });

        logger.info('Media item updated', { 
          mediaItemId: input.id,
          userId: ctx.session.user.id
        });

        return {
          success: true,
          mediaItem: {
            ...updatedItem,
            fileSize: updatedItem.fileSize.toString(),
            variants: updatedItem.variants.map((variant: any) => ({
              ...variant,
              fileSize: variant.fileSize.toString()
            })),
            collections: updatedItem.collections.map((col: any) => col.collection)
          }
        };

      } catch (error) {
        logger.error('Update media item API error', { 
          error, 
          userId: ctx.session.user.id,
          mediaItemId: input.id
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update media item'
        });
      }
    }),

  deleteMediaItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if user owns the media item or is admin
        const mediaItem = await ctx.db.mediaItem.findFirst({
          where: { 
            id: input.id,
            deletedAt: null 
          }
        });

        if (!mediaItem) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media item not found'
          });
        }

        if (mediaItem.uploadedBy !== ctx.session.user.id && ctx.session.user.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only delete your own media items'
          });
        }

        // Soft delete
        await ctx.db.mediaItem.update({
          where: { id: input.id },
          data: { deletedAt: new Date() }
        });

        // Remove from all collections
        await ctx.db.mediaCollectionItem.deleteMany({
          where: { mediaItemId: input.id }
        });

        logger.info('Media item deleted', { 
          mediaItemId: input.id,
          userId: ctx.session.user.id
        });

        return { success: true };

      } catch (error) {
        logger.error('Delete media item API error', { 
          error, 
          userId: ctx.session.user.id,
          mediaItemId: input.id
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete media item'
        });
      }
    }),

  // ========================================
  // COLLECTION ENDPOINTS
  // ========================================

  getCollections: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20)
    }))
    .query(async ({ ctx, input }) => {
      try {
        const offset = (input.page - 1) * input.limit;

        const [collections, total] = await Promise.all([
          ctx.db.mediaCollection.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: input.limit,
            include: {
              creator: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              items: {
                take: 5, // Preview items
                include: {
                  mediaItem: {
                    select: {
                      id: true,
                      filename: true,
                      thumbnailUrl: true,
                      cdnUrl: true,
                      type: true
                    }
                  }
                }
              }
            }
          }),
          ctx.db.mediaCollection.count({
            where: { deletedAt: null }
          })
        ]);

        return {
          collections: collections.map((collection: any) => ({
            ...collection,
            totalSize: collection.totalSize.toString(),
            items: collection.items.map((item: any) => item.mediaItem)
          })),
          pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit)
          }
        };

      } catch (error) {
        logger.error('Get collections API error', { 
          error, 
          userId: ctx.session.user.id
        });
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to retrieve collections'
        });
      }
    }),

  createCollection: protectedProcedure
    .input(createCollectionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const mediaService = new MediaService(ctx.db);
        
        return await mediaService.createCollection(input, ctx.session.user.id);

      } catch (error) {
        logger.error('Create collection API error', { 
          error, 
          userId: ctx.session.user.id,
          collectionData: input
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create collection'
        });
      }
    }),

  addToCollection: protectedProcedure
    .input(z.object({
      mediaItemId: z.string(),
      collectionId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const mediaService = new MediaService(ctx.db);
        
        await mediaService.addToCollection(
          input.mediaItemId, 
          input.collectionId, 
          ctx.session.user.id
        );

        logger.info('Media added to collection', { 
          mediaItemId: input.mediaItemId,
          collectionId: input.collectionId,
          userId: ctx.session.user.id
        });

        return { success: true };

      } catch (error) {
        logger.error('Add to collection API error', { 
          error, 
          userId: ctx.session.user.id,
          mediaItemId: input.mediaItemId,
          collectionId: input.collectionId
        });
        
        if (error instanceof TRPCError) {
          throw error;
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add media to collection'
        });
      }
    })
});
