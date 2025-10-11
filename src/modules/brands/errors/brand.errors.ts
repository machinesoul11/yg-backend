/**
 * Brand Module Error Definitions
 * Custom error classes for brand-related operations
 */

import { TRPCError } from '@trpc/server';

/**
 * Brand Already Exists Error
 */
export class BrandAlreadyExistsError extends TRPCError {
  constructor(userId: string) {
    super({
      code: 'CONFLICT',
      message: 'User already has a brand profile',
      cause: { userId },
    });
  }
}

/**
 * Brand Not Found Error
 */
export class BrandNotFoundError extends TRPCError {
  constructor(brandId?: string) {
    super({
      code: 'NOT_FOUND',
      message: brandId
        ? `Brand with ID ${brandId} not found`
        : 'Brand not found or you do not have permission to access it',
      cause: brandId ? { brandId } : undefined,
    });
  }
}

/**
 * Brand Unauthorized Access Error
 */
export class BrandUnauthorizedError extends TRPCError {
  constructor(action: string) {
    super({
      code: 'FORBIDDEN',
      message: `You do not have permission to ${action}`,
    });
  }
}

/**
 * Brand Has Active Licenses Error
 */
export class BrandHasActiveLicensesError extends TRPCError {
  constructor(activeLicenseCount: number) {
    super({
      code: 'PRECONDITION_FAILED',
      message: `Cannot delete brand with ${activeLicenseCount} active license${activeLicenseCount === 1 ? '' : 's'}. Please wait for licenses to expire or contact support.`,
      cause: { activeLicenseCount },
    });
  }
}

/**
 * Team Member Already Exists Error
 */
export class TeamMemberAlreadyExistsError extends TRPCError {
  constructor(email: string) {
    super({
      code: 'CONFLICT',
      message: 'User is already a team member',
      cause: { email },
    });
  }
}

/**
 * User Not Found Error (for team invitations)
 */
export class UserNotFoundForInvitationError extends TRPCError {
  constructor(email: string) {
    super({
      code: 'NOT_FOUND',
      message: 'User with this email not found. They must create an account first.',
      cause: { email },
    });
  }
}

/**
 * Cannot Remove Brand Owner Error
 */
export class CannotRemoveBrandOwnerError extends TRPCError {
  constructor() {
    super({
      code: 'FORBIDDEN',
      message: 'Cannot remove brand owner from team',
    });
  }
}

/**
 * Last Admin Remaining Error
 */
export class LastAdminRemainingError extends TRPCError {
  constructor() {
    super({
      code: 'PRECONDITION_FAILED',
      message: 'Cannot remove last admin. Assign another admin first.',
    });
  }
}

/**
 * Invalid File Type Error
 */
export class InvalidFileTypeError extends TRPCError {
  constructor(allowedTypes: string[]) {
    super({
      code: 'BAD_REQUEST',
      message: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
      cause: { allowedTypes },
    });
  }
}

/**
 * File Too Large Error
 */
export class FileTooLargeError extends TRPCError {
  constructor(maxSizeMB: number) {
    super({
      code: 'BAD_REQUEST',
      message: `File too large. Maximum size is ${maxSizeMB}MB`,
      cause: { maxSizeMB },
    });
  }
}

/**
 * Invalid Tax ID Error
 */
export class InvalidTaxIdError extends TRPCError {
  constructor() {
    super({
      code: 'BAD_REQUEST',
      message: 'Invalid tax ID format',
    });
  }
}

/**
 * Brand Verification Error
 */
export class BrandVerificationError extends TRPCError {
  constructor(message: string) {
    super({
      code: 'BAD_REQUEST',
      message,
    });
  }
}

/**
 * Brand Update Error
 */
export class BrandUpdateError extends TRPCError {
  constructor(message: string, cause?: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to update brand: ${message}`,
      cause,
    });
  }
}

/**
 * Brand Creation Error
 */
export class BrandCreationError extends TRPCError {
  constructor(message: string, cause?: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to create brand: ${message}`,
      cause,
    });
  }
}
