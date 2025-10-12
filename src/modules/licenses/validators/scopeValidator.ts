/**
 * License Scope Validator
 * Comprehensive validation for license scope configurations
 */

import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { LicenseScope, Conflict } from '../types';
import type { LicenseType } from '@prisma/client';

// Known media types
const VALID_MEDIA_TYPES = ['digital', 'print', 'broadcast', 'ooh'] as const;

// Known social platforms
const VALID_SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'twitter',
  'youtube',
  'pinterest',
  'snapchat',
] as const;

// ISO country codes
const GLOBAL_TERRITORY = 'GLOBAL';

// Video aspect ratios
const VALID_ASPECT_RATIOS = [
  '16:9',
  '1:1',
  '9:16',
  '4:5',
  '2:3',
  '4:3',
  '21:9',
] as const;

/**
 * Scope validation result
 */
export interface ScopeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Exclusivity conflict check result
 */
export interface ExclusivityCheckResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
}

/**
 * Scope Validator Service
 */
export class ScopeValidator {
  /**
   * Validate complete license scope configuration
   */
  async validateScope(
    scope: LicenseScope,
    licenseType: LicenseType,
    ipAssetId: string,
    startDate: Date,
    endDate: Date,
    excludeLicenseId?: string
  ): Promise<ScopeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate media types
    const mediaValidation = this.validateMediaTypes(scope);
    errors.push(...mediaValidation.errors);
    warnings.push(...mediaValidation.warnings);

    // Validate placements
    const placementValidation = this.validatePlacements(scope);
    errors.push(...placementValidation.errors);
    warnings.push(...placementValidation.warnings);

    // Validate geographic restrictions
    const geoValidation = this.validateGeographic(scope);
    errors.push(...geoValidation.errors);
    warnings.push(...geoValidation.warnings);

    // Validate exclusivity
    const exclusivityValidation = await this.validateExclusivity(
      scope,
      licenseType,
      ipAssetId,
      startDate,
      endDate,
      excludeLicenseId
    );
    errors.push(...exclusivityValidation.errors);
    warnings.push(...exclusivityValidation.warnings);

    // Validate cutdowns/modifications
    const cutdownValidation = this.validateCutdowns(scope);
    errors.push(...cutdownValidation.errors);
    warnings.push(...cutdownValidation.warnings);

    // Validate attribution
    const attributionValidation = this.validateAttribution(scope);
    errors.push(...attributionValidation.errors);
    warnings.push(...attributionValidation.warnings);

    // Cross-validation checks
    const crossValidation = this.validateCrossConstraints(scope);
    errors.push(...crossValidation.errors);
    warnings.push(...crossValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate media types selection
   */
  private validateMediaTypes(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if at least one media type is selected
    const hasAnyMedia = Object.values(scope.media).some((v) => v === true);
    if (!hasAnyMedia) {
      errors.push('At least one media type must be selected');
    }

    // Validate media type combinations
    if (scope.media.print && !scope.media.digital) {
      warnings.push(
        'Print-only licenses are less common; consider including digital rights for broader utility'
      );
    }

    if (scope.media.broadcast && !scope.media.digital) {
      warnings.push(
        'Broadcast licenses typically include digital rights for promotional purposes'
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate placement specifications
   */
  private validatePlacements(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if at least one placement is selected
    const hasAnyPlacement = Object.values(scope.placement).some((v) => v === true);
    if (!hasAnyPlacement) {
      errors.push('At least one placement type must be selected');
    }

    // Validate media-placement compatibility
    if (scope.placement.social && !scope.media.digital) {
      errors.push('Social media placement requires digital media rights');
    }

    if (scope.placement.website && !scope.media.digital) {
      errors.push('Website placement requires digital media rights');
    }

    if (scope.placement.email && !scope.media.digital) {
      errors.push('Email placement requires digital media rights');
    }

    if (scope.placement.paid_ads) {
      if (!scope.media.digital && !scope.media.print && !scope.media.ooh) {
        errors.push('Paid advertising requires at least one compatible media type');
      }
    }

    if (scope.placement.packaging && !scope.media.print) {
      warnings.push('Packaging placement typically requires print media rights');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate geographic restrictions
   */
  private validateGeographic(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (scope.geographic) {
      const { territories } = scope.geographic;

      if (!territories || territories.length === 0) {
        errors.push('Geographic scope must specify at least one territory or GLOBAL');
      }

      // Check for GLOBAL mixed with specific territories
      if (territories.includes(GLOBAL_TERRITORY) && territories.length > 1) {
        errors.push('GLOBAL territory cannot be combined with specific territories');
      }

      // Check for duplicate territories
      const uniqueTerritories = new Set(territories);
      if (uniqueTerritories.size !== territories.length) {
        errors.push('Duplicate territories detected');
      }

      // Validate territory codes (basic check for 2-3 character country codes)
      for (const territory of territories) {
        if (territory !== GLOBAL_TERRITORY) {
          if (!/^[A-Z]{2,3}$/.test(territory)) {
            errors.push(
              `Invalid territory code: ${territory}. Use ISO country codes (e.g., US, GB, FR) or GLOBAL`
            );
          }
        }
      }
    } else {
      // No geographic restrictions means global
      warnings.push('No geographic restrictions specified; license will be global');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate exclusivity configuration and check for conflicts
   */
  private async validateExclusivity(
    scope: LicenseScope,
    licenseType: LicenseType,
    ipAssetId: string,
    startDate: Date,
    endDate: Date,
    excludeLicenseId?: string
  ): Promise<ScopeValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check exclusivity configuration
    if (scope.exclusivity) {
      if (licenseType === 'NON_EXCLUSIVE') {
        errors.push('Non-exclusive licenses cannot have exclusivity clauses');
      }

      // Validate category exclusivity
      if (scope.exclusivity.category) {
        if (scope.exclusivity.category.trim().length < 2) {
          errors.push('Exclusivity category must be at least 2 characters');
        }
        if (scope.exclusivity.category.length > 100) {
          errors.push('Exclusivity category must be less than 100 characters');
        }
      }

      // Validate competitor list
      if (scope.exclusivity.competitors) {
        if (scope.exclusivity.competitors.length === 0) {
          warnings.push('Competitor exclusivity list is empty');
        }

        // Validate competitor IDs are valid CUIDs
        for (const competitorId of scope.exclusivity.competitors) {
          if (!/^c[a-z0-9]{24}$/.test(competitorId)) {
            errors.push(`Invalid competitor brand ID: ${competitorId}`);
          }
        }
      }
    }

    // Check for exclusivity conflicts with existing licenses
    if (licenseType === 'EXCLUSIVE' || licenseType === 'EXCLUSIVE_TERRITORY') {
      const conflictCheck = await this.checkExclusivityConflicts(
        ipAssetId,
        licenseType,
        scope,
        startDate,
        endDate,
        excludeLicenseId
      );

      if (conflictCheck.hasConflicts) {
        for (const conflict of conflictCheck.conflicts) {
          errors.push(conflict.details);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Check for exclusivity conflicts with existing licenses
   */
  private async checkExclusivityConflicts(
    ipAssetId: string,
    licenseType: LicenseType,
    scope: LicenseScope,
    startDate: Date,
    endDate: Date,
    excludeLicenseId?: string
  ): Promise<ExclusivityCheckResult> {
    const conflicts: Conflict[] = [];

    // Query existing licenses with date overlap
    const existingLicenses = await prisma.license.findMany({
      where: {
        ipAssetId,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'DRAFT'] },
        deletedAt: null,
        AND: [{ startDate: { lte: endDate } }, { endDate: { gte: startDate } }],
        ...(excludeLicenseId && { id: { not: excludeLicenseId } }),
      },
      include: {
        brand: { select: { companyName: true } },
      },
    });

    for (const existing of existingLicenses) {
      // Full exclusivity conflict
      if (licenseType === 'EXCLUSIVE' || existing.licenseType === 'EXCLUSIVE') {
        conflicts.push({
          licenseId: existing.id,
          reason: 'EXCLUSIVE_OVERLAP',
          details: `Exclusive license conflict with ${existing.brand.companyName} from ${existing.startDate.toLocaleDateString()} to ${existing.endDate.toLocaleDateString()}`,
          conflictingLicense: existing,
        });
        continue;
      }

      // Territory exclusivity conflict
      if (
        licenseType === 'EXCLUSIVE_TERRITORY' ||
        existing.licenseType === 'EXCLUSIVE_TERRITORY'
      ) {
        const existingScope = existing.scopeJson as unknown as LicenseScope;
        const hasOverlap = this.checkTerritoryOverlap(
          scope.geographic,
          existingScope.geographic
        );

        if (hasOverlap) {
          const territories = this.getOverlappingTerritories(
            scope.geographic,
            existingScope.geographic
          );
          conflicts.push({
            licenseId: existing.id,
            reason: 'TERRITORY_OVERLAP',
            details: `Exclusive territory conflict with ${existing.brand.companyName} in territories: ${territories.join(', ')}`,
            conflictingLicense: existing,
          });
        }
      }

      // Category exclusivity conflict
      if (
        scope.exclusivity?.category &&
        existing.scopeJson &&
        typeof existing.scopeJson === 'object' &&
        'exclusivity' in existing.scopeJson
      ) {
        const existingScope = existing.scopeJson as unknown as LicenseScope;
        if (
          existingScope.exclusivity?.category &&
          existingScope.exclusivity.category.toLowerCase() ===
            scope.exclusivity.category.toLowerCase()
        ) {
          conflicts.push({
            licenseId: existing.id,
            reason: 'EXCLUSIVE_OVERLAP',
            details: `Category exclusivity conflict in "${scope.exclusivity.category}" with ${existing.brand.companyName}`,
            conflictingLicense: existing,
          });
        }
      }

      // Competitor exclusivity conflict
      if (scope.exclusivity?.competitors?.includes(existing.brandId)) {
        conflicts.push({
          licenseId: existing.id,
          reason: 'COMPETITOR_BLOCKED',
          details: `Competitor exclusivity clause blocks ${existing.brand.companyName}`,
          conflictingLicense: existing,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Check if two geographic scopes overlap
   */
  private checkTerritoryOverlap(
    scope1?: LicenseScope['geographic'],
    scope2?: LicenseScope['geographic']
  ): boolean {
    if (!scope1 || !scope2) {
      // No geographic restrictions means global
      return true;
    }

    const territories1 = new Set(scope1.territories);
    const territories2 = new Set(scope2.territories);

    // Check if GLOBAL is in either
    if (territories1.has(GLOBAL_TERRITORY) || territories2.has(GLOBAL_TERRITORY)) {
      return true;
    }

    // Check for any overlap
    for (const territory of territories1) {
      if (territories2.has(territory)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get overlapping territories between two scopes
   */
  private getOverlappingTerritories(
    scope1?: LicenseScope['geographic'],
    scope2?: LicenseScope['geographic']
  ): string[] {
    if (!scope1 || !scope2) return [GLOBAL_TERRITORY];

    const territories1 = new Set(scope1.territories);
    const territories2 = new Set(scope2.territories);

    if (territories1.has(GLOBAL_TERRITORY) || territories2.has(GLOBAL_TERRITORY)) {
      return [GLOBAL_TERRITORY];
    }

    const overlapping: string[] = [];
    for (const territory of territories1) {
      if (territories2.has(territory)) {
        overlapping.push(territory);
      }
    }

    return overlapping;
  }

  /**
   * Validate cutdown/modification permissions
   */
  private validateCutdowns(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (scope.cutdowns) {
      // Validate max duration for video cutdowns
      if (scope.cutdowns.maxDuration !== undefined) {
        if (scope.cutdowns.maxDuration <= 0) {
          errors.push('Maximum cutdown duration must be positive');
        }
        if (scope.cutdowns.maxDuration > 3600) {
          warnings.push('Maximum cutdown duration exceeds 1 hour (3600 seconds)');
        }
      }

      // Validate aspect ratios
      if (scope.cutdowns.aspectRatios) {
        if (scope.cutdowns.aspectRatios.length === 0) {
          warnings.push('Aspect ratios specified but list is empty');
        }

        for (const ratio of scope.cutdowns.aspectRatios) {
          if (!/^\d+:\d+$/.test(ratio)) {
            errors.push(`Invalid aspect ratio format: ${ratio}. Use format like "16:9"`);
          }
        }
      }

      if (scope.cutdowns.allowEdits) {
        warnings.push(
          'Allowing edits gives the brand significant creative control; ensure quality standards are specified'
        );
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate attribution requirements
   */
  private validateAttribution(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (scope.attribution) {
      if (scope.attribution.required && !scope.attribution.format) {
        warnings.push(
          'Attribution is required but no format specified; consider providing a standard format (e.g., "Photo by @creator")'
        );
      }

      if (scope.attribution.format) {
        if (scope.attribution.format.length > 200) {
          errors.push('Attribution format must be less than 200 characters');
        }
        if (!scope.attribution.format.trim()) {
          errors.push('Attribution format cannot be empty');
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate cross-constraint logic
   */
  private validateCrossConstraints(scope: LicenseScope): ScopeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for overly restrictive combinations
    const selectedMedia = Object.entries(scope.media).filter(([_, v]) => v).length;
    const selectedPlacements = Object.entries(scope.placement).filter(([_, v]) => v)
      .length;

    if (selectedMedia === 1 && selectedPlacements === 1) {
      warnings.push(
        'Highly restrictive scope (single media type and placement); this may limit utility for the brand'
      );
    }

    // Check for very broad permissions
    const allMedia = Object.values(scope.media).every((v) => v === true);
    const allPlacements = Object.values(scope.placement).every((v) => v === true);
    const isGlobal =
      !scope.geographic ||
      scope.geographic.territories.includes(GLOBAL_TERRITORY) ||
      scope.geographic.territories.length === 0;

    if (allMedia && allPlacements && isGlobal) {
      warnings.push(
        'Extremely broad scope (all media, all placements, global); ensure appropriate compensation is set'
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

export const scopeValidator = new ScopeValidator();
