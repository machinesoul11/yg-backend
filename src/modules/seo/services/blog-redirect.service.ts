/**
 * Blog Redirect Management Service
 * Handles 301 redirect creation and management for blog post slug changes
 */

import { PrismaClient } from '@prisma/client';

export interface CreateRedirectOptions {
  sourcePath: string;
  destinationPath: string;
  redirectType?: number;
  expiresAt?: Date;
  createdBy: string;
}

export interface RedirectLookupResult {
  found: boolean;
  destinationPath?: string;
  redirectType?: number;
  shouldTrackHit?: boolean;
  redirectId?: string;
}

export interface RedirectValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class BlogRedirectService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new redirect mapping
   */
  async createRedirect(options: CreateRedirectOptions): Promise<void> {
    const {
      sourcePath,
      destinationPath,
      redirectType = 301,
      expiresAt,
      createdBy,
    } = options;

    // Validate the redirect
    const validation = await this.validateRedirect(sourcePath, destinationPath);
    if (!validation.isValid) {
      throw new Error(`Invalid redirect: ${validation.errors.join(', ')}`);
    }

    try {
      // Check for existing redirect with the same source path
      const existingRedirect = await this.prisma.blogRedirect.findUnique({
        where: { sourcePath },
      });

      if (existingRedirect) {
        // Update existing redirect instead of creating a new one
        await this.prisma.blogRedirect.update({
          where: { id: existingRedirect.id },
          data: {
            destinationPath,
            redirectType,
            expiresAt,
            isActive: true,
            hitCount: 0, // Reset hit count for updated redirect
            lastAccessedAt: null,
          },
        });
        
        console.log(`Updated existing redirect: ${sourcePath} → ${destinationPath}`);
      } else {
        // Create new redirect
        await this.prisma.blogRedirect.create({
          data: {
            sourcePath,
            destinationPath,
            redirectType,
            expiresAt,
            createdBy,
            isActive: true,
          },
        });
        
        console.log(`Created new redirect: ${sourcePath} → ${destinationPath}`);
      }
    } catch (error) {
      console.error('Error creating redirect:', error);
      throw new Error('Failed to create redirect mapping');
    }
  }

  /**
   * Create redirect when a blog post slug changes
   */
  async createSlugChangeRedirect(
    oldSlug: string,
    newSlug: string,
    createdBy: string
  ): Promise<void> {
    const sourcePath = `/blog/${oldSlug}`;
    const destinationPath = `/blog/${newSlug}`;

    await this.createRedirect({
      sourcePath,
      destinationPath,
      redirectType: 301, // Permanent redirect for slug changes
      createdBy,
    });
  }

  /**
   * Look up a redirect by source path
   */
  async lookupRedirect(sourcePath: string): Promise<RedirectLookupResult> {
    try {
      const redirect = await this.prisma.blogRedirect.findUnique({
        where: {
          sourcePath,
          isActive: true,
        },
      });

      if (!redirect) {
        return { found: false };
      }

      // Check if redirect has expired
      if (redirect.expiresAt && redirect.expiresAt < new Date()) {
        // Deactivate expired redirect
        await this.prisma.blogRedirect.update({
          where: { id: redirect.id },
          data: { isActive: false },
        });
        
        return { found: false };
      }

      // Check for redirect chains and resolve to final destination
      const finalDestination = await this.resolveFinalDestination(
        redirect.destinationPath,
        [sourcePath] // Track visited paths to prevent infinite loops
      );

      return {
        found: true,
        destinationPath: finalDestination,
        redirectType: redirect.redirectType,
        shouldTrackHit: true,
        redirectId: redirect.id,
      };
    } catch (error) {
      console.error('Error looking up redirect:', error);
      return { found: false };
    }
  }

  /**
   * Track redirect hit (update hit count and last accessed time)
   */
  async trackRedirectHit(redirectId: string): Promise<void> {
    try {
      await this.prisma.blogRedirect.update({
        where: { id: redirectId },
        data: {
          hitCount: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Error tracking redirect hit:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Resolve redirect chains to find the final destination
   */
  private async resolveFinalDestination(
    path: string,
    visitedPaths: string[],
    maxDepth = 5
  ): Promise<string> {
    // Prevent infinite loops
    if (visitedPaths.length >= maxDepth || visitedPaths.includes(path)) {
      console.warn(`Redirect chain detected or max depth reached for path: ${path}`);
      return path;
    }

    // Check if this path is also a redirect source
    const nextRedirect = await this.prisma.blogRedirect.findUnique({
      where: {
        sourcePath: path,
        isActive: true,
      },
    });

    if (!nextRedirect || (nextRedirect.expiresAt && nextRedirect.expiresAt < new Date())) {
      return path; // No further redirect or expired
    }

    // Continue following the chain
    return this.resolveFinalDestination(
      nextRedirect.destinationPath,
      [...visitedPaths, path],
      maxDepth
    );
  }

  /**
   * Validate a redirect mapping
   */
  private async validateRedirect(
    sourcePath: string,
    destinationPath: string
  ): Promise<RedirectValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!sourcePath || !destinationPath) {
      errors.push('Source and destination paths are required');
    }

    if (sourcePath === destinationPath) {
      errors.push('Source and destination paths cannot be the same');
    }

    // Path format validation
    if (sourcePath && !sourcePath.startsWith('/')) {
      errors.push('Source path must start with /');
    }

    if (destinationPath && !destinationPath.startsWith('/')) {
      errors.push('Destination path must start with /');
    }

    // Check for redirect loops
    if (sourcePath && destinationPath) {
      const wouldCreateLoop = await this.wouldCreateRedirectLoop(sourcePath, destinationPath);
      if (wouldCreateLoop) {
        errors.push('This redirect would create a loop');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if creating a redirect would cause a loop
   */
  private async wouldCreateRedirectLoop(
    newSourcePath: string,
    newDestinationPath: string
  ): Promise<boolean> {
    try {
      // Follow the chain from the new destination to see if it leads back to the new source
      const finalDestination = await this.resolveFinalDestination(
        newDestinationPath,
        [newSourcePath]
      );
      
      return finalDestination === newSourcePath;
    } catch (error) {
      console.error('Error checking for redirect loop:', error);
      return false; // Assume no loop on error
    }
  }

  /**
   * Get all active redirects with pagination
   */
  async getRedirects(options: {
    page?: number;
    limit?: number;
    includeExpired?: boolean;
  } = {}) {
    const { page = 1, limit = 50, includeExpired = false } = options;
    const skip = (page - 1) * limit;

    const where = includeExpired 
      ? {} 
      : { 
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        };

    const [redirects, total] = await Promise.all([
      this.prisma.blogRedirect.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blogRedirect.count({ where }),
    ]);

    return {
      redirects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete a redirect
   */
  async deleteRedirect(redirectId: string): Promise<void> {
    try {
      await this.prisma.blogRedirect.update({
        where: { id: redirectId },
        data: { isActive: false },
      });
      
      console.log(`Deactivated redirect: ${redirectId}`);
    } catch (error) {
      console.error('Error deleting redirect:', error);
      throw new Error('Failed to delete redirect');
    }
  }

  /**
   * Clean up old redirects based on age and hit count
   */
  async cleanupOldRedirects(options: {
    olderThanDays?: number;
    maxHitCount?: number;
    dryRun?: boolean;
  } = {}) {
    const { olderThanDays = 365, maxHitCount = 0, dryRun = false } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const redirectsToCleanup = await this.prisma.blogRedirect.findMany({
      where: {
        isActive: true,
        createdAt: { lt: cutoffDate },
        hitCount: { lte: maxHitCount },
      },
      select: {
        id: true,
        sourcePath: true,
        destinationPath: true,
        hitCount: true,
        createdAt: true,
      },
    });

    console.log(`Found ${redirectsToCleanup.length} redirects for cleanup`);

    if (!dryRun && redirectsToCleanup.length > 0) {
      await this.prisma.blogRedirect.updateMany({
        where: {
          id: { in: redirectsToCleanup.map(r => r.id) },
        },
        data: { isActive: false },
      });
      
      console.log(`Cleaned up ${redirectsToCleanup.length} old redirects`);
    }

    return redirectsToCleanup;
  }
}
