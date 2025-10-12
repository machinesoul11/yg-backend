/**
 * Derivative Asset Service
 * 
 * Manages creation and tracking of derivative assets:
 * - Parent-child relationships
 * - Derivative type classification
 * - Ownership split calculations
 * - Attribution tracking
 * - Derivative detection and validation
 * 
 * Ensures proper royalty distribution across derivative chains
 */

import { PrismaClient, AssetType, AssetStatus, OwnershipType } from '@prisma/client';

export type DerivativeType =
  | 'remix'
  | 'adaptation'
  | 'combination'
  | 'edit'
  | 'variant'
  | 'compilation'
  | 'mashup'
  | 'sample';

export interface DerivativeCreationInput {
  parentAssetId: string;
  newAssetId: string;
  creatorId: string;
  derivativeType: DerivativeType;
  modificationsDescription: string;
  toolsUsed?: string[];
  creativeContribution?: string;
  ownershipSplits?: {
    derivativeCreator: number; // Basis points (10000 = 100%)
    originalContributors: number; // Basis points
  };
}

export interface DerivativeMetadata {
  derivativeType: DerivativeType;
  parentAssetId: string;
  modificationsDescription: string;
  toolsUsed: string[];
  creativeContribution: string;
  createdAt: string;
  derivationLevel: number; // How many levels deep (1 = direct derivative, 2+ = derivative of derivative)
  lineage: string[]; // Array of ancestor asset IDs
}

export interface OwnershipSplitCalculation {
  creatorId: string;
  shareBps: number;
  ownershipType: OwnershipType;
  contractReference?: string;
}

// Default ownership splits for derivatives
const DEFAULT_SPLITS = {
  derivativeCreator: 6000, // 60%
  originalContributors: 4000, // 40%
};

/**
 * Derivative Asset Service
 */
export class DerivativeAssetService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a derivative asset with proper parent-child relationship
   */
  async createDerivative(input: DerivativeCreationInput): Promise<{
    derivativeAsset: any;
    ownerships: any[];
    lineage: string[];
  }> {
    const {
      parentAssetId,
      newAssetId,
      creatorId,
      derivativeType,
      modificationsDescription,
      toolsUsed = [],
      creativeContribution = '',
      ownershipSplits = DEFAULT_SPLITS,
    } = input;

    // Validate ownership splits sum to 100%
    const totalSplit = ownershipSplits.derivativeCreator + ownershipSplits.originalContributors;
    if (totalSplit !== 10000) {
      throw new Error(
        `Ownership splits must sum to 10000 basis points (100%). Current: ${totalSplit}`
      );
    }

    // Get parent asset with its ownership structure
    const parentAsset = await this.prisma.ipAsset.findUnique({
      where: { id: parentAssetId, deletedAt: null },
      include: {
        ownerships: {
          where: {
            endDate: null, // Only active ownerships
          },
          include: {
            creator: {
              select: {
                id: true,
              },
            },
          },
        },
        parentAsset: {
          select: {
            id: true,
            parentAssetId: true,
            metadata: true,
          },
        },
      },
    });

    if (!parentAsset) {
      throw new Error(`Parent asset ${parentAssetId} not found`);
    }

    // Check if derivatives are allowed for parent asset
    const parentMetadata = parentAsset.metadata as any;
    if (parentMetadata?.derivativesAllowed === false) {
      throw new Error(
        `Derivatives are not allowed for asset ${parentAssetId}. Creator has disabled derivative creation.`
      );
    }

    // Calculate derivation level and build lineage
    const lineage = await this.buildLineage(parentAssetId);
    const derivationLevel = lineage.length + 1;

    // Update the new asset with parent relationship and derivative metadata
    const derivativeMetadata: DerivativeMetadata = {
      derivativeType,
      parentAssetId,
      modificationsDescription,
      toolsUsed,
      creativeContribution,
      createdAt: new Date().toISOString(),
      derivationLevel,
      lineage,
    };

    const derivativeAsset = await this.prisma.ipAsset.update({
      where: { id: newAssetId },
      data: {
        parentAssetId,
        metadata: {
          derivative: derivativeMetadata,
        } as any,
      },
    });

    // Create ownership records
    const ownerships = await this.createDerivativeOwnerships(
      newAssetId,
      creatorId,
      parentAsset,
      ownershipSplits
    );

    return {
      derivativeAsset,
      ownerships,
      lineage,
    };
  }

  /**
   * Create ownership records for derivative asset
   */
  private async createDerivativeOwnerships(
    derivativeAssetId: string,
    derivativeCreatorId: string,
    parentAsset: any,
    splits: { derivativeCreator: number; originalContributors: number }
  ): Promise<any[]> {
    const ownerships: any[] = [];

    // 1. Create primary ownership for derivative creator
    const derivativeCreatorOwnership = await this.prisma.ipOwnership.create({
      data: {
        ipAssetId: derivativeAssetId,
        creatorId: derivativeCreatorId,
        shareBps: splits.derivativeCreator,
        ownershipType: OwnershipType.PRIMARY,
        contractReference: `Derivative of ${parentAsset.id}`,
        notes: {
          derivativeCreation: true,
          parentAssetId: parentAsset.id,
          derivativeType: 'new_derivative',
        },
        createdBy: derivativeCreatorId,
        updatedBy: derivativeCreatorId,
      },
    });
    ownerships.push(derivativeCreatorOwnership);

    // 2. Calculate and create ownerships for original contributors
    // Distribute the originalContributors share proportionally among parent asset owners
    const parentOwnerships = parentAsset.ownerships;
    const totalParentShares = parentOwnerships.reduce(
      (sum: number, o: any) => sum + o.shareBps,
      0
    );

    for (const parentOwnership of parentOwnerships) {
      // Calculate proportional share for this original contributor
      const proportionalShare = Math.floor(
        (parentOwnership.shareBps / totalParentShares) * splits.originalContributors
      );

      if (proportionalShare > 0) {
        const contributorOwnership = await this.prisma.ipOwnership.create({
          data: {
            ipAssetId: derivativeAssetId,
            creatorId: parentOwnership.creatorId,
            shareBps: proportionalShare,
            ownershipType: OwnershipType.CONTRIBUTOR,
            contractReference: `Original work: ${parentAsset.id}`,
            notes: {
              derivativeContribution: true,
              parentAssetId: parentAsset.id,
              parentOwnershipShare: parentOwnership.shareBps,
              derivativeShare: proportionalShare,
            },
            createdBy: derivativeCreatorId,
            updatedBy: derivativeCreatorId,
          },
        });
        ownerships.push(contributorOwnership);
      }
    }

    // Verify total shares equal 10000
    const totalShares = ownerships.reduce((sum, o) => sum + o.shareBps, 0);
    if (totalShares !== 10000) {
      console.warn(
        `Derivative ownership shares sum to ${totalShares} instead of 10000. Adjusting primary owner.`
      );
      // Adjust the derivative creator's share to make up the difference
      const adjustment = 10000 - totalShares;
      await this.prisma.ipOwnership.update({
        where: { id: derivativeCreatorOwnership.id },
        data: {
          shareBps: derivativeCreatorOwnership.shareBps + adjustment,
        },
      });
    }

    return ownerships;
  }

  /**
   * Build complete lineage array for an asset
   */
  private async buildLineage(assetId: string): Promise<string[]> {
    const lineage: string[] = [];
    let currentAssetId: string | null = assetId;

    // Traverse up the parent chain
    while (currentAssetId) {
      lineage.unshift(currentAssetId); // Add to beginning

      const asset: { parentAssetId: string | null } | null =
        await this.prisma.ipAsset.findUnique({
          where: { id: currentAssetId },
          select: { parentAssetId: true },
        });

      if (!asset || !asset.parentAssetId) {
        break;
      }

      currentAssetId = asset.parentAssetId;

      // Safety check to prevent infinite loops
      if (lineage.length > 20) {
        console.warn(`Derivative chain exceeds 20 levels for asset ${assetId}`);
        break;
      }
    }

    return lineage;
  }

  /**
   * Get all derivatives of an asset
   */
  async getDerivatives(
    assetId: string,
    options: {
      includeIndirect?: boolean; // Include derivatives of derivatives
      limit?: number;
    } = {}
  ): Promise<any[]> {
    const { includeIndirect = false, limit = 100 } = options;

    if (includeIndirect) {
      // Recursive query to get all descendants
      return this.getAllDescendants(assetId, limit);
    } else {
      // Direct derivatives only
      return this.prisma.ipAsset.findMany({
        where: {
          parentAssetId: assetId,
          deletedAt: null,
        },
        include: {
          creator: {
            select: {
              id: true,
            },
          },
          ownerships: {
            where: { endDate: null },
            include: {
              creator: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
    }
  }

  /**
   * Recursively get all descendants
   */
  private async getAllDescendants(assetId: string, limit: number): Promise<any[]> {
    const descendants: any[] = [];
    const queue: string[] = [assetId];
    const visited = new Set<string>();

    while (queue.length > 0 && descendants.length < limit) {
      const currentId = queue.shift()!;

      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const children = await this.prisma.ipAsset.findMany({
        where: {
          parentAssetId: currentId,
          deletedAt: null,
        },
        include: {
          creator: {
            select: {
              id: true,
            },
          },
        },
      });

      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants.slice(0, limit);
  }

  /**
   * Get lineage (ancestry) of an asset
   */
  async getLineage(assetId: string): Promise<any[]> {
    const lineageIds = await this.buildLineage(assetId);

    if (lineageIds.length === 0) {
      return [];
    }

    const assets = await this.prisma.ipAsset.findMany({
      where: {
        id: { in: lineageIds },
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return assets;
  }

  /**
   * Update derivative metadata
   */
  async updateDerivativeMetadata(
    assetId: string,
    updates: Partial<DerivativeMetadata>
  ): Promise<any> {
    const asset = await this.prisma.ipAsset.findUnique({
      where: { id: assetId },
      select: { metadata: true, parentAssetId: true },
    });

    if (!asset || !asset.parentAssetId) {
      throw new Error(`Asset ${assetId} is not a derivative`);
    }

    const currentMetadata = asset.metadata as any;
    const derivativeMetadata = currentMetadata?.derivative || {};

    return this.prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          ...currentMetadata,
          derivative: {
            ...derivativeMetadata,
            ...updates,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  /**
   * Check if derivatives are allowed for an asset
   */
  async areDerivativesAllowed(assetId: string): Promise<boolean> {
    const asset = await this.prisma.ipAsset.findUnique({
      where: { id: assetId },
      select: { metadata: true },
    });

    if (!asset) {
      return false;
    }

    const metadata = asset.metadata as any;
    return metadata?.derivativesAllowed !== false; // Default to true if not explicitly set
  }

  /**
   * Set derivative permission for an asset
   */
  async setDerivativePermission(
    assetId: string,
    allowDerivatives: boolean
  ): Promise<any> {
    const asset = await this.prisma.ipAsset.findUnique({
      where: { id: assetId },
      select: { metadata: true },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found`);
    }

    return this.prisma.ipAsset.update({
      where: { id: assetId },
      data: {
        metadata: {
          ...((asset.metadata as Record<string, any>) || {}),
          derivativesAllowed: allowDerivatives,
          derivativePermissionUpdatedAt: new Date().toISOString(),
        } as any,
      },
    });
  }

  /**
   * Calculate ownership distribution for a derivative chain
   * Useful for understanding royalty flows
   */
  async calculateDerivativeRoyaltyDistribution(
    derivativeAssetId: string,
    totalRoyaltyCents: number
  ): Promise<
    {
      creatorId: string;
      creatorName: string;
      shareBps: number;
      amountCents: number;
      role: string;
    }[]
  > {
    const ownerships = await this.prisma.ipOwnership.findMany({
      where: {
        ipAssetId: derivativeAssetId,
        endDate: null,
      },
      include: {
        creator: {
          select: {
            id: true,
          },
        },
      },
    });

    return ownerships.map((ownership) => {
      const creatorName = 'Creator'; // Would need User table join for actual name
      return {
        creatorId: ownership.creatorId,
        creatorName,
        shareBps: ownership.shareBps,
        amountCents: Math.floor((ownership.shareBps / 10000) * totalRoyaltyCents),
        role:
          ownership.ownershipType === OwnershipType.PRIMARY
            ? 'Derivative Creator'
            : 'Original Contributor',
      };
    });
  }
}
