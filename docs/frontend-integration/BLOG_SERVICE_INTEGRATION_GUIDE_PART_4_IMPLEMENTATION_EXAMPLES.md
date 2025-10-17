# 🌐 Blog Service - Frontend Integration Guide (Part 4: Implementation Examples)

**Classification Key:**
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only  
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## Overview

This final part provides complete implementation examples, React components, and integration patterns for the Blog Service. Use these as templates for building your frontend interface.

---

## 1. Complete React Components

### 1.1 Post Creation Form Component

```typescript
// components/blog/PostCreateForm.tsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { createPostSchema, type CreatePostRequest } from '@/types/blog';
import { useBlogErrorHandler } from '@/hooks/useBlogErrorHandler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { TagInput } from '@/components/ui/tag-input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ImageUpload } from '@/components/ui/image-upload';

interface PostCreateFormProps {
  initialData?: Partial<CreatePostRequest>;
  onSuccess?: (post: Post) => void;
  onCancel?: () => void;
}

export const PostCreateForm: React.FC<PostCreateFormProps> = ({
  initialData,
  onSuccess,
  onCancel
}) => {
  const router = useRouter();
  const { handleError } = useBlogErrorHandler();
  const [isDraft, setIsDraft] = useState(true);

  // Fetch categories for dropdown
  const { data: categories } = trpc.blog.categories.list.useQuery({
    isActive: true,
    sortBy: 'name',
    sortOrder: 'asc'
  });

  // Form setup
  const form = useForm<CreatePostRequest>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      status: 'DRAFT',
      isFeatured: false,
      tags: [],
      ...initialData
    }
  });

  const { register, handleSubmit, formState: { errors, isValid, isSubmitting }, watch, setValue, control } = form;

  // Watch form values for dynamic behavior
  const watchedStatus = watch('status');
  const watchedTitle = watch('title');
  const watchedContent = watch('content');

  // Create post mutation
  const createPost = trpc.blog.posts.create.useMutation({
    onSuccess: (post) => {
      console.log('Post created successfully:', post);
      onSuccess?.(post);
      router.push(`/admin/blog/posts/${post.id}`);
    },
    onError: (error) => {
      handleError(error, 'Creating post');
    }
  });

  // Auto-generate slug from title
  React.useEffect(() => {
    if (watchedTitle && !form.getValues('slug')) {
      const slug = watchedTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      setValue('slug', slug);
    }
  }, [watchedTitle, setValue, form]);

  // Calculate reading time
  const readingTime = React.useMemo(() => {
    if (!watchedContent) return 0;
    const wordCount = watchedContent.replace(/<[^>]*>/g, '').split(/\s+/).length;
    return Math.ceil(wordCount / 200); // 200 words per minute
  }, [watchedContent]);

  const onSubmit = async (data: CreatePostRequest) => {
    try {
      await createPost.mutateAsync(data);
    } catch (error) {
      // Error handled by mutation onError
      console.error('Form submission error:', error);
    }
  };

  const handleSaveDraft = () => {
    setValue('status', 'DRAFT');
    handleSubmit(onSubmit)();
  };

  const handlePublish = () => {
    setValue('status', 'PUBLISHED');
    setValue('publishedAt', new Date().toISOString());
    handleSubmit(onSubmit)();
  };

  const handleSchedule = () => {
    setValue('status', 'SCHEDULED');
    handleSubmit(onSubmit)();
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Create New Post</h1>
        <div className="flex items-center gap-3">
          <Badge variant={isDraft ? 'secondary' : 'default'}>
            {watchedStatus || 'DRAFT'}
          </Badge>
          {readingTime > 0 && (
            <Badge variant="outline">{readingTime} min read</Badge>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Title and Slug */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title *
            </label>
            <Input
              id="title"
              {...register('title')}
              placeholder="Enter post title"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium">
              URL Slug
            </label>
            <Input
              id="slug"
              {...register('slug')}
              placeholder="url-friendly-slug"
              className={errors.slug ? 'border-red-500' : ''}
            />
            {errors.slug && (
              <p className="text-sm text-red-500">{errors.slug.message}</p>
            )}
          </div>
        </div>

        {/* Content Editor */}
        <div className="space-y-2">
          <label htmlFor="content" className="text-sm font-medium">
            Content *
          </label>
          <RichTextEditor
            value={watch('content') || ''}
            onChange={(value) => setValue('content', value)}
            placeholder="Start writing your post..."
            className={errors.content ? 'border-red-500' : ''}
          />
          {errors.content && (
            <p className="text-sm text-red-500">{errors.content.message}</p>
          )}
        </div>

        {/* Excerpt */}
        <div className="space-y-2">
          <label htmlFor="excerpt" className="text-sm font-medium">
            Excerpt
          </label>
          <Textarea
            id="excerpt"
            {...register('excerpt')}
            placeholder="Brief description of the post (optional)"
            rows={3}
            className={errors.excerpt ? 'border-red-500' : ''}
          />
          <p className="text-xs text-gray-500">
            Leave empty to auto-generate from content
          </p>
          {errors.excerpt && (
            <p className="text-sm text-red-500">{errors.excerpt.message}</p>
          )}
        </div>

        {/* Category and Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="categoryId" className="text-sm font-medium">
              Category
            </label>
            <Select
              value={watch('categoryId') || ''}
              onValueChange={(value) => setValue('categoryId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Category</SelectItem>
                {categories?.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="tags" className="text-sm font-medium">
              Tags
            </label>
            <TagInput
              value={watch('tags') || []}
              onChange={(tags) => setValue('tags', tags)}
              placeholder="Add tags..."
              maxTags={20}
            />
            {errors.tags && (
              <p className="text-sm text-red-500">{errors.tags.message}</p>
            )}
          </div>
        </div>

        {/* Featured Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Featured Image</label>
          <ImageUpload
            value={watch('featuredImageUrl') || ''}
            onChange={(url) => setValue('featuredImageUrl', url)}
            maxSize={5 * 1024 * 1024} // 5MB
            allowedTypes={['image/jpeg', 'image/png', 'image/webp', 'image/gif']}
          />
        </div>

        {/* SEO Section */}
        <div className="border-t pt-6 space-y-4">
          <h3 className="text-lg font-medium">SEO Settings</h3>
          
          <div className="space-y-2">
            <label htmlFor="seoTitle" className="text-sm font-medium">
              SEO Title
            </label>
            <Input
              id="seoTitle"
              {...register('seoTitle')}
              placeholder="Custom title for search engines (optional)"
              maxLength={70}
              className={errors.seoTitle ? 'border-red-500' : ''}
            />
            <p className="text-xs text-gray-500">
              {watch('seoTitle')?.length || 0}/70 characters
            </p>
            {errors.seoTitle && (
              <p className="text-sm text-red-500">{errors.seoTitle.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="seoDescription" className="text-sm font-medium">
              SEO Description
            </label>
            <Textarea
              id="seoDescription"
              {...register('seoDescription')}
              placeholder="Custom description for search engines (optional)"
              rows={2}
              maxLength={160}
              className={errors.seoDescription ? 'border-red-500' : ''}
            />
            <p className="text-xs text-gray-500">
              {watch('seoDescription')?.length || 0}/160 characters
            </p>
            {errors.seoDescription && (
              <p className="text-sm text-red-500">{errors.seoDescription.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="seoKeywords" className="text-sm font-medium">
              SEO Keywords
            </label>
            <Input
              id="seoKeywords"
              {...register('seoKeywords')}
              placeholder="Comma-separated keywords (optional)"
              className={errors.seoKeywords ? 'border-red-500' : ''}
            />
            {errors.seoKeywords && (
              <p className="text-sm text-red-500">{errors.seoKeywords.message}</p>
            )}
          </div>
        </div>

        {/* Publishing Options */}
        <div className="border-t pt-6 space-y-4">
          <h3 className="text-lg font-medium">Publishing Options</h3>
          
          <div className="flex items-center space-x-2">
            <Switch
              id="isFeatured"
              checked={watch('isFeatured') || false}
              onCheckedChange={(checked) => setValue('isFeatured', checked)}
            />
            <label htmlFor="isFeatured" className="text-sm font-medium">
              Featured Post
            </label>
          </div>

          {watchedStatus === 'SCHEDULED' && (
            <div className="space-y-2">
              <label htmlFor="scheduledFor" className="text-sm font-medium">
                Scheduled Date *
              </label>
              <Input
                id="scheduledFor"
                type="datetime-local"
                {...register('scheduledFor')}
                min={new Date().toISOString().slice(0, 16)}
                className={errors.scheduledFor ? 'border-red-500' : ''}
              />
              {errors.scheduledFor && (
                <p className="text-sm text-red-500">{errors.scheduledFor.message}</p>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSubmitting || !isValid}
              loading={isSubmitting && watchedStatus === 'DRAFT'}
            >
              Save Draft
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setValue('status', 'SCHEDULED');
                // Show scheduling modal or inline date picker
              }}
              disabled={isSubmitting || !isValid}
            >
              Schedule
            </Button>

            <Button
              type="button"
              onClick={handlePublish}
              disabled={isSubmitting || !isValid}
              loading={isSubmitting && watchedStatus === 'PUBLISHED'}
            >
              Publish Now
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
```

### 1.2 Post List Component with Filtering

```typescript
// components/blog/PostList.tsx
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { type PostFilters, type PostSortBy, type SortOrder } from '@/types/blog';
import { usePermissions } from '@/hooks/usePermissions';
import { useBlogErrorHandler } from '@/hooks/useBlogErrorHandler';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PostStatusBadge } from '@/components/blog/PostStatusBadge';
import { PostActions } from '@/components/blog/PostActions';

interface PostListProps {
  userRole: UserRole;
  userId: string;
  showFilters?: boolean;
  showActions?: boolean;
  defaultFilters?: Partial<PostFilters>;
}

export const PostList: React.FC<PostListProps> = ({
  userRole,
  userId,
  showFilters = true,
  showActions = true,
  defaultFilters = {}
}) => {
  const router = useRouter();
  const { handleError } = useBlogErrorHandler();
  const permissions = usePermissions(userRole, userId);

  // Filter state
  const [filters, setFilters] = useState<PostFilters>({
    ...defaultFilters
  });
  const [sortBy, setSortBy] = useState<PostSortBy>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch posts
  const {
    data: postsResponse,
    isLoading,
    error,
    refetch
  } = trpc.blog.posts.list.useQuery({
    filters: {
      ...filters,
      ...(debouncedSearch && { search: debouncedSearch })
    },
    sortBy,
    sortOrder,
    page,
    limit: 20
  });

  // Fetch categories for filter dropdown
  const { data: categories } = trpc.blog.categories.list.useQuery({
    isActive: true,
    sortBy: 'name'
  });

  // Handle errors
  React.useEffect(() => {
    if (error) {
      handleError(error, 'Loading posts');
    }
  }, [error, handleError]);

  // Filter handlers
  const handleFilterChange = (key: keyof PostFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setSearch('');
    setPage(1);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Posts</h1>
          <p className="text-gray-600">
            {postsResponse?.total || 0} posts total
          </p>
        </div>
        {permissions.canCreatePost && (
          <Button onClick={() => router.push('/admin/blog/posts/create')}>
            Create Post
          </Button>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <Input
                  placeholder="Search posts..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={filters.status || ''}
                  onValueChange={(value) => 
                    handleFilterChange('status', value || undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Statuses</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={filters.categoryId || ''}
                  onValueChange={(value) => 
                    handleFilterChange('categoryId', value || undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Categories</SelectItem>
                    {categories?.categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sort By</label>
                <div className="flex gap-2">
                  <Select
                    value={sortBy}
                    onValueChange={(value) => setSortBy(value as PostSortBy)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="createdAt">Created Date</SelectItem>
                      <SelectItem value="updatedAt">Updated Date</SelectItem>
                      <SelectItem value="publishedAt">Published Date</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="viewCount">View Count</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={sortOrder}
                    onValueChange={(value) => setSortOrder(value as SortOrder)}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">↓</SelectItem>
                      <SelectItem value="asc">↑</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClearFilters}>
                Clear Filters
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts List */}
      <div className="space-y-4">
        {postsResponse?.posts.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900">No posts found</h3>
            <p className="text-gray-500">
              {Object.keys(filters).length > 0 || debouncedSearch
                ? 'Try adjusting your filters'
                : 'Get started by creating your first post'}
            </p>
            {permissions.canCreatePost && Object.keys(filters).length === 0 && !debouncedSearch && (
              <Button
                className="mt-4"
                onClick={() => router.push('/admin/blog/posts/create')}
              >
                Create First Post
              </Button>
            )}
          </div>
        ) : (
          postsResponse?.posts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <PostStatusBadge status={post.status} />
                      {post.isFeatured && (
                        <Badge variant="secondary">Featured</Badge>
                      )}
                      {post.category && (
                        <Badge variant="outline">{post.category.name}</Badge>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold mb-2 truncate">
                      <button
                        onClick={() => router.push(`/admin/blog/posts/${post.id}`)}
                        className="text-left hover:text-blue-600 transition-colors"
                      >
                        {post.title}
                      </button>
                    </h3>

                    {post.excerpt && (
                      <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>By {post.author?.name || 'Unknown'}</span>
                      <span>•</span>
                      <span>Created {formatDate(post.createdAt)}</span>
                      {post.publishedAt && (
                        <>
                          <span>•</span>
                          <span>Published {formatDate(post.publishedAt)}</span>
                        </>
                      )}
                      {post.scheduledFor && (
                        <>
                          <span>•</span>
                          <span>Scheduled for {formatDate(post.scheduledFor)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{post.readTimeMinutes} min read</span>
                      <span>•</span>
                      <span>{post.viewCount} views</span>
                    </div>

                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {post.tags.slice(0, 5).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {post.tags.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{post.tags.length - 5} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {showActions && (
                    <PostActions
                      post={post}
                      userRole={userRole}
                      userId={userId}
                      onUpdate={() => refetch()}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {postsResponse && postsResponse.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={postsResponse.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};
```

### 1.3 Featured Image Upload Component

```typescript
// components/blog/FeaturedImageUpload.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { trpc } from '@/lib/trpc';
import { useBlogErrorHandler } from '@/hooks/useBlogErrorHandler';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, Upload, Image as ImageIcon } from 'lucide-react';

interface FeaturedImageUploadProps {
  postId: string;
  currentImageUrl?: string;
  onImageChange?: (imageUrl: string | null) => void;
  disabled?: boolean;
}

export const FeaturedImageUpload: React.FC<FeaturedImageUploadProps> = ({
  postId,
  currentImageUrl,
  onImageChange,
  disabled = false
}) => {
  const { handleError } = useBlogErrorHandler();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  // Upload mutation
  const uploadImage = trpc.blog.posts.uploadFeaturedImage.useMutation({
    onSuccess: (result) => {
      console.log('Image uploaded successfully:', result);
      onImageChange?.(result.imageUrl);
      setUploading(false);
      setUploadProgress(0);
    },
    onError: (error) => {
      handleError(error, 'Uploading featured image');
      setUploading(false);
      setUploadProgress(0);
    }
  });

  // Remove mutation
  const removeImage = trpc.blog.posts.removeFeaturedImage.useMutation({
    onSuccess: () => {
      onImageChange?.(null);
    },
    onError: (error) => {
      handleError(error, 'Removing featured image');
    }
  });

  // File validation
  const validateFile = (file: File): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.size > maxSize) {
      errors.push('File size must be less than 5MB');
    }

    if (!allowedTypes.includes(file.type)) {
      errors.push('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    const validation = validateFile(file);
    if (!validation.isValid) {
      validation.errors.forEach(error => {
        handleError({ message: error, statusCode: 400 }, 'File validation');
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      await uploadImage.mutateAsync({
        postId,
        imageFile: {
          buffer,
          mimetype: file.type,
          originalname: file.name,
          size: file.size
        }
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleFileUpload(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif']
    },
    maxFiles: 1,
    disabled: disabled || uploading
  });

  // Handle remove
  const handleRemove = async () => {
    try {
      await removeImage.mutateAsync({ postId });
    } catch (error) {
      console.error('Remove failed:', error);
    }
  };

  return (
    <div className="space-y-4">
      {currentImageUrl ? (
        // Show current image
        <div className="relative">
          <img
            src={currentImageUrl}
            alt="Featured image"
            className="w-full h-48 object-cover rounded-lg border"
          />
          {!disabled && (
            <Button
              size="sm"
              variant="destructive"
              className="absolute top-2 right-2"
              onClick={handleRemove}
              disabled={removeImage.isLoading}
              loading={removeImage.isLoading}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ) : (
        // Show upload area
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${isDragActive || dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
            ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-gray-50'}
          `}
        >
          <input {...getInputProps()} />
          
          {uploading ? (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Uploading image...</p>
                <Progress value={uploadProgress} className="mt-2" />
                <p className="text-xs text-gray-500 mt-1">{uploadProgress}%</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {isDragActive ? 'Drop image here' : 'Upload featured image'}
                </p>
                <p className="text-xs text-gray-500">
                  Drag and drop or click to select
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPEG, PNG, WebP, GIF up to 5MB
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Guidelines */}
      <Alert>
        <AlertDescription className="text-sm">
          <strong>Recommended:</strong> 1200x630px for optimal social media sharing.
          Images will be optimized automatically.
        </AlertDescription>
      </Alert>
    </div>
  );
};
```

---

## 2. API Client Layer

### 2.1 Blog Service Client

```typescript
// lib/api/blog-client.ts
import { trpc } from '@/lib/trpc';
import type {
  CreatePostRequest,
  UpdatePostRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  PostFilters,
  CategoryFilters,
  PostsQueryOptions,
  CategoriesQueryOptions,
  Post,
  Category,
  PostsResponse,
  CategoriesResponse
} from '@/types/blog';

export class BlogApiClient {
  // Posts
  async createPost(data: CreatePostRequest): Promise<Post> {
    return trpc.blog.posts.create.mutate(data);
  }

  async updatePost(id: string, data: UpdatePostRequest): Promise<Post> {
    return trpc.blog.posts.update.mutate({ id, data });
  }

  async getPost(id: string, options?: { includeRevisions?: boolean }): Promise<Post> {
    return trpc.blog.posts.getById.query({ id, ...options });
  }

  async getPostBySlug(slug: string, options?: { incrementViews?: boolean }): Promise<Post> {
    return trpc.blog.posts.getBySlug.query({ slug, ...options });
  }

  async getPosts(options: PostsQueryOptions = {}): Promise<PostsResponse> {
    return trpc.blog.posts.list.query(options);
  }

  async publishPost(id: string, publishedAt?: string): Promise<Post> {
    return trpc.blog.posts.publish.mutate({ id, publishedAt });
  }

  async schedulePost(id: string, scheduledFor: string): Promise<Post> {
    return trpc.blog.posts.schedule.mutate({ id, scheduledFor });
  }

  async deletePost(id: string): Promise<void> {
    return trpc.blog.posts.delete.mutate({ id });
  }

  async duplicatePost(id: string, overrides?: Partial<CreatePostRequest>): Promise<Post> {
    return trpc.blog.posts.duplicate.mutate({ id, overrides });
  }

  // Featured images
  async uploadFeaturedImage(postId: string, imageFile: File): Promise<{ imageUrl: string; storageKey: string }> {
    const buffer = await imageFile.arrayBuffer();
    return trpc.blog.posts.uploadFeaturedImage.mutate({
      postId,
      imageFile: {
        buffer: Buffer.from(buffer),
        mimetype: imageFile.type,
        originalname: imageFile.name,
        size: imageFile.size
      }
    });
  }

  async removeFeaturedImage(postId: string): Promise<void> {
    await trpc.blog.posts.removeFeaturedImage.mutate({ postId });
  }

  // Categories
  async createCategory(data: CreateCategoryRequest): Promise<Category> {
    return trpc.blog.categories.create.mutate(data);
  }

  async updateCategory(id: string, data: UpdateCategoryRequest): Promise<Category> {
    return trpc.blog.categories.update.mutate({ id, data });
  }

  async getCategory(id: string, options?: { includeChildren?: boolean; includePostCount?: boolean }): Promise<Category> {
    return trpc.blog.categories.getById.query({ id, ...options });
  }

  async getCategories(options: CategoriesQueryOptions = {}): Promise<CategoriesResponse> {
    return trpc.blog.categories.list.query(options);
  }

  async deleteCategory(id: string, reassignPostsTo?: string): Promise<void> {
    return trpc.blog.categories.delete.mutate({ id, reassignPostsTo });
  }

  // Revisions
  async createRevision(postId: string, content: string, revisionNote?: string): Promise<void> {
    return trpc.blog.revisions.create.mutate({ postId, content, revisionNote });
  }

  async getRevisions(postId: string, page = 1, limit = 20): Promise<any> {
    return trpc.blog.revisions.list.query({ postId, page, limit });
  }
}

// Export singleton instance
export const blogApi = new BlogApiClient();
```

### 2.2 React Query Integration

```typescript
// hooks/blog/useBlogQueries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blogApi } from '@/lib/api/blog-client';
import { useBlogErrorHandler } from '@/hooks/useBlogErrorHandler';
import type { PostsQueryOptions, CategoriesQueryOptions } from '@/types/blog';

// Query keys factory
export const blogQueryKeys = {
  all: ['blog'] as const,
  posts: () => [...blogQueryKeys.all, 'posts'] as const,
  post: (id: string) => [...blogQueryKeys.posts(), id] as const,
  postBySlug: (slug: string) => [...blogQueryKeys.posts(), 'slug', slug] as const,
  postsList: (options: PostsQueryOptions) => [...blogQueryKeys.posts(), 'list', options] as const,
  categories: () => [...blogQueryKeys.all, 'categories'] as const,
  category: (id: string) => [...blogQueryKeys.categories(), id] as const,
  categoriesList: (options: CategoriesQueryOptions) => [...blogQueryKeys.categories(), 'list', options] as const,
  revisions: (postId: string) => [...blogQueryKeys.all, 'revisions', postId] as const,
};

// Post queries
export const usePosts = (options: PostsQueryOptions = {}) => {
  return useQuery({
    queryKey: blogQueryKeys.postsList(options),
    queryFn: () => blogApi.getPosts(options),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const usePost = (id: string, options?: { includeRevisions?: boolean }) => {
  return useQuery({
    queryKey: blogQueryKeys.post(id),
    queryFn: () => blogApi.getPost(id, options),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
};

export const usePostBySlug = (slug: string, options?: { incrementViews?: boolean }) => {
  return useQuery({
    queryKey: blogQueryKeys.postBySlug(slug),
    queryFn: () => blogApi.getPostBySlug(slug, options),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
};

// Category queries
export const useCategories = (options: CategoriesQueryOptions = {}) => {
  return useQuery({
    queryKey: blogQueryKeys.categoriesList(options),
    queryFn: () => blogApi.getCategories(options),
    staleTime: 10 * 60 * 1000, // Categories change less frequently
  });
};

export const useCategory = (id: string, options?: { includeChildren?: boolean; includePostCount?: boolean }) => {
  return useQuery({
    queryKey: blogQueryKeys.category(id),
    queryFn: () => blogApi.getCategory(id, options),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
};

// Post mutations
export const useCreatePost = () => {
  const queryClient = useQueryClient();
  const { handleError } = useBlogErrorHandler();

  return useMutation({
    mutationFn: blogApi.createPost,
    onSuccess: () => {
      // Invalidate posts list
      queryClient.invalidateQueries({ queryKey: blogQueryKeys.posts() });
    },
    onError: (error) => {
      handleError(error, 'Creating post');
    }
  });
};

export const useUpdatePost = () => {
  const queryClient = useQueryClient();
  const { handleError } = useBlogErrorHandler();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => blogApi.updatePost(id, data),
    onSuccess: (updatedPost) => {
      // Update specific post cache
      queryClient.setQueryData(blogQueryKeys.post(updatedPost.id), updatedPost);
      // Invalidate posts list
      queryClient.invalidateQueries({ queryKey: blogQueryKeys.posts() });
    },
    onError: (error) => {
      handleError(error, 'Updating post');
    }
  });
};

export const useDeletePost = () => {
  const queryClient = useQueryClient();
  const { handleError } = useBlogErrorHandler();

  return useMutation({
    mutationFn: blogApi.deletePost,
    onSuccess: () => {
      // Invalidate all post-related queries
      queryClient.invalidateQueries({ queryKey: blogQueryKeys.posts() });
    },
    onError: (error) => {
      handleError(error, 'Deleting post');
    }
  });
};

// Featured image mutations
export const useUploadFeaturedImage = () => {
  const queryClient = useQueryClient();
  const { handleError } = useBlogErrorHandler();

  return useMutation({
    mutationFn: ({ postId, file }: { postId: string; file: File }) => 
      blogApi.uploadFeaturedImage(postId, file),
    onSuccess: (result, { postId }) => {
      // Update post cache with new image URL
      queryClient.setQueryData(
        blogQueryKeys.post(postId),
        (old: any) => old ? { ...old, featuredImageUrl: result.imageUrl } : old
      );
    },
    onError: (error) => {
      handleError(error, 'Uploading featured image');
    }
  });
};
```

---

## 3. Form Validation Examples

### 3.1 Advanced Form Hook

```typescript
// hooks/blog/useBlogForm.ts
import { useForm, UseFormProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useBlogErrorHandler, useFieldErrors } from '@/hooks/useBlogErrorHandler';

interface UseBlogFormOptions<T> extends UseFormProps<T> {
  schema: z.ZodType<T>;
  onSubmitSuccess?: (data: T, result: any) => void;
  onSubmitError?: (error: any) => void;
  autoSave?: boolean;
  autoSaveDelay?: number;
}

export const useBlogForm = <T extends Record<string, any>>({
  schema,
  onSubmitSuccess,
  onSubmitError,
  autoSave = false,
  autoSaveDelay = 2000,
  ...formOptions
}: UseBlogFormOptions<T>) => {
  const { handleError } = useBlogErrorHandler();
  const { extractFieldErrors } = useFieldErrors();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  const form = useForm<T>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    ...formOptions
  });

  const { handleSubmit, formState: { errors, isDirty, isValid }, watch, setError } = form;

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave || !isDirty || !isValid) return;

    const subscription = watch((data) => {
      const timeoutId = setTimeout(async () => {
        setAutoSaving(true);
        try {
          // Call onSubmitSuccess with auto-save flag
          await onSubmitSuccess?.(data as T, { autoSave: true });
          setLastSaved(new Date());
        } catch (error) {
          console.error('Auto-save failed:', error);
        } finally {
          setAutoSaving(false);
        }
      }, autoSaveDelay);

      return () => clearTimeout(timeoutId);
    });

    return () => subscription.unsubscribe();
  }, [watch, autoSave, autoSaveDelay, isDirty, isValid, onSubmitSuccess]);

  const handleFormSubmit = handleSubmit(
    async (data) => {
      try {
        const result = await onSubmitSuccess?.(data, { autoSave: false });
        setLastSaved(new Date());
        return result;
      } catch (error) {
        const fieldErrors = extractFieldErrors(error);
        
        // Set field-specific errors
        Object.entries(fieldErrors).forEach(([field, message]) => {
          setError(field as any, { message });
        });

        // Handle general error if no field errors
        if (Object.keys(fieldErrors).length === 0) {
          handleError(error, 'Form submission');
        }

        onSubmitError?.(error);
        throw error;
      }
    },
    (errors) => {
      console.error('Form validation errors:', errors);
      handleError(
        { message: 'Please fix the validation errors', statusCode: 400 },
        'Form validation'
      );
    }
  );

  return {
    ...form,
    handleFormSubmit,
    lastSaved,
    autoSaving,
    hasFieldErrors: Object.keys(errors).length > 0
  };
};

// Usage example
export const usePostForm = (initialData?: Partial<CreatePostRequest>) => {
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();

  return useBlogForm({
    schema: createPostSchema,
    defaultValues: {
      status: 'DRAFT',
      isFeatured: false,
      tags: [],
      ...initialData
    },
    autoSave: true,
    autoSaveDelay: 3000,
    onSubmitSuccess: async (data, { autoSave }) => {
      if (initialData?.id) {
        return await updatePost.mutateAsync({ id: initialData.id, data });
      } else {
        return await createPost.mutateAsync(data);
      }
    }
  });
};
```

---

## 4. Error Boundary and Loading States

### 4.1 Blog Error Boundary

```typescript
// components/blog/BlogErrorBoundary.tsx
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface BlogErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

const BlogErrorFallback: React.FC<BlogErrorFallbackProps> = ({
  error,
  resetErrorBoundary
}) => {
  return (
    <div className="max-w-md mx-auto p-6">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription className="mt-2">
          {error.message || 'An unexpected error occurred while loading the blog content.'}
        </AlertDescription>
      </Alert>
      
      <div className="mt-4 flex gap-2">
        <Button onClick={resetErrorBoundary} size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try again
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => window.location.reload()}
        >
          Refresh page
        </Button>
      </div>
    </div>
  );
};

export const BlogErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary
      FallbackComponent={BlogErrorFallback}
      onError={(error, errorInfo) => {
        console.error('Blog error boundary caught an error:', error, errorInfo);
        // Send to error tracking service
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
```

### 4.2 Loading State Components

```typescript
// components/blog/BlogLoadingStates.tsx
import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export const PostListSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const PostFormSkeleton: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-20" />
      </div>
      
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-64 w-full" />
        </div>
        
        <div className="space-y-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-20 w-full" />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Frontend Implementation Checklist

### 5.1 Setup Tasks

- [ ] **Install Dependencies**
  ```bash
  npm install @trpc/client @trpc/react-query @tanstack/react-query
  npm install react-hook-form @hookform/resolvers/zod zod
  npm install lucide-react react-dropzone
  ```

- [ ] **Configure tRPC Client**
  - Set up tRPC client with proper base URL
  - Configure authentication headers
  - Add error handling middleware

- [ ] **Set up Type Definitions**
  - Copy all TypeScript interfaces from Part 2
  - Configure proper import/export structure
  - Set up Zod validation schemas

### 5.2 Core Components

- [ ] **Post Management**
  - [ ] Post creation form with validation
  - [ ] Post editing form with auto-save
  - [ ] Post list with filtering and pagination
  - [ ] Post status badges and actions
  - [ ] Rich text editor integration

- [ ] **Category Management**
  - [ ] Category creation/editing forms
  - [ ] Category hierarchy display
  - [ ] Category selection dropdowns
  - [ ] Category deletion with post reassignment

- [ ] **File Upload**
  - [ ] Featured image upload component
  - [ ] Drag and drop functionality
  - [ ] File validation and error handling
  - [ ] Upload progress indicators

### 5.3 Advanced Features

- [ ] **Search and Filtering**
  - [ ] Search input with debouncing
  - [ ] Advanced filter panels
  - [ ] Sort options and controls
  - [ ] Filter state persistence

- [ ] **State Management**
  - [ ] React Query cache configuration
  - [ ] Optimistic updates for better UX
  - [ ] Error boundary implementation
  - [ ] Loading state components

- [ ] **Permissions and Security**
  - [ ] Role-based component rendering
  - [ ] Action permission checks
  - [ ] Resource ownership validation
  - [ ] Admin-only features protection

### 5.4 UX Considerations

- [ ] **Form Experience**
  - [ ] Auto-save functionality
  - [ ] Unsaved changes warning
  - [ ] Field validation feedback
  - [ ] Success/error notifications

- [ ] **Performance**
  - [ ] Lazy loading for large lists
  - [ ] Image optimization
  - [ ] Query caching strategies
  - [ ] Bundle size optimization

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] Screen reader support
  - [ ] ARIA labels and descriptions
  - [ ] Focus management

### 5.5 Testing Strategy

- [ ] **Unit Tests**
  - [ ] Form validation logic
  - [ ] API client functions
  - [ ] Permission checking hooks
  - [ ] Utility functions

- [ ] **Integration Tests**
  - [ ] Complete form workflows
  - [ ] API error handling
  - [ ] File upload process
  - [ ] Search and filtering

- [ ] **E2E Tests**
  - [ ] Post creation flow
  - [ ] Publishing workflow
  - [ ] Image upload process
  - [ ] User permission scenarios

---

## Conclusion

This comprehensive integration guide provides everything needed to implement the Blog Service frontend:

✅ **Complete API coverage** - All endpoints with request/response schemas  
✅ **TypeScript definitions** - Full type safety and validation  
✅ **Business logic** - Error handling, permissions, and state management  
✅ **Implementation examples** - Ready-to-use React components  

**Key Benefits:**
- **Type Safety**: Full TypeScript coverage prevents runtime errors
- **Error Handling**: Comprehensive error management with user-friendly messages
- **Performance**: Optimistic updates and smart caching strategies
- **Accessibility**: Built-in support for keyboard navigation and screen readers
- **Scalability**: Modular component architecture for easy maintenance

**Next Steps:**
1. Follow the implementation checklist step by step
2. Customize components to match your design system
3. Add any additional business logic specific to your use case
4. Test thoroughly with different user roles and edge cases

---

**Integration Status**: ✅ Complete frontend integration guide  
**Documentation**: [Part 1](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_1_API_ENDPOINTS.md) | [Part 2](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_2_TYPES_VALIDATION.md) | [Part 3](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_3_ERROR_HANDLING_IMPLEMENTATION.md) | **Part 4**  
**Last Updated**: October 16, 2025
