/**
 * SEO Integration Service
 * Coordinates all SEO-related functionality for blog posts
 */

import { PrismaClient } from '@prisma/client';
import { SearchEngineSubmissionService } from './search-engine-submission.service';
import { BlogRedirectService } from './blog-redirect.service';

export interface SEOUpdateTrigger {
  type: 'post_published' | 'post_updated' | 'post_deleted' | 'slug_changed';
  postId?: string;
  oldSlug?: string;
  newSlug?: string;
  userId: string;
}

export class SEOIntegrationService {
  private searchEngineService: SearchEngineSubmissionService;
  private redirectService: BlogRedirectService;

  constructor(
    private prisma: PrismaClient,
    baseUrl?: string
  ) {
    this.searchEngineService = new SearchEngineSubmissionService(baseUrl);
    this.redirectService = new BlogRedirectService(prisma);
  }

  /**
   * Handle SEO updates triggered by blog content changes
   */
  async handleSEOUpdate(trigger: SEOUpdateTrigger): Promise<void> {
    console.log(`Processing SEO update for: ${trigger.type}`, trigger);

    try {
      switch (trigger.type) {
        case 'post_published':
          await this.handlePostPublished(trigger);
          break;
        
        case 'post_updated':
          await this.handlePostUpdated(trigger);
          break;
        
        case 'post_deleted':
          await this.handlePostDeleted(trigger);
          break;
        
        case 'slug_changed':
          await this.handleSlugChanged(trigger);
          break;
        
        default:
          console.warn(`Unknown SEO trigger type: ${trigger.type}`);
      }
    } catch (error) {
      console.error(`SEO update failed for ${trigger.type}:`, error);
      // Don't throw error as SEO operations shouldn't block main functionality
    }
  }

  /**
   * Handle post publication (submit sitemap)
   */
  private async handlePostPublished(trigger: SEOUpdateTrigger): Promise<void> {
    console.log(`📢 Post published, submitting sitemap to search engines`);
    
    // Submit sitemap with a small delay to ensure database consistency
    setTimeout(async () => {
      try {
        const result = await this.searchEngineService.submitToAllSearchEngines();
        console.log(`✅ Sitemap submission completed: ${result.successfulSubmissions}/${result.totalSubmissions} successful`);
      } catch (error) {
        console.error('❌ Sitemap submission failed:', error);
      }
    }, 2000); // 2 second delay
  }

  /**
   * Handle post updates (may need sitemap resubmission)
   */
  private async handlePostUpdated(trigger: SEOUpdateTrigger): Promise<void> {
    if (!trigger.postId) return;

    // Check if the updated post is published
    const post = await this.prisma.post.findUnique({
      where: { id: trigger.postId },
      select: { status: true, publishedAt: true },
    });

    if (post?.status === 'PUBLISHED') {
      console.log(`📝 Published post updated, submitting sitemap to search engines`);
      
      // Submit sitemap with delay
      setTimeout(async () => {
        try {
          const result = await this.searchEngineService.submitToAllSearchEngines();
          console.log(`✅ Sitemap submission completed: ${result.successfulSubmissions}/${result.totalSubmissions} successful`);
        } catch (error) {
          console.error('❌ Sitemap submission failed:', error);
        }
      }, 1000); // 1 second delay for updates
    }
  }

  /**
   * Handle post deletion (submit sitemap)
   */
  private async handlePostDeleted(trigger: SEOUpdateTrigger): Promise<void> {
    console.log(`🗑️ Post deleted, submitting sitemap to search engines`);
    
    // Submit sitemap with delay
    setTimeout(async () => {
      try {
        const result = await this.searchEngineService.submitToAllSearchEngines();
        console.log(`✅ Sitemap submission completed: ${result.successfulSubmissions}/${result.totalSubmissions} successful`);
      } catch (error) {
        console.error('❌ Sitemap submission failed:', error);
      }
    }, 1000);
  }

  /**
   * Handle slug changes (create redirects)
   */
  private async handleSlugChanged(trigger: SEOUpdateTrigger): Promise<void> {
    if (!trigger.oldSlug || !trigger.newSlug || !trigger.userId) {
      console.warn('Missing required data for slug change redirect');
      return;
    }

    console.log(`🔄 Slug changed: ${trigger.oldSlug} → ${trigger.newSlug}`);
    
    try {
      await this.redirectService.createSlugChangeRedirect(
        trigger.oldSlug,
        trigger.newSlug,
        trigger.userId
      );
      console.log(`✅ Redirect created successfully`);
    } catch (error) {
      console.error('❌ Failed to create redirect:', error);
    }
  }

  /**
   * Submit sitemap manually
   */
  async submitSitemap(): Promise<void> {
    console.log(`🚀 Manual sitemap submission initiated`);
    
    // Validate sitemap accessibility first
    const isAccessible = await this.searchEngineService.validateSitemapAccessibility();
    if (!isAccessible) {
      throw new Error('Sitemap is not accessible - submission aborted');
    }

    const result = await this.searchEngineService.submitToAllSearchEngines();
    
    if (result.failedSubmissions > 0) {
      console.warn(`⚠️ Some submissions failed: ${result.failedSubmissions}/${result.totalSubmissions}`);
      result.results.forEach(r => {
        if (!r.success) {
          console.error(`${r.searchEngine} submission failed:`, r.error);
        }
      });
    }

    console.log(`✅ Manual sitemap submission completed: ${result.successfulSubmissions}/${result.totalSubmissions} successful`);
  }

  /**
   * Get sitemap submission status
   */
  getSitemapUrl(): string {
    return this.searchEngineService.getSitemapUrl();
  }

  /**
   * Cleanup old redirects
   */
  async cleanupOldRedirects(options?: {
    olderThanDays?: number;
    maxHitCount?: number;
    dryRun?: boolean;
  }): Promise<void> {
    console.log(`🧹 Starting redirect cleanup`);
    
    const cleanedUp = await this.redirectService.cleanupOldRedirects(options);
    
    if (options?.dryRun) {
      console.log(`📋 Dry run: ${cleanedUp.length} redirects would be cleaned up`);
    } else {
      console.log(`✅ Cleaned up ${cleanedUp.length} old redirects`);
    }
  }

  /**
   * Get redirect statistics
   */
  async getRedirectStats(): Promise<{
    totalActive: number;
    totalExpired: number;
    totalHits: number;
    topRedirects: Array<{
      sourcePath: string;
      destinationPath: string;
      hitCount: number;
    }>;
  }> {
    const [activeCount, expiredCount, topRedirects, totalHits] = await Promise.all([
      this.prisma.blogRedirect.count({
        where: { 
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      }),
      this.prisma.blogRedirect.count({
        where: { 
          OR: [
            { isActive: false },
            { expiresAt: { lte: new Date() } }
          ]
        }
      }),
      this.prisma.blogRedirect.findMany({
        where: { isActive: true },
        select: {
          sourcePath: true,
          destinationPath: true,
          hitCount: true,
        },
        orderBy: { hitCount: 'desc' },
        take: 10,
      }),
      this.prisma.blogRedirect.aggregate({
        _sum: { hitCount: true },
        where: { isActive: true },
      }),
    ]);

    return {
      totalActive: activeCount,
      totalExpired: expiredCount,
      totalHits: totalHits._sum.hitCount || 0,
      topRedirects,
    };
  }
}

// Helper function to create SEO update triggers
export function createSEOTrigger(
  type: SEOUpdateTrigger['type'],
  userId: string,
  options?: {
    postId?: string;
    oldSlug?: string;
    newSlug?: string;
  }
): SEOUpdateTrigger {
  return {
    type,
    userId,
    ...options,
  };
}
