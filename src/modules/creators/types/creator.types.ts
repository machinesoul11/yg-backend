/**
 * Creator/Talent Type Definitions
 * Shared types for creator profiles across backend and frontend
 */

import type { Creator } from '@prisma/client';

/**
 * Creator Specialty Enum
 */
export const CreatorSpecialties = [
  'photography',
  'videography',
  'motion-graphics',
  'illustration',
  '3d-design',
  'graphic-design',
  'copywriting',
  'music-composition',
  'sound-design',
  'brand-strategy',
  'art-direction',
  'animation',
] as const;

export type CreatorSpecialty = typeof CreatorSpecialties[number];

/**
 * Verification Status
 */
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

/**
 * Onboarding Status
 */
export type OnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Social Links Object
 */
export interface SocialLinks {
  instagram?: string;
  behance?: string;
  dribbble?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  vimeo?: string;
}

/**
 * Availability Object
 */
export interface Availability {
  status: 'available' | 'limited' | 'unavailable';
  nextAvailable?: string; // ISO date string
  hoursPerWeek?: number;
}

/**
 * Budget Range
 */
export interface BudgetRange {
  min: number;
  max: number;
}

/**
 * Preferences Object
 */
export interface Preferences {
  projectTypes?: string[];
  budgetRange?: BudgetRange;
  collaborationStyle?: 'remote' | 'hybrid' | 'in-person';
  preferredIndustries?: string[];
  minimumProjectDuration?: string; // e.g., "1 month", "3 months"
}

/**
 * Performance Metrics Object
 */
export interface PerformanceMetrics {
  totalEarningsCents: number;
  activeLicenses: number;
  avgRating: number;
  totalProjects?: number;
  completionRate?: number;
  responseTime?: string; // e.g., "< 2 hours"
}

/**
 * Public Creator Profile
 * Visible to brands browsing creator directory
 */
export interface PublicCreatorProfile {
  id: string;
  stageName: string;
  bio: string | null;
  specialties: CreatorSpecialty[];
  socialLinks: SocialLinks | null;
  portfolioUrl: string | null;
  website: string | null;
  verifiedAt: string | null;
  performanceMetrics: PerformanceMetrics | null;
  createdAt: string;
}

/**
 * Private Creator Profile
 * Visible to creator themselves
 */
export interface PrivateCreatorProfile extends PublicCreatorProfile {
  availability: Availability | null;
  preferences: Preferences | null;
  verificationStatus: VerificationStatus;
  onboardingStatus: OnboardingStatus;
  stripeAccountId: string | null;
  updatedAt: string;
}

/**
 * Admin Creator Profile
 * All fields visible to admins
 */
export interface AdminCreatorProfile extends PrivateCreatorProfile {
  userId: string;
  deletedAt: string | null;
}

/**
 * Creator List Item
 * Simplified view for list/table displays
 */
export interface CreatorListItem {
  id: string;
  userId: string;
  stageName: string;
  specialties: CreatorSpecialty[];
  verificationStatus: VerificationStatus;
  onboardingStatus: OnboardingStatus;
  verifiedAt: string | null;
  createdAt: string;
  totalEarningsCents: number;
  activeLicenses: number;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Creator Statistics (for dashboard)
 */
export interface CreatorStatistics {
  totalEarnings: number;
  totalEarningsCents: number;
  activeLicenses: number;
  totalLicenses: number;
  totalAssets: number;
  avgRating: number;
  totalReviews: number;
  profileViews: number;
  thisMonthEarnings: number;
  lastMonthEarnings: number;
  earningsGrowth: number; // percentage
}

/**
 * Stripe Account Link Response
 */
export interface StripeAccountLinkResponse {
  url: string;
  expiresAt: number;
}

/**
 * Stripe Account Status Response
 */
export interface StripeAccountStatusResponse {
  hasAccount: boolean;
  onboardingStatus: OnboardingStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requiresAction: boolean;
  currentlyDue: string[];
  errors: string[];
}

/**
 * Storage Upload URL Response
 */
export interface StorageUploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresAt: number;
}

/**
 * Type guards
 */
export function isCreatorSpecialty(value: string): value is CreatorSpecialty {
  return CreatorSpecialties.includes(value as CreatorSpecialty);
}

export function isVerificationStatus(value: string): value is VerificationStatus {
  return ['pending', 'approved', 'rejected'].includes(value);
}

export function isOnboardingStatus(value: string): value is OnboardingStatus {
  return ['pending', 'in_progress', 'completed', 'failed'].includes(value);
}
