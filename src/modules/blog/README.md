# Blog Module

> Complete content management system for YesGoddess blog articles and categories

## Overview

The Blog module provides a comprehensive content management system with hierarchical categories, revision tracking, full-text search capabilities, and SEO optimization features. Built specifically for the YesGoddess admin backend platform.

## Features

### ✅ Content Management
- **Posts**: Create, update, delete, and manage blog posts
- **Categories**: Hierarchical category system with parent-child relationships
- **Revisions**: Complete version history with author tracking
- **Status Workflow**: Draft → Published → Scheduled → Archived
- **Soft Deletion**: Posts can be soft deleted and restored

### ✅ SEO Optimization
- **Custom SEO Fields**: Title, description, and keywords
- **Automatic Slug Generation**: URL-friendly slugs with uniqueness validation
- **Meta Tag Support**: Open Graph and Twitter Card ready
- **Search Engine Friendly**: Optimized for crawling and indexing

### ✅ Rich Features
- **Read Time Calculation**: Automatic estimation based on word count
- **Tag System**: Flexible JSONB-based tagging
- **Featured Images**: Support for featured post images
- **Excerpt Generation**: Automatic excerpt creation from content
- **View Tracking**: Post view count analytics

### ✅ Search & Filtering
- **Full-Text Search**: PostgreSQL-powered search across title, content, and excerpt
- **Advanced Filtering**: Filter by status, author, category, tags, dates
- **Hierarchical Browsing**: Navigate through category hierarchies
- **Pagination Support**: Efficient pagination for large datasets

### ✅ Editorial Workflow
- **Scheduling**: Schedule posts for future publication
- **Draft System**: Work on drafts before publishing
- **Revision History**: Track all changes with notes
- **Author Attribution**: Track post authors and revision creators

## Database Schema

### Posts Table
- **Core Fields**: id, title, slug, content, excerpt, author_id
- **SEO Fields**: seo_title, seo_description, seo_keywords, featured_image_url
- **Status Fields**: status, published_at, scheduled_for
- **Metadata**: read_time_minutes, view_count, tags (JSONB)
- **Timestamps**: created_at, updated_at, deleted_at

### Categories Table
- **Core Fields**: id, name, slug, description
- **Hierarchy**: parent_category_id (self-referencing)
- **Display**: display_order, is_active
- **Timestamps**: created_at, updated_at

### Post Revisions Table
- **Core Fields**: id, post_id, content, author_id
- **Metadata**: revision_note, created_at
- **Purpose**: Complete audit trail of content changes

## API Endpoints

### Categories
- `POST /categories` - Create new category
- `GET /categories` - List categories with filtering
- `GET /categories/:id` - Get category details
- `PUT /categories/:id` - Update category
- `DELETE /categories/:id` - Delete category

### Posts
- `POST /posts` - Create new post
- `GET /posts` - List posts with filtering and search
- `GET /posts/:id` - Get post details
- `GET /posts/slug/:slug` - Get post by slug
- `PUT /posts/:id` - Update post
- `DELETE /posts/:id` - Delete/soft delete post
- `POST /posts/:id/restore` - Restore soft deleted post

### Revisions
- `GET /posts/:id/revisions` - Get post revision history
- `POST /posts/:id/revisions` - Create new revision
- `POST /revisions/:id/restore` - Restore from specific revision

### Search & Analytics
- `GET /posts/search` - Full-text search across posts
- `GET /posts/:id/analytics` - Get post performance metrics
- `GET /categories/:id/analytics` - Get category statistics

## Status Workflow

```
DRAFT → PUBLISHED (immediate publication)
  ↓         ↓
SCHEDULED → PUBLISHED (automatic at scheduled time)
  ↓         ↓
ARCHIVED ←  ARCHIVED (manual archival)
```

### Status Descriptions
- **DRAFT**: Work in progress, not visible to public
- **PUBLISHED**: Live and visible to readers
- **SCHEDULED**: Approved for future publication
- **ARCHIVED**: Removed from active display but preserved

## Permissions & Security

### Role-Based Access
- **ADMIN**: Full access to all posts and categories
- **CREATOR**: Can manage their own posts, view published posts
- **VIEWER**: Read-only access to published content

### Row-Level Security
- Authors can only access their own drafts
- Published posts are readable by all authenticated users
- Admins have unrestricted access with audit logging

## Performance Features

### Indexing Strategy
- **Slug Indexes**: Fast lookup for URL routing
- **Status Indexes**: Efficient filtering by publication status
- **Full-Text Indexes**: GIN indexes for search functionality
- **Composite Indexes**: Optimized for common query patterns
- **JSONB Indexes**: Efficient tag-based filtering

### Caching
- Category hierarchies cached for fast navigation
- Popular posts cached to reduce database load
- Search results cached with appropriate TTL

## Integration Points

### Email System
- **Publication Notifications**: Notify subscribers of new posts
- **Editorial Workflow**: Notify editors of status changes
- **Comment Notifications**: Alert authors of comments (future)

### Analytics System
- **View Tracking**: Record post views and engagement
- **Performance Metrics**: Track reading time and completion rates
- **Popular Content**: Identify trending posts and categories

### Asset Management
- **Featured Images**: Integration with IP Assets module
- **Content Images**: Support for inline image references
- **Media Library**: Access to uploaded media files

## Usage Examples

### Creating a Blog Post

```typescript
import { BlogService } from '@/modules/blog';

const blogService = new BlogService(prisma);

const post = await blogService.createPost({
  title: "Getting Started with IP Licensing",
  content: "In this comprehensive guide...",
  categoryId: "creator-education",
  status: "DRAFT",
  tags: ["licensing", "education", "getting-started"],
  seoTitle: "IP Licensing Guide for Creators",
  seoDescription: "Learn the fundamentals of intellectual property licensing for creative professionals.",
}, authorId);
```

### Publishing a Scheduled Post

```typescript
const publishedPost = await blogService.updatePost(postId, {
  status: "PUBLISHED",
  publishedAt: new Date(),
}, authorId);
```

### Managing Categories

```typescript
const category = await blogService.createCategory({
  name: "Creator Education",
  description: "Educational content for creators",
  parentCategoryId: "education",
  displayOrder: 1,
}, adminId);
```

## Configuration

### Environment Variables
```env
# Database (required)
DATABASE_URL=postgresql://...
DATABASE_URL_POOLED=postgresql://...

# Search Configuration
BLOG_SEARCH_ENABLED=true
BLOG_SEARCH_MIN_CHARS=3
BLOG_MAX_SEARCH_RESULTS=50

# Content Limits
BLOG_MAX_TITLE_LENGTH=500
BLOG_MAX_CONTENT_LENGTH=100000
BLOG_MAX_EXCERPT_LENGTH=1000
BLOG_MAX_TAGS_COUNT=20

# SEO Configuration
BLOG_DEFAULT_READ_WPM=200
BLOG_AUTO_GENERATE_EXCERPTS=true
BLOG_AUTO_GENERATE_SEO=true
```

### Default Settings
- **Reading Speed**: 200 words per minute
- **Excerpt Length**: 160 characters
- **SEO Title Length**: 60 characters
- **SEO Description Length**: 155 characters
- **Maximum Tags**: 20 per post

## Testing

### Unit Tests
- Service layer validation and business logic
- Utility functions for slug generation and read time
- Error handling and edge cases

### Integration Tests
- Database operations and transactions
- Full workflow testing (create → publish → archive)
- Search functionality and performance

### Performance Tests
- Large dataset operations
- Search response times
- Category hierarchy traversal

## Monitoring & Analytics

### Key Metrics
- **Post Performance**: Views, read time, engagement
- **Category Usage**: Post distribution, popularity
- **Author Activity**: Publication frequency, revision patterns
- **Search Analytics**: Query patterns, result relevance

### Health Checks
- Database connectivity and performance
- Search index status and freshness
- Cache hit rates and response times
- Background job processing (scheduled posts)

## Future Enhancements

### Phase 2 Features
- **Comment System**: Reader engagement and moderation
- **Social Media Integration**: Auto-posting to social platforms
- **Advanced Analytics**: Heat maps, scroll tracking, A/B testing
- **Content Recommendations**: Related posts and personalization

### Phase 3 Features
- **Multi-language Support**: Internationalization and localization
- **Advanced Editor**: Rich text editing with live preview
- **Collaboration Tools**: Multi-author workflows and approvals
- **Advanced SEO**: Schema markup, automatic meta tags

## Support & Documentation

### Related Documentation
- [Database Schema](../../docs/blog/schema.md)
- [API Reference](../../docs/blog/api.md)
- [Frontend Integration](../../docs/blog/frontend.md)
- [Migration Guide](../../docs/blog/migration.md)

### Troubleshooting
- [Common Issues](../../docs/blog/troubleshooting.md)
- [Performance Optimization](../../docs/blog/performance.md)
- [Error Codes](../../docs/blog/errors.md)

---

**Module Status**: ✅ Complete - Production Ready  
**Version**: 1.0.0  
**Last Updated**: October 15, 2025  
**Maintained By**: Backend Team
