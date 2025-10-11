/**
 * Permission Service
 * Handles permission checking with caching for performance
 * Supports role-based, resource-level, and field-level permissions
 */

import { PrismaClient, UserRole } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { redis } from '@/lib/redis';
import {
  Permission,
  getRolePermissions,
  roleHasPermission,
  roleHasAnyPermission,
  roleHasAllPermissions,
  PERMISSIONS,
} from '@/lib/constants/permissions';
import { AuditService } from './audit.service';

/**
 * Resource action types
 */
export type ResourceAction = 'view' | 'edit' | 'delete' | 'create' | 'approve' | 'publish';

/**
 * Field permission check result
 */
export interface FieldPermissionResult {
  allowed: boolean;
  maskedValue?: any;
}

/**
 * Permission check context for request-level caching
 */
interface PermissionCheckContext {
  userId: string;
  cache: Map<string, boolean>;
}

export class PermissionService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_PREFIX = 'permissions:user:';
  private readonly RESOURCE_CACHE_PREFIX = 'permissions:resource:';
  
  // Request-level cache - cleared after each request
  private requestCache: Map<string, PermissionCheckContext> | null = null;

  constructor(
    private prisma: PrismaClient,
    private auditService: AuditService
  ) {}

  /**
   * Check if user has a specific permission
   * Uses request-level caching for performance
   * @param userId - User ID
   * @param permission - Permission to check
   * @param useRequestCache - Whether to use request-level caching
   * @returns Promise<boolean>
   */
  async hasPermission(
    userId: string,
    permission: Permission,
    useRequestCache: boolean = true
  ): Promise<boolean> {
    try {
      // Check request-level cache first
      if (useRequestCache && this.requestCache) {
        const cacheKey = `${userId}:${permission}`;
        const ctx = this.requestCache.get(userId);
        if (ctx && ctx.cache.has(permission)) {
          return ctx.cache.get(permission)!;
        }
      }

      const role = await this.getUserRole(userId);
      if (!role) return false;

      const hasPermission = roleHasPermission(role, permission);

      // Store in request cache
      if (useRequestCache && this.requestCache) {
        if (!this.requestCache.has(userId)) {
          this.requestCache.set(userId, { userId, cache: new Map() });
        }
        this.requestCache.get(userId)!.cache.set(permission, hasPermission);
      }

      return hasPermission;
    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }

  /**
   * Check if user has ANY of the specified permissions
   * @param userId - User ID
   * @param permissions - Array of permissions to check
   * @returns Promise<boolean>
   */
  async hasAnyPermission(userId: string, permissions: Permission[]): Promise<boolean> {
    const role = await this.getUserRole(userId);
    if (!role) return false;

    return roleHasAnyPermission(role, permissions);
  }

  /**
   * Check if user has ALL of the specified permissions
   * @param userId - User ID
   * @param permissions - Array of permissions to check
   * @returns Promise<boolean>
   */
  async hasAllPermissions(userId: string, permissions: Permission[]): Promise<boolean> {
    const role = await this.getUserRole(userId);
    if (!role) return false;

    return roleHasAllPermissions(role, permissions);
  }

  /**
   * Check if user has a permission, throw error if not
   * @param userId - User ID
   * @param permission - Permission to check
   * @param customMessage - Optional custom error message
   * @throws TRPCError if permission denied
   */
  async checkPermission(
    userId: string,
    permission: Permission,
    customMessage?: string
  ): Promise<void> {
    const hasPermission = await this.hasPermission(userId, permission);
    
    if (!hasPermission) {
      // Log permission denied
      await this.auditService.log({
        action: 'PERMISSION_DENIED',
        entityType: 'user',
        entityId: userId,
        userId,
        after: { permission, customMessage },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: customMessage || 'You do not have permission to perform this action',
      });
    }
  }

  /**
   * Check if user has ANY permission, throw error if none match
   * @param userId - User ID
   * @param permissions - Array of permissions to check
   * @param customMessage - Optional custom error message
   * @throws TRPCError if no permissions match
   */
  async checkAnyPermission(
    userId: string,
    permissions: Permission[],
    customMessage?: string
  ): Promise<void> {
    const hasPermission = await this.hasAnyPermission(userId, permissions);
    
    if (!hasPermission) {
      await this.auditService.log({
        action: 'PERMISSION_DENIED',
        entityType: 'user',
        entityId: userId,
        userId,
        after: { requiredPermissions: permissions },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: customMessage || 'You do not have any of the required permissions',
      });
    }
  }

  /**
   * Check if user has ALL permissions, throw error if any missing
   * @param userId - User ID
   * @param permissions - Array of permissions to check
   * @param customMessage - Optional custom error message
   * @throws TRPCError if any permissions are missing
   */
  async checkAllPermissions(
    userId: string,
    permissions: Permission[],
    customMessage?: string
  ): Promise<void> {
    const hasAllPermissions = await this.hasAllPermissions(userId, permissions);
    
    if (!hasAllPermissions) {
      await this.auditService.log({
        action: 'PERMISSION_DENIED',
        entityType: 'user',
        entityId: userId,
        userId,
        after: { requiredPermissions: permissions },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: customMessage || 'You do not have all the required permissions',
      });
    }
  }

  /**
   * Get all permissions for a user
   * @param userId - User ID
   * @returns Promise<Permission[]>
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    // Check cache first
    const cached = await this.getCachedPermissions(userId);
    if (cached) return cached;

    // Fetch user role from database
    const role = await this.getUserRole(userId);
    if (!role) return [];

    const permissions = getRolePermissions(role);

    // Cache the result
    await this.cachePermissions(userId, permissions);

    return permissions;
  }

  /**
   * Check if user has resource-level access
   * Considers both permissions and ownership/relationships
   * Uses caching for performance
   * 
   * @param userId - User ID
   * @param resourceType - Type of resource (e.g., 'ip_asset', 'project')
   * @param resourceId - ID of the resource
   * @param action - Action being performed (view, edit, delete, etc.)
   * @returns Promise<boolean>
   */
  async hasResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: ResourceAction
  ): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = `${userId}:${resourceType}:${resourceId}:${action}`;
      const cached = await this.getResourcePermissionCache(cacheKey);
      if (cached !== null) return cached;

      const role = await this.getUserRole(userId);
      if (!role) return false;

      // Admins have access to everything
      if (role === 'ADMIN') {
        await this.cacheResourcePermission(cacheKey, true);
        return true;
      }

      // Check ownership/relationships
      const isOwner = await this.checkResourceOwnership(userId, resourceType, resourceId);
      const hasRelationship = await this.checkResourceRelationship(userId, resourceType, resourceId);

      // Map resource type and action to permission
      const permission = this.getResourcePermission(resourceType, action, isOwner);
      
      if (!permission) {
        await this.cacheResourcePermission(cacheKey, false);
        return false;
      }

      const hasAccess = roleHasPermission(role, permission);
      
      // Additional relationship-based access (e.g., brand team members)
      const hasRelationshipAccess = hasRelationship && this.checkRelationshipPermission(
        resourceType,
        action,
        role
      );

      const result = hasAccess || hasRelationshipAccess;
      await this.cacheResourcePermission(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Resource access check failed:', error);
      return false;
    }
  }

  /**
   * Check if user has resource access and throw if not
   * @param userId - User ID
   * @param resourceType - Resource type
   * @param resourceId - Resource ID
   * @param action - Action to perform
   * @throws TRPCError if access denied
   */
  async checkResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    action: ResourceAction
  ): Promise<void> {
    const hasAccess = await this.hasResourceAccess(userId, resourceType, resourceId, action);
    
    if (!hasAccess) {
      await this.auditService.log({
        action: 'RESOURCE_ACCESS_DENIED',
        entityType: resourceType,
        entityId: resourceId,
        userId,
        after: { action, resourceType, resourceId },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You do not have permission to ${action} this ${resourceType}`,
      });
    }
  }

  /**
   * Invalidate cached permissions for a user
   * Call this when user's role changes
   */
  async invalidateUserPermissions(userId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${userId}`;
      await redis.del(cacheKey);
    } catch (error) {
      console.error('Failed to invalidate permission cache:', error);
    }
  }

  /**
   * Invalidate resource permission cache for a specific resource
   * Call this when ownership or relationships change
   */
  async invalidateResourcePermissions(
    resourceType: string,
    resourceId: string
  ): Promise<void> {
    try {
      const pattern = `${this.RESOURCE_CACHE_PREFIX}*:${resourceType}:${resourceId}:*`;
      // Note: This is a simple approach. For production, consider using Redis SCAN
      // or maintaining a set of cache keys for more efficient invalidation
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Failed to invalidate resource permission cache:', error);
    }
  }

  /**
   * Filter object fields based on user permissions
   * Integrates with field-level permission system
   */
  async filterObjectFields<T extends Record<string, any>>(
    obj: T,
    resourceType: string,
    userId: string
  ): Promise<Partial<T>> {
    const permissions = await this.getUserPermissions(userId);
    
    // Import dynamically to avoid circular dependencies
    const { filterFieldsByPermissions } = await import('@/lib/utils/field-permissions');
    
    return filterFieldsByPermissions(obj, resourceType, permissions);
  }

  /**
   * Validate field writes for an update operation
   * Throws error if user attempts to modify fields they don't have permission for
   */
  async validateFieldUpdates(
    resourceType: string,
    fieldsToUpdate: Record<string, any>,
    userId: string
  ): Promise<void> {
    const permissions = await this.getUserPermissions(userId);
    
    const { validateFieldWrites } = await import('@/lib/utils/field-permissions');
    
    const unwritableFields = validateFieldWrites(resourceType, fieldsToUpdate, permissions);
    
    if (unwritableFields.length > 0) {
      await this.auditService.log({
        action: 'FIELD_PERMISSION_DENIED',
        entityType: resourceType,
        entityId: 'unknown',
        userId,
        after: { deniedFields: unwritableFields },
      });

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You do not have permission to modify the following fields: ${unwritableFields.join(', ')}`,
      });
    }
  }

  /**
   * Get user's role from database
   * @private
   */
  private async getUserRole(userId: string): Promise<UserRole | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      return user?.role || null;
    } catch (error) {
      console.error('Failed to fetch user role:', error);
      return null;
    }
  }

  /**
   * Get cached permissions
   * @private
   */
  private async getCachedPermissions(userId: string): Promise<Permission[] | null> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${userId}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as Permission[];
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get cached permissions:', error);
      return null;
    }
  }

  /**
   * Cache user permissions
   * @private
   */
  private async cachePermissions(userId: string, permissions: Permission[]): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${userId}`;
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(permissions));
    } catch (error) {
      console.error('Failed to cache permissions:', error);
    }
  }

  /**
   * Check if user owns a resource
   * @private
   */
  private async checkResourceOwnership(
    userId: string,
    resourceType: string,
    resourceId: string
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'ip_asset':
          const asset = await this.prisma.ipAsset.findUnique({
            where: { id: resourceId },
            select: { createdBy: true },
          });
          return asset?.createdBy === userId;

        case 'project':
          const project = await this.prisma.project.findUnique({
            where: { id: resourceId },
            include: { brand: { select: { userId: true } } },
          });
          return project?.brand?.userId === userId;

        case 'creator':
          const creator = await this.prisma.creator.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          return creator?.userId === userId;

        case 'brand':
          const brand = await this.prisma.brand.findUnique({
            where: { id: resourceId },
            select: { userId: true },
          });
          return brand?.userId === userId;

        default:
          return false;
      }
    } catch (error) {
      console.error('Ownership check failed:', error);
      return false;
    }
  }

  /**
   * Map resource type and action to permission
   * @private
   */
  private getResourcePermission(
    resourceType: string,
    action: string,
    isOwner: boolean
  ): Permission | null {
    const permissionMap: Record<string, Record<string, Permission>> = {
      ip_asset: {
        view: isOwner ? PERMISSIONS.IP_ASSETS_VIEW_OWN : PERMISSIONS.IP_ASSETS_VIEW_ALL,
        edit: isOwner ? PERMISSIONS.IP_ASSETS_EDIT_OWN : PERMISSIONS.IP_ASSETS_EDIT_ALL,
        delete: isOwner ? PERMISSIONS.IP_ASSETS_DELETE_OWN : PERMISSIONS.IP_ASSETS_DELETE_ALL,
        create: PERMISSIONS.IP_ASSETS_CREATE,
        approve: PERMISSIONS.IP_ASSETS_APPROVE,
        publish: PERMISSIONS.IP_ASSETS_PUBLISH,
      },
      project: {
        view: isOwner ? PERMISSIONS.PROJECTS_VIEW_OWN : PERMISSIONS.PROJECTS_VIEW_ALL,
        edit: isOwner ? PERMISSIONS.PROJECTS_EDIT_OWN : PERMISSIONS.PROJECTS_EDIT_ALL,
        delete: isOwner ? PERMISSIONS.PROJECTS_DELETE_OWN : PERMISSIONS.PROJECTS_DELETE_ALL,
        create: PERMISSIONS.PROJECTS_CREATE,
      },
      creator: {
        view: isOwner ? PERMISSIONS.CREATORS_VIEW_OWN : PERMISSIONS.CREATORS_VIEW_ALL,
        edit: isOwner ? PERMISSIONS.CREATORS_EDIT_OWN : PERMISSIONS.CREATORS_EDIT_ALL,
      },
      brand: {
        view: isOwner ? PERMISSIONS.BRANDS_VIEW_OWN : PERMISSIONS.BRANDS_VIEW_ALL,
        edit: isOwner ? PERMISSIONS.BRANDS_EDIT_OWN : PERMISSIONS.BRANDS_EDIT_ALL,
      },
      license: {
        view: isOwner ? PERMISSIONS.LICENSES_VIEW_OWN : PERMISSIONS.LICENSES_VIEW_ALL,
        edit: isOwner ? PERMISSIONS.LICENSES_EDIT_OWN : PERMISSIONS.LICENSES_EDIT_ALL,
        create: PERMISSIONS.LICENSES_CREATE,
        approve: PERMISSIONS.LICENSES_APPROVE,
      },
    };

    return permissionMap[resourceType]?.[action] || null;
  }

  /**
   * Check if user has relationship to resource (e.g., team member, collaborator)
   * @private
   */
  private async checkResourceRelationship(
    userId: string,
    resourceType: string,
    resourceId: string
  ): Promise<boolean> {
    try {
      switch (resourceType) {
        case 'ip_asset':
          // Check if user is a co-owner via ip_ownerships
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { creator: { select: { id: true } } },
          });
          
          if (!user?.creator) return false;

          const ownership = await this.prisma.ipOwnership.findFirst({
            where: {
              ipAssetId: resourceId,
              creatorId: user.creator.id,
              startDate: { lte: new Date() },
              OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
            },
          });
          
          return !!ownership;

        case 'project':
        case 'brand':
          // Check brand team membership
          if (resourceType === 'brand') {
            const brand = await this.prisma.brand.findUnique({
              where: { id: resourceId },
              select: { teamMembers: true },
            });

            if (!brand?.teamMembers) return false;
            
            const teamMembers = brand.teamMembers as any[];
            return teamMembers.some((member: any) => member.userId === userId);
          } else {
            // For projects, check the brand's team members
            const project = await this.prisma.project.findUnique({
              where: { id: resourceId },
              include: {
                brand: {
                  select: { teamMembers: true },
                },
              },
            });

            if (!project?.brand?.teamMembers) return false;
            
            const teamMembers = project.brand.teamMembers as any[];
            return teamMembers.some((member: any) => member.userId === userId);
          }

        default:
          return false;
      }
    } catch (error) {
      console.error('Relationship check failed:', error);
      return false;
    }
  }

  /**
   * Check if relationship grants permission for action
   * @private
   */
  private checkRelationshipPermission(
    resourceType: string,
    action: ResourceAction,
    role: UserRole
  ): boolean {
    // Team members of brands can view projects and licenses
    if (resourceType === 'project' || resourceType === 'license') {
      if (role === 'BRAND' && (action === 'view' || action === 'edit')) {
        return true;
      }
    }

    // Co-owners of IP assets can view
    if (resourceType === 'ip_asset' && role === 'CREATOR') {
      if (action === 'view') return true;
    }

    return false;
  }

  /**
   * Get resource permission from cache
   * @private
   */
  private async getResourcePermissionCache(cacheKey: string): Promise<boolean | null> {
    try {
      const fullKey = `${this.RESOURCE_CACHE_PREFIX}${cacheKey}`;
      const cached = await redis.get(fullKey);
      
      if (cached !== null) {
        return cached === 'true';
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get resource permission cache:', error);
      return null;
    }
  }

  /**
   * Cache resource permission
   * @private
   */
  private async cacheResourcePermission(cacheKey: string, hasAccess: boolean): Promise<void> {
    try {
      const fullKey = `${this.RESOURCE_CACHE_PREFIX}${cacheKey}`;
      await redis.setex(fullKey, this.CACHE_TTL, hasAccess ? 'true' : 'false');
    } catch (error) {
      console.error('Failed to cache resource permission:', error);
    }
  }

  /**
   * Initialize request-level cache
   * Call this at the start of each request
   */
  initRequestCache(): void {
    this.requestCache = new Map();
  }

  /**
   * Clear request-level cache
   * Call this at the end of each request
   */
  clearRequestCache(): void {
    this.requestCache = null;
  }
}
