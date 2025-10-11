/**
 * Creator Validation Schemas (Zod)
 * Input validation for creator-related API endpoints
 */

import { z } from 'zod';

/**
 * Creator Specialty Enum
 */
export const CreatorSpecialtyEnum = z.enum([
  'photography',
  'videography',
  'motion-graphics',
  'illustration',
  '3d-design',
  'graphic-design',
  'copywriting',
  'music-composition',
  'sound-design',
  'brand-strategy',
  'art-direction',
  'animation',
]);

/**
 * Verification Status Enum
 */
export const VerificationStatusEnum = z.enum(['pending', 'approved', 'rejected']);

/**
 * Onboarding Status Enum
 */
export const OnboardingStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'failed']);

/**
 * Social Links Schema
 */
export const SocialLinksSchema = z.object({
  instagram: z.string().url().optional(),
  behance: z.string().url().optional(),
  dribbble: z.string().url().optional(),
  website: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  twitter: z.string().url().optional(),
  youtube: z.string().url().optional(),
  vimeo: z.string().url().optional(),
}).strict();

/**
 * Availability Schema
 */
export const AvailabilitySchema = z.object({
  status: z.enum(['available', 'limited', 'unavailable']),
  nextAvailable: z.string().datetime().optional(),
  hoursPerWeek: z.number().int().min(1).max(168).optional(),
}).strict();

/**
 * Budget Range Schema
 */
export const BudgetRangeSchema = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
}).refine(data => data.max >= data.min, {
  message: 'Maximum budget must be greater than or equal to minimum budget',
});

/**
 * Preferences Schema
 */
export const PreferencesSchema = z.object({
  projectTypes: z.array(z.string()).optional(),
  budgetRange: BudgetRangeSchema.optional(),
  collaborationStyle: z.enum(['remote', 'hybrid', 'in-person']).optional(),
  preferredIndustries: z.array(z.string()).optional(),
  minimumProjectDuration: z.string().optional(),
}).strict();

/**
 * Create Creator Input Schema
 */
export const createCreatorSchema = z.object({
  stageName: z.string().min(2, 'Stage name must be at least 2 characters').max(100, 'Stage name must be at most 100 characters'),
  bio: z.string().max(2000, 'Bio must be at most 2000 characters').optional(),
  specialties: z.array(CreatorSpecialtyEnum).min(1, 'At least one specialty is required').max(5, 'Maximum 5 specialties allowed'),
  socialLinks: SocialLinksSchema.optional(),
  portfolioUrl: z.string().url('Invalid portfolio URL').optional(),
  website: z.string().url('Invalid website URL').optional(),
  availability: AvailabilitySchema.optional(),
  preferences: PreferencesSchema.optional(),
});

export type CreateCreatorInput = z.infer<typeof createCreatorSchema>;

/**
 * Update Creator Input Schema
 */
export const updateCreatorSchema = z.object({
  stageName: z.string().min(2).max(100).optional(),
  bio: z.string().max(2000).optional().nullable(),
  specialties: z.array(CreatorSpecialtyEnum).min(1).max(5).optional(),
  socialLinks: SocialLinksSchema.optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable(),
  website: z.string().url().optional().nullable(),
  availability: AvailabilitySchema.optional().nullable(),
  preferences: PreferencesSchema.optional().nullable(),
});

export type UpdateCreatorInput = z.infer<typeof updateCreatorSchema>;

/**
 * List Creators Input Schema (Admin)
 */
export const listCreatorsSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  verificationStatus: VerificationStatusEnum.optional(),
  onboardingStatus: OnboardingStatusEnum.optional(),
  specialties: z.array(CreatorSpecialtyEnum).optional(),
  sortBy: z.enum(['createdAt', 'stageName', 'verifiedAt', 'totalEarningsCents']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListCreatorsInput = z.infer<typeof listCreatorsSchema>;

/**
 * Get Creator By ID Schema
 */
export const getCreatorByIdSchema = z.object({
  id: z.string().cuid('Invalid creator ID'),
});

export type GetCreatorByIdInput = z.infer<typeof getCreatorByIdSchema>;

/**
 * Approve Creator Schema
 */
export const approveCreatorSchema = z.object({
  id: z.string().cuid('Invalid creator ID'),
});

export type ApproveCreatorInput = z.infer<typeof approveCreatorSchema>;

/**
 * Reject Creator Schema
 */
export const rejectCreatorSchema = z.object({
  id: z.string().cuid('Invalid creator ID'),
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters').max(500, 'Rejection reason must be at most 500 characters'),
});

export type RejectCreatorInput = z.infer<typeof rejectCreatorSchema>;

/**
 * Confirm Profile Image Upload Schema
 */
export const confirmProfileImageUploadSchema = z.object({
  storageKey: z.string().min(1, 'Storage key is required'),
});

export type ConfirmProfileImageUploadInput = z.infer<typeof confirmProfileImageUploadSchema>;

/**
 * Confirm Verification Document Upload Schema
 */
export const confirmVerificationDocUploadSchema = z.object({
  storageKey: z.string().min(1, 'Storage key is required'),
  documentType: z.enum(['identity', 'portfolio', 'other']),
});

export type ConfirmVerificationDocUploadInput = z.infer<typeof confirmVerificationDocUploadSchema>;

/**
 * Update Performance Metrics Schema (Admin only)
 */
export const updatePerformanceMetricsSchema = z.object({
  id: z.string().cuid('Invalid creator ID'),
});

export type UpdatePerformanceMetricsInput = z.infer<typeof updatePerformanceMetricsSchema>;
