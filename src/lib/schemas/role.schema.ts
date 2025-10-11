/**
 * Role Management Zod Schemas
 * Input validation for role management endpoints
 */

import { z } from 'zod';
import { UserRole } from '@prisma/client';

/**
 * User Role Enum Schema
 * Matches Prisma UserRole enum
 */
export const UserRoleEnum = z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER']);

/**
 * Assign Role Schema
 * For single role assignment
 */
export const assignRoleSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  role: UserRoleEnum,
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500, 'Reason too long').optional(),
});

export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/**
 * Bulk Assign Role Schema
 * For assigning role to multiple users
 */
export const bulkAssignRoleSchema = z.object({
  userIds: z.array(z.string().cuid('Invalid user ID')).min(1, 'At least one user ID required').max(100, 'Maximum 100 users at once'),
  role: UserRoleEnum,
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500, 'Reason too long'),
});

export type BulkAssignRoleInput = z.infer<typeof bulkAssignRoleSchema>;

/**
 * List Users Schema
 * For pagination and filtering
 */
export const listUsersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  roleFilter: UserRoleEnum.optional(),
  searchQuery: z.string().optional(),
  sortBy: z.enum(['createdAt', 'email', 'name', 'role']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;

/**
 * Get Role History Schema
 * For querying role change history
 */
export const getRoleHistorySchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  limit: z.number().int().min(1).max(100).default(50),
});

export type GetRoleHistoryInput = z.infer<typeof getRoleHistorySchema>;

/**
 * Get User Role Schema
 * For getting detailed role info for a user
 */
export const getUserRoleSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
});

export type GetUserRoleInput = z.infer<typeof getUserRoleSchema>;
