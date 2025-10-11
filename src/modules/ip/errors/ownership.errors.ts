/**
 * IP Ownership Error Classes
 * 
 * Domain-specific errors for ownership operations
 */

import { OwnershipValidationErrorDetails, InsufficientOwnershipErrorDetails } from '../types/ownership.types';

/**
 * Base ownership error
 */
export class OwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnershipError';
  }
}

/**
 * Thrown when ownership split validation fails
 */
export class OwnershipValidationError extends OwnershipError {
  public readonly details: OwnershipValidationErrorDetails;

  constructor(
    message: string,
    details: OwnershipValidationErrorDetails
  ) {
    super(message);
    this.name = 'OwnershipValidationError';
    this.details = details;
  }
}

/**
 * Thrown when a creator doesn't have enough ownership to perform an operation
 */
export class InsufficientOwnershipError extends OwnershipError {
  public readonly details: InsufficientOwnershipErrorDetails;

  constructor(
    requiredBps: number,
    availableBps: number,
    creatorId: string,
    ipAssetId: string
  ) {
    super(
      `Insufficient ownership: required ${requiredBps} BPS (${requiredBps / 100}%), ` +
      `available ${availableBps} BPS (${availableBps / 100}%)`
    );
    this.name = 'InsufficientOwnershipError';
    this.details = {
      requiredBps,
      availableBps,
      creatorId,
      ipAssetId,
    };
  }
}

/**
 * Thrown when trying to access/modify an asset the user doesn't own
 */
export class UnauthorizedOwnershipError extends OwnershipError {
  constructor(ipAssetId: string, userId: string) {
    super(`User ${userId} does not have ownership of asset ${ipAssetId}`);
    this.name = 'UnauthorizedOwnershipError';
  }
}

/**
 * Thrown when ownership dates create conflicts (overlaps, gaps)
 */
export class OwnershipConflictError extends OwnershipError {
  public readonly conflicts: Array<{
    type: 'OVERLAP' | 'GAP' | 'INVALID_SUM';
    message: string;
    affectedOwnerships: string[];
  }>;

  constructor(
    message: string,
    conflicts: Array<{
      type: 'OVERLAP' | 'GAP' | 'INVALID_SUM';
      message: string;
      affectedOwnerships: string[];
    }>
  ) {
    super(message);
    this.name = 'OwnershipConflictError';
    this.conflicts = conflicts;
  }
}

/**
 * Thrown when trying to modify historical ownership records
 */
export class ImmutableOwnershipError extends OwnershipError {
  constructor(ownershipId: string) {
    super(`Cannot modify historical ownership record ${ownershipId}. Create a new record instead.`);
    this.name = 'ImmutableOwnershipError';
  }
}
