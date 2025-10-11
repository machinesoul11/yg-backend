/**
 * License Service
 * Business logic for license management
 */

import { prisma } from '@/lib/db';
import { storageProvider } from '@/lib/storage';
import { EmailService } from '@/lib/services/email/email.service';
import type {
  CreateLicenseInput,
  UpdateLicenseInput,
  LicenseFilters,
  ConflictCheckInput,
  ConflictResult,
  Conflict,
  TerminateLicenseInput,
  GenerateRenewalInput,
  LicenseScope,
  LicenseStats,
  LicenseConflictError,
  LicensePermissionError,
  LicenseValidationError,
  LicenseNotFoundError,
} from './types';
import type { License, Prisma } from '@prisma/client';
import { addDays, differenceInDays, startOfDay, endOfDay } from 'date-fns';

export class LicenseService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Create a new license
   * Validates ownership, checks conflicts, and notifies creator
   */
  async createLicense(input: CreateLicenseInput, userId: string): Promise<License> {
    // Validate dates
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    // Validate financial terms
    if (input.feeCents < 0) {
      throw new Error('Fee cannot be negative');
    }

    if (input.revShareBps < 0 || input.revShareBps > 10000) {
      throw new Error('Revenue share must be between 0 and 10000 basis points');
    }

    // Verify IP asset exists and get ownerships
    const ipAsset = await prisma.ipAsset.findUnique({
      where: { id: input.ipAssetId },
      include: {
        ownerships: {
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
      throw new Error('IP asset not found');
    }

    if (ipAsset.deletedAt) {
      throw new Error('Cannot license a deleted asset');
    }

    // Check for conflicts
    const conflictCheck = await this.checkConflicts({
      ipAssetId: input.ipAssetId,
      startDate,
      endDate,
      licenseType: input.licenseType,
      scope: input.scope,
    });

    if (conflictCheck.hasConflicts) {
      const error = new Error('License conflicts detected') as any;
      error.name = 'LicenseConflictError';
      error.conflicts = conflictCheck.conflicts;
      throw error;
    }

    // Create license in DRAFT status
    const license = await prisma.license.create({
      data: {
        ipAssetId: input.ipAssetId,
        brandId: input.brandId,
        projectId: input.projectId,
        licenseType: input.licenseType,
        status: 'DRAFT',
        startDate,
        endDate,
        feeCents: input.feeCents,
        revShareBps: input.revShareBps,
        paymentTerms: input.paymentTerms,
        billingFrequency: input.billingFrequency,
        scopeJson: input.scope as any,
        autoRenew: input.autoRenew ?? false,
        metadata: input.metadata as any,
        createdBy: userId,
      },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    // Notify creators for approval
    for (const ownership of license.ipAsset.ownerships) {
      if (ownership.creator.user.email) {
        try {
          await this.emailService.sendTransactional({
            email: ownership.creator.user.email,
            subject: 'New License Request for Your IP Asset',
            template: 'welcome', // TODO: Create license-request template
            variables: {
              creatorName: ownership.creator.displayName || ownership.creator.user.name || 'Creator',
              assetTitle: license.ipAsset.title,
              brandName: license.brand.companyName,
              licenseType: license.licenseType,
              fee: `$${(license.feeCents / 100).toFixed(2)}`,
              revShare: `${(license.revShareBps / 100).toFixed(2)}%`,
              startDate: license.startDate.toLocaleDateString(),
              endDate: license.endDate.toLocaleDateString(),
              licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`,
            },
          });
        } catch (error) {
          console.error('Failed to send license request email:', error);
        }
      }
    }

    // Log event
    await prisma.event.create({
      data: {
        eventType: 'license.created',
        actorType: 'brand',
        actorId: userId,
        brandId: license.brandId,
        propsJson: {
          licenseId: license.id,
          ipAssetId: license.ipAssetId,
          licenseType: license.licenseType,
        },
      },
    });

    return license;
  }

  /**
   * Approve a pending license
   * Only creators who own the asset can approve
   */
  async approveLicense(licenseId: string, userId: string): Promise<License> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: true,
              },
            },
          },
        },
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    if (license.status !== 'DRAFT' && license.status !== 'PENDING_APPROVAL') {
      throw new Error('License is not pending approval');
    }

    // Verify user is an owner of the asset
    const isOwner = license.ipAsset.ownerships.some(
      (o) => o.creator.userId === userId
    );

    if (!isOwner) {
      const error = new Error('User does not own this asset');
      error.name = 'LicensePermissionError';
      throw error;
    }

    // Update license to ACTIVE
    const approved = await prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'ACTIVE',
        signedAt: new Date(),
        updatedBy: userId,
      },
    });

    // Notify brand
    if (license.brand.user.email) {
      try {
        await this.emailService.sendTransactional({
          email: license.brand.user.email,
          subject: 'License Approved!',
          template: 'welcome', // TODO: Create license-approved template
          variables: {
            brandName: license.brand.companyName,
            assetTitle: license.ipAsset.title,
            startDate: approved.startDate.toLocaleDateString(),
            endDate: approved.endDate.toLocaleDateString(),
            licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${approved.id}`,
          },
        });
      } catch (error) {
        console.error('Failed to send approval email:', error);
      }
    }

    // Log event
    await prisma.event.create({
      data: {
        eventType: 'license.approved',
        actorType: 'creator',
        actorId: userId,
        propsJson: {
          licenseId: approved.id,
          brandId: approved.brandId,
        },
      },
    });

    return approved;
  }

  /**
   * Check for licensing conflicts
   * Detects exclusive license overlaps, territory conflicts, etc.
   */
  async checkConflicts(input: ConflictCheckInput): Promise<ConflictResult> {
    const { ipAssetId, startDate, endDate, licenseType, scope, excludeLicenseId } =
      input;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Query existing licenses for this asset with date overlap
    const where: Prisma.LicenseWhereInput = {
      ipAssetId,
      status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'DRAFT'] },
      deletedAt: null,
      AND: [
        { startDate: { lte: end } },
        { endDate: { gte: start } },
      ],
    };

    if (excludeLicenseId) {
      where.id = { not: excludeLicenseId };
    }

    const existingLicenses = await prisma.license.findMany({
      where,
      include: {
        brand: true,
      },
    });

    const conflicts: Conflict[] = [];

    for (const existing of existingLicenses) {
      // Check if either license is globally exclusive
      if (licenseType === 'EXCLUSIVE' || existing.licenseType === 'EXCLUSIVE') {
        conflicts.push({
          licenseId: existing.id,
          reason: 'EXCLUSIVE_OVERLAP',
          details: `Exclusive license already exists for this period (${existing.brand.companyName})`,
          conflictingLicense: existing,
        });
        continue;
      }

      // Check for territory exclusivity
      if (
        licenseType === 'EXCLUSIVE_TERRITORY' ||
        existing.licenseType === 'EXCLUSIVE_TERRITORY'
      ) {
        const existingScope = existing.scopeJson as LicenseScope;
        const hasTerritorOverlap = this.checkTerritoryOverlap(
          scope.geographic,
          existingScope.geographic
        );

        if (hasTerritorOverlap) {
          conflicts.push({
            licenseId: existing.id,
            reason: 'TERRITORY_OVERLAP',
            details: `Exclusive territory conflict detected with ${existing.brand.companyName}`,
            conflictingLicense: existing,
          });
        }
      }

      // Check for competitor exclusivity
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
   * Helper: Check if two geographic scopes overlap
   */
  private checkTerritoryOverlap(
    scope1?: LicenseScope['geographic'],
    scope2?: LicenseScope['geographic']
  ): boolean {
    if (!scope1 || !scope2) return false;

    const territories1 = new Set(scope1.territories);
    const territories2 = new Set(scope2.territories);

    // Check if GLOBAL is in either
    if (territories1.has('GLOBAL') || territories2.has('GLOBAL')) {
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
   * Generate renewal for expiring license
   */
  async generateRenewal(
    input: GenerateRenewalInput,
    userId: string
  ): Promise<License> {
    const { licenseId, durationDays, feeAdjustmentPercent, revShareAdjustmentBps } =
      input;

    const original = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        brand: true,
      },
    });

    if (!original) {
      throw new Error('License not found');
    }

    if (original.status !== 'ACTIVE' && original.status !== 'EXPIRED') {
      throw new Error('Only active or expired licenses can be renewed');
    }

    // Calculate renewal period
    const originalDuration =
      durationDays ?? differenceInDays(original.endDate, original.startDate);
    const newStartDate = addDays(original.endDate, 1);
    const newEndDate = addDays(newStartDate, originalDuration);

    // Calculate adjusted fees
    const feeAdjustment = feeAdjustmentPercent
      ? (original.feeCents * feeAdjustmentPercent) / 100
      : 0;
    const renewalFeeCents = Math.round(original.feeCents + feeAdjustment);

    const renewalRevShareBps = revShareAdjustmentBps
      ? original.revShareBps + revShareAdjustmentBps
      : original.revShareBps;

    // Validate adjusted revenue share
    if (renewalRevShareBps < 0 || renewalRevShareBps > 10000) {
      throw new Error('Adjusted revenue share must be between 0 and 10000 basis points');
    }

    // Create renewal
    const renewal = await prisma.license.create({
      data: {
        ipAssetId: original.ipAssetId,
        brandId: original.brandId,
        projectId: original.projectId,
        licenseType: original.licenseType,
        status: 'PENDING_APPROVAL',
        startDate: newStartDate,
        endDate: newEndDate,
        feeCents: renewalFeeCents,
        revShareBps: renewalRevShareBps,
        paymentTerms: original.paymentTerms,
        billingFrequency: original.billingFrequency,
        scopeJson: original.scopeJson,
        autoRenew: original.autoRenew,
        parentLicenseId: original.id,
        createdBy: userId,
      },
    });

    // Notify creators
    for (const ownership of original.ipAsset.ownerships) {
      if (ownership.creator.user.email) {
        try {
          await this.emailService.sendTransactional({
            email: ownership.creator.user.email,
            subject: 'License Renewal Request',
            template: 'welcome', // TODO: Create license-renewal template
            variables: {
              creatorName: ownership.creator.displayName || ownership.creator.user.name || 'Creator',
              assetTitle: original.ipAsset.title,
              brandName: original.brand.companyName,
              originalEndDate: original.endDate.toLocaleDateString(),
              newStartDate: renewal.startDate.toLocaleDateString(),
              newEndDate: renewal.endDate.toLocaleDateString(),
              fee: `$${(renewal.feeCents / 100).toFixed(2)}`,
              revShare: `${(renewal.revShareBps / 100).toFixed(2)}%`,
              licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${renewal.id}`,
            },
          });
        } catch (error) {
          console.error('Failed to send renewal email:', error);
        }
      }
    }

    return renewal;
  }

  /**
   * Terminate an active license
   */
  async terminateLicense(
    input: TerminateLicenseInput,
    userId: string
  ): Promise<License> {
    const { licenseId, reason, effectiveDate } = input;

    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        brand: {
          include: {
            user: true,
          },
        },
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    if (license.status !== 'ACTIVE') {
      throw new Error('Only active licenses can be terminated');
    }

    const terminationDate = effectiveDate ? new Date(effectiveDate) : new Date();

    // Update license
    const terminated = await prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'TERMINATED',
        endDate: terminationDate,
        updatedBy: userId,
        metadata: {
          ...(license.metadata as any),
          terminationReason: reason,
          terminatedAt: terminationDate.toISOString(),
          terminatedBy: userId,
        },
      },
    });

    // Notify affected parties
    const recipients: Array<{ email: string; name: string; role: string }> = [];

    if (license.brand.user.email) {
      recipients.push({
        email: license.brand.user.email,
        name: license.brand.companyName,
        role: 'brand',
      });
    }

    for (const ownership of license.ipAsset.ownerships) {
      if (ownership.creator.user.email) {
        recipients.push({
          email: ownership.creator.user.email,
          name: ownership.creator.displayName || ownership.creator.user.name || 'Creator',
          role: 'creator',
        });
      }
    }

    for (const recipient of recipients) {
      try {
        await this.emailService.sendTransactional({
          email: recipient.email,
          subject: 'License Terminated',
          template: 'welcome', // TODO: Create license-terminated template
          variables: {
            recipientName: recipient.name,
            assetTitle: license.ipAsset.title,
            brandName: license.brand.companyName,
            terminationDate: terminationDate.toLocaleDateString(),
            reason,
            licenseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${license.id}`,
          },
        });
      } catch (error) {
        console.error(`Failed to send termination email to ${recipient.email}:`, error);
      }
    }

    // Log event
    await prisma.event.create({
      data: {
        eventType: 'license.terminated',
        actorType: 'user',
        actorId: userId,
        propsJson: {
          licenseId: terminated.id,
          reason,
          effectiveDate: terminationDate.toISOString(),
        },
      },
    });

    return terminated;
  }

  /**
   * List licenses with filters
   */
  async listLicenses(
    filters: LicenseFilters,
    userRole?: string,
    userBrandId?: string,
    userCreatorId?: string
  ) {
    const {
      status,
      ipAssetId,
      brandId,
      projectId,
      licenseType,
      expiringBefore,
      creatorId,
      page = 1,
      pageSize = 20,
    } = filters;

    const where: Prisma.LicenseWhereInput = {
      deletedAt: null,
    };

    // Apply filters
    if (status) where.status = status;
    if (ipAssetId) where.ipAssetId = ipAssetId;
    if (projectId) where.projectId = projectId;
    if (licenseType) where.licenseType = licenseType;
    if (expiringBefore) {
      where.endDate = { lte: new Date(expiringBefore) };
      where.status = 'ACTIVE';
    }

    // Role-based filtering
    if (userRole === 'BRAND' && userBrandId) {
      where.brandId = userBrandId;
    } else if (userRole === 'CREATOR' && userCreatorId) {
      where.ipAsset = {
        ownerships: {
          some: { creatorId: userCreatorId },
        },
      };
    } else if (brandId) {
      where.brandId = brandId;
    } else if (creatorId) {
      where.ipAsset = {
        ownerships: {
          some: { creatorId },
        },
      };
    }

    const [licenses, total] = await Promise.all([
      prisma.license.findMany({
        where,
        include: {
          ipAsset: {
            select: {
              id: true,
              title: true,
              type: true,
              thumbnailUrl: true,
            },
          },
          brand: {
            select: {
              id: true,
              companyName: true,
              logo: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.license.count({ where }),
    ]);

    return {
      licenses,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get license by ID with full details
   */
  async getLicenseById(licenseId: string, includeRelations = true): Promise<License | null> {
    return prisma.license.findUnique({
      where: { id: licenseId },
      include: includeRelations
        ? {
            ipAsset: {
              include: {
                ownerships: {
                  include: {
                    creator: {
                      include: {
                        user: true,
                      },
                    },
                  },
                },
              },
            },
            brand: {
              include: {
                user: true,
              },
            },
            project: true,
            parentLicense: true,
            renewals: true,
          }
        : undefined,
    });
  }

  /**
   * Update license
   */
  async updateLicense(
    licenseId: string,
    input: UpdateLicenseInput,
    userId: string
  ): Promise<License> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Validate date change
    if (input.endDate) {
      const newEndDate = new Date(input.endDate);
      if (newEndDate <= license.startDate) {
        throw new Error('End date must be after start date');
      }
    }

    // Validate financial terms
    if (input.feeCents !== undefined && input.feeCents < 0) {
      throw new Error('Fee cannot be negative');
    }

    if (
      input.revShareBps !== undefined &&
      (input.revShareBps < 0 || input.revShareBps > 10000)
    ) {
      throw new Error('Revenue share must be between 0 and 10000 basis points');
    }

    return prisma.license.update({
      where: { id: licenseId },
      data: {
        ...(input.status && { status: input.status }),
        ...(input.endDate && { endDate: new Date(input.endDate) }),
        ...(input.feeCents !== undefined && { feeCents: input.feeCents }),
        ...(input.revShareBps !== undefined && { revShareBps: input.revShareBps }),
        ...(input.paymentTerms && { paymentTerms: input.paymentTerms }),
        ...(input.billingFrequency && { billingFrequency: input.billingFrequency }),
        ...(input.scope && { scopeJson: input.scope as any }),
        ...(input.autoRenew !== undefined && { autoRenew: input.autoRenew }),
        ...(input.metadata && { metadata: input.metadata as any }),
        updatedBy: userId,
      },
    });
  }

  /**
   * Get license statistics
   */
  async getLicenseStats(brandId?: string): Promise<LicenseStats> {
    const where: Prisma.LicenseWhereInput = {
      deletedAt: null,
      ...(brandId && { brandId }),
    };

    const [
      totalActive,
      expiringIn30Days,
      expiringIn60Days,
      expiringIn90Days,
      allActive,
      exclusiveLicenses,
      nonExclusiveLicenses,
      renewedLicenses,
      totalLicenses,
    ] = await Promise.all([
      prisma.license.count({
        where: { ...where, status: 'ACTIVE' },
      }),
      prisma.license.count({
        where: {
          ...where,
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: addDays(new Date(), 30),
          },
        },
      }),
      prisma.license.count({
        where: {
          ...where,
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: addDays(new Date(), 60),
          },
        },
      }),
      prisma.license.count({
        where: {
          ...where,
          status: 'ACTIVE',
          endDate: {
            gte: new Date(),
            lte: addDays(new Date(), 90),
          },
        },
      }),
      prisma.license.findMany({
        where: { ...where, status: 'ACTIVE' },
        select: { feeCents: true, startDate: true, endDate: true },
      }),
      prisma.license.count({
        where: { ...where, licenseType: 'EXCLUSIVE' },
      }),
      prisma.license.count({
        where: { ...where, licenseType: 'NON_EXCLUSIVE' },
      }),
      prisma.license.count({
        where: { ...where, parentLicenseId: { not: null } },
      }),
      prisma.license.count({ where }),
    ]);

    // Calculate total revenue and average duration
    const totalRevenueCents = allActive.reduce((sum, l) => sum + l.feeCents, 0);
    const totalDurationDays = allActive.reduce(
      (sum, l) => sum + differenceInDays(l.endDate, l.startDate),
      0
    );
    const averageLicenseDurationDays =
      allActive.length > 0 ? Math.round(totalDurationDays / allActive.length) : 0;

    const renewalRate =
      totalLicenses > 0 ? (renewedLicenses / totalLicenses) * 100 : 0;

    return {
      totalActive,
      totalRevenueCents,
      expiringIn30Days,
      expiringIn60Days,
      expiringIn90Days,
      averageLicenseDurationDays,
      exclusiveLicenses,
      nonExclusiveLicenses,
      renewalRate,
    };
  }

  /**
   * Soft delete a license
   */
  async deleteLicense(licenseId: string, userId: string): Promise<License> {
    return prisma.license.update({
      where: { id: licenseId },
      data: {
        deletedAt: new Date(),
        updatedBy: userId,
      },
    });
  }
}

export const licenseService = new LicenseService();

