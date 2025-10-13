/**
 * Royalty Validation Schemas (Zod)
 * Input validation for royalty-related API endpoints
 */

import { z } from 'zod';

/**
 * Royalty Run Status Enum
 */
export const royaltyRunStatusSchema = z.enum([
  'DRAFT',
  'CALCULATED',
  'LOCKED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export type RoyaltyRunStatus = z.infer<typeof royaltyRunStatusSchema>;

/**
 * Royalty Statement Status Enum
 */
export const royaltyStatementStatusSchema = z.enum([
  'PENDING',
  'REVIEWED',
  'DISPUTED',
  'RESOLVED',
  'PAID',
]);

export type RoyaltyStatementStatus = z.infer<typeof royaltyStatementStatusSchema>;

/**
 * Adjustment Type Enum
 */
export const adjustmentTypeSchema = z.enum([
  'CREDIT',
  'DEBIT',
  'BONUS',
  'CORRECTION',
  'REFUND',
]);

export type AdjustmentType = z.infer<typeof adjustmentTypeSchema>;

/**
 * Create Royalty Run Input Schema
 */
export const createRoyaltyRunSchema = z
  .object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => new Date(data.periodEnd) > new Date(data.periodStart), {
    message: 'Period end must be after period start',
    path: ['periodEnd'],
  });

export type CreateRoyaltyRunInput = z.infer<typeof createRoyaltyRunSchema>;

/**
 * Calculate Run Input Schema
 */
export const calculateRunSchema = z.object({
  runId: z.string().cuid(),
});

export type CalculateRunInput = z.infer<typeof calculateRunSchema>;

/**
 * Lock Run Input Schema
 */
export const lockRunSchema = z.object({
  runId: z.string().cuid(),
});

export type LockRunInput = z.infer<typeof lockRunSchema>;

/**
 * Initiate Payouts Input Schema
 */
export const initiatePayoutsSchema = z.object({
  runId: z.string().cuid(),
});

export type InitiatePayoutsInput = z.infer<typeof initiatePayoutsSchema>;

/**
 * List Runs Input Schema
 */
export const listRunsSchema = z.object({
  status: royaltyRunStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().cuid().optional(),
});

export type ListRunsInput = z.infer<typeof listRunsSchema>;

/**
 * Get Run Input Schema
 */
export const getRunSchema = z.object({
  runId: z.string().cuid(),
});

export type GetRunInput = z.infer<typeof getRunSchema>;

/**
 * Apply Adjustment Input Schema
 */
export const applyAdjustmentSchema = z.object({
  statementId: z.string().cuid(),
  adjustmentCents: z.number().int(),
  adjustmentType: adjustmentTypeSchema,
  reason: z
    .string()
    .min(20, 'Adjustment reason must be at least 20 characters')
    .max(1000, 'Adjustment reason must be at most 1000 characters'),
});

export type ApplyAdjustmentInput = z.infer<typeof applyAdjustmentSchema>;

/**
 * Resolve Dispute Input Schema
 */
export const resolveDisputeSchema = z.object({
  statementId: z.string().cuid(),
  resolution: z
    .string()
    .min(20, 'Resolution must be at least 20 characters')
    .max(1000, 'Resolution must be at most 1000 characters'),
  adjustmentCents: z.number().int().optional(),
});

export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

/**
 * List Statements Input Schema
 */
export const listStatementsSchema = z.object({
  status: royaltyStatementStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().cuid().optional(),
});

export type ListStatementsInput = z.infer<typeof listStatementsSchema>;

/**
 * Get Statement Input Schema
 */
export const getStatementSchema = z.object({
  statementId: z.string().cuid(),
});

export type GetStatementInput = z.infer<typeof getStatementSchema>;

/**
 * Review Statement Input Schema
 */
export const reviewStatementSchema = z.object({
  statementId: z.string().cuid(),
});

export type ReviewStatementInput = z.infer<typeof reviewStatementSchema>;

/**
 * Dispute Statement Input Schema
 */
export const disputeStatementSchema = z.object({
  statementId: z.string().cuid(),
  reason: z
    .string()
    .min(20, 'Dispute reason must be at least 20 characters')
    .max(1000, 'Dispute reason must be at most 1000 characters'),
});

export type DisputeStatementInput = z.infer<typeof disputeStatementSchema>;

/**
 * Earnings Summary Input Schema
 */
export const earningsSummarySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type EarningsSummaryInput = z.infer<typeof earningsSummarySchema>;

/**
 * Validate License Scope Input Schema
 */
export const validateLicenseScopeSchema = z.object({
  licenseId: z.string().cuid(),
  reportedUsage: z.object({
    mediaTypes: z.array(z.string()).optional(),
    geographies: z.array(z.string()).optional(),
    channels: z.array(z.string()).optional(),
  }),
});

export type ValidateLicenseScopeInput = z.infer<typeof validateLicenseScopeSchema>;

