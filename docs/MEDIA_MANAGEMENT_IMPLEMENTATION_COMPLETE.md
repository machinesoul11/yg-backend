# Media Management System Implementation

A comprehensive media management system for YesGoddess backend providing file upload, processing, organization, and delivery capabilities for internal staff and content management.

## 🏗️ Architecture Overview

The media management system is built following the existing project patterns and integrates seamlessly with the current infrastructure:

- **Database Layer**: PostgreSQL with Prisma ORM
- **Storage**: Cloudflare R2 with CDN integration  
- **Image Processing**: Sharp for optimization and variant generation
- **API**: tRPC with type-safe endpoints
- **Authentication**: NextAuth with role-based access control

## 📁 Module Structure

```
src/modules/media/
├── types.ts              # TypeScript interfaces and enums
├── validation.ts         # Zod validation schemas  
├── errors.ts             # Custom error classes
├── services/
│   └── MediaService.ts   # Core business logic
├── router.ts             # tRPC API endpoints
└── index.ts              # Module exports
```

## 🗃️ Database Schema

### Core Tables

- **`media_items`** - Core media files with metadata
- **`media_collections`** - Organizational containers for media
- **`media_collection_items`** - Many-to-many relationship table
- **`media_variants`** - Generated image variants (thumbnails, optimized formats)
- **`media_usage_tracking`** - Usage analytics and access logs
- **`media_bulk_operations`** - Batch operation management

### Key Features

- **Soft deletion** with `deletedAt` timestamp
- **File versioning** with variant generation
- **Access control** with granular permission levels
- **Usage tracking** for analytics and audit trails
- **Bulk operations** for administrative efficiency

## 🚀 Key Features

### File Upload & Processing

- **Multi-format support**: Images, videos, audio, documents, archives
- **Automatic optimization**: Image compression, format conversion (WebP, AVIF)
- **Variant generation**: Multiple sizes (thumbnail, small, medium, large)
- **Metadata extraction**: EXIF data, color analysis, dimensions
- **Storage integration**: Cloudflare R2 with CDN delivery

### Media Organization

- **Collections**: Manual and smart collections for grouping media
- **Tagging system**: Flexible tag-based organization
- **Search & filtering**: Full-text search across metadata
- **Categories**: Predefined categories (brand assets, marketing, templates, etc.)

### Access Control

- **Role-based permissions**: Admin, Creator, Brand, Viewer roles
- **Access levels**: Public, Internal, Admin-only, Restricted
- **Ownership model**: Users can manage their own uploads
- **Usage rights tracking**: Copyright and licensing information

### Administrative Tools

- **Bulk operations**: Delete, archive, update metadata, move collections
- **Usage analytics**: Download counts, access patterns, popular content
- **Storage metrics**: File size tracking, type breakdowns
- **Audit trails**: Complete usage and modification history

## 🔧 API Endpoints

### Upload & Management

```typescript
// Upload new media
uploadMedia(file: Buffer, metadata: UploadOptions): Promise<MediaUploadResponse>

// Get user's media items with filtering
getMediaItems(filters: SearchFilters, pagination): Promise<MediaListResponse>

// Get single media item with full details
getMediaItem(id: string): Promise<MediaItem>

// Update media metadata
updateMediaItem(id: string, updates: UpdateRequest): Promise<MediaItem>

// Soft delete media item
deleteMediaItem(id: string): Promise<{ success: boolean }>
```

### Collections

```typescript
// List all collections with pagination
getCollections(pagination): Promise<CollectionListResponse>

// Create new collection
createCollection(data: CreateCollectionRequest): Promise<MediaCollection>

// Add media to collection
addToCollection(mediaId: string, collectionId: string): Promise<void>

// Remove media from collection
removeFromCollection(mediaId: string, collectionId: string): Promise<void>
```

### Analytics & Admin

```typescript
// Get user's media statistics
getMediaStats(): Promise<MediaUsageStats>

// Admin: Get all media items across users
getAllMediaItems(filters: SearchFilters): Promise<MediaListResponse>

// Admin: Perform bulk operations
bulkOperation(operation: BulkOperationRequest): Promise<BulkOperationResponse>

// Admin: Check bulk operation status
getBulkOperationStatus(operationId: string): Promise<BulkOperationStatus>
```

## 🔗 Integration Points

### Existing Storage Infrastructure

The media system leverages existing storage components:

- **R2StorageProvider** (`src/lib/storage/r2-storage-provider.ts`)
- **Thumbnail Generator** (`src/lib/storage/thumbnail-generator.ts`) 
- **CDN Cache Management** (existing cache utilities)

### Authentication & Authorization

Integrates with existing auth system:

- **NextAuth sessions** for user identification
- **Role-based access control** using existing user roles
- **Security context** for row-level security

### Logging & Monitoring

Uses existing infrastructure:

- **Structured logging** with context
- **Error tracking** and reporting
- **Performance monitoring** for file operations

## 🛠️ Usage Examples

### Upload Media File

```typescript
import { mediaRouter } from '@/modules/media';

// Upload image with metadata
const result = await mediaRouter.uploadMedia({
  filename: 'brand-logo.png',
  mimeType: 'image/png',
  file: fileBuffer,
  title: 'Company Brand Logo',
  description: 'Primary brand logo for marketing materials',
  tags: ['logo', 'brand', 'marketing'],
  category: 'BRAND_ASSETS',
  generateVariants: true
});
```

### Search and Filter Media

```typescript
// Search with filters
const media = await mediaRouter.getMediaItems({
  page: 1,
  limit: 20,
  search: 'logo',
  type: 'IMAGE',
  tags: ['brand', 'marketing']
});
```

### Create and Manage Collections

```typescript
// Create marketing collection
const collection = await mediaRouter.createCollection({
  name: 'Q4 Marketing Campaign',
  description: 'Assets for quarterly marketing campaign',
  type: 'MANUAL',
  visibility: 'SHARED'
});

// Add media to collection
await mediaRouter.addToCollection({
  mediaItemId: 'media-123',
  collectionId: collection.id
});
```

### Bulk Operations (Admin)

```typescript
// Bulk archive old media
const operation = await mediaRouter.bulkOperation({
  name: 'Archive Q3 Campaign Assets',
  operationType: 'ARCHIVE',
  mediaItemIds: ['media-1', 'media-2', 'media-3'],
  parameters: {}
});

// Check operation status
const status = await mediaRouter.getBulkOperationStatus({
  operationId: operation.operationId
});
```

## 📝 Configuration

### Environment Variables

```env
# Cloudflare R2 Configuration (existing)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=your_public_url

# CDN Configuration
CDN_DOMAIN=https://your-cdn-domain.com

# Media Processing
MAX_FILE_SIZE=52428800  # 50MB
MAX_IMAGE_DIMENSION=4096
THUMBNAIL_SIZES=150,400,800,1200
```

### Media Constants

```typescript
export const MEDIA_CONSTANTS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_FILENAME_LENGTH: 255,
  MAX_TAGS: 20,
  SUPPORTED_MIME_TYPES: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/pdf', 'text/plain',
    'application/zip', 'application/x-rar-compressed'
  ]
};
```

## 🔒 Security Features

### File Validation

- **MIME type checking** against allowed types
- **File size limits** to prevent abuse
- **Filename sanitization** to prevent path traversal
- **Virus scanning** integration ready

### Access Control

- **Role-based permissions** for different user types
- **Ownership validation** for media operations
- **Access level enforcement** for viewing/downloading
- **Audit logging** for compliance

### Data Protection

- **Soft deletion** for data recovery
- **Encrypted storage** via Cloudflare R2
- **Secure URLs** with expiration for sensitive content
- **GDPR compliance** features

## 📊 Performance Optimizations

### Image Processing

- **Lazy variant generation** to reduce upload time
- **Progressive JPEG** for faster loading
- **WebP/AVIF conversion** for modern browsers
- **Responsive image sizes** for different devices

### Caching Strategy

- **CDN caching** for global distribution
- **Browser caching** with appropriate headers
- **Database query optimization** with proper indexing
- **Connection pooling** for database performance

### Storage Efficiency

- **Duplicate detection** to save storage space
- **Compression optimization** for file size reduction
- **Storage analytics** for capacity planning
- **Lifecycle policies** for old file cleanup

## 🧪 Testing Strategy

### Unit Tests

- Service layer business logic
- Validation schema enforcement
- Error handling scenarios
- File processing utilities

### Integration Tests

- tRPC endpoint functionality
- Database operations
- Storage provider integration
- Authentication flow

### Performance Tests

- File upload/download speed
- Concurrent operation handling
- Large file processing
- Database query performance

## 🚀 Deployment Considerations

### Database Migration

```bash
# Run Prisma migration to add media tables
npx prisma migrate dev --name add_media_management_tables

# Generate Prisma client with new models
npx prisma generate
```

### Storage Setup

1. Configure Cloudflare R2 bucket with proper CORS policies
2. Set up CDN with appropriate cache headers
3. Configure lifecycle rules for storage optimization
4. Set up monitoring and alerting for storage usage

### Monitoring

- **File upload success/failure rates**
- **Storage usage and costs**
- **Processing time metrics**
- **Error rates and types**
- **User adoption metrics**

## 🔄 Future Enhancements

### Planned Features

- **AI-powered tagging** using image recognition
- **Advanced search** with similarity matching
- **Collaborative workflows** with approval processes
- **API versioning** for external integrations
- **Mobile app support** with offline capabilities

### Scalability Improvements

- **Microservice architecture** for processing
- **Event-driven processing** with queues
- **Multi-region storage** for global users
- **Edge computing** for faster processing

---

## 🎯 Implementation Status

✅ **Completed:**
- Database schema design and migration
- Core service layer with business logic
- tRPC API endpoints with authentication
- File upload and processing pipeline
- Collection management system
- Basic search and filtering
- Bulk operation framework
- Error handling and logging

🚧 **In Progress:**
- Testing suite development
- Performance optimization
- Documentation completion

⏳ **Planned:**
- Admin dashboard interface
- Advanced analytics reporting
- External API for integrations
- Mobile-specific optimizations

This media management system provides a solid foundation for handling all media assets in the YesGoddess platform while maintaining the existing architecture patterns and security standards.
