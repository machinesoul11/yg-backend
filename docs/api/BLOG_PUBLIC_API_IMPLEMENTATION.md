# Blog Public API Implementation

## Overview

Four new public REST API endpoints have been implemented for the blog system, providing public access to published blog content. These endpoints complement the existing tRPC blog router by offering RESTful access for external integrations, RSS readers, search engines, and frontend applications.

## Implemented Endpoints

### 1. GET /api/blog/posts - Public Blog Posts Listing

**Purpose**: Returns a paginated list of published blog posts with filtering and sorting capabilities.

**Features**:
- Pagination (default: 10 posts per page, max: 50)
- Category filtering by slug
- Tag filtering
- Full-text search across title, excerpt, and content
- Sorting by newest, oldest, popular (view count), or featured
- Only returns published posts with `publishedAt` <= current time
- Includes author and category information
- Public response format optimized for frontend consumption

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Posts per page (default: 10, max: 50)
- `category` (optional): Category slug for filtering
- `tag` (optional): Tag name for filtering
- `search` (optional): Search query string
- `sort` (optional): Sort order - `newest`, `oldest`, `popular`, `featured` (default: `newest`)

**Response Format**:
```json
{
  "data": [
    {
      "id": "post_id",
      "title": "Post Title",
      "slug": "post-slug",
      "excerpt": "Post excerpt...",
      "featured_image_url": "https://...",
      "published_at": "2025-01-01T12:00:00.000Z",
      "read_time_minutes": 5,
      "view_count": 142,
      "is_featured": false,
      "tags": ["tag1", "tag2"],
      "author": {
        "name": "Author Name",
        "avatar": "https://..."
      },
      "category": {
        "name": "Category Name",
        "slug": "category-slug"
      }
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 5,
    "total_posts": 47,
    "page_size": 10,
    "has_next_page": true,
    "has_previous_page": false
  },
  "filters": {
    "category": null,
    "tag": null,
    "search": null,
    "sort": "newest"
  }
}
```

**Caching**: 5 minutes public cache with 10 minutes stale-while-revalidate

### 2. GET /api/blog/posts/[slug] - Individual Blog Post

**Purpose**: Returns complete details of a single published blog post by its slug.

**Features**:
- Full post content including SEO metadata
- Automatic view count increment
- Related posts based on category and tags
- Only returns published posts
- ETag header for conditional requests
- Rich author and category information

**Response Format**:
```json
{
  "success": true,
  "data": {
    "id": "post_id",
    "title": "Post Title",
    "slug": "post-slug",
    "content": "Full HTML content...",
    "excerpt": "Post excerpt...",
    "featured_image_url": "https://...",
    "published_at": "2025-01-01T12:00:00.000Z",
    "read_time_minutes": 5,
    "view_count": 143,
    "is_featured": false,
    "tags": ["tag1", "tag2"],
    "author": {
      "id": "author_id",
      "name": "Author Name",
      "avatar": "https://..."
    },
    "category": {
      "id": "category_id",
      "name": "Category Name",
      "slug": "category-slug",
      "description": "Category description"
    },
    "seo": {
      "title": "SEO optimized title",
      "description": "SEO description",
      "keywords": "keyword1, keyword2"
    },
    "related_posts": [
      {
        "id": "related_post_id",
        "title": "Related Post",
        "slug": "related-post-slug",
        "excerpt": "Related post excerpt...",
        "featured_image_url": "https://...",
        "published_at": "2025-01-01T10:00:00.000Z"
      }
    ]
  }
}
```

**Caching**: 30 minutes public cache with 1 hour stale-while-revalidate, includes ETag header

### 3. GET /api/blog/sitemap.xml - Blog Sitemap

**Purpose**: Generates an XML sitemap following the sitemaps.org protocol for search engine optimization.

**Features**:
- Includes all published blog posts
- Includes active category pages
- Includes blog homepage
- Proper lastmod dates and change frequencies
- SEO-optimized priority values
- Automatic URL generation based on environment

**XML Structure**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://domain.com/blog</loc>
    <lastmod>2025-01-15</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://domain.com/blog/post-slug</loc>
    <lastmod>2025-01-15</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- More URLs... -->
</urlset>
```

**Caching**: 24 hours public cache with 48 hours stale-while-revalidate

### 4. GET /api/blog/rss.xml - RSS Feed

**Purpose**: Generates an RSS 2.0 feed for blog subscription and syndication.

**Features**:
- RSS 2.0 compliant format
- Includes 50 most recent published posts
- Full HTML content in CDATA sections
- Proper author attribution
- Category and tag mapping
- Blog metadata and branding
- Optimized for RSS readers and aggregators

**RSS Structure**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>YES GODDESS Blog</title>
    <link>https://domain.com/blog</link>
    <description>Latest insights, updates, and stories...</description>
    <language>en-us</language>
    <!-- Channel metadata... -->
    <item>
      <title>Post Title</title>
      <link>https://domain.com/blog/post-slug</link>
      <description>Post excerpt...</description>
      <content:encoded><![CDATA[Full HTML content...]]></content:encoded>
      <author>email@domain.com (Author Name)</author>
      <guid isPermaLink="true">https://domain.com/blog/post-slug</guid>
      <pubDate>Wed, 15 Jan 2025 12:00:00 GMT</pubDate>
      <category>Category Name</category>
      <!-- More items... -->
    </item>
  </channel>
</rss>
```

**Caching**: 2 hours public cache with 4 hours stale-while-revalidate

## Security & Performance Features

### CORS Support
All endpoints include proper CORS headers for cross-origin access:
- `Access-Control-Allow-Origin: *` (public endpoints)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- Preflight OPTIONS request handling

### Caching Strategy
Implements multi-layer caching:
- HTTP Cache-Control headers for browser/CDN caching
- ETag headers for conditional requests (individual posts)
- Stale-while-revalidate for improved performance

### Content Security
- Only published posts with `publishedAt` <= current time are exposed
- Draft, scheduled, and archived posts are never accessible
- Soft-deleted posts are excluded from all responses
- Input validation using Zod schemas

### Error Handling
- Consistent error response format
- Proper HTTP status codes
- Validation error details for debugging
- Generic error messages for security

## Integration with Existing System

### Database Integration
- Uses existing BlogService and Prisma models
- Leverages existing database indexes for performance
- Maintains consistency with admin/tRPC interfaces

### Performance Considerations
- Efficient database queries with proper SELECT statements
- Related posts query optimization
- Pagination to limit response sizes
- Strategic use of database indexes

### Monitoring & Logging
- Error logging for debugging and monitoring
- Request tracking through existing audit system
- Performance metrics for optimization

## Usage Examples

### Frontend Integration
```javascript
// Fetch blog posts
const response = await fetch('/api/blog/posts?page=1&limit=10&category=tutorials');
const { data, pagination } = await response.json();

// Fetch individual post
const post = await fetch('/api/blog/posts/my-blog-post-slug');
const { data } = await post.json();
```

### RSS Feed Subscription
```html
<link rel="alternate" type="application/rss+xml" title="YES GODDESS Blog" href="/api/blog/rss.xml">
```

### Sitemap Integration
```xml
<!-- In main sitemap.xml -->
<sitemap>
  <loc>https://domain.com/api/blog/sitemap.xml</loc>
  <lastmod>2025-01-15T12:00:00Z</lastmod>
</sitemap>
```

## API Testing

All endpoints can be tested using standard HTTP tools:

```bash
# List posts
curl "https://ops.yesgoddess.agency/api/blog/posts?limit=5&sort=popular"

# Get specific post
curl "https://ops.yesgoddess.agency/api/blog/posts/example-post-slug"

# Get sitemap
curl "https://ops.yesgoddess.agency/api/blog/sitemap.xml"

# Get RSS feed
curl "https://ops.yesgoddess.agency/api/blog/rss.xml"
```

## Future Enhancements

Potential future improvements:
- Enhanced search with full-text search indexes
- Advanced filtering by date ranges
- Tag cloud and trending tags endpoints
- Post analytics and metrics endpoints
- Comment system integration
- Social media sharing optimization
