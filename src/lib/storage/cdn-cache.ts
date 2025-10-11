/**
 * CDN Cache Management for Cloudflare R2
 * 
 * Utilities for managing CDN cache, including cache purging and warming
 */

/**
 * Cloudflare cache purge options
 */
export interface CachePurgeOptions {
  files?: string[] // Specific file URLs to purge
  tags?: string[] // Cache tags to purge
  hosts?: string[] // Hostnames to purge
  prefixes?: string[] // URL prefixes to purge
}

/**
 * Purge CDN cache for specific files or patterns
 * 
 * NOTE: Requires Cloudflare API token with cache purge permissions
 * Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in environment
 */
export async function purgeCDNCache(
  options: CachePurgeOptions
): Promise<{ success: boolean; purged: number; errors?: string[] }> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID

  if (!apiToken || !zoneId) {
    return {
      success: false,
      purged: 0,
      errors: [
        'Cloudflare API credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID',
      ],
    }
  }

  try {
    const purgeBody: any = {}

    if (options.files && options.files.length > 0) {
      purgeBody.files = options.files
    }

    if (options.tags && options.tags.length > 0) {
      purgeBody.tags = options.tags
    }

    if (options.hosts && options.hosts.length > 0) {
      purgeBody.hosts = options.hosts
    }

    if (options.prefixes && options.prefixes.length > 0) {
      purgeBody.prefixes = options.prefixes
    }

    // If no specific options provided, purge everything (use with caution!)
    if (Object.keys(purgeBody).length === 0) {
      purgeBody.purge_everything = true
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(purgeBody),
      }
    )

    const result = await response.json()

    if (!result.success) {
      return {
        success: false,
        purged: 0,
        errors: result.errors?.map((e: any) => e.message) || [
          'Unknown error',
        ],
      }
    }

    // Count purged items
    const purged =
      (options.files?.length || 0) +
      (options.tags?.length || 0) +
      (options.hosts?.length || 0) +
      (options.prefixes?.length || 0)

    return {
      success: true,
      purged: purged || 1, // 1 if purge_everything
    }
  } catch (error) {
    return {
      success: false,
      purged: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }
}

/**
 * Purge cache for specific asset and all its variants (thumbnails, previews)
 */
export async function purgeAssetCache(
  assetId: string,
  publicUrl?: string
): Promise<{ success: boolean; purged: number; errors?: string[] }> {
  const baseUrl = publicUrl || process.env.R2_PUBLIC_URL

  if (!baseUrl) {
    return {
      success: false,
      purged: 0,
      errors: ['R2_PUBLIC_URL not configured'],
    }
  }

  // Generate URLs for all asset variants
  const files = [
    `${baseUrl}/assets/${assetId}/original.*`, // Original file
    `${baseUrl}/assets/${assetId}/thumbnail_small.jpg`,
    `${baseUrl}/assets/${assetId}/thumbnail_medium.jpg`,
    `${baseUrl}/assets/${assetId}/thumbnail_large.jpg`,
    `${baseUrl}/assets/${assetId}/preview.*`,
  ]

  return purgeCDNCache({ files })
}

/**
 * Warm CDN cache by making requests to specific URLs
 * This ensures first user request is fast
 */
export async function warmCDNCache(urls: string[]): Promise<{
  success: boolean
  warmed: number
  failed: number
}> {
  let warmed = 0
  let failed = 0

  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        // HEAD request is sufficient to warm cache
        const response = await fetch(url, { method: 'HEAD' })
        if (response.ok) {
          warmed++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    })
  )

  return {
    success: failed === 0,
    warmed,
    failed,
  }
}

/**
 * Warm cache for asset thumbnails after generation
 */
export async function warmAssetCache(
  assetId: string,
  publicUrl?: string
): Promise<{ success: boolean; warmed: number; failed: number }> {
  const baseUrl = publicUrl || process.env.R2_PUBLIC_URL

  if (!baseUrl) {
    return { success: false, warmed: 0, failed: 0 }
  }

  const urls = [
    `${baseUrl}/assets/${assetId}/thumbnail_small.jpg`,
    `${baseUrl}/assets/${assetId}/thumbnail_medium.jpg`,
    `${baseUrl}/assets/${assetId}/thumbnail_large.jpg`,
  ]

  return warmCDNCache(urls)
}

/**
 * Get cache status for a URL
 */
export async function getCacheStatus(url: string): Promise<{
  cached: boolean
  age?: number
  expires?: Date
  cfCacheStatus?: string
}> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const headers = response.headers

    const cfCacheStatus = headers.get('cf-cache-status')
    const cacheControl = headers.get('cache-control')
    const age = headers.get('age')
    const expires = headers.get('expires')

    return {
      cached: cfCacheStatus === 'HIT',
      age: age ? parseInt(age, 10) : undefined,
      expires: expires ? new Date(expires) : undefined,
      cfCacheStatus: cfCacheStatus || undefined,
    }
  } catch (error) {
    return {
      cached: false,
    }
  }
}

/**
 * Configuration for cache control headers based on file type
 */
export const CACHE_CONTROL_CONFIGS = {
  immutable: 'public, max-age=31536000, immutable', // 1 year
  longTerm: 'public, max-age=2592000, immutable', // 30 days
  standard: 'public, max-age=604800', // 7 days
  short: 'public, max-age=86400', // 1 day
  noCache: 'no-store, no-cache, must-revalidate', // No caching
} as const

/**
 * Get recommended cache control header for a file path
 */
export function getRecommendedCacheControl(filePath: string): string {
  if (filePath.includes('/original.')) {
    return CACHE_CONTROL_CONFIGS.immutable
  }
  if (filePath.includes('thumbnail') || filePath.includes('preview')) {
    return CACHE_CONTROL_CONFIGS.longTerm
  }
  if (filePath.startsWith('temp/')) {
    return CACHE_CONTROL_CONFIGS.noCache
  }
  if (filePath.startsWith('documents/')) {
    return CACHE_CONTROL_CONFIGS.short
  }
  return CACHE_CONTROL_CONFIGS.standard
}
