/**
 * Media Management Error Classes
 * 
 * Standardized error handling for media management operations
 */

import { MediaError } from './types';

export class MediaNotFoundError extends MediaError {
  constructor(mediaId: string) {
    super(
      'MEDIA_NOT_FOUND',
      `Media item with ID ${mediaId} not found`,
      404,
      { mediaId }
    );
  }
}

export class MediaAccessDeniedError extends MediaError {
  constructor(mediaId: string) {
    super(
      'MEDIA_ACCESS_DENIED',
      `Access denied to media item ${mediaId}`,
      403,
      { mediaId }
    );
  }
}

export class MediaUploadFailedError extends MediaError {
  constructor(reason: string) {
    super(
      'MEDIA_UPLOAD_FAILED',
      `Media upload failed: ${reason}`,
      400,
      { reason }
    );
  }
}

export class MediaFileTooLargeError extends MediaError {
  constructor(fileSize: number, maxSize: number) {
    super(
      'MEDIA_FILE_TOO_LARGE',
      `File size ${fileSize} bytes exceeds maximum allowed size of ${maxSize} bytes`,
      400,
      { fileSize, maxSize }
    );
  }
}

export class MediaInvalidFileTypeError extends MediaError {
  constructor(mimeType: string) {
    super(
      'MEDIA_INVALID_FILE_TYPE',
      `File type ${mimeType} is not supported`,
      400,
      { mimeType }
    );
  }
}

export class MediaDuplicateError extends MediaError {
  constructor(filename: string) {
    super(
      'MEDIA_DUPLICATE',
      `Media item with filename ${filename} already exists`,
      409,
      { filename }
    );
  }
}

export class MediaProcessingError extends MediaError {
  constructor(mediaId: string, stage: string, reason: string) {
    super(
      'MEDIA_PROCESSING_ERROR',
      `Failed to process media ${mediaId} at stage ${stage}: ${reason}`,
      500,
      { mediaId, stage, reason }
    );
  }
}

export class MediaInUseError extends MediaError {
  constructor(mediaId: string, usageCount: number) {
    super(
      'MEDIA_IN_USE',
      `Cannot delete media ${mediaId} as it is currently being used in ${usageCount} place(s)`,
      409,
      { mediaId, usageCount }
    );
  }
}

export class MediaCollectionNotFoundError extends MediaError {
  constructor(collectionId: string) {
    super(
      'COLLECTION_NOT_FOUND',
      `Media collection with ID ${collectionId} not found`,
      404,
      { collectionId }
    );
  }
}

export class MediaStorageError extends MediaError {
  constructor(operation: string, reason: string) {
    super(
      'MEDIA_STORAGE_ERROR',
      `Storage operation ${operation} failed: ${reason}`,
      500,
      { operation, reason }
    );
  }
}

export class MediaValidationError extends MediaError {
  constructor(field: string, reason: string) {
    super(
      'MEDIA_VALIDATION_ERROR',
      `Validation failed for ${field}: ${reason}`,
      400,
      { field, reason }
    );
  }
}

export class MediaQuotaExceededError extends MediaError {
  constructor(currentUsage: number, limit: number) {
    super(
      'MEDIA_QUOTA_EXCEEDED',
      `Storage quota exceeded. Current usage: ${currentUsage}MB, Limit: ${limit}MB`,
      400,
      { currentUsage, limit }
    );
  }
}

// Factory class for creating media errors
export class MediaErrors {
  static notFound(mediaId: string): MediaNotFoundError {
    return new MediaNotFoundError(mediaId);
  }

  static accessDenied(mediaId: string): MediaAccessDeniedError {
    return new MediaAccessDeniedError(mediaId);
  }

  static uploadFailed(reason: string): MediaUploadFailedError {
    return new MediaUploadFailedError(reason);
  }

  static fileTooLarge(fileSize: number, maxSize: number): MediaFileTooLargeError {
    return new MediaFileTooLargeError(fileSize, maxSize);
  }

  static invalidFileType(mimeType: string): MediaInvalidFileTypeError {
    return new MediaInvalidFileTypeError(mimeType);
  }

  static duplicate(filename: string): MediaDuplicateError {
    return new MediaDuplicateError(filename);
  }

  static processingError(mediaId: string, stage: string, reason: string): MediaProcessingError {
    return new MediaProcessingError(mediaId, stage, reason);
  }

  static inUse(mediaId: string, usageCount: number): MediaInUseError {
    return new MediaInUseError(mediaId, usageCount);
  }

  static collectionNotFound(collectionId: string): MediaCollectionNotFoundError {
    return new MediaCollectionNotFoundError(collectionId);
  }

  static storageError(operation: string, reason: string): MediaStorageError {
    return new MediaStorageError(operation, reason);
  }

  static validationError(field: string, reason: string): MediaValidationError {
    return new MediaValidationError(field, reason);
  }

  static quotaExceeded(currentUsage: number, limit: number): MediaQuotaExceededError {
    return new MediaQuotaExceededError(currentUsage, limit);
  }
}

// Helper function to map media errors to tRPC error codes
export function mapMediaErrorToTRPCCode(error: MediaError): string {
  switch (error.code) {
    case 'MEDIA_NOT_FOUND':
    case 'COLLECTION_NOT_FOUND':
      return 'NOT_FOUND';
    case 'MEDIA_ACCESS_DENIED':
      return 'FORBIDDEN';
    case 'MEDIA_VALIDATION_ERROR':
    case 'MEDIA_UPLOAD_FAILED':
    case 'MEDIA_FILE_TOO_LARGE':
    case 'MEDIA_INVALID_FILE_TYPE':
    case 'MEDIA_QUOTA_EXCEEDED':
      return 'BAD_REQUEST';
    case 'MEDIA_DUPLICATE':
    case 'MEDIA_IN_USE':
      return 'CONFLICT';
    case 'MEDIA_PROCESSING_ERROR':
    case 'MEDIA_STORAGE_ERROR':
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}
