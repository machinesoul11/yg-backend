import { AssetStatus } from '@prisma/client';
import { IpAssetError } from './types';

/**
 * IP Assets Error Definitions
 * 
 * Consistent error handling for the IP Assets module
 */

export const AssetErrors = {
  notFound: (assetId: string) => new IpAssetError(
    'ASSET_NOT_FOUND',
    `Asset with ID ${assetId} not found`,
    404
  ),
  
  uploadFailed: (reason: string) => new IpAssetError(
    'ASSET_UPLOAD_FAILED',
    `Upload failed: ${reason}`,
    500,
    { reason }
  ),
  
  invalidStatus: (current: AssetStatus, attempted: AssetStatus) => new IpAssetError(
    'ASSET_INVALID_STATUS_TRANSITION',
    `Cannot transition from ${current} to ${attempted}`,
    400,
    { current, attempted }
  ),
  
  hasActiveLicenses: (assetId: string) => new IpAssetError(
    'ASSET_HAS_ACTIVE_LICENSES',
    `Cannot delete asset ${assetId} with active licenses`,
    409
  ),
  
  virusDetected: (assetId: string) => new IpAssetError(
    'ASSET_VIRUS_DETECTED',
    `Asset ${assetId} failed virus scan`,
    400
  ),
  
  accessDenied: (assetId: string) => new IpAssetError(
    'ASSET_ACCESS_DENIED',
    `You do not have permission to access asset ${assetId}`,
    403
  ),
  
  alreadyDeleted: (assetId: string) => new IpAssetError(
    'ASSET_ALREADY_DELETED',
    `Asset ${assetId} has already been deleted`,
    410
  ),
  
  invalidFileType: (mimeType: string) => new IpAssetError(
    'ASSET_INVALID_FILE_TYPE',
    `File type ${mimeType} is not supported`,
    400,
    { mimeType }
  ),
  
  fileSizeTooLarge: (size: number, maxSize: number) => new IpAssetError(
    'ASSET_FILE_TOO_LARGE',
    `File size ${size} bytes exceeds maximum ${maxSize} bytes`,
    400,
    { size, maxSize }
  ),
  
  storageError: (operation: string, details: any) => new IpAssetError(
    'ASSET_STORAGE_ERROR',
    `Storage operation failed: ${operation}`,
    500,
    { operation, details }
  ),
  
  processingFailed: (operation: string, reason: string) => new IpAssetError(
    'ASSET_PROCESSING_FAILED',
    `Asset processing failed during ${operation}: ${reason}`,
    500,
    { operation, reason }
  ),
  
  invalidMetadata: (field: string, reason: string) => new IpAssetError(
    'ASSET_INVALID_METADATA',
    `Invalid metadata field ${field}: ${reason}`,
    400,
    { field, reason }
  ),
};

/**
 * Map IpAssetError to tRPC error
 */
export function mapAssetErrorToTRPCCode(error: IpAssetError): string {
  switch (error.statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 410:
      return 'NOT_FOUND';
    case 500:
      return 'INTERNAL_SERVER_ERROR';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}
