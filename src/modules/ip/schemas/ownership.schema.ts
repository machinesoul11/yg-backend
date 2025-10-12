/**
 * IP Ownership Validation Schemas
 * 
 * Zod schemas for validating ownership data - shared between backend and frontend
 */

import { z } from 'zod';
import { OwnershipType } from '@prisma/client';

// ============================================================================
// Base Schemas
// ============================================================================

/**
 * Ownership split for a single creator
 */
export const ownershipSplitSchema = z.object({
  creatorId: z.string().cuid('Invalid creator ID format'),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)'),
  ownershipType: z.nativeEnum(OwnershipType),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url('Legal document must be a valid URL').optional(),
  notes: z.record(z.any()).optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || data.startDate < data.endDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

/**
 * Array of ownership splits - must sum to 10,000 BPS
 */
export const ownershipSplitArraySchema = z.array(ownershipSplitSchema)
  .min(1, 'At least one owner is required')
  .refine(
    (ownerships) => {
      const totalBps = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
      return totalBps === 10000;
    },
    { 
      message: 'Total ownership must equal 100% (10,000 basis points)',
      path: ['root']
    }
  );

/**
 * Create ownership input
 */
export const createOwnershipSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP asset ID format'),
  creatorId: z.string().cuid('Invalid creator ID format'),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)'),
  ownershipType: z.nativeEnum(OwnershipType).default(OwnershipType.PRIMARY),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url().optional(),
  notes: z.record(z.any()).optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || data.startDate < data.endDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

/**
 * Update ownership input
 */
export const updateOwnershipSchema = z.object({
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)')
    .optional(),
  ownershipType: z.nativeEnum(OwnershipType).optional(),
  endDate: z.date().optional(),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url().optional(),
  notes: z.record(z.any()).optional(),
});

/**
 * Set asset ownership (atomic operation)
 */
export const setAssetOwnershipSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP asset ID format'),
  ownerships: ownershipSplitArraySchema,
  effectiveDate: z.date().optional(),
});

/**
 * Transfer ownership input
 */
export const transferOwnershipSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP asset ID format'),
  toCreatorId: z.string().cuid('Invalid creator ID format'),
  shareBps: z.number()
    .int('Share must be an integer')
    .min(1, 'Share must be at least 1 basis point (0.01%)')
    .max(10000, 'Share cannot exceed 10,000 basis points (100%)'),
  contractReference: z.string().max(255).optional(),
  legalDocUrl: z.string().url().optional(),
  notes: z.record(z.any()).optional(),
});

/**
 * Get ownership query filters
 */
export const getOwnershipFiltersSchema = z.object({
  ipAssetId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  ownershipType: z.nativeEnum(OwnershipType).optional(),
  atDate: z.date().optional(), // Historical query
  includeExpired: z.boolean().default(false),
});

/**
 * Flag ownership dispute
 */
export const flagDisputeSchema = z.object({
  ownershipId: z.string().cuid('Invalid ownership ID format'),
  reason: z.string().min(10, 'Dispute reason must be at least 10 characters').max(1000),
  supportingDocuments: z.array(z.string().url()).optional(),
});

/**
 * Resolve ownership dispute
 */
export const resolveDisputeSchema = z.object({
  ownershipId: z.string().cuid('Invalid ownership ID format'),
  action: z.enum(['CONFIRM', 'MODIFY', 'REMOVE']),
  resolutionNotes: z.string().min(10, 'Resolution notes must be at least 10 characters').max(2000),
  modifiedData: z.object({
    shareBps: z.number().int().min(1).max(10000).optional(),
    ownershipType: z.nativeEnum(OwnershipType).optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
  }).optional(),
}).refine(
  (data) => {
    // If action is MODIFY, modifiedData is required
    if (data.action === 'MODIFY' && !data.modifiedData) {
      return false;
    }
    return true;
  },
  {
    message: 'Modified data is required when action is MODIFY',
    path: ['modifiedData'],
  }
);

/**
 * Get disputed ownerships filters
 */
export const getDisputedOwnershipsSchema = z.object({
  ipAssetId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(),
  includeResolved: z.boolean().default(false),
});

// ============================================================================
// Type Exports
// ============================================================================

export type OwnershipSplitInput = z.infer<typeof ownershipSplitSchema>;
export type CreateOwnershipInput = z.infer<typeof createOwnershipSchema>;
export type UpdateOwnershipInput = z.infer<typeof updateOwnershipSchema>;
export type SetAssetOwnershipInput = z.infer<typeof setAssetOwnershipSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
export type GetOwnershipFilters = z.infer<typeof getOwnershipFiltersSchema>;
export type FlagDisputeInput = z.infer<typeof flagDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type GetDisputedOwnershipsInput = z.infer<typeof getDisputedOwnershipsSchema>;
