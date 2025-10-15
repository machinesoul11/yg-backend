/**
 * Media Management Validation Schemas
 * 
 * Zod schemas for validating media management inputs
 */

import { z } from 'zod';
import { MEDIA_CONSTANTS } from './types';

// Enum schemas
export const MediaCategorySchema = z.enum([
  'BRAND_ASSETS',
  'MARKETING', 
  'TEMPLATES',
  'STOCK',
  'UI_ELEMENTS',
  'OTHER'
]);

export const MediaStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const MediaUsageTypeSchema = z.enum(['PUBLIC', 'INTERNAL', 'RESTRICTED']);

export const SortBySchema = z.enum(['createdAt', 'updatedAt', 'title', 'downloadCount', 'fileSize']);

export const SortOrderSchema = z.enum(['asc', 'desc']);

// Upload schemas
export const initiateUploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(255, 'Filename must be less than 255 characters')
    .regex(/^[a-zA-Z0-9._\-\s]+$/, 'Filename contains invalid characters'),
  fileSize: z
    .number()
    .int()
    .min(1, 'File size must be greater than 0')
    .max(MEDIA_CONSTANTS.MAX_FILE_SIZE, `File size cannot exceed ${MEDIA_CONSTANTS.MAX_FILE_SIZE / 1024 / 1024}MB`),
  mimeType: z
    .string()
    .refine(
      (mime) => MEDIA_CONSTANTS.SUPPORTED_MIME_TYPES.includes(mime as any),
      'Unsupported file type'
    ),
  category: MediaCategorySchema,
});

export const confirmUploadSchema = z.object({
  mediaId: z.string().cuid('Invalid media ID'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(MEDIA_CONSTANTS.MAX_TITLE_LENGTH, `Title must be less than ${MEDIA_CONSTANTS.MAX_TITLE_LENGTH} characters`)
    .trim(),
  description: z
    .string()
    .max(MEDIA_CONSTANTS.MAX_DESCRIPTION_LENGTH, `Description must be less than ${MEDIA_CONSTANTS.MAX_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  tags: z
    .array(z.string().min(1).max(MEDIA_CONSTANTS.MAX_TAG_LENGTH).trim())
    .max(MEDIA_CONSTANTS.MAX_TAGS, `Cannot have more than ${MEDIA_CONSTANTS.MAX_TAGS} tags`)
    .default([]),
  usageType: MediaUsageTypeSchema.default('INTERNAL'),
});

// Query schemas
export const listMediaSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  category: MediaCategorySchema.optional(),
  status: MediaStatusSchema.optional(),
  usageType: MediaUsageTypeSchema.optional(),
  search: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  sortBy: SortBySchema.default('createdAt'),
  sortOrder: SortOrderSchema.default('desc'),
});

export const getMediaByIdSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
});

// Update schemas
export const updateMediaSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(MEDIA_CONSTANTS.MAX_TITLE_LENGTH, `Title must be less than ${MEDIA_CONSTANTS.MAX_TITLE_LENGTH} characters`)
    .trim()
    .optional(),
  description: z
    .string()
    .max(MEDIA_CONSTANTS.MAX_DESCRIPTION_LENGTH, `Description must be less than ${MEDIA_CONSTANTS.MAX_DESCRIPTION_LENGTH} characters`)
    .trim()
    .optional(),
  tags: z
    .array(z.string().min(1).max(MEDIA_CONSTANTS.MAX_TAG_LENGTH).trim())
    .max(MEDIA_CONSTANTS.MAX_TAGS, `Cannot have more than ${MEDIA_CONSTANTS.MAX_TAGS} tags`)
    .optional(),
  category: MediaCategorySchema.optional(),
  usageType: MediaUsageTypeSchema.optional(),
});

export const updateStatusSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
  status: MediaStatusSchema,
});

export const bulkUpdateStatusSchema = z.object({
  mediaIds: z
    .array(z.string().cuid('Invalid media ID'))
    .min(1, 'At least one media ID is required')
    .max(100, 'Cannot update more than 100 items at once'),
  status: MediaStatusSchema,
});

// Delete schema
export const deleteMediaSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
});

export const bulkDeleteSchema = z.object({
  mediaIds: z
    .array(z.string().cuid('Invalid media ID'))
    .min(1, 'At least one media ID is required')
    .max(50, 'Cannot delete more than 50 items at once'),
});

// Download/Access schemas
export const getDownloadUrlSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
});

export const getVariantsSchema = z.object({
  id: z.string().cuid('Invalid media ID'),
});

// Collection schemas
export const createCollectionSchema = z.object({
  name: z
    .string()
    .min(1, 'Collection name is required')
    .max(100, 'Collection name must be less than 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .trim()
    .optional(),
  mediaIds: z
    .array(z.string().cuid('Invalid media ID'))
    .max(100, 'Cannot add more than 100 items to a collection'),
});

export const updateCollectionSchema = z.object({
  id: z.string().cuid('Invalid collection ID'),
  name: z
    .string()
    .min(1, 'Collection name is required')
    .max(100, 'Collection name must be less than 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .trim()
    .optional(),
  mediaIds: z
    .array(z.string().cuid('Invalid media ID'))
    .max(100, 'Cannot add more than 100 items to a collection')
    .optional(),
});

export const getCollectionSchema = z.object({
  id: z.string().cuid('Invalid collection ID'),
});

export const listCollectionsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  search: z.string().trim().min(1).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).default('createdAt'),
  sortOrder: SortOrderSchema.default('desc'),
});

// Helper functions for validation
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._\-\s]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .toLowerCase(); // Convert to lowercase
}

export function sanitizeTags(tags: string[]): string[] {
  return tags
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)
    .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
    .slice(0, MEDIA_CONSTANTS.MAX_TAGS);
}

export function validateMimeType(mimeType: string): boolean {
  return MEDIA_CONSTANTS.SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(lastDot + 1).toLowerCase() : '';
}

export function generateMediaKey(mediaId: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  return `media/${mediaId}/${sanitized}`;
}

export function generateThumbnailKey(mediaId: string, variant: 'small' | 'medium' | 'large'): string {
  return `media/${mediaId}/thumbnails/${variant}.jpg`;
}
