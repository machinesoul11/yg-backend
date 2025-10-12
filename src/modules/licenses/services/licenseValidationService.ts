/**
 * License Validation Service
 * Comprehensive validation for license creation and updates
 * Implements: date overlap, exclusivity, scope conflict, budget, ownership, and approval checks
 */

import { prisma } from '@/lib/db';
import type { LicenseScope, Conflict } from '../types';
import type { LicenseType, LicenseStatus } from '@prisma/client';

/**
 * Validation input for creating or updating a license
 */
export interface LicenseValidationInput {
  ipAssetId: string;
  brandId: string;
  licenseType: LicenseType;
  startDate: Date;
  endDate: Date;
  scope: LicenseScope;
  feeCents: number;
  revShareBps: number;
  excludeLicenseId?: string; // When updating, exclude self from checks
}

/**
 * Individual validation result
 */
export interface ValidationCheck {
  passed: boolean;
  errors: string[];
  warnings: string[];
  details?: any;
}

/**
 * Comprehensive validation result
 */
export interface LicenseValidationResult {
  valid: boolean;
  checks: {
    dateOverlap: ValidationCheck;
    exclusivity: ValidationCheck;
    scopeConflict: ValidationCheck;
    budgetAvailability: ValidationCheck;
    ownershipVerification: ValidationCheck;
    approvalRequirements: ValidationCheck;
  };
  allErrors: string[];
  allWarnings: string[];
  conflicts: Conflict[];
}

/**
 * Approval requirement result
 */
export interface ApprovalRequirement {
  required: boolean;
  reasons: string[];
  approvers: Array<{
    type: 'creator' | 'brand' | 'admin';
    userId?: string;
    name?: string;
  }>;
}

export class LicenseValidationService {
  /**
   * Validate all aspects of a license
   * Runs all six validation checks and returns comprehensive results
   */
  async validateLicense(
    input: LicenseValidationInput,
    options: { validateAll?: boolean } = {}
  ): Promise<LicenseValidationResult> {
    const result: LicenseValidationResult = {
      valid: true,
      checks: {
        dateOverlap: { passed: true, errors: [], warnings: [] },
        exclusivity: { passed: true, errors: [], warnings: [] },
        scopeConflict: { passed: true, errors: [], warnings: [] },
        budgetAvailability: { passed: true, errors: [], warnings: [] },
        ownershipVerification: { passed: true, errors: [], warnings: [] },
        approvalRequirements: { passed: true, errors: [], warnings: [] },
      },
      allErrors: [],
      allWarnings: [],
      conflicts: [],
    };

    // Run all validations (or stop at first failure if validateAll is false)
    try {
      // 1. Date Overlap Validation
      result.checks.dateOverlap = await this.validateDateOverlap(input);
      if (!result.checks.dateOverlap.passed && !options.validateAll) {
        result.valid = false;
        result.allErrors.push(...result.checks.dateOverlap.errors);
        return result;
      }

      // 2. Exclusivity Checking
      result.checks.exclusivity = await this.validateExclusivity(input);
      if (!result.checks.exclusivity.passed && !options.validateAll) {
        result.valid = false;
        result.allErrors.push(...result.checks.exclusivity.errors);
        return result;
      }

      // 3. Scope Conflict Detection
      result.checks.scopeConflict = await this.validateScopeConflicts(input);
      if (!result.checks.scopeConflict.passed && !options.validateAll) {
        result.valid = false;
        result.allErrors.push(...result.checks.scopeConflict.errors);
        return result;
      }

      // 4. Budget Availability Check
      result.checks.budgetAvailability = await this.validateBudgetAvailability(input);
      if (!result.checks.budgetAvailability.passed && !options.validateAll) {
        result.valid = false;
        result.allErrors.push(...result.checks.budgetAvailability.errors);
        return result;
      }

      // 5. Ownership Verification
      result.checks.ownershipVerification = await this.validateOwnership(input);
      if (!result.checks.ownershipVerification.passed && !options.validateAll) {
        result.valid = false;
        result.allErrors.push(...result.checks.ownershipVerification.errors);
        return result;
      }

      // 6. Approval Requirement Checks
      result.checks.approvalRequirements = await this.validateApprovalRequirements(input);

      // Aggregate all errors and warnings
      Object.values(result.checks).forEach((check) => {
        result.allErrors.push(...check.errors);
        result.allWarnings.push(...check.warnings);
        if (!check.passed) {
          result.valid = false;
        }
      });

      // Collect all conflicts
      if (result.checks.dateOverlap.details?.conflicts) {
        result.conflicts.push(...result.checks.dateOverlap.details.conflicts);
      }
      if (result.checks.exclusivity.details?.conflicts) {
        result.conflicts.push(...result.checks.exclusivity.details.conflicts);
      }
      if (result.checks.scopeConflict.details?.conflicts) {
        result.conflicts.push(...result.checks.scopeConflict.details.conflicts);
      }
    } catch (error) {
      result.valid = false;
      result.allErrors.push(
        error instanceof Error ? error.message : 'Unknown validation error occurred'
      );
    }

    return result;
  }

  /**
   * 1. Date Overlap Validation
   * Checks if proposed license dates overlap with existing licenses
   */
  async validateDateOverlap(input: LicenseValidationInput): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: Conflict[] = [];

    try {
      // Basic date validation
      if (input.endDate <= input.startDate) {
        errors.push('End date must be after start date');
        return { passed: false, errors, warnings };
      }

      const now = new Date();
      if (input.startDate < now) {
        warnings.push('License start date is in the past');
      }

      // Query for overlapping licenses
      const overlappingLicenses = await prisma.license.findMany({
        where: {
          ipAssetId: input.ipAssetId,
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'PENDING_APPROVAL'] as LicenseStatus[],
          },
          ...(input.excludeLicenseId && {
            id: { not: input.excludeLicenseId },
          }),
          // Date overlap condition: (start1 <= end2) AND (end1 >= start2)
          AND: [
            { startDate: { lte: input.endDate } },
            { endDate: { gte: input.startDate } },
          ],
        },
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      });

      // Check each overlapping license
      for (const existing of overlappingLicenses) {
        const scope = existing.scopeJson as unknown as LicenseScope;

        // If renewal of parent license, allow overlap
        if (input.excludeLicenseId && existing.id === input.excludeLicenseId) {
          continue;
        }

        // Non-exclusive licenses can potentially coexist
        if (
          input.licenseType === 'NON_EXCLUSIVE' &&
          existing.licenseType === 'NON_EXCLUSIVE'
        ) {
          // Check for specific scope conflicts (handled in scope validation)
          warnings.push(
            `Non-exclusive license overlap detected with ${existing.brand.companyName} (${existing.id}). Verify scope compatibility.`
          );
        } else {
          // Exclusive or mixed exclusive/non-exclusive = conflict
          conflicts.push({
            licenseId: existing.id,
            reason: 'DATE_OVERLAP',
            details: `License dates overlap with existing ${existing.licenseType.toLowerCase()} license for ${existing.brand.companyName} (${existing.startDate.toISOString().split('T')[0]} to ${existing.endDate.toISOString().split('T')[0]})`,
            conflictingLicense: {
              id: existing.id,
              brandId: existing.brandId,
              licenseType: existing.licenseType,
              startDate: existing.startDate,
              endDate: existing.endDate,
            },
          });

          errors.push(
            `Date overlap conflict: ${existing.licenseType.toLowerCase()} license exists for ${existing.brand.companyName} from ${existing.startDate.toISOString().split('T')[0]} to ${existing.endDate.toISOString().split('T')[0]}`
          );
        }
      }

      return {
        passed: errors.length === 0,
        errors,
        warnings,
        details: { conflicts, overlappingLicenses: overlappingLicenses.length },
      };
    } catch (error) {
      errors.push(
        `Date overlap validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * 2. Exclusivity Checking
   * Validates that proposed license doesn't violate exclusivity rules
   */
  async validateExclusivity(input: LicenseValidationInput): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: Conflict[] = [];

    try {
      // Get overlapping licenses for exclusivity checks
      const overlappingLicenses = await prisma.license.findMany({
        where: {
          ipAssetId: input.ipAssetId,
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'PENDING_APPROVAL'] as LicenseStatus[],
          },
          ...(input.excludeLicenseId && {
            id: { not: input.excludeLicenseId },
          }),
          AND: [
            { startDate: { lte: input.endDate } },
            { endDate: { gte: input.startDate } },
          ],
        },
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      });

      for (const existing of overlappingLicenses) {
        const existingScope = existing.scopeJson as unknown as LicenseScope;

        // Check if new license is exclusive
        if (input.licenseType === 'EXCLUSIVE') {
          // Any existing active license conflicts with a new exclusive license
          conflicts.push({
            licenseId: existing.id,
            reason: 'EXCLUSIVE_OVERLAP',
            details: `Cannot grant exclusive license: ${existing.licenseType.toLowerCase()} license already exists for ${existing.brand.companyName} during this period`,
            conflictingLicense: {
              id: existing.id,
              brandId: existing.brandId,
              licenseType: existing.licenseType,
              startDate: existing.startDate,
              endDate: existing.endDate,
            },
          });

          errors.push(
            `Exclusive license conflict: Existing ${existing.licenseType.toLowerCase()} license for ${existing.brand.companyName} prevents granting exclusive rights`
          );
        }

        // Check if existing license is exclusive
        if (existing.licenseType === 'EXCLUSIVE') {
          conflicts.push({
            licenseId: existing.id,
            reason: 'EXCLUSIVE_OVERLAP',
            details: `Cannot create license: Exclusive license already exists for ${existing.brand.companyName} during this period`,
            conflictingLicense: {
              id: existing.id,
              brandId: existing.brandId,
              licenseType: existing.licenseType,
              startDate: existing.startDate,
              endDate: existing.endDate,
            },
          });

          errors.push(
            `Exclusive license conflict: ${existing.brand.companyName} holds exclusive rights during this period`
          );
        }

        // Check for territory-based exclusivity
        if (
          input.licenseType === 'EXCLUSIVE_TERRITORY' ||
          existing.licenseType === 'EXCLUSIVE_TERRITORY'
        ) {
          const territoryOverlap = this.checkTerritoryOverlap(
            input.scope.geographic,
            existingScope.geographic
          );

          if (territoryOverlap.overlaps) {
            conflicts.push({
              licenseId: existing.id,
              reason: 'TERRITORY_OVERLAP',
              details: `Exclusive territory conflict with ${existing.brand.companyName}: ${territoryOverlap.overlappingTerritories.join(', ')}`,
              conflictingLicense: {
                id: existing.id,
                brandId: existing.brandId,
                licenseType: existing.licenseType,
              },
            });

            errors.push(
              `Territory exclusivity conflict: Overlapping territories with ${existing.brand.companyName} (${territoryOverlap.overlappingTerritories.join(', ')})`
            );
          }
        }

        // Check for category-based exclusivity in scope
        if (input.scope.exclusivity?.category || existingScope.exclusivity?.category) {
          if (
            input.scope.exclusivity?.category &&
            existingScope.exclusivity?.category &&
            input.scope.exclusivity.category === existingScope.exclusivity.category
          ) {
            conflicts.push({
              licenseId: existing.id,
              reason: 'EXCLUSIVE_OVERLAP',
              details: `Category exclusivity conflict: Both licenses claim exclusivity in ${input.scope.exclusivity.category} category`,
              conflictingLicense: {
                id: existing.id,
                brandId: existing.brandId,
              },
            });

            errors.push(
              `Category exclusivity conflict: ${existing.brand.companyName} already has exclusive rights in ${input.scope.exclusivity.category} category`
            );
          }
        }

        // Check competitor blocking
        if (existingScope.exclusivity?.competitors?.includes(input.brandId)) {
          conflicts.push({
            licenseId: existing.id,
            reason: 'COMPETITOR_BLOCKED',
            details: `Brand is blocked as a competitor by existing license for ${existing.brand.companyName}`,
            conflictingLicense: {
              id: existing.id,
              brandId: existing.brandId,
            },
          });

          errors.push(
            `Competitor exclusivity conflict: Your brand is blocked by ${existing.brand.companyName}'s license terms`
          );
        }
      }

      return {
        passed: errors.length === 0,
        errors,
        warnings,
        details: { conflicts },
      };
    } catch (error) {
      errors.push(
        `Exclusivity validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * 3. Scope Conflict Detection
   * Checks for conflicts in media types, placements, and usage scope
   */
  async validateScopeConflicts(input: LicenseValidationInput): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const conflicts: Conflict[] = [];

    try {
      // Validate scope structure
      if (!input.scope.media || !input.scope.placement) {
        errors.push('License scope must specify media types and placements');
        return { passed: false, errors, warnings };
      }

      // Check if at least one media type is selected
      const hasMedia = Object.values(input.scope.media).some((v) => v === true);
      if (!hasMedia) {
        errors.push('At least one media type must be selected');
      }

      // Check if at least one placement is selected
      const hasPlacement = Object.values(input.scope.placement).some((v) => v === true);
      if (!hasPlacement) {
        errors.push('At least one placement must be selected');
      }

      // Get overlapping licenses to check scope conflicts
      const overlappingLicenses = await prisma.license.findMany({
        where: {
          ipAssetId: input.ipAssetId,
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'PENDING_APPROVAL'] as LicenseStatus[],
          },
          ...(input.excludeLicenseId && {
            id: { not: input.excludeLicenseId },
          }),
          AND: [
            { startDate: { lte: input.endDate } },
            { endDate: { gte: input.startDate } },
          ],
        },
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
      });

      for (const existing of overlappingLicenses) {
        const existingScope = existing.scopeJson as unknown as LicenseScope;

        // Only check scope conflicts for non-exclusive licenses
        // (Exclusive conflicts are caught in exclusivity validation)
        if (
          input.licenseType === 'NON_EXCLUSIVE' &&
          existing.licenseType === 'NON_EXCLUSIVE'
        ) {
          // Check for media type overlaps
          const mediaOverlaps = this.checkMediaOverlap(input.scope.media, existingScope.media);
          if (mediaOverlaps.length > 0) {
            warnings.push(
              `Media overlap with ${existing.brand.companyName}: ${mediaOverlaps.join(', ')}`
            );
          }

          // Check for placement overlaps
          const placementOverlaps = this.checkPlacementOverlap(
            input.scope.placement,
            existingScope.placement
          );
          if (placementOverlaps.length > 0) {
            warnings.push(
              `Placement overlap with ${existing.brand.companyName}: ${placementOverlaps.join(', ')}`
            );
          }

          // Check for complete scope overlap (all media and placements match)
          if (mediaOverlaps.length > 0 && placementOverlaps.length > 0) {
            const isCompleteOverlap = this.isCompleteScopeOverlap(
              input.scope,
              existingScope,
              mediaOverlaps,
              placementOverlaps
            );

            if (isCompleteOverlap) {
              errors.push(
                `Complete scope conflict: Identical usage scope already licensed to ${existing.brand.companyName}`
              );
              conflicts.push({
                licenseId: existing.id,
                reason: 'DATE_OVERLAP',
                details: `Identical scope already licensed to ${existing.brand.companyName}`,
                conflictingLicense: {
                  id: existing.id,
                  brandId: existing.brandId,
                },
              });
            }
          }
        }

        // Check for attribution conflicts
        if (input.scope.attribution?.required && existingScope.attribution?.required) {
          if (
            input.scope.attribution.format &&
            existingScope.attribution.format &&
            input.scope.attribution.format !== existingScope.attribution.format
          ) {
            warnings.push(
              `Different attribution requirements exist with ${existing.brand.companyName}'s license`
            );
          }
        }
      }

      // Validate cutdown permissions
      if (input.scope.cutdowns?.allowEdits) {
        if (
          input.scope.cutdowns.aspectRatios &&
          input.scope.cutdowns.aspectRatios.length > 0
        ) {
          const validRatios = [
            '16:9',
            '1:1',
            '9:16',
            '4:5',
            '2:3',
            '4:3',
            '21:9',
          ];
          const invalidRatios = input.scope.cutdowns.aspectRatios.filter(
            (r) => !validRatios.includes(r)
          );
          if (invalidRatios.length > 0) {
            warnings.push(`Invalid aspect ratios specified: ${invalidRatios.join(', ')}`);
          }
        }

        if (input.scope.cutdowns.maxDuration && input.scope.cutdowns.maxDuration <= 0) {
          errors.push('Maximum duration must be greater than 0 seconds');
        }
      }

      return {
        passed: errors.length === 0,
        errors,
        warnings,
        details: { conflicts },
      };
    } catch (error) {
      errors.push(
        `Scope conflict validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * 4. Budget Availability Check
   * Validates that the brand has sufficient budget for the license fee
   */
  async validateBudgetAvailability(input: LicenseValidationInput): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Skip validation if fee is negotiable (zero or very low)
      if (input.feeCents <= 0) {
        warnings.push('License fee is $0 - budget validation skipped');
        return { passed: true, errors, warnings };
      }

      // Get brand with budget information
      const brand = await prisma.brand.findUnique({
        where: { id: input.brandId },
        select: {
          id: true,
          companyName: true,
          totalSpent: true,
        },
      });

      if (!brand) {
        errors.push('Brand not found');
        return { passed: false, errors, warnings };
      }

      // Get all active and pending licenses for this brand to calculate committed budget
      const brandLicenses = await prisma.license.findMany({
        where: {
          brandId: input.brandId,
          deletedAt: null,
          status: {
            in: ['ACTIVE', 'PENDING_APPROVAL'] as LicenseStatus[],
          },
          ...(input.excludeLicenseId && {
            id: { not: input.excludeLicenseId },
          }),
        },
        select: {
          id: true,
          feeCents: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      });

      // Calculate total committed budget
      const committedBudgetCents = brandLicenses.reduce(
        (sum, license) => sum + license.feeCents,
        0
      );

      // Check if brand's project has sufficient budget
      // First, try to get project budget if projectId is available in future calls
      // For now, we'll use a simplified check based on brand's spending capacity

      // Get brand verification status to determine budget limits
      const brandWithVerification = await prisma.brand.findUnique({
        where: { id: input.brandId },
        select: {
          isVerified: true,
          totalSpent: true,
        },
      });

      // Set budget limits based on verification status
      // Unverified brands: $10,000 limit
      // Verified brands: No hard limit, but warn at high amounts
      const unverifiedBrandLimit = 1000000; // $10,000 in cents
      const verifiedHighAmountThreshold = 10000000; // $100,000 in cents

      if (!brandWithVerification?.isVerified) {
        const totalWithNewLicense = committedBudgetCents + input.feeCents;
        if (totalWithNewLicense > unverifiedBrandLimit) {
          errors.push(
            `Budget limit exceeded: Unverified brands are limited to $${(unverifiedBrandLimit / 100).toLocaleString()} in total license fees. Current committed: $${(committedBudgetCents / 100).toLocaleString()}, Requested: $${(input.feeCents / 100).toLocaleString()}`
          );
        }
      } else {
        // For verified brands, just warn about high amounts
        if (input.feeCents > verifiedHighAmountThreshold) {
          warnings.push(
            `High license fee: $${(input.feeCents / 100).toLocaleString()} requires additional approval`
          );
        }
      }

      // Calculate available budget details for response
      const details = {
        brandId: brand.id,
        brandName: brand.companyName,
        isVerified: brandWithVerification?.isVerified || false,
        committedBudgetCents,
        committedBudgetDollars: committedBudgetCents / 100,
        requestedFeeCents: input.feeCents,
        requestedFeeDollars: input.feeCents / 100,
        totalWithNewLicense: committedBudgetCents + input.feeCents,
        activeLicenseCount: brandLicenses.filter((l) => l.status === 'ACTIVE').length,
        pendingLicenseCount: brandLicenses.filter((l) => l.status === 'PENDING_APPROVAL')
          .length,
      };

      return {
        passed: errors.length === 0,
        errors,
        warnings,
        details,
      };
    } catch (error) {
      errors.push(
        `Budget availability validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * 5. Ownership Verification
   * Validates that the IP asset has complete and valid ownership records
   */
  async validateOwnership(input: LicenseValidationInput): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get IP asset with ownership records
      const ipAsset = await prisma.ipAsset.findUnique({
        where: { id: input.ipAssetId },
        include: {
          ownerships: {
            where: {
              // Only consider ownerships that are active during the license period
              startDate: { lte: input.endDate },
              OR: [{ endDate: null }, { endDate: { gte: input.startDate } }],
            },
            include: {
              creator: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!ipAsset) {
        errors.push('IP asset not found');
        return { passed: false, errors, warnings };
      }

      // Check if asset is deleted
      if (ipAsset.deletedAt) {
        errors.push('Cannot license a deleted IP asset');
        return { passed: false, errors, warnings };
      }

      // Check if asset is in licensable status
      const licensableStatuses = ['PUBLISHED', 'APPROVED'];
      if (!licensableStatuses.includes(ipAsset.status)) {
        errors.push(
          `IP asset must be in PUBLISHED or APPROVED status (current: ${ipAsset.status})`
        );
      }

      // Check if there are any ownership records
      if (ipAsset.ownerships.length === 0) {
        errors.push('IP asset has no ownership records - cannot license');
        return { passed: false, errors, warnings };
      }

      // Validate total ownership shares equal 100%
      const totalShareBps = ipAsset.ownerships.reduce(
        (sum, ownership) => sum + ownership.shareBps,
        0
      );

      if (totalShareBps !== 10000) {
        errors.push(
          `Invalid ownership structure: Total shares must equal 100% (current: ${totalShareBps / 100}%)`
        );
      }

      // Check for at least one primary owner
      const primaryOwners = ipAsset.ownerships.filter(
        (o) => o.ownershipType === 'PRIMARY'
      );

      if (primaryOwners.length === 0) {
        errors.push('IP asset must have at least one primary owner');
      }

      // Validate all creators are active
      for (const ownership of ipAsset.ownerships) {
        if (ownership.creator.user.deleted_at) {
          errors.push(
            `Creator ${ownership.creator.user.name || ownership.creator.user.email} has been deleted - cannot license`
          );
        }

        if (!ownership.creator.user.isActive) {
          warnings.push(
            `Creator ${ownership.creator.user.name || ownership.creator.user.email} account is inactive`
          );
        }
      }

      // Check for disputed ownership
      const disputedOwnerships = ipAsset.ownerships.filter((o) => o.disputed);
      if (disputedOwnerships.length > 0) {
        errors.push(
          `Ownership is disputed - cannot license until disputes are resolved (${disputedOwnerships.length} disputed ownership record(s))`
        );
      }

      // Validate ownership documentation for high-value licenses
      const highValueThreshold = 500000; // $5,000 in cents
      if (input.feeCents >= highValueThreshold) {
        const missingDocs = ipAsset.ownerships.filter(
          (o) => !o.contractReference && !o.legalDocUrl
        );

        if (missingDocs.length > 0) {
          warnings.push(
            `High-value license: ${missingDocs.length} ownership record(s) missing legal documentation`
          );
        }
      }

      // Check for derivative works
      if (ipAsset.parentAssetId) {
        warnings.push(
          'This is a derivative work - ensure parent asset ownership is also valid'
        );
      }

      // Prepare ownership details for response
      const details = {
        assetId: ipAsset.id,
        assetTitle: ipAsset.title,
        assetStatus: ipAsset.status,
        totalOwners: ipAsset.ownerships.length,
        primaryOwners: primaryOwners.length,
        totalShareBps,
        totalSharePercent: totalShareBps / 100,
        hasDisputes: disputedOwnerships.length > 0,
        owners: ipAsset.ownerships.map((o) => ({
          creatorId: o.creatorId,
          creatorName: o.creator.user.name || o.creator.user.email,
          shareBps: o.shareBps,
          sharePercent: o.shareBps / 100,
          ownershipType: o.ownershipType,
          isActive: o.creator.user.isActive,
          hasDocumentation: !!(o.contractReference || o.legalDocUrl),
          disputed: o.disputed,
        })),
      };

      return {
        passed: errors.length === 0,
        errors,
        warnings,
        details,
      };
    } catch (error) {
      errors.push(
        `Ownership verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * 6. Approval Requirement Checks
   * Determines if additional approvals are required based on business rules
   */
  async validateApprovalRequirements(
    input: LicenseValidationInput
  ): Promise<ValidationCheck> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const approvalRequirement: ApprovalRequirement = {
        required: false,
        reasons: [],
        approvers: [],
      };

      // Rule 1: High-value licenses require admin approval
      const highValueThreshold = 1000000; // $10,000 in cents
      if (input.feeCents >= highValueThreshold) {
        approvalRequirement.required = true;
        approvalRequirement.reasons.push(
          `High-value license ($${(input.feeCents / 100).toLocaleString()}) requires admin approval`
        );
        approvalRequirement.approvers.push({ type: 'admin' });
      }

      // Rule 2: Exclusive licenses always require approval
      if (input.licenseType === 'EXCLUSIVE' || input.licenseType === 'EXCLUSIVE_TERRITORY') {
        approvalRequirement.required = true;
        approvalRequirement.reasons.push(
          `Exclusive licenses require creator and admin approval`
        );
        approvalRequirement.approvers.push({ type: 'creator' }, { type: 'admin' });
      }

      // Rule 3: Check brand verification status
      const brand = await prisma.brand.findUnique({
        where: { id: input.brandId },
        select: {
          id: true,
          companyName: true,
          isVerified: true,
          verificationStatus: true,
        },
      });

      if (!brand) {
        errors.push('Brand not found');
        return { passed: false, errors, warnings };
      }

      if (!brand.isVerified || brand.verificationStatus !== 'approved') {
        approvalRequirement.required = true;
        approvalRequirement.reasons.push(
          'Unverified brands require admin approval for all licenses'
        );
        approvalRequirement.approvers.push({ type: 'admin' });
      }

      // Rule 4: Get creator preferences for approval requirements
      const ipAsset = await prisma.ipAsset.findUnique({
        where: { id: input.ipAssetId },
        include: {
          ownerships: {
            include: {
              creator: {
                select: {
                  id: true,
                  userId: true,
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (ipAsset && ipAsset.ownerships) {
        // All licenses require creator approval by default
        approvalRequirement.required = true;
        approvalRequirement.reasons.push('Creator approval required for all licenses');

        // Add all creators as approvers
        for (const ownership of ipAsset.ownerships) {
          approvalRequirement.approvers.push({
            type: 'creator',
            userId: ownership.creator.userId,
            name: ownership.creator.user.name || ownership.creator.user.email,
          });
        }
      }

      // Rule 5: Broad scope licenses require additional scrutiny
      if (input.scope.geographic?.territories.includes('GLOBAL')) {
        warnings.push('Global territory license may require additional approval');
        if (input.licenseType === 'EXCLUSIVE') {
          approvalRequirement.reasons.push('Global exclusive license requires admin review');
        }
      }

      // Rule 6: Long-duration licenses
      const durationDays =
        (input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24);
      const longDurationThreshold = 365; // 1 year

      if (durationDays > longDurationThreshold) {
        warnings.push(
          `Long-duration license (${Math.round(durationDays)} days) may require additional approval`
        );
      }

      // Rule 7: Check for revenue share complexity
      if (input.revShareBps > 0 && input.feeCents > 0) {
        warnings.push('Hybrid pricing model (fixed fee + revenue share) requires careful review');
      }

      const details = {
        approvalRequired: approvalRequirement.required,
        reasons: approvalRequirement.reasons,
        approvers: approvalRequirement.approvers,
        brandVerified: brand.isVerified,
        brandVerificationStatus: brand.verificationStatus,
        licenseType: input.licenseType,
        feeCents: input.feeCents,
        durationDays: Math.round(durationDays),
      };

      return {
        passed: true, // Approval requirements don't fail validation, just inform
        errors,
        warnings,
        details,
      };
    } catch (error) {
      errors.push(
        `Approval requirements validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { passed: false, errors, warnings };
    }
  }

  /**
   * Helper: Check territory overlap
   */
  private checkTerritoryOverlap(
    geo1?: LicenseScope['geographic'],
    geo2?: LicenseScope['geographic']
  ): { overlaps: boolean; overlappingTerritories: string[] } {
    if (!geo1 || !geo2) {
      return { overlaps: false, overlappingTerritories: [] };
    }

    const territories1 = new Set(geo1.territories);
    const territories2 = new Set(geo2.territories);

    // Check if GLOBAL is in either
    if (territories1.has('GLOBAL') || territories2.has('GLOBAL')) {
      return { overlaps: true, overlappingTerritories: ['GLOBAL'] };
    }

    // Check for any overlap
    const overlapping: string[] = [];
    for (const territory of territories1) {
      if (territories2.has(territory)) {
        overlapping.push(territory);
      }
    }

    return {
      overlaps: overlapping.length > 0,
      overlappingTerritories: overlapping,
    };
  }

  /**
   * Helper: Check media type overlap
   */
  private checkMediaOverlap(
    media1: LicenseScope['media'],
    media2: LicenseScope['media']
  ): string[] {
    const overlaps: string[] = [];

    if (media1.digital && media2.digital) overlaps.push('digital');
    if (media1.print && media2.print) overlaps.push('print');
    if (media1.broadcast && media2.broadcast) overlaps.push('broadcast');
    if (media1.ooh && media2.ooh) overlaps.push('out-of-home');

    return overlaps;
  }

  /**
   * Helper: Check placement overlap
   */
  private checkPlacementOverlap(
    placement1: LicenseScope['placement'],
    placement2: LicenseScope['placement']
  ): string[] {
    const overlaps: string[] = [];

    if (placement1.social && placement2.social) overlaps.push('social');
    if (placement1.website && placement2.website) overlaps.push('website');
    if (placement1.email && placement2.email) overlaps.push('email');
    if (placement1.paid_ads && placement2.paid_ads) overlaps.push('paid_ads');
    if (placement1.packaging && placement2.packaging) overlaps.push('packaging');

    return overlaps;
  }

  /**
   * Helper: Check if scope is completely identical
   */
  private isCompleteScopeOverlap(
    scope1: LicenseScope,
    scope2: LicenseScope,
    mediaOverlaps: string[],
    placementOverlaps: string[]
  ): boolean {
    // Count active media and placements in each scope
    const scope1MediaCount = Object.values(scope1.media).filter((v) => v).length;
    const scope2MediaCount = Object.values(scope2.media).filter((v) => v).length;
    const scope1PlacementCount = Object.values(scope1.placement).filter((v) => v).length;
    const scope2PlacementCount = Object.values(scope2.placement).filter((v) => v).length;

    // Complete overlap means all active items in both scopes overlap
    return (
      mediaOverlaps.length === scope1MediaCount &&
      mediaOverlaps.length === scope2MediaCount &&
      placementOverlaps.length === scope1PlacementCount &&
      placementOverlaps.length === scope2PlacementCount
    );
  }
}

// Export singleton instance
export const licenseValidationService = new LicenseValidationService();
