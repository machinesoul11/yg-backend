/**
 * Creators/Talent Module - Central Export Point
 * 
 * This module provides:
 * - Creator profile management (CRUD operations)
 * - Stripe Connect integration for payouts
 * - File upload/storage for portfolios and verification
 * - Email notifications for creator events
 * - Performance metrics and analytics
 * - Admin approval workflows
 */

// Services
export { CreatorService } from './services/creator.service';
export { StripeConnectService } from './services/stripe-connect.service';
export { CreatorAssetsService } from './services/creator-assets.service';
export { CreatorNotificationsService } from './services/creator-notifications.service';

// Router
export { creatorsRouter } from './routers/creators.router';
export { default as creatorsRouterDefault } from './routers/creators.router';

// Types
export type {
  PublicCreatorProfile,
  PrivateCreatorProfile,
  AdminCreatorProfile,
  CreatorListItem,
  CreatorStatistics,
  PaginatedResponse,
  StripeAccountLinkResponse,
  StripeAccountStatusResponse,
  StripeCapabilityResponse,
  StripeAccountRequirement,
  CategorizedRequirements,
  StripeOnboardingSession,
  StripeAccountUpdateResponse,
  SocialLinks,
  Availability,
  Preferences,
  PerformanceMetrics,
} from './types/creator.types';

export type {
  CreatorSpecialty,
  VerificationStatus,
  OnboardingStatus,
} from './types/creator.types';

export {
  CreatorSpecialties,
  isCreatorSpecialty,
  isVerificationStatus,
  isOnboardingStatus,
} from './types/creator.types';

// Schemas
export {
  createCreatorSchema,
  updateCreatorSchema,
  listCreatorsSchema,
  getCreatorByIdSchema,
  approveCreatorSchema,
  rejectCreatorSchema,
  CreatorSpecialtyEnum,
  VerificationStatusEnum,
  OnboardingStatusEnum,
} from './schemas/creator.schema';

export type {
  CreateCreatorInput,
  UpdateCreatorInput,
  ListCreatorsInput,
  GetCreatorByIdInput,
  ApproveCreatorInput,
  RejectCreatorInput,
} from './schemas/creator.schema';

// Errors
export {
  CreatorNotFoundError,
  CreatorAlreadyExistsError,
  CreatorNotVerifiedError,
  CreatorVerificationRejectedError,
  StripeOnboardingIncompleteError,
  StripeAccountCreationFailedError,
  InvalidCreatorSpecialtyError,
  CreatorProfileDeletedError,
  StorageUploadFailedError,
  UnauthorizedProfileAccessError,
  isCreatorError,
} from './errors/creator.errors';
