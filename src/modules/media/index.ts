/**
 * Media Management Module
 * 
 * Provides comprehensive media management capabilities including:
 * - File upload and storage
 * - Image optimization and variant generation
 * - Media library organization
 * - Collection management
 * - Bulk operations
 * - Usage tracking
 * - Access control
 */

export { mediaRouter } from './router';
export { MediaService } from './services/MediaService';

// Export main types
export type {
  MediaItem,
  MediaCollection,
  MediaStatus
} from './types';
