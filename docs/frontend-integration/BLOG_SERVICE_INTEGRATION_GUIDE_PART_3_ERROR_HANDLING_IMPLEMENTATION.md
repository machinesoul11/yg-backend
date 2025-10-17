# Blog Service - Frontend Integration Guide (Part 3: Error Handling & Implementation)

## Classification Key
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 1. Error Handling

### All Possible Error Codes

#### HTTP Status Code Mapping
```typescript
interface BlogErrorMapping {
  // 400 Bad Request
  'BLOG_VALIDATION_ERROR': 400;
  'INVALID_STATUS_TRANSITION': 400;
  'SCHEDULED_DATE_IN_PAST': 400;
  'POST_ALREADY_PUBLISHED': 400;
  'POST_CONTENT_TOO_LONG': 400;
  'TOO_MANY_TAGS': 400;
  'CIRCULAR_CATEGORY_REFERENCE': 400;
  
  // 403 Forbidden
  'INSUFFICIENT_PERMISSIONS': 403;
  'POST_NOT_PUBLISHED': 403;
  
  // 404 Not Found
  'POST_NOT_FOUND': 404;
  'CATEGORY_NOT_FOUND': 404;
  'POST_REVISION_NOT_FOUND': 404;
  
  // 409 Conflict
  'DUPLICATE_SLUG': 409;
  'CATEGORY_IN_USE': 409;
  
  // 429 Too Many Requests
  'TOO_MANY_REVISIONS': 429;
  'BULK_OPERATION_LIMIT_EXCEEDED': 429;
  
  // 500 Internal Server Error
  'BLOG_DATABASE_ERROR': 500;
  'BLOG_CACHE_ERROR': 500;
  'SLUG_GENERATION_ERROR': 500;
  'SEARCH_INDEX_ERROR': 500;
}
```

### Error Response Structure
```typescript
interface BlogErrorResponse {
  code: string;
  message: string;
  statusCode: number;
  details?: {
    field?: string;
    value?: any;
    identifier?: string;
    type?: string;
    [key: string]: any;
  };
}

// Example error responses
const errorExamples = {
  postNotFound: {
    code: 'POST_NOT_FOUND',
    message: 'Post with id "post_123" not found',
    statusCode: 404,
    details: { identifier: 'post_123', type: 'id' }
  },
  duplicateSlug: {
    code: 'DUPLICATE_SLUG',
    message: 'Post with slug "my-blog-post" already exists',
    statusCode: 409,
    details: { slug: 'my-blog-post', type: 'post', existingId: 'post_456' }
  },
  invalidTransition: {
    code: 'INVALID_STATUS_TRANSITION',
    message: 'Invalid status transition from "PUBLISHED" to "DRAFT" for post "post_123"',
    statusCode: 400,
    details: { fromStatus: 'PUBLISHED', toStatus: 'DRAFT', postId: 'post_123' }
  }
};
```

### Frontend Error Handling

#### Error Handler Hook
```typescript
import { TRPCClientError } from '@trpc/client';
import { toast } from 'react-hot-toast';

export function useBlogErrorHandler() {
  const handleError = (error: unknown, context?: string) => {
    if (error instanceof TRPCClientError) {
      const errorCode = error.data?.code;
      const errorMessage = error.message;
      
      switch (errorCode) {
        case 'POST_NOT_FOUND':
          toast.error('Post not found');
          // Navigate away or refresh
          break;
          
        case 'DUPLICATE_SLUG':
          toast.error('A post with this URL already exists. Please choose a different title.');
          // Focus on title field
          break;
          
        case 'INVALID_STATUS_TRANSITION':
          toast.error('Cannot change post status. Invalid transition.');
          // Reset status field
          break;
          
        case 'INSUFFICIENT_PERMISSIONS':
          toast.error('You do not have permission to perform this action');
          break;
          
        case 'SCHEDULED_DATE_IN_PAST':
          toast.error('Scheduled date must be in the future');
          // Focus on date field
          break;
          
        case 'POST_CONTENT_TOO_LONG':
          toast.error('Post content is too long. Please shorten your content.');
          break;
          
        case 'TOO_MANY_TAGS':
          toast.error('Too many tags. Maximum 20 tags allowed.');
          break;
          
        case 'CATEGORY_IN_USE':
          toast.error('Cannot delete category: it contains posts. Please reassign posts first.');
          break;
          
        case 'TOO_MANY_REVISIONS':
          toast.error('Too many revisions for this post. Please contact support.');
          break;
          
        default:
          // Generic error handling
          if (context) {
            toast.error(`Failed to ${context}. Please try again.`);
          } else {
            toast.error(errorMessage || 'An unexpected error occurred');
          }
      }
    } else {
      // Network or unknown errors
      console.error('Unexpected error:', error);
      toast.error('Network error. Please check your connection and try again.');
    }
  };
  
  return { handleError };
}
```

#### Usage in Components
```typescript
function PostEditor() {
  const { handleError } = useBlogErrorHandler();
  const createPost = trpc.blog.posts.create.useMutation({
    onError: (error) => handleError(error, 'create post'),
    onSuccess: (post) => {
      toast.success('Post created successfully!');
      router.push(`/admin/posts/${post.id}`);
    }
  });
  
  const handleSubmit = async (data: CreatePostRequest) => {
    try {
      await createPost.mutateAsync(data);
    } catch (error) {
      // Error is already handled by onError callback
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

## 2. Authorization & Permissions

### Permission Matrix

| Operation | Public | Authenticated | Post Author | Admin |
|-----------|--------|---------------|-------------|-------|
| **Posts** |
| View published posts | ✅ | ✅ | ✅ | ✅ |
| View draft posts | ❌ | ❌ | ✅ | ✅ |
| Create posts | ❌ | ✅ | ✅ | ✅ |
| Edit own posts | ❌ | ❌ | ✅ | ✅ |
| Edit any posts | ❌ | ❌ | ❌ | ✅ |
| Delete own posts | ❌ | ❌ | ✅ | ✅ |
| Delete any posts | ❌ | ❌ | ❌ | ✅ |
| Publish posts | ❌ | ❌ | ✅ | ✅ |
| Schedule posts | ❌ | ❌ | ✅ | ✅ |
| **Categories** |
| View active categories | ✅ | ✅ | ✅ | ✅ |
| View inactive categories | ❌ | ❌ | ❌ | ✅ |
| Create categories | ❌ | ❌ | ❌ | ✅ |
| Edit categories | ❌ | ❌ | ❌ | ✅ |
| Delete categories | ❌ | ❌ | ❌ | ✅ |
| **Admin Functions** |
| View statistics | ❌ | ❌ | ❌ | ✅ |
| Trigger publishing | ❌ | ❌ | ❌ | ✅ |
| Bulk operations | ❌ | ❌ | ❌ | ✅ |

### Permission Checking Hook
```typescript
interface User {
  id: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
}

interface Post {
  id: string;
  authorId: string;
  status: PostStatus;
}

export function usePermissions(user?: User) {
  const canViewPost = (post: Post): boolean => {
    if (post.status === 'PUBLISHED') return true;
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return post.authorId === user.id;
  };
  
  const canEditPost = (post: Post): boolean => {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return post.authorId === user.id;
  };
  
  const canDeletePost = (post: Post): boolean => {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return post.authorId === user.id;
  };
  
  const canPublishPost = (post: Post): boolean => {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
    return post.authorId === user.id;
  };
  
  const canManageCategories = (): boolean => {
    return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  };
  
  const canAccessAdminFeatures = (): boolean => {
    return user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  };
  
  return {
    canViewPost,
    canEditPost,
    canDeletePost,
    canPublishPost,
    canManageCategories,
    canAccessAdminFeatures
  };
}
```

---

## 3. Rate Limiting & Quotas

### Rate Limits per Endpoint

```typescript
interface RateLimits {
  // Per-user limits (per hour unless specified)
  'blog.posts.create': 10;        // 10 posts per hour
  'blog.posts.update': 100;       // 100 updates per hour
  'blog.posts.delete': 20;        // 20 deletions per hour
  'blog.posts.uploadFeaturedImage': 30; // 30 uploads per hour
  'blog.revisions.create': 50;     // 50 revisions per hour
  
  // Admin limits (higher thresholds)
  'blog.categories.create': 20;    // 20 categories per hour
  'blog.categories.delete': 10;    // 10 deletions per hour
  'blog.triggerScheduledPublishing': 6; // 6 manual triggers per hour
  
  // Public endpoints (per IP)
  'blog.posts.getBySlug': 1000;    // 1000 requests per hour
  'blog.posts.list': 500;          // 500 requests per hour
}
```

### Rate Limit Headers
```typescript
// Response headers to check
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;     // Maximum requests allowed
  'X-RateLimit-Remaining': string; // Remaining requests in window
  'X-RateLimit-Reset': string;     // Unix timestamp when limit resets
  'X-RateLimit-RetryAfter'?: string; // Seconds to wait if limit exceeded
}

// Frontend rate limit handler
export function useRateLimitHandler() {
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    remaining: number;
    reset: Date;
    limit: number;
  } | null>(null);
  
  const handleRateLimitHeaders = (headers: Headers) => {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');
    
    if (limit && remaining && reset) {
      setRateLimitInfo({
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        reset: new Date(parseInt(reset) * 1000)
      });
    }
  };
  
  return { rateLimitInfo, handleRateLimitHeaders };
}
```

---

## 4. File Upload Implementation

### Featured Image Upload Flow

```typescript
interface ImageUploadOptions {
  maxSize: number;        // 5MB = 5 * 1024 * 1024
  allowedTypes: string[]; // ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  quality: number;        // 0.8 for JPEG compression
}

export function useImageUpload(options: ImageUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const uploadFeaturedImage = trpc.blog.posts.uploadFeaturedImage.useMutation();
  
  const validateImage = (file: File): { valid: boolean; error?: string } => {
    if (file.size > options.maxSize) {
      return { valid: false, error: `File size must be less than ${options.maxSize / 1024 / 1024}MB` };
    }
    
    if (!options.allowedTypes.includes(file.type)) {
      return { valid: false, error: 'File type not supported. Use JPEG, PNG, WebP, or GIF.' };
    }
    
    return { valid: true };
  };
  
  const processImage = async (file: File): Promise<{
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const buffer = Buffer.from(arrayBuffer);
        
        resolve({
          buffer,
          mimetype: file.type,
          originalname: file.name,
          size: file.size
        });
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };
  
  const uploadImage = async (postId: string, file: File) => {
    const validation = validateImage(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    
    setUploading(true);
    setProgress(0);
    
    try {
      const imageData = await processImage(file);
      
      const result = await uploadFeaturedImage.mutateAsync({
        postId,
        imageFile: imageData
      });
      
      setProgress(100);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };
  
  return {
    uploadImage,
    uploading,
    progress,
    validateImage
  };
}
```

### Image Upload Component
```typescript
interface ImageUploadProps {
  postId: string;
  currentImageUrl?: string;
  onUploadSuccess: (imageUrl: string) => void;
  onUploadError: (error: string) => void;
}

export function FeaturedImageUpload({
  postId,
  currentImageUrl,
  onUploadSuccess,
  onUploadError
}: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { uploadImage, uploading, progress, validateImage } = useImageUpload({
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    quality: 0.8
  });
  
  const removeImage = trpc.blog.posts.removeFeaturedImage.useMutation({
    onSuccess: () => {
      onUploadSuccess('');
      toast.success('Featured image removed');
    },
    onError: (error) => {
      onUploadError(error.message);
    }
  });
  
  const handleFileUpload = async (file: File) => {
    const validation = validateImage(file);
    if (!validation.valid) {
      onUploadError(validation.error!);
      return;
    }
    
    try {
      const result = await uploadImage(postId, file);
      onUploadSuccess(result.imageUrl);
      toast.success('Featured image uploaded successfully');
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };
  
  return (
    <div className="featured-image-upload">
      {currentImageUrl ? (
        <div className="current-image">
          <img src={currentImageUrl} alt="Featured image" />
          <div className="image-actions">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Replace Image
            </button>
            <button
              onClick={() => removeImage.mutate({ postId })}
              disabled={uploading || removeImage.isLoading}
            >
              Remove Image
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={() => setDragActive(true)}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span>Uploading... {progress}%</span>
            </div>
          ) : (
            <div className="upload-placeholder">
              <p>Drop an image here or click to select</p>
              <p className="upload-hint">
                Supports JPEG, PNG, WebP, GIF • Max 5MB
              </p>
            </div>
          )}
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
```

---

## 5. Real-time Updates

### WebSocket Events (if implemented)
```typescript
interface BlogWebSocketEvents {
  'post:published': { postId: string; slug: string; title: string };
  'post:updated': { postId: string; changes: string[] };
  'post:deleted': { postId: string };
  'post:scheduled': { postId: string; scheduledFor: string };
  'category:created': { categoryId: string; name: string };
  'category:updated': { categoryId: string; changes: string[] };
}

// WebSocket hook for real-time updates
export function useBlogWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  
  useEffect(() => {
    const ws = new WebSocket(`wss://ops.yesgoddess.agency/ws/blog`);
    
    ws.onopen = () => {
      console.log('Blog WebSocket connected');
      setSocket(ws);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
      console.log('Blog WebSocket disconnected');
      setSocket(null);
    };
    
    return () => {
      ws.close();
    };
  }, []);
  
  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'post:published':
        toast.success(`Post "${data.title}" has been published`);
        // Invalidate queries or update cache
        break;
      case 'post:updated':
        // Invalidate specific post query
        break;
      // Handle other events
    }
  };
  
  return { socket, connected: !!socket };
}
```

### Polling Recommendations
```typescript
// For real-time features without WebSocket
export function usePollingPosts(enabled: boolean = true) {
  return trpc.blog.posts.list.useQuery(
    { 
      filters: { status: ['PUBLISHED', 'SCHEDULED'] },
      limit: 20 
    },
    {
      enabled,
      refetchInterval: 30000, // Poll every 30 seconds
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true
    }
  );
}

// For scheduled posts (admin only)
export function useScheduledPostsPolling() {
  return trpc.blog.posts.list.useQuery(
    {
      filters: { status: 'SCHEDULED' },
      sortBy: 'scheduledFor',
      sortOrder: 'asc'
    },
    {
      refetchInterval: 60000, // Poll every minute
      enabled: true
    }
  );
}
```

---

## 6. Pagination & Performance

### Infinite Scrolling Implementation
```typescript
export function useInfinitePostsList(filters?: PostFilters) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = trpc.blog.posts.list.useInfiniteQuery(
    {
      limit: 20,
      filters
    },
    {
      getNextPageParam: (lastPage) => {
        return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
      }
    }
  );
  
  const posts = useMemo(() => {
    return data?.pages.flatMap(page => page.posts) ?? [];
  }, [data]);
  
  return {
    posts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  };
}

// Infinite scroll component
export function InfinitePostsList({ filters }: { filters?: PostFilters }) {
  const {
    posts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status
  } = useInfinitePostsList(filters);
  
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false
  });
  
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);
  
  if (status === 'loading') return <div>Loading...</div>;
  if (status === 'error') return <div>Error loading posts</div>;
  
  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      
      <div ref={ref}>
        {isFetchingNextPage && <div>Loading more...</div>}
        {!hasNextPage && posts.length > 0 && <div>No more posts</div>}
      </div>
    </div>
  );
}
```

---

## 7. Frontend Implementation Checklist

### ✅ Essential Tasks

#### Data Fetching & State Management
- [ ] Set up tRPC client with authentication headers
- [ ] Implement React Query for caching and synchronization
- [ ] Create custom hooks for common blog operations
- [ ] Handle loading states and error boundaries
- [ ] Implement optimistic updates for better UX

#### Forms & Validation
- [ ] Create post creation/editing forms with real-time validation
- [ ] Implement rich text editor with content validation
- [ ] Add tag input component with autocomplete
- [ ] Build category selector with hierarchy support
- [ ] Add SEO optimization form fields

#### File Management
- [ ] Implement featured image upload with drag-and-drop
- [ ] Add image preview and cropping functionality
- [ ] Handle file validation and error states
- [ ] Implement progress tracking for uploads
- [ ] Add bulk image operations (if needed)

#### User Interface
- [ ] Build post list with filtering and sorting
- [ ] Create post detail pages with proper SEO
- [ ] Implement post status indicators and transitions
- [ ] Add content calendar view for scheduled posts
- [ ] Build admin dashboard with statistics

#### Permissions & Security
- [ ] Implement role-based access control
- [ ] Add permission checks for all operations
- [ ] Handle unauthorized access gracefully
- [ ] Implement secure file upload validation
- [ ] Add CSRF protection for forms

### ⚡ Advanced Features
- [ ] Real-time collaboration on posts
- [ ] Auto-save functionality
- [ ] Revision comparison interface
- [ ] Bulk operations interface
- [ ] Content analytics dashboard
- [ ] Social media integration
- [ ] Email notifications
- [ ] Content templates

### 🚀 Performance Optimizations
- [ ] Implement virtual scrolling for large lists
- [ ] Add service worker for offline capabilities
- [ ] Optimize images with lazy loading
- [ ] Implement code splitting for blog routes
- [ ] Add CDN integration for media files
- [ ] Cache frequently accessed data
- [ ] Implement search with debouncing

---

This completes the comprehensive frontend integration documentation for the Blog Service module. The frontend developer should now have everything needed to implement a full-featured blog management system without additional clarification questions.
