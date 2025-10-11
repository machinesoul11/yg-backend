import { AssetType, AssetStatus, ScanStatus } from '@prisma/client';

/**
 * IP Assets Module Types
 * 
 * Core content management system for intellectual property lifecycle
 */

// ============================================================================
// Response Types (Shared with Frontend)
// ============================================================================

export interface IpAssetResponse {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: AssetType;
  fileSize: number;
  mimeType: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  version: number;
  parentAssetId: string | null;
  metadata: Record<string, any> | null;
  status: AssetStatus;
  scanStatus: ScanStatus;
  createdBy: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
  
  // Computed fields
  downloadUrl?: string; // Signed URL with 15min expiry
  canEdit: boolean;
  canDelete: boolean;
}

export interface OwnershipSummary {
  ownerId: string;
  ownerName: string;
  percentage: number;
  role: string;
}

export interface AssetListFilters {
  projectId?: string;
  type?: AssetType;
  status?: AssetStatus;
  createdBy?: string;
  search?: string; // Full-text search on title/description
  fromDate?: string; // ISO 8601
  toDate?: string; // ISO 8601
}

export interface AssetListResponse {
  data: IpAssetResponse[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string; // ISO 8601
}

export interface PreviewUrlResponse {
  url: string;
  size: 'small' | 'medium' | 'large' | 'original';
  width?: number;
  height?: number;
  expiresAt: string;
}

export interface AssetVariantsResponse {
  thumbnails: {
    small?: PreviewUrlResponse;
    medium?: PreviewUrlResponse;
    large?: PreviewUrlResponse;
  };
  previews: {
    url?: string;
    expiresAt?: string;
    duration?: number; // For video/audio previews
  };
  waveform?: {
    url?: string;
    expiresAt?: string;
  };
}

export interface AssetMetadataResponse {
  type: AssetType;
  technical?: Record<string, any>;
  descriptive?: Record<string, any>;
  extracted?: Record<string, any>;
  processing?: {
    thumbnailGenerated?: boolean;
    thumbnailGeneratedAt?: string;
    previewGenerated?: boolean;
    previewGeneratedAt?: string;
    metadataExtracted?: boolean;
    metadataExtractedAt?: string;
  };
}

export interface RegeneratePreviewResponse {
  jobId: string;
  status: 'queued' | 'processing';
  types: string[];
}

export interface UploadInitiationResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
}

// ============================================================================
// Input Types
// ============================================================================

export interface InitiateUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  projectId?: string;
}

export interface ConfirmUploadInput {
  assetId: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UpdateAssetInput {
  id: string;
  title?: string;
  description?: string | null;
  metadata?: Record<string, any>;
}

export interface UpdateStatusInput {
  id: string;
  status: AssetStatus;
  notes?: string;
}

export interface BulkUpdateStatusInput {
  assetIds: string[];
  status: AssetStatus;
}

export interface ListAssetsInput {
  filters?: AssetListFilters;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Service Layer Types
// ============================================================================

export interface AssetServiceContext {
  userId: string;
  userRole: string;
}

export interface AssetMetadataExtraction {
  // Image metadata
  width?: number;
  height?: number;
  format?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  exif?: Record<string, any>;

  // Video metadata
  duration?: number;
  codec?: string;
  fps?: number;
  bitrate?: number;
  resolution?: string;

  // Audio metadata
  artist?: string;
  album?: string;
  title?: string;

  // Document metadata
  pageCount?: number;
  author?: string;
  creator?: string;
}

// ============================================================================
// Job Types
// ============================================================================

export interface VirusScanJobData {
  assetId: string;
  storageKey: string;
}

export interface ThumbnailGenerationJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
}

export interface PreviewGenerationJobData {
  assetId: string;
  storageKey: string;
  type: AssetType;
  mimeType: string;
}

export interface MetadataExtractionJobData {
  assetId: string;
  storageKey: string;
  mimeType: string;
}

export interface AssetCleanupJobData {
  deletedBefore: Date;
}

// ============================================================================
// Error Types
// ============================================================================

export class IpAssetError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'IpAssetError';
  }
}

// ============================================================================
// Constants
// ============================================================================

export const ASSET_CONSTANTS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  SIGNED_URL_EXPIRY: 900, // 15 minutes in seconds
  CACHE_TTL: {
    ASSET_LIST: 300, // 5 minutes
    ASSET_DETAILS: 600, // 10 minutes
    DOWNLOAD_URL: 900, // 15 minutes
    METADATA: 3600, // 1 hour
  },
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/tiff',
    // Videos
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // 3D
    'model/gltf+json',
    'model/gltf-binary',
    'model/obj',
  ],
  STATUS_TRANSITIONS: {
    DRAFT: ['REVIEW', 'ARCHIVED'],
    PROCESSING: ['DRAFT', 'REVIEW'],
    REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED'],
    REJECTED: ['DRAFT'],
    ARCHIVED: [],
  } as Record<AssetStatus, AssetStatus[]>,
};

