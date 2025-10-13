/**
 * System Module - Validation Schemas
 * 
 * Zod schemas for input validation
 */

import { z } from 'zod';
import { NotificationType, NotificationPriority } from '@prisma/client';

// ===========================
// Idempotency Schemas
// ===========================

export const CheckIdempotencyKeySchema = z.object({
  key: z.string().uuid({
    message: 'Idempotency key must be a valid UUID'
  })
});

// ===========================
// Feature Flag Schemas
// ===========================

export const CreateFeatureFlagSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must not exceed 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Name must be lowercase kebab-case')
    .refine(
      (val) => !val.startsWith('-') && !val.endsWith('-'),
      'Name cannot start or end with hyphen'
    ),
  description: z.string().max(500).optional(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().int().min(0).max(100).default(0),
  conditions: z.object({
    userRoles: z.array(z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER'])).optional(),
    brandIds: z.array(z.string().cuid()).optional(),
    creatorIds: z.array(z.string().cuid()).optional(),
    customConditions: z.record(z.string(), z.any()).optional()
  }).optional()
});

export const UpdateFeatureFlagSchema = z.object({
  id: z.string().cuid(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  conditions: z.object({
    userRoles: z.array(z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER'])).optional(),
    brandIds: z.array(z.string().cuid()).optional(),
    creatorIds: z.array(z.string().cuid()).optional(),
    customConditions: z.record(z.string(), z.any()).optional()
  }).optional()
});

export const DeleteFeatureFlagSchema = z.object({
  id: z.string().cuid()
});

// ===========================
// Notification Schemas
// ===========================

export const ListNotificationsSchema = z.object({
  read: z.boolean().optional(),
  type: z.nativeEnum(NotificationType).optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20)
});

export const CreateNotificationSchema = z.object({
  userId: z.string().cuid().optional(),
  userIds: z.array(z.string().cuid()).optional(),
  userRole: z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER']).optional(),
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(1000),
  priority: z.nativeEnum(NotificationPriority).default('MEDIUM'),
  actionUrl: z.string().url().or(z.string().regex(/^\/[a-z0-9\/-]*$/)).optional(),
  metadata: z.record(z.string(), z.any()).optional()
}).refine(
  (data) => !!(data.userId || data.userIds || data.userRole),
  {
    message: 'Must provide userId, userIds, or userRole'
  }
);

export const MarkAsReadSchema = z.object({
  notificationId: z.string().cuid()
});

export const DeleteNotificationSchema = z.object({
  notificationId: z.string().cuid()
});
