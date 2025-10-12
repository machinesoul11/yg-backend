/**
 * Enhanced License Conflict Detection Service
 * Comprehensive conflict checking for license creation and modifications
 */

import { prisma } from '@/lib/db';
import type { LicenseScope, Conflict, ConflictResult } from '../types';
import { differenceInDays } from 'date-fns';

export interface ConflictCheckParams {
  ipAssetId: string;
  startDate: Date;
  endDate: Date;
  licenseType: 'EXCLUSIVE' | 'NON_EXCLUSIVE' | 'EXCLUSIVE_TERRITORY';
  scope: LicenseScope;
  excludeLicenseId?: string;
}

export class LicenseConflictDetectionService {
  /**
   * Comprehensive conflict check
   */
  async checkConflicts(params: ConflictCheckParams): Promise<ConflictResult> {
    const conflicts: Conflict[] = [];

    // Get all active/pending licenses for this IP asset
    const existingLicenses = await prisma.license.findMany({
      where: {
        ipAssetId: params.ipAssetId,
        ...(params.excludeLicenseId && { id: { not: params.excludeLicenseId } }),
        deletedAt: null,
        status: {
          in: ['ACTIVE', 'PENDING_APPROVAL', 'DRAFT'], // Include drafts to warn about potential conflicts
        },
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

    // Check each type of conflict
    for (const existing of existingLicenses) {
      // 1. Exclusivity conflicts
      const exclusivityConflicts = this.checkExclusivityConflicts(
        params,
        existing,
        existing.scopeJson as LicenseScope
      );
      conflicts.push(...exclusivityConflicts);

      // 2. Territory overlap conflicts
      const territoryConflicts = this.checkTerritoryConflicts(
        params,
        existing,
        existing.scopeJson as LicenseScope
      );
      conflicts.push(...territoryConflicts);

      // 3. Competitor blocking conflicts
      const competitorConflicts = this.checkCompetitorConflicts(
        params,
        existing,
        existing.scopeJson as LicenseScope
      );
      conflicts.push(...competitorConflicts);

      // 4. Temporal overlap conflicts
      const temporalConflicts = this.checkTemporalOverlap(params, existing);
      if (temporalConflicts.length > 0 && conflicts.length > 0) {
        // Only report temporal if there are other conflicts
        conflicts.push(...temporalConflicts);
      }

      // 5. Revenue share conflicts
      const revenueConflicts = await this.checkRevenueShareConflicts(
        params.ipAssetId,
        params.startDate,
        params.endDate,
        params.excludeLicenseId
      );
      conflicts.push(...revenueConflicts);
    }

    // Deduplicate conflicts
    const uniqueConflicts = this.deduplicateConflicts(conflicts);

    return {
      hasConflicts: uniqueConflicts.length > 0,
      conflicts: uniqueConflicts,
    };
  }

  /**
   * Check for exclusivity conflicts
   */
  private checkExclusivityConflicts(
    params: ConflictCheckParams,
    existing: any,
    existingScope: LicenseScope
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    // If new license is exclusive
    if (params.licenseType === 'EXCLUSIVE') {
      // Check date overlap
      if (this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
        // Any existing license on same asset is a conflict
        if (existing.licenseType === 'EXCLUSIVE' || existing.licenseType === 'NON_EXCLUSIVE') {
          conflicts.push({
            licenseId: existing.id,
            reason: 'EXCLUSIVE_OVERLAP',
            details: `Exclusive license request conflicts with existing ${existing.licenseType.toLowerCase()} license`,
            conflictingLicense: {
              id: existing.id,
              brandId: existing.brandId,
              startDate: existing.startDate,
              endDate: existing.endDate,
              licenseType: existing.licenseType,
            },
          });
        }
      }
    }

    // If existing license is exclusive
    if (existing.licenseType === 'EXCLUSIVE') {
      if (this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
        conflicts.push({
          licenseId: existing.id,
          reason: 'EXCLUSIVE_OVERLAP',
          details: `New license conflicts with existing exclusive license`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
            startDate: existing.startDate,
            endDate: existing.endDate,
            licenseType: existing.licenseType,
          },
        });
      }
    }

    // Check scope-level exclusivity
    if (this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
      // Media exclusivity
      const mediaConflicts = this.checkMediaExclusivity(params.scope, existingScope);
      if (mediaConflicts.length > 0) {
        conflicts.push({
          licenseId: existing.id,
          reason: 'EXCLUSIVE_OVERLAP',
          details: `Media exclusivity conflict: ${mediaConflicts.join(', ')}`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
            startDate: existing.startDate,
            endDate: existing.endDate,
          },
        });
      }

      // Placement exclusivity
      const placementConflicts = this.checkPlacementExclusivity(params.scope, existingScope);
      if (placementConflicts.length > 0) {
        conflicts.push({
          licenseId: existing.id,
          reason: 'EXCLUSIVE_OVERLAP',
          details: `Placement exclusivity conflict: ${placementConflicts.join(', ')}`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
            startDate: existing.startDate,
            endDate: existing.endDate,
          },
        });
      }
    }

    return conflicts;
  }

  /**
   * Check for territory/geographic conflicts
   */
  private checkTerritoryConflicts(
    params: ConflictCheckParams,
    existing: any,
    existingScope: LicenseScope
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    if (!params.scope.geographic || !existingScope.geographic) {
      return conflicts;
    }

    if (!this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
      return conflicts;
    }

    const newTerritories = params.scope.geographic.territories || [];
    const existingTerritories = existingScope.geographic.territories || [];

    // Check for GLOBAL conflicts
    if (newTerritories.includes('GLOBAL') && existingTerritories.length > 0) {
      if (existing.licenseType === 'EXCLUSIVE' || params.licenseType === 'EXCLUSIVE') {
        conflicts.push({
          licenseId: existing.id,
          reason: 'TERRITORY_OVERLAP',
          details: `Global license request conflicts with existing territory-specific license`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
          },
        });
      }
    }

    if (existingTerritories.includes('GLOBAL') && newTerritories.length > 0) {
      if (existing.licenseType === 'EXCLUSIVE' || params.licenseType === 'EXCLUSIVE') {
        conflicts.push({
          licenseId: existing.id,
          reason: 'TERRITORY_OVERLAP',
          details: `New license conflicts with existing global license`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
          },
        });
      }
    }

    // Check for specific territory overlaps
    const overlappingTerritories = newTerritories.filter((t) => existingTerritories.includes(t));

    if (overlappingTerritories.length > 0) {
      if (existing.licenseType === 'EXCLUSIVE_TERRITORY' || params.licenseType === 'EXCLUSIVE_TERRITORY') {
        conflicts.push({
          licenseId: existing.id,
          reason: 'TERRITORY_OVERLAP',
          details: `Territory-exclusive license conflict in: ${overlappingTerritories.join(', ')}`,
          conflictingLicense: {
            id: existing.id,
            brandId: existing.brandId,
          },
        });
      }
    }

    return conflicts;
  }

  /**
   * Check for competitor blocking conflicts
   */
  private checkCompetitorConflicts(
    params: ConflictCheckParams,
    existing: any,
    existingScope: LicenseScope
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    if (!existingScope.exclusivity?.competitors) {
      return conflicts;
    }

    if (!this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
      return conflicts;
    }

    // Check if the new license's brand is blocked by existing license
    // This would require brand relationship data to determine competitors
    // For now, we check if brand IDs match the blocked list
    const blockedBrands = existingScope.exclusivity.competitors;

    // Would need to look up the brand for the new license
    // Placeholder for competitor check logic

    return conflicts;
  }

  /**
   * Check temporal overlap
   */
  private checkTemporalOverlap(params: ConflictCheckParams, existing: any): Conflict[] {
    const conflicts: Conflict[] = [];

    if (this.datesOverlap(params.startDate, params.endDate, existing.startDate, existing.endDate)) {
      conflicts.push({
        licenseId: existing.id,
        reason: 'DATE_OVERLAP',
        details: `License periods overlap: ${existing.startDate.toLocaleDateString()} - ${existing.endDate.toLocaleDateString()}`,
        conflictingLicense: {
          id: existing.id,
          brandId: existing.brandId,
          startDate: existing.startDate,
          endDate: existing.endDate,
        },
      });
    }

    return conflicts;
  }

  /**
   * Check revenue share conflicts
   * Ensure total promised rev share doesn't exceed 100%
   */
  private async checkRevenueShareConflicts(
    ipAssetId: string,
    startDate: Date,
    endDate: Date,
    excludeLicenseId?: string
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Get all licenses with rev share in the same time period
    const overlappingLicenses = await prisma.license.findMany({
      where: {
        ipAssetId,
        ...(excludeLicenseId && { id: { not: excludeLicenseId } }),
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
        revShareBps: { gt: 0 },
        AND: [
          { startDate: { lte: endDate } },
          { endDate: { gte: startDate } },
        ],
      },
      select: {
        id: true,
        revShareBps: true,
        brandId: true,
      },
    });

    const totalRevShareBps = overlappingLicenses.reduce((sum, l) => sum + l.revShareBps, 0);

    // Warn if approaching 100%
    if (totalRevShareBps > 8000) {
      // 80% threshold warning
      conflicts.push({
        licenseId: 'multiple',
        reason: 'EXCLUSIVE_OVERLAP',
        details: `High cumulative revenue share commitment: ${(totalRevShareBps / 100).toFixed(2)}%. Approaching creator capacity limit.`,
      });
    }

    return conflicts;
  }

  /**
   * Check if two date ranges overlap
   */
  private datesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 <= end2 && end1 >= start2;
  }

  /**
   * Check media exclusivity conflicts
   */
  private checkMediaExclusivity(scope1: LicenseScope, scope2: LicenseScope): string[] {
    const conflicts: string[] = [];
    const mediaTypes = ['digital', 'print', 'broadcast', 'ooh'] as const;

    for (const mediaType of mediaTypes) {
      if (scope1.media[mediaType] && scope2.media[mediaType]) {
        // Both want the same media type - check exclusivity
        if (
          scope1.exclusivity?.category === scope2.exclusivity?.category ||
          !scope1.exclusivity ||
          !scope2.exclusivity
        ) {
          conflicts.push(mediaType);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check placement exclusivity conflicts
   */
  private checkPlacementExclusivity(scope1: LicenseScope, scope2: LicenseScope): string[] {
    const conflicts: string[] = [];
    const placements = ['social', 'website', 'email', 'paid_ads', 'packaging'] as const;

    for (const placement of placements) {
      if (scope1.placement[placement] && scope2.placement[placement]) {
        conflicts.push(placement);
      }
    }

    return conflicts;
  }

  /**
   * Deduplicate conflicts
   */
  private deduplicateConflicts(conflicts: Conflict[]): Conflict[] {
    const seen = new Set<string>();
    const unique: Conflict[] = [];

    for (const conflict of conflicts) {
      const key = `${conflict.licenseId}-${conflict.reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(conflict);
      }
    }

    return unique;
  }

  /**
   * Get conflict preview before license creation
   */
  async getConflictPreview(ipAssetId: string): Promise<{
    activeLicenses: number;
    exclusiveLicenses: number;
    availableTerritories: string[];
    blockedMediaTypes: string[];
    suggestedStartDate: Date | null;
  }> {
    const activeLicenses = await prisma.license.findMany({
      where: {
        ipAssetId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
      },
      select: {
        licenseType: true,
        endDate: true,
        scopeJson: true,
      },
    });

    const exclusiveCount = activeLicenses.filter((l) => l.licenseType === 'EXCLUSIVE').length;

    // Analyze blocked media/territories
    const blockedMedia = new Set<string>();
    const usedTerritories = new Set<string>();

    activeLicenses.forEach((license) => {
      const scope = license.scopeJson as LicenseScope;

      // Check media
      Object.entries(scope.media).forEach(([type, enabled]) => {
        if (enabled && license.licenseType === 'EXCLUSIVE') {
          blockedMedia.add(type);
        }
      });

      // Check territories
      if (scope.geographic?.territories) {
        scope.geographic.territories.forEach((t) => usedTerritories.add(t));
      }
    });

    // Suggest earliest available start date
    const latestEndDate = activeLicenses.reduce((latest, l) => {
      return l.endDate > latest ? l.endDate : latest;
    }, new Date());

    const suggestedStartDate =
      exclusiveCount > 0 && latestEndDate > new Date() ? latestEndDate : null;

    return {
      activeLicenses: activeLicenses.length,
      exclusiveLicenses: exclusiveCount,
      availableTerritories: [], // Would calculate based on all territories vs used
      blockedMediaTypes: Array.from(blockedMedia),
      suggestedStartDate,
    };
  }
}

export const licenseConflictDetectionService = new LicenseConflictDetectionService();
