/**
 * Admin Role Management Zod Schemas
 * Input validation for admin role assignment and management endpoints
 */

import { z } from 'zod';

/**
 * Department Enum Schema
 * Matches Prisma Department enum
 */
export const DepartmentEnum = z.enum([
  'SUPER_ADMIN',
  'CONTENT_MANAGER',
  'FINANCE_LICENSING',
  'CREATOR_APPLICATIONS',
  'BRAND_APPLICATIONS',
  'CUSTOMER_SERVICE',
  'OPERATIONS',
  'CONTRACTOR',
]);

/**
 * Seniority Enum Schema
 * Matches Prisma Seniority enum
 */
export const SeniorityEnum = z.enum(['JUNIOR', 'SENIOR']);

/**
 * Permission String Schema
 * Validates permission format (namespace:action)
 */
export const permissionStringSchema = z
  .string()
  .regex(/^[a-z_]+:[a-z_]+$/, 'Permission must be in format "namespace:action"')
  .min(3)
  .max(100);

/**
 * Permissions Array Schema
 * Array of valid permission strings
 */
export const permissionsArraySchema = z
  .array(permissionStringSchema)
  .default([])
  .refine(
    (permissions) => new Set(permissions).size === permissions.length,
    'Duplicate permissions are not allowed'
  );

/**
 * Create Admin Role Schema
 * For assigning a new admin role to a user
 */
export const createAdminRoleSchema = z
  .object({
    userId: z.string().cuid('Invalid user ID'),
    department: DepartmentEnum,
    seniority: SeniorityEnum,
    permissions: permissionsArraySchema,
    isActive: z.boolean().default(true),
    expiresAt: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      // Contractor roles must have an expiration date
      if (data.department === 'CONTRACTOR' && !data.expiresAt) {
        return false;
      }
      return true;
    },
    {
      message: 'Contractor roles must have an expiration date',
      path: ['expiresAt'],
    }
  )
  .refine(
    (data) => {
      // Expiration date must be in the future
      if (data.expiresAt && data.expiresAt <= new Date()) {
        return false;
      }
      return true;
    },
    {
      message: 'Expiration date must be in the future',
      path: ['expiresAt'],
    }
  )
  .refine(
    (data) => {
      // Contractor roles should not exceed 1 year
      if (data.department === 'CONTRACTOR' && data.expiresAt) {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        if (data.expiresAt > oneYearFromNow) {
          return false;
        }
      }
      return true;
    },
    {
      message: 'Contractor roles cannot exceed 1 year',
      path: ['expiresAt'],
    }
  );

export type CreateAdminRoleInput = z.infer<typeof createAdminRoleSchema>;

/**
 * Update Admin Role Schema
 * For updating an existing admin role
 */
export const updateAdminRoleSchema = z
  .object({
    roleId: z.string().cuid('Invalid role ID'),
    seniority: SeniorityEnum.optional(),
    permissions: permissionsArraySchema.optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (data) => {
      // At least one field must be provided for update
      return (
        data.seniority !== undefined ||
        data.permissions !== undefined ||
        data.isActive !== undefined ||
        data.expiresAt !== undefined
      );
    },
    {
      message: 'At least one field must be provided for update',
    }
  );

export type UpdateAdminRoleInput = z.infer<typeof updateAdminRoleSchema>;

/**
 * Revoke Admin Role Schema
 * For removing an admin role from a user
 */
export const revokeAdminRoleSchema = z.object({
  roleId: z.string().cuid('Invalid role ID'),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long')
    .optional(),
});

export type RevokeAdminRoleInput = z.infer<typeof revokeAdminRoleSchema>;

/**
 * Get Admin Role Schema
 * For retrieving a specific admin role
 */
export const getAdminRoleSchema = z.object({
  roleId: z.string().cuid('Invalid role ID'),
});

export type GetAdminRoleInput = z.infer<typeof getAdminRoleSchema>;

/**
 * List Admin Roles Schema
 * For pagination and filtering of admin roles
 */
export const listAdminRolesSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  userId: z.string().cuid('Invalid user ID').optional(),
  department: DepartmentEnum.optional(),
  seniority: SeniorityEnum.optional(),
  isActive: z.boolean().optional(),
  includeExpired: z.boolean().default(false),
  sortBy: z.enum(['createdAt', 'updatedAt', 'expiresAt', 'department']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAdminRolesInput = z.infer<typeof listAdminRolesSchema>;

/**
 * Get User Admin Roles Schema
 * For retrieving all admin roles for a specific user
 */
export const getUserAdminRolesSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  includeInactive: z.boolean().default(false),
  includeExpired: z.boolean().default(false),
});

export type GetUserAdminRolesInput = z.infer<typeof getUserAdminRolesSchema>;

/**
 * Extend Contractor Role Schema
 * For extending the expiration date of a contractor role
 */
export const extendContractorRoleSchema = z.object({
  roleId: z.string().cuid('Invalid role ID'),
  newExpirationDate: z.coerce.date(),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long'),
});

export type ExtendContractorRoleInput = z.infer<typeof extendContractorRoleSchema>;

/**
 * Convert Contractor to Permanent Schema
 * For converting a contractor role to a permanent role
 */
export const convertContractorToPermanentSchema = z.object({
  roleId: z.string().cuid('Invalid role ID'),
  newDepartment: DepartmentEnum.refine((dept) => dept !== 'CONTRACTOR', {
    message: 'New department cannot be CONTRACTOR',
  }),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long'),
});

export type ConvertContractorToPermanentInput = z.infer<typeof convertContractorToPermanentSchema>;

/**
 * Bulk Operations Schema
 * For performing bulk operations on admin roles
 */
export const bulkUpdateAdminRolesSchema = z.object({
  roleIds: z
    .array(z.string().cuid('Invalid role ID'))
    .min(1, 'At least one role ID required')
    .max(50, 'Maximum 50 roles at once'),
  updates: z.object({
    isActive: z.boolean().optional(),
    permissions: permissionsArraySchema.optional(),
  }),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason too long'),
});

export type BulkUpdateAdminRolesInput = z.infer<typeof bulkUpdateAdminRolesSchema>;

/**
 * Get Expiring Roles Schema
 * For retrieving roles that are expiring soon
 */
export const getExpiringRolesSchema = z.object({
  daysUntilExpiration: z.number().int().min(1).max(365).default(30),
  includeNotified: z.boolean().default(false),
});

export type GetExpiringRolesInput = z.infer<typeof getExpiringRolesSchema>;

/**
 * Admin Role Statistics Schema
 * For retrieving statistics about admin roles
 */
export const getAdminRoleStatsSchema = z.object({
  department: DepartmentEnum.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type GetAdminRoleStatsInput = z.infer<typeof getAdminRoleStatsSchema>;

/**
 * Check User Permission Schema
 * For checking if a user has a specific permission through their admin roles
 */
export const checkUserPermissionSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  permission: permissionStringSchema,
});

export type CheckUserPermissionInput = z.infer<typeof checkUserPermissionSchema>;

/**
 * Get Permission Usage Schema
 * For auditing which roles have a specific permission
 */
export const getPermissionUsageSchema = z.object({
  permission: permissionStringSchema,
  includeInactive: z.boolean().default(false),
});

export type GetPermissionUsageInput = z.infer<typeof getPermissionUsageSchema>;

/**
 * Create Contractor Role Schema
 * Specialized schema for creating time-limited contractor roles
 */
export const createContractorRoleSchema = z
  .object({
    userId: z.string().cuid('Invalid user ID'),
    seniority: SeniorityEnum.default('JUNIOR'),
    permissions: permissionsArraySchema,
    expiresAt: z.coerce.date(),
    reason: z
      .string()
      .min(20, 'Reason must be at least 20 characters for contractor roles')
      .max(1000, 'Reason too long'),
    projectDescription: z
      .string()
      .min(10, 'Project description required')
      .max(500, 'Project description too long')
      .optional(),
    sponsoringEmployee: z.string().cuid('Invalid sponsoring employee ID').optional(),
  })
  .refine(
    (data) => {
      // Expiration date must be in the future
      if (data.expiresAt <= new Date()) {
        return false;
      }
      return true;
    },
    {
      message: 'Expiration date must be in the future',
      path: ['expiresAt'],
    }
  )
  .refine(
    (data) => {
      // Expiration must be at least 24 hours from now
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 24);
      if (data.expiresAt < tomorrow) {
        return false;
      }
      return true;
    },
    {
      message: 'Contractor roles must be valid for at least 24 hours',
      path: ['expiresAt'],
    }
  )
  .refine(
    (data) => {
      // Contractor roles should not exceed 1 year
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      if (data.expiresAt > oneYearFromNow) {
        return false;
      }
      return true;
    },
    {
      message: 'Contractor roles cannot exceed 1 year. Please use a shorter duration.',
      path: ['expiresAt'],
    }
  );

export type CreateContractorRoleInput = z.infer<typeof createContractorRoleSchema>;
