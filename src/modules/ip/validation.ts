import { z } from 'zod';
import { AssetStatus, AssetType } from '@prisma/client';
import { ASSET_CONSTANTS } from './types';

/**
 * IP Assets Validation Schemas
 * 
 * Comprehensive validation for all asset operations
 */

// ============================================================================
// File Upload Validation
// ============================================================================

export const fileUploadSchema = z.object({
  fileName: z.string()
    .min(1, 'File name is required')
    .max(255, 'File name too long')
    .regex(/^[a-zA-Z0-9\-_\. ]+$/, 'Invalid file name characters'),
  fileSize: z.number()
    .int('File size must be an integer')
    .positive('File size must be positive')
    .max(ASSET_CONSTANTS.MAX_FILE_SIZE, 'File size exceeds 100MB limit'),
  mimeType: z.string()
    .regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i, 'Invalid MIME type'),
  projectId: z.string().cuid().optional(),
}).refine(
  (data) => ASSET_CONSTANTS.ALLOWED_MIME_TYPES.includes(data.mimeType),
  { message: 'File type not supported' }
);

export const confirmUploadSchema = z.object({
  assetId: z.string().cuid(),
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title too long'),
  description: z.string()
    .max(2000, 'Description too long')
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// Asset Update Validation
// ============================================================================

export const updateAssetSchema = z.object({
  id: z.string().cuid(),
  title: z.string()
    .min(1, 'Title is required')
    .max(255, 'Title too long')
    .optional(),
  description: z.string()
    .max(2000, 'Description too long')
    .optional()
    .nullable(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// ============================================================================
// Status Update Validation
// ============================================================================

export const statusTransitionSchema = z.object({
  currentStatus: z.nativeEnum(AssetStatus),
  newStatus: z.nativeEnum(AssetStatus),
}).refine(
  (data) => {
    const allowedTransitions = ASSET_CONSTANTS.STATUS_TRANSITIONS[data.currentStatus];
    return allowedTransitions?.includes(data.newStatus) ?? false;
  },
  { message: 'Invalid status transition' }
);

export const updateStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.nativeEnum(AssetStatus),
  notes: z.string()
    .max(1000, 'Notes too long')
    .optional(),
});

export const bulkUpdateStatusSchema = z.object({
  assetIds: z.array(z.string().cuid())
    .min(1, 'At least one asset required')
    .max(100, 'Maximum 100 assets at once'),
  status: z.nativeEnum(AssetStatus),
});

// ============================================================================
// Query Validation
// ============================================================================

// ============================================================================
// Preview & Variant Validation
// ============================================================================

export const getPreviewSchema = z.object({
  id: z.string().cuid(),
  size: z.enum(['small', 'medium', 'large', 'original']).optional().default('medium'),
});

export const getMetadataSchema = z.object({
  id: z.string().cuid(),
  fields: z.array(z.enum(['technical', 'descriptive', 'extracted', 'processing', 'all']))
    .optional()
    .default(['all']),
});

export const getVariantsSchema = z.object({
  id: z.string().cuid(),
  type: z.enum(['thumbnail', 'preview', 'all']).optional().default('all'),
});

export const regeneratePreviewSchema = z.object({
  id: z.string().cuid(),
  types: z.array(z.enum(['thumbnail', 'preview', 'metadata', 'all']))
    .optional()
    .default(['all']),
});

export const listAssetsSchema = z.object({
  filters: z.object({
    projectId: z.string().cuid().optional(),
    type: z.nativeEnum(AssetType).optional(),
    status: z.nativeEnum(AssetStatus).optional(),
    createdBy: z.string().cuid().optional(),
    search: z.string()
      .max(100, 'Search query too long')
      .optional(),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
  }).optional(),
  page: z.number()
    .int()
    .positive()
    .default(1),
  pageSize: z.number()
    .int()
    .positive()
    .max(100, 'Maximum page size is 100')
    .default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const getAssetByIdSchema = z.object({
  id: z.string().cuid(),
});

export const deleteAssetSchema = z.object({
  id: z.string().cuid(),
});

export const getDerivativesSchema = z.object({
  parentAssetId: z.string().cuid(),
});

export const getAssetOwnersSchema = z.object({
  id: z.string().cuid(),
});

export const addAssetOwnerSchema = z.object({
  id: z.string().cuid(),
  creatorId: z.string().cuid(),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point')
    .max(10000, 'Share cannot exceed 10000 basis points (100%)'),
  ownershipType: z.enum(['PRIMARY', 'SECONDARY', 'DERIVATIVE']).optional().default('SECONDARY'),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url().optional(),
  notes: z.record(z.string(), z.any()).optional(),
});

export const getAssetLicensesSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED', 'ALL']).optional().default('ALL'),
});

// ============================================================================
// Metadata Validation
// ============================================================================

export const assetMetadataSchema = z.record(z.string(), z.any()).optional().refine(
  (data) => {
    if (!data) return true;
    
    // Validate specific metadata fields if present
    const validations: Record<string, () => boolean> = {
      width: () => typeof data.width === 'number' && data.width > 0,
      height: () => typeof data.height === 'number' && data.height > 0,
      duration: () => typeof data.duration === 'number' && data.duration > 0,
      fps: () => typeof data.fps === 'number' && data.fps > 0,
      bitrate: () => typeof data.bitrate === 'number' && data.bitrate > 0,
      pageCount: () => typeof data.pageCount === 'number' && data.pageCount > 0,
    };

    for (const [key, validator] of Object.entries(validations)) {
      if (key in data && !validator()) {
        return false;
      }
    }

    return true;
  },
  { message: 'Invalid metadata format' }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate status transition
 */
export function validateStatusTransition(
  currentStatus: AssetStatus,
  newStatus: AssetStatus
): boolean {
  const allowedTransitions = ASSET_CONSTANTS.STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions?.includes(newStatus) ?? false;
}

/**
 * Sanitize file name
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9\-_\.]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 255);
}

/**
 * Get asset type from MIME type
 */
export function getAssetTypeFromMime(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return 'IMAGE' as AssetType;
  if (mimeType.startsWith('video/')) return 'VIDEO' as AssetType;
  if (mimeType.startsWith('audio/')) return 'AUDIO' as AssetType;
  if (mimeType.startsWith('model/')) return 'THREE_D' as AssetType;
  if (
    mimeType.includes('pdf') ||
    mimeType.includes('document') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    mimeType.includes('presentation')
  ) {
    return 'DOCUMENT' as AssetType;
  }
  return 'OTHER' as AssetType;
}
