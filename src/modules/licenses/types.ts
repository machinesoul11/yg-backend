/**
 * Licensing Module Types
 * TypeScript interfaces and types for the licensing system
 */

import type { License, LicenseType, LicenseStatus, BillingFrequency } from '@prisma/client';

/**
 * License Scope Structure
 * Defines what the license allows in terms of media, placement, geography, etc.
 */
export interface LicenseScope {
  media: {
    digital: boolean;
    print: boolean;
    broadcast: boolean;
    ooh: boolean; // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;
    website: boolean;
    email: boolean;
    paid_ads: boolean;
    packaging: boolean;
  };
  geographic?: {
    territories: string[]; // ISO country codes or "GLOBAL"
  };
  exclusivity?: {
    category?: string; // e.g., "Fashion", "Beauty"
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number; // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string; // e.g., "Photo by @creator"
  };
}

/**
 * Input for creating a new license
 */
export interface CreateLicenseInput {
  ipAssetId: string;
  brandId: string;
  projectId?: string;
  licenseType: LicenseType;
  startDate: Date | string;
  endDate: Date | string;
  feeCents: number;
  revShareBps: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Input for updating an existing license
 */
export interface UpdateLicenseInput {
  status?: LicenseStatus;
  endDate?: Date | string;
  feeCents?: number;
  revShareBps?: number;
  paymentTerms?: string;
  billingFrequency?: BillingFrequency;
  scope?: LicenseScope;
  autoRenew?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Filters for querying licenses
 */
export interface LicenseFilters {
  status?: LicenseStatus;
  ipAssetId?: string;
  brandId?: string;
  projectId?: string;
  licenseType?: LicenseType;
  expiringBefore?: Date | string;
  creatorId?: string; // For filtering by creator ownership
  page?: number;
  pageSize?: number;
}

/**
 * Input for checking license conflicts
 */
export interface ConflictCheckInput {
  ipAssetId: string;
  startDate: Date | string;
  endDate: Date | string;
  licenseType: LicenseType;
  scope: LicenseScope;
  excludeLicenseId?: string; // When updating, exclude self from conflict check
}

/**
 * Conflict details
 */
export interface Conflict {
  licenseId: string;
  reason: 'EXCLUSIVE_OVERLAP' | 'TERRITORY_OVERLAP' | 'COMPETITOR_BLOCKED' | 'DATE_OVERLAP';
  details: string;
  conflictingLicense?: Partial<License>;
}

/**
 * Result of conflict check
 */
export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

/**
 * Input for terminating a license
 */
export interface TerminateLicenseInput {
  licenseId: string;
  reason: string;
  effectiveDate?: Date | string; // If not provided, terminates immediately
}

/**
 * API response format for licenses
 */
export interface LicenseResponse {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: LicenseType;
  status: LicenseStatus;
  startDate: string;
  endDate: string;
  signedAt: string | null;
  feeCents: number;
  feeDollars: number; // Computed: feeCents / 100
  revShareBps: number;
  revSharePercent: number; // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  scope: LicenseScope;
  autoRenew: boolean;
  renewalNotifiedAt: string | null;
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  // Optional expanded relations
  ipAsset?: any;
  brand?: any;
  project?: any;
  parentLicense?: LicenseResponse;
  renewals?: LicenseResponse[];
}

/**
 * Paginated response
 */
export interface PaginatedLicenseResponse {
  data: LicenseResponse[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Renewal generation input
 */
export interface GenerateRenewalInput {
  licenseId: string;
  durationDays?: number; // Override duration (defaults to same as original)
  feeAdjustmentPercent?: number; // e.g., 10 for 10% increase
  revShareAdjustmentBps?: number; // Absolute adjustment in basis points
}

/**
 * License statistics for reporting
 */
export interface LicenseStats {
  totalActive: number;
  totalRevenueCents: number;
  expiringIn30Days: number;
  expiringIn60Days: number;
  expiringIn90Days: number;
  averageLicenseDurationDays: number;
  exclusiveLicenses: number;
  nonExclusiveLicenses: number;
  renewalRate: number; // Percentage of licenses that were renewed
}

/**
 * Custom errors
 */
export class LicenseConflictError extends Error {
  constructor(public conflicts: Conflict[]) {
    super('License conflicts detected');
    this.name = 'LicenseConflictError';
  }
}

export class LicensePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicensePermissionError';
  }
}

export class LicenseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseValidationError';
  }
}

export class LicenseNotFoundError extends Error {
  constructor(licenseId: string) {
    super(`License not found: ${licenseId}`);
    this.name = 'LicenseNotFoundError';
  }
}

