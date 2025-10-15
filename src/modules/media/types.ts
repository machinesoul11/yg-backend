/**
 * Media Management Module Types
 * 
 * Types for internal staff media library management
 */

import { z } from 'zod';

// Database types
export type MediaStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type MediaCategory = 'BRAND_ASSETS' | 'MARKETING' | 'TEMPLATES' | 'STOCK' | 'UI_ELEMENTS' | 'OTHER';
export type MediaUsageType = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED';

// API Response Types
export interface MediaItem {
  id: string;
  title: string;
  description?: string;
  category: MediaCategory;
  tags: string[];
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  dimensions?: {
    width: number;
    height: number;
  };
  status: MediaStatus;
  usageType: MediaUsageType;
  downloadCount: number;
  thumbnails: {
    small?: string;
    medium?: string;
    large?: string;
  };
  cdnUrl?: string;
  createdBy: string;
  createdByName: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaListResponse {
  data: MediaItem[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    totalPages: number;
  };
}

export interface UploadInitiationResponse {
  uploadUrl: string;
  mediaId: string;
  storageKey: string;
  expiresAt: string;
}

export interface MediaVariantsResponse {
  thumbnails: {
    small?: {
      url: string;
      width: number;
      height: number;
      expiresAt: string;
    };
    medium?: {
      url: string;
      width: number;
      height: number;
      expiresAt: string;
    };
    large?: {
      url: string;
      width: number;
      height: number;
      expiresAt: string;
    };
  };
  original: {
    url: string;
    expiresAt: string;
  };
}

export interface MediaUsageStatsResponse {
  totalFiles: number;
  totalSize: number;
  categoryCounts: Record<MediaCategory, number>;
  recentUploads: number;
  popularTags: Array<{
    tag: string;
    count: number;
  }>;
}

// Input Types
export interface InitiateUploadInput {
  filename: string;
  fileSize: number;
  mimeType: string;
  category: MediaCategory;
}

export interface ConfirmUploadInput {
  mediaId: string;
  title: string;
  description?: string;
  tags: string[];
  usageType: MediaUsageType;
}

export interface UpdateMediaInput {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  category?: MediaCategory;
  usageType?: MediaUsageType;
}

export interface ListMediaInput {
  page?: number;
  pageSize?: number;
  category?: MediaCategory;
  status?: MediaStatus;
  usageType?: MediaUsageType;
  search?: string;
  tags?: string[];
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'downloadCount' | 'fileSize';
  sortOrder?: 'asc' | 'desc';
}

export interface BulkUpdateStatusInput {
  mediaIds: string[];
  status: MediaStatus;
}

export interface MediaCollectionInput {
  name: string;
  description?: string;
  mediaIds: string[];
}

export interface MediaCollection {
  id: string;
  name: string;
  description?: string;
  mediaCount: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// Service Context
export interface MediaServiceContext {
  userId: string;
  userRole: string;
}

// Constants
export const MEDIA_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  SIGNED_URL_EXPIRY: 900, // 15 minutes
  MAX_TAGS: 10,
  MAX_TAG_LENGTH: 50,
  MAX_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 1000,
  SUPPORTED_MIME_TYPES: [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    // Videos
    'video/mp4',
    'video/quicktime',
    'video/webm',
    // Documents
    'application/pdf',
    // Audio
    'audio/mpeg',
    'audio/wav',
  ] as const,
} as const;

// Error Types
export class MediaError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

// Job Data Types
export interface MediaThumbnailJobData {
  mediaId: string;
  storageKey: string;
  mimeType: string;
}

export interface MediaOptimizationJobData {
  mediaId: string;
  storageKey: string;
  mimeType: string;
  originalFileSize: number;
}
