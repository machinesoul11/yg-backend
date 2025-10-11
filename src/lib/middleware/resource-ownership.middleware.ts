/**
 * Resource Ownership Middleware
 * Verifies user ownership and access rights to specific resources
 * 
 * Ensures data isolation and proper access control for multi-tenant resources
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { AuditService } from '@/lib/services/audit.service';
import type { AuthUser } from './auth.middleware';
import type { UserRole } from '@prisma/client';

const auditService = new AuditService(prisma);

/**
 * Resource types supported by ownership checks
 */
export type ResourceType = 
  | 'ip_asset'
  | 'project'
  | 'license'
  | 'royalty_statement'
  | 'payout'
  | 'brand'
  | 'creator';

/**
 * Ownership check result
 */
export interface OwnershipResult {
  hasAccess: boolean;
  ownershipType?: 'owner' | 'collaborator' | 'assigned' | 'admin';
  error?: string;
}

/**
 * Ownership check options
 */
export interface OwnershipOptions {
  allowAdmin?: boolean; // If true, admins bypass ownership checks (default: true)
  requireDirectOwnership?: boolean; // If true, collaborator access is not sufficient
  cacheResults?: boolean; // If true, cache ownership checks (default: true)
  cacheTTL?: number; // Cache TTL in seconds (default: 300 = 5 minutes)
}

/**
 * Build cache key for ownership check
 */
function buildOwnershipCacheKey(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): string {
  return `ownership:${userId}:${resourceType}:${resourceId}`;
}

/**
 * Get cached ownership result
 */
async function getCachedOwnership(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<boolean | null> {
  try {
    const key = buildOwnershipCacheKey(userId, resourceType, resourceId);
    const cached = await redis.get(key);
    return cached ? cached === 'true' : null;
  } catch (error) {
    console.error('[OwnershipMiddleware] Cache read error:', error);
    return null;
  }
}

/**
 * Cache ownership result
 */
async function cacheOwnership(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  hasAccess: boolean,
  ttl: number = 300
): Promise<void> {
  try {
    const key = buildOwnershipCacheKey(userId, resourceType, resourceId);
    await redis.setex(key, ttl, hasAccess.toString());
  } catch (error) {
    console.error('[OwnershipMiddleware] Cache write error:', error);
  }
}

/**
 * Invalidate ownership cache for a resource
 */
export async function invalidateOwnershipCache(
  resourceType: ResourceType,
  resourceId: string
): Promise<void> {
  try {
    const pattern = `ownership:*:${resourceType}:${resourceId}`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('[OwnershipMiddleware] Cache invalidation error:', error);
  }
}

/**
 * Check IP Asset ownership
 */
async function checkIpAssetOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const asset = await prisma.ipAsset.findUnique({
    where: { id: resourceId },
    include: {
      ownerships: {
        where: {
          creatorId: user.creatorId || '',
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } },
          ],
        },
      },
      project: {
        select: {
          brandId: true,
        },
      },
    },
  });

  if (!asset) {
    return { hasAccess: false, error: 'Asset not found' };
  }

  // Check if user created the asset
  if (asset.createdBy === user.id) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // Check creator ownership
  if (user.creatorId && asset.ownerships.length > 0) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // Check brand access (if asset belongs to brand's project)
  if (user.brandId && asset.project?.brandId === user.brandId) {
    return { hasAccess: true, ownershipType: 'collaborator' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check Project ownership
 */
async function checkProjectOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const project = await prisma.project.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      brandId: true,
      createdBy: true,
    },
  });

  if (!project) {
    return { hasAccess: false, error: 'Project not found' };
  }

  // Check if user created the project
  if (project.createdBy === user.id) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // Check brand ownership
  if (user.brandId && project.brandId === user.brandId) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // TODO: Check if creator is assigned to project
  // This would require a project_collaborators or project_assignments table

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check License ownership/access
 */
async function checkLicenseOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const license = await prisma.license.findUnique({
    where: { id: resourceId },
    include: {
      brand: { select: { id: true, userId: true } },
      ipAsset: {
        include: {
          ownerships: {
            where: {
              creatorId: user.creatorId || '',
              OR: [
                { endDate: null },
                { endDate: { gte: new Date() } },
              ],
            },
          },
        },
      },
    },
  });

  if (!license) {
    return { hasAccess: false, error: 'License not found' };
  }

  // Check brand ownership
  if (user.brandId && license.brandId === user.brandId) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // Check creator ownership of licensed asset
  if (user.creatorId && license.ipAsset.ownerships.length > 0) {
    return { hasAccess: true, ownershipType: 'collaborator' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check Royalty Statement ownership
 */
async function checkRoyaltyStatementOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const statement = await prisma.royaltyStatement.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      creatorId: true,
    },
  });

  if (!statement) {
    return { hasAccess: false, error: 'Royalty statement not found' };
  }

  // Check creator ownership
  if (user.creatorId && statement.creatorId === user.creatorId) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check Payout ownership
 */
async function checkPayoutOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const payout = await prisma.payout.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      creatorId: true,
    },
  });

  if (!payout) {
    return { hasAccess: false, error: 'Payout not found' };
  }

  // Check creator ownership
  if (user.creatorId && payout.creatorId === user.creatorId) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check Brand profile access
 */
async function checkBrandOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const brand = await prisma.brand.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!brand) {
    return { hasAccess: false, error: 'Brand not found' };
  }

  // Check if user owns the brand profile
  if (brand.userId === user.id) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  // TODO: Check team member access if team members table exists

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Check Creator profile access
 */
async function checkCreatorOwnership(
  user: AuthUser,
  resourceId: string,
  options: OwnershipOptions
): Promise<OwnershipResult> {
  const creator = await prisma.creator.findUnique({
    where: { id: resourceId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!creator) {
    return { hasAccess: false, error: 'Creator not found' };
  }

  // Check if user owns the creator profile
  if (creator.userId === user.id) {
    return { hasAccess: true, ownershipType: 'owner' };
  }

  return { hasAccess: false, error: 'Access denied' };
}

/**
 * Main ownership verification function
 * 
 * @param user - Authenticated user
 * @param resourceType - Type of resource to check
 * @param resourceId - ID of the resource
 * @param options - Ownership check options
 * @returns Promise<OwnershipResult>
 */
export async function verifyOwnership(
  user: AuthUser,
  resourceType: ResourceType,
  resourceId: string,
  options: OwnershipOptions = {}
): Promise<OwnershipResult> {
  const {
    allowAdmin = true,
    requireDirectOwnership = false,
    cacheResults = true,
    cacheTTL = 300,
  } = options;

  // Admin bypass
  if (allowAdmin && user.role === 'ADMIN') {
    return { hasAccess: true, ownershipType: 'admin' };
  }

  // Check cache first
  if (cacheResults) {
    const cached = await getCachedOwnership(user.id, resourceType, resourceId);
    if (cached !== null) {
      return { hasAccess: cached, ownershipType: cached ? 'owner' : undefined };
    }
  }

  let result: OwnershipResult;

  try {
    // Route to appropriate ownership check
    switch (resourceType) {
      case 'ip_asset':
        result = await checkIpAssetOwnership(user, resourceId, options);
        break;
      case 'project':
        result = await checkProjectOwnership(user, resourceId, options);
        break;
      case 'license':
        result = await checkLicenseOwnership(user, resourceId, options);
        break;
      case 'royalty_statement':
        result = await checkRoyaltyStatementOwnership(user, resourceId, options);
        break;
      case 'payout':
        result = await checkPayoutOwnership(user, resourceId, options);
        break;
      case 'brand':
        result = await checkBrandOwnership(user, resourceId, options);
        break;
      case 'creator':
        result = await checkCreatorOwnership(user, resourceId, options);
        break;
      default:
        result = { hasAccess: false, error: 'Unknown resource type' };
    }

    // Check direct ownership requirement
    if (requireDirectOwnership && result.ownershipType === 'collaborator') {
      result = { hasAccess: false, error: 'Direct ownership required' };
    }

    // Cache the result
    if (cacheResults) {
      await cacheOwnership(user.id, resourceType, resourceId, result.hasAccess, cacheTTL);
    }

    // Audit access denial
    if (!result.hasAccess) {
      await auditService.log({
        action: 'ACCESS_DENIED',
        entityType: resourceType,
        entityId: resourceId,
        userId: user.id,
        after: {
          reason: result.error || 'Ownership check failed',
          resourceType,
        },
      });
    }

    return result;
  } catch (error) {
    console.error('[OwnershipMiddleware] Ownership check error:', error);
    
    await auditService.log({
      action: 'OWNERSHIP_CHECK_ERROR',
      entityType: resourceType,
      entityId: resourceId,
      userId: user.id,
      after: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return {
      hasAccess: false,
      error: 'Ownership verification failed',
    };
  }
}

/**
 * Require ownership - throws error if user doesn't have access
 * 
 * @example
 * ```typescript
 * const auth = await requireAuth(req);
 * await requireOwnership(auth.user, 'project', projectId);
 * ```
 */
export async function requireOwnership(
  user: AuthUser,
  resourceType: ResourceType,
  resourceId: string,
  options?: OwnershipOptions
): Promise<void> {
  const result = await verifyOwnership(user, resourceType, resourceId, options);
  
  if (!result.hasAccess) {
    const error = new Error(result.error || 'Access denied');
    (error as any).code = 'FORBIDDEN';
    throw error;
  }
}
