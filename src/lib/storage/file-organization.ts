/**
 * File Organization Structure
 * 
 * Provides utilities for organizing files in a scalable, logical hierarchy
 * within the storage bucket.
 */

import { customAlphabet } from 'nanoid';
import { sanitizeFilename } from '../utils/storage';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 21);

/**
 * Environment prefix for multi-tenancy
 */
export function getEnvironmentPrefix(): string {
  const env = process.env.NODE_ENV || 'development';
  const appEnv = process.env.APP_ENV || env;
  return env === 'production' ? 'prod' : appEnv === 'staging' ? 'staging' : 'dev';
}

/**
 * Asset types for organization
 */
export type OrganizedAssetType = 
  | 'image' 
  | 'video' 
  | 'document' 
  | 'audio' 
  | 'thumbnail' 
  | 'preview' 
  | 'temp';

/**
 * Path construction options
 */
export interface PathConstructionOptions {
  environment?: string;
  brandId?: string;
  projectId?: string;
  assetType: OrganizedAssetType;
  assetId?: string;
  filename?: string;
  variant?: string;
}

/**
 * Path components extracted from a storage key
 */
export interface PathComponents {
  environment?: string;
  brandId?: string;
  projectId?: string;
  assetType?: string;
  year?: string;
  month?: string;
  assetId?: string;
  filename?: string;
  variant?: string;
}

/**
 * Constructs a properly organized storage path
 * 
 * Pattern: {environment}/{brand-id}/{project-id}/{asset-type}/{year}/{month}/{uuid-filename}
 * 
 * @example
 * constructStoragePath({
 *   brandId: 'brand_123',
 *   projectId: 'proj_456',
 *   assetType: 'image',
 *   assetId: 'asset_789',
 *   filename: 'photo.jpg'
 * })
 * // Returns: "prod/brand_123/proj_456/image/2025/10/asset_789_photo.jpg"
 */
export function constructStoragePath(options: PathConstructionOptions): string {
  const {
    environment = getEnvironmentPrefix(),
    brandId,
    projectId,
    assetType,
    assetId,
    filename,
    variant,
  } = options;

  // Validate required parameters
  if (!assetType) {
    throw new Error('assetType is required for path construction');
  }

  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');

  const pathParts: string[] = [environment];

  // Add organizational hierarchy
  if (brandId) {
    pathParts.push(sanitizePathComponent(brandId));
  }
  if (projectId) {
    pathParts.push(sanitizePathComponent(projectId));
  }

  // Add asset type
  pathParts.push(assetType);

  // Add date components for time-based organization
  pathParts.push(year, month);

  // Add filename with asset ID prefix
  if (assetId && filename) {
    const sanitized = sanitizeFilename(filename);
    const finalFilename = variant
      ? `${assetId}_${variant}_${sanitized}`
      : `${assetId}_${sanitized}`;
    pathParts.push(finalFilename);
  } else if (filename) {
    pathParts.push(sanitizeFilename(filename));
  }

  return pathParts.join('/');
}

/**
 * Constructs a legacy-compatible storage path (for backward compatibility)
 * Pattern: assets/{assetId}/{filename}
 */
export function constructLegacyPath(assetId: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  return `assets/${assetId}/${sanitized}`;
}

/**
 * Decomposes a storage key back into its constituent parts
 * 
 * @example
 * decomposeStoragePath("prod/brand_123/proj_456/image/2025/10/asset_789_photo.jpg")
 * // Returns: { environment: 'prod', brandId: 'brand_123', ... }
 */
export function decomposeStoragePath(key: string): PathComponents {
  const parts = key.split('/');
  const components: PathComponents = {};

  // Handle legacy format: assets/{assetId}/{filename}
  if (parts[0] === 'assets' && parts.length === 3) {
    components.assetId = parts[1];
    components.filename = parts[2];
    return components;
  }

  // Handle organized format
  let index = 0;

  // Environment (if present)
  if (['dev', 'staging', 'prod'].includes(parts[0])) {
    components.environment = parts[index++];
  }

  // Brand ID (if looks like an ID)
  if (parts[index]?.startsWith('brand_') || parts[index]?.match(/^[a-z0-9]{20,}/)) {
    components.brandId = parts[index++];
  }

  // Project ID (if looks like an ID)
  if (parts[index]?.startsWith('proj_') || parts[index]?.startsWith('project_')) {
    components.projectId = parts[index++];
  }

  // Asset type
  const assetTypes = ['image', 'video', 'document', 'audio', 'thumbnail', 'preview', 'temp'];
  if (parts[index] && assetTypes.includes(parts[index])) {
    components.assetType = parts[index++];
  }

  // Year (if numeric and 4 digits)
  if (parts[index]?.match(/^\d{4}$/)) {
    components.year = parts[index++];
  }

  // Month (if numeric and 2 digits)
  if (parts[index]?.match(/^\d{2}$/)) {
    components.month = parts[index++];
  }

  // Filename (last component)
  if (parts[index]) {
    const filename = parts[index];
    components.filename = filename;

    // Extract asset ID if present (format: assetId_filename or assetId_variant_filename)
    const underscoreIndex = filename.indexOf('_');
    if (underscoreIndex > 0) {
      const potentialAssetId = filename.substring(0, underscoreIndex);
      if (potentialAssetId.length >= 20) {
        components.assetId = potentialAssetId;

        // Check for variant
        const remainingParts = filename.substring(underscoreIndex + 1).split('_');
        if (remainingParts.length > 1 && 
            ['thumb', 'preview', 'small', 'medium', 'large'].includes(remainingParts[0])) {
          components.variant = remainingParts[0];
        }
      }
    }
  }

  return components;
}

/**
 * Sanitizes a path component to prevent issues
 */
function sanitizePathComponent(component: string): string {
  // Remove any characters that could cause path traversal or other issues
  return component
    .replace(/\.\./g, '')
    .replace(/[\/\\]/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Validates a storage path for security and correctness
 */
export function validateStoragePath(path: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!path || path.length === 0) {
    errors.push('Storage path cannot be empty');
  }

  if (path.includes('..')) {
    errors.push('Storage path cannot contain path traversal sequences (..)');
  }

  if (path.length > 1024) {
    errors.push('Storage path too long (max 1024 characters)');
  }

  if (path.startsWith('/') || path.endsWith('/')) {
    errors.push('Storage path should not start or end with /');
  }

  // Check for invalid characters
  const invalidChars = ['\\', '<', '>', '"', '|', '\0', '\n', '\r'];
  for (const char of invalidChars) {
    if (path.includes(char)) {
      errors.push(`Storage path contains invalid character: ${char}`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a complete storage path for a new asset
 */
export function generateAssetStoragePath(options: {
  brandId?: string;
  projectId?: string;
  assetType: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'AUDIO';
  filename: string;
}): { path: string; assetId: string } {
  const assetId = nanoid();
  const organizedType = options.assetType.toLowerCase() as OrganizedAssetType;

  const path = constructStoragePath({
    brandId: options.brandId,
    projectId: options.projectId,
    assetType: organizedType,
    assetId,
    filename: options.filename,
  });

  return { path, assetId };
}

/**
 * Generates variant paths for thumbnails and previews
 */
export function generateVariantPaths(
  basePath: string,
  variants: Array<'thumb_small' | 'thumb_medium' | 'thumb_large' | 'preview'>
): Record<string, string> {
  const components = decomposeStoragePath(basePath);
  const paths: Record<string, string> = {};

  if (!components.assetId) {
    throw new Error('Cannot generate variant paths without asset ID');
  }

  for (const variant of variants) {
    // Remove the original filename
    const pathWithoutFilename = basePath.substring(0, basePath.lastIndexOf('/'));
    const extension = variant === 'preview' ? 'jpg' : 'jpg';
    paths[variant] = `${pathWithoutFilename}/${components.assetId}_${variant}.${extension}`;
  }

  return paths;
}

/**
 * Configuration for path patterns
 */
export const PATH_PATTERNS = {
  ORGANIZED: '{env}/{brand}/{project}/{type}/{year}/{month}/{assetId}_{filename}',
  LEGACY: 'assets/{assetId}/{filename}',
  TEMP: 'temp/{uuid}_{filename}',
  THUMBNAIL: '{basePath}/{assetId}_thumb_{size}.jpg',
  PREVIEW: '{basePath}/{assetId}_preview.{ext}',
} as const;

/**
 * Documentation for path structure
 */
export const PATH_DOCUMENTATION = {
  environment: 'Environment prefix (dev/staging/prod) for multi-tenancy',
  brandId: 'Brand identifier for organizational separation',
  projectId: 'Project identifier for grouping related assets',
  assetType: 'Type of asset (image/video/document/audio/thumbnail/preview/temp)',
  year: 'Year of upload for time-based organization (YYYY)',
  month: 'Month of upload for time-based organization (MM)',
  assetId: 'Unique asset identifier (21-character nanoid)',
  filename: 'Sanitized original filename',
  variant: 'Asset variant (thumb_small, thumb_medium, thumb_large, preview)',
} as const;
