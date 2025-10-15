/**
 * Payout Module - Zod Validation Schemas
 * Input validation for payout API endpoints
 */

import { z } from 'zod';
import { PayoutStatus } from '@prisma/client';

/**
 * POST /payouts/transfer (initiate payout)
 */
export const initiatePayoutSchema = z.object({
  creatorId: z.string().cuid().optional(), // Optional for admin, auto-filled for creators
  amountCents: z.number().int().positive().optional(), // If not provided, use all available balance
  royaltyStatementIds: z.array(z.string().cuid()).optional(), // Specific statements to pay out
});

/**
 * GET /payouts/:id (payout details)
 */
export const getPayoutByIdSchema = z.object({
  id: z.string().cuid(),
});

/**
 * GET /payouts (list payouts with filters)
 */
export const listPayoutsSchema = z.object({
  creatorId: z.string().cuid().optional(),
  status: z.nativeEnum(PayoutStatus).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  minAmount: z.number().int().positive().optional(),
  maxAmount: z.number().int().positive().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'processedAt', 'amountCents', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * POST /payouts/:id/retry (retry failed payout)
 */
export const retryPayoutSchema = z.object({
  id: z.string().cuid(),
});

/**
 * GET /me/payouts (creator's payout history)
 */
export const getMyPayoutsSchema = z.object({
  status: z.nativeEnum(PayoutStatus).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'processedAt', 'amountCents']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /me/payouts/pending (creator's pending balance)
 */
export const getPendingBalanceSchema = z.object({
  includeBreakdown: z.boolean().default(true),
});

/**
 * Admin batch payout initiation
 */
export const batchPayoutSchema = z.object({
  creatorIds: z.array(z.string().cuid()).optional(),
  autoSelectEligible: z.boolean().default(false),
  minAmountCents: z.number().int().positive().optional(),
});
