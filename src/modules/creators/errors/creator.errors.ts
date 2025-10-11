/**
 * Creator-Specific Error Classes
 * Custom errors for creator module operations
 */

import { TRPCError } from '@trpc/server';

/**
 * Creator Not Found Error
 */
export class CreatorNotFoundError extends TRPCError {
  constructor(identifier?: string) {
    super({
      code: 'NOT_FOUND',
      message: identifier 
        ? `Creator with ID ${identifier} not found`
        : 'Creator profile not found',
    });
  }
}

/**
 * Creator Already Exists Error
 */
export class CreatorAlreadyExistsError extends TRPCError {
  constructor(userId: string) {
    super({
      code: 'CONFLICT',
      message: `Creator profile already exists for user ${userId}`,
    });
  }
}

/**
 * Creator Not Verified Error
 */
export class CreatorNotVerifiedError extends TRPCError {
  constructor(creatorId?: string) {
    super({
      code: 'FORBIDDEN',
      message: creatorId
        ? `Creator ${creatorId} is not verified. Contact support for verification.`
        : 'Creator profile is not verified. Please wait for admin approval.',
    });
  }
}

/**
 * Creator Verification Rejected Error
 */
export class CreatorVerificationRejectedError extends TRPCError {
  constructor(reason?: string) {
    super({
      code: 'FORBIDDEN',
      message: reason
        ? `Creator verification was rejected: ${reason}`
        : 'Creator verification was rejected. Please update your profile and reapply.',
    });
  }
}

/**
 * Stripe Onboarding Incomplete Error
 */
export class StripeOnboardingIncompleteError extends TRPCError {
  constructor(creatorId?: string) {
    super({
      code: 'PRECONDITION_FAILED',
      message: creatorId
        ? `Stripe onboarding incomplete for creator ${creatorId}. Complete onboarding to receive payouts.`
        : 'Stripe onboarding is incomplete. Please complete your payout account setup.',
    });
  }
}

/**
 * Stripe Account Creation Failed Error
 */
export class StripeAccountCreationFailedError extends TRPCError {
  constructor(reason?: string) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: reason
        ? `Failed to create Stripe account: ${reason}`
        : 'Failed to create Stripe account. Please try again later.',
    });
  }
}

/**
 * Invalid Creator Specialty Error
 */
export class InvalidCreatorSpecialtyError extends TRPCError {
  constructor(specialty: string) {
    super({
      code: 'BAD_REQUEST',
      message: `Invalid creator specialty: ${specialty}`,
    });
  }
}

/**
 * Creator Profile Deleted Error
 */
export class CreatorProfileDeletedError extends TRPCError {
  constructor(creatorId: string) {
    super({
      code: 'NOT_FOUND',
      message: `Creator profile ${creatorId} has been deleted`,
    });
  }
}

/**
 * Storage Upload Failed Error
 */
export class StorageUploadFailedError extends TRPCError {
  constructor(reason?: string) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: reason
        ? `Storage upload failed: ${reason}`
        : 'Failed to generate upload URL. Please try again later.',
    });
  }
}

/**
 * Unauthorized Profile Access Error
 */
export class UnauthorizedProfileAccessError extends TRPCError {
  constructor() {
    super({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this creator profile',
    });
  }
}

/**
 * Type guard to check if error is a creator-related error
 */
export function isCreatorError(error: unknown): error is TRPCError {
  return error instanceof TRPCError && [
    'NOT_FOUND',
    'CONFLICT',
    'FORBIDDEN',
    'PRECONDITION_FAILED',
    'INTERNAL_SERVER_ERROR',
    'BAD_REQUEST',
  ].includes((error as TRPCError).code);
}
