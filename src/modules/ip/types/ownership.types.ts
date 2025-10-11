/**
 * IP Ownership Types
 * 
 * TypeScript types for IP ownership management
 */

import { IpOwnership, OwnershipType, Creator } from '@prisma/client';

// ============================================================================
// Response Types (Frontend-Safe)
// ============================================================================

export interface IpOwnershipResponse {
  id: string;
  ipAssetId: string;
  creatorId: string;
  shareBps: number;
  sharePercentage: number; // Computed: shareBps / 100
  ownershipType: OwnershipType;
  startDate: string; // ISO 8601
  endDate: string | null; // ISO 8601 or null for perpetual
  contractReference: string | null;
  legalDocUrl: string | null;
  notes: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  
  // Relations
  creator?: CreatorSummary;
  
  // Computed
  isActive: boolean; // Whether ownership is currently active
  isPerpetual: boolean; // Whether endDate is null
}

export interface CreatorSummary {
  id: string;
  userId: string;
  stageName: string;
  verificationStatus: string;
}

export interface OwnershipSummary {
  creatorId: string;
  creatorName: string;
  shareBps: number;
  sharePercentage: number;
  ownershipType: OwnershipType;
}

export interface AssetOwnershipSummary {
  ipAssetId: string;
  owners: OwnershipSummary[];
  totalBps: number; // Should always be 10000
  ownerCount: number;
  hasMultipleOwners: boolean;
}

// ============================================================================
// Database Types (With Relations)
// ============================================================================

export type IpOwnershipWithCreator = IpOwnership & {
  creator: Creator;
};

export type IpOwnershipWithRelations = IpOwnership & {
  creator: Creator & {
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  };
};

// ============================================================================
// Service Layer Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConflictCheck {
  hasConflicts: boolean;
  conflicts: {
    type: 'OVERLAP' | 'GAP' | 'INVALID_SUM';
    message: string;
    affectedOwnerships: string[]; // IDs
  }[];
}

export interface OwnershipTransferResult {
  fromOwnership: IpOwnershipResponse;
  toOwnership: IpOwnershipResponse;
  transferredBps: number;
}

export interface OwnershipHistoryEntry {
  ownership: IpOwnershipResponse;
  changeType: 'CREATED' | 'UPDATED' | 'ENDED' | 'TRANSFERRED';
  changedAt: string;
  changedBy: string;
}

// ============================================================================
// Query Options
// ============================================================================

export interface GetOwnersOptions {
  ipAssetId: string;
  atDate?: Date;
  includeCreatorDetails?: boolean;
}

export interface GetCreatorAssetsOptions {
  creatorId: string;
  includeExpired?: boolean;
  ownershipType?: OwnershipType;
}

// ============================================================================
// Error Types
// ============================================================================

export interface OwnershipValidationErrorDetails {
  requiredBps: number;
  providedBps: number;
  missingBps?: number;
  excessBps?: number;
  conflictingOwnerships?: string[];
}

export interface InsufficientOwnershipErrorDetails {
  requiredBps: number;
  availableBps: number;
  creatorId: string;
  ipAssetId: string;
}

// ============================================================================
// Cache Keys
// ============================================================================

export const OWNERSHIP_CACHE_KEYS = {
  activeByAsset: (ipAssetId: string) => `ownership:asset:${ipAssetId}:active`,
  byCreator: (creatorId: string) => `ownership:creator:${creatorId}:assets`,
  history: (ipAssetId: string) => `ownership:asset:${ipAssetId}:history`,
} as const;

// ============================================================================
// Constants
// ============================================================================

export const OWNERSHIP_CONSTANTS = {
  TOTAL_BPS: 10000,
  MIN_BPS: 1,
  MAX_BPS: 10000,
  BPS_TO_PERCENTAGE: 100,
  CACHE_TTL_ACTIVE: 900, // 15 minutes
  CACHE_TTL_HISTORY: 300, // 5 minutes
} as const;
