/**
 * System Module - Types
 * 
 * TypeScript interfaces for system infrastructure
 */

// ===========================
// Idempotency Types
// ===========================

export interface IdempotencyResult {
  processed: boolean;
  responseStatus: number;
  responseBody: any;
  entityType: string;
  entityId: string | null;
}

export interface StartProcessingParams {
  key: string;
  entityType: string;
  requestHash: string;
}

export interface CompleteProcessingParams {
  key: string;
  entityId: string;
  responseStatus: number;
  responseBody: any;
}

// ===========================
// Feature Flag Types
// ===========================

export interface FeatureFlagContext {
  userId: string;
  userRole: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  brandId?: string;
  creatorId?: string;
}

export interface FeatureFlagConditions {
  userRoles?: ('ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER')[];
  brandIds?: string[];
  creatorIds?: string[];
  customConditions?: Record<string, any>;
}

export interface CreateFeatureFlagInput {
  name: string;
  description?: string;
  enabled?: boolean;
  rolloutPercentage?: number;
  conditions?: FeatureFlagConditions;
}

export interface UpdateFeatureFlagInput {
  enabled?: boolean;
  description?: string;
  rolloutPercentage?: number;
  conditions?: FeatureFlagConditions;
}

export interface FeatureFlagResponse {
  id: string;
  name: string;
  enabled: boolean;
  description: string | null;
  rolloutPercentage: number;
  conditions: FeatureFlagConditions | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===========================
// Notification Types
// ===========================

export type NotificationType = 'LICENSE' | 'PAYOUT' | 'ROYALTY' | 'PROJECT' | 'SYSTEM';
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface CreateNotificationInput {
  userId?: string;
  userIds?: string[];
  userRole?: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface ListNotificationsInput {
  read?: boolean;
  type?: NotificationType;
  priority?: NotificationPriority;
  page?: number;
  pageSize?: number;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string | null;
  priority: NotificationPriority;
  read: boolean;
  readAt: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationResponse[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface CreateNotificationResult {
  created: number;
  notificationIds: string[];
}

// ===========================
// Error Types
// ===========================

export type IdempotencyErrorCode = 'PROCESSING' | 'HASH_MISMATCH' | 'EXPIRED';
export type FeatureFlagErrorCode = 'NOT_FOUND' | 'INVALID_NAME' | 'DUPLICATE';
export type NotificationErrorCode = 'NOT_FOUND' | 'UNAUTHORIZED' | 'INVALID_TARGET';
