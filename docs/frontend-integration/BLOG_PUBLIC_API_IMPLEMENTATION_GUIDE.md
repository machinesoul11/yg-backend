# 🛠️ Blog Public API - Implementation Guide

## Overview
This document provides step-by-step implementation guidance, code examples, and best practices for integrating the Blog Public API into your frontend application.

---

## 1. API Client Setup

### 1.1 Base API Client

```typescript
// lib/api/blog-client.ts
import { z } from 'zod';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';

class BlogAPIClient {
  private baseURL: string;

  constructor(baseURL: string = BASE_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    // Handle rate limiting
    this.handleRateLimit(response);

    if (!response.ok) {
      throw await this.handleError(response);
    }

    return response.json();
  }

  private handleRateLimit(response: Response): void {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }
    
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`API rate limit warning: ${remaining} requests remaining`);
    }
  }

  private async handleError(response: Response): Promise<Error> {
    try {
      const errorData = await response.json();
      return new Error(errorData.error || 'API request failed');
    } catch {
      return new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  // ========================================
  // Public API Methods
  // ========================================

  async getPosts(params: BlogPostsRequest = {}): Promise<BlogPostsResponse> {
    const searchParams = new URLSearchParams();
    
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.category) searchParams.set('category', params.category);
    if (params.tag) searchParams.set('tag', params.tag);
    if (params.search) searchParams.set('search', params.search);
    if (params.sort) searchParams.set('sort', params.sort);

    const endpoint = `/api/blog/posts?${searchParams.toString()}`;
    return this.request<BlogPostsResponse>(endpoint);
  }

  async getPost(slug: string): Promise<BlogPostResponse> {
    return this.request<BlogPostResponse>(`/api/blog/posts/${slug}`);
  }

  async getSitemap(): Promise<string> {
    const response = await fetch(`${this.baseURL}/api/blog/sitemap.xml`);
    if (!response.ok) {
      throw new Error('Failed to fetch sitemap');
    }
    return response.text();
  }

  async getRSSFeed(): Promise<string> {
    const response = await fetch(`${this.baseURL}/api/blog/rss.xml`);
    if (!response.ok) {
      throw new Error('Failed to fetch RSS feed');
    }
    return response.text();
  }
}

// Export singleton instance
export const blogAPI = new BlogAPIClient();
```

### 1.2 Request/Response Types

```typescript
// types/blog-api.ts
export interface BlogPostsRequest {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
  search?: string;
  sort?: 'newest' | 'oldest' | 'popular' | 'featured';
}

export interface BlogPostsResponse {
  data: PublicBlogPost[];
  pagination: PaginationMeta;
  filters: AppliedFilters;
}

export interface BlogPostResponse {
  success: true;
  data: PublicBlogPostDetailed;
}

// Copy types from Part 1 here...
```

---

## 2. React Query Integration

### 2.1 Query Keys & Functions

```typescript
// hooks/blog/query-keys.ts
export const blogKeys = {
  all: ['blog'] as const,
  posts: () => [...blogKeys.all, 'posts'] as const,
  postsList: (params: BlogPostsRequest) => [...blogKeys.posts(), 'list', params] as const,
  post: (slug: string) => [...blogKeys.posts(), 'detail', slug] as const,
  sitemap: () => [...blogKeys.all, 'sitemap'] as const,
  rss: () => [...blogKeys.all, 'rss'] as const,
};

// Query configuration
export const blogQueryConfig = {
  posts: {
    staleTime: 5 * 60 * 1000,        // 5 minutes
    cacheTime: 30 * 60 * 1000,       // 30 minutes
    refetchOnWindowFocus: false,
    retry: (failureCount: number, error: any) => {
      // Don't retry on 404s
      if (error?.status === 404) return false;
      return failureCount < 3;
    },
  },
  post: {
    staleTime: 30 * 60 * 1000,       // 30 minutes
    cacheTime: 60 * 60 * 1000,       // 1 hour
    refetchOnWindowFocus: false,
    retry: (failureCount: number, error: any) => {
      if (error?.status === 404) return false;
      return failureCount < 2;
    },
  },
};
```

### 2.2 Custom Hooks

```typescript
// hooks/blog/use-blog-posts.ts
import { useQuery } from '@tanstack/react-query';
import { blogAPI } from '@/lib/api/blog-client';
import { blogKeys, blogQueryConfig } from './query-keys';

export function useBlogPosts(params: BlogPostsRequest = {}) {
  return useQuery({
    queryKey: blogKeys.postsList(params),
    queryFn: () => blogAPI.getPosts(params),
    ...blogQueryConfig.posts,
  });
}

// hooks/blog/use-blog-post.ts
export function useBlogPost(slug: string) {
  return useQuery({
    queryKey: blogKeys.post(slug),
    queryFn: () => blogAPI.getPost(slug),
    ...blogQueryConfig.post,
    enabled: !!slug,
  });
}

// hooks/blog/use-infinite-posts.ts
import { useInfiniteQuery } from '@tanstack/react-query';

export function useInfiniteBlogPosts(
  baseParams: Omit<BlogPostsRequest, 'page'> = {}
) {
  return useInfiniteQuery({
    queryKey: blogKeys.postsList(baseParams),
    queryFn: ({ pageParam = 1 }) => 
      blogAPI.getPosts({ ...baseParams, page: pageParam }),
    getNextPageParam: (lastPage, pages) => {
      return lastPage.pagination.has_next_page 
        ? lastPage.pagination.current_page + 1 
        : undefined;
    },
    ...blogQueryConfig.posts,
  });
}

// hooks/blog/use-related-posts.ts
export function useRelatedPosts(currentPostSlug: string) {
  const { data: currentPost } = useBlogPost(currentPostSlug);
  
  return useQuery({
    queryKey: ['blog', 'related', currentPostSlug],
    queryFn: async () => {
      if (!currentPost?.data.category) return [];
      
      const relatedResponse = await blogAPI.getPosts({
        category: currentPost.data.category.slug,
        limit: 6,
      });
      
      // Filter out current post and limit to 5
      return relatedResponse.data
        .filter(post => post.slug !== currentPostSlug)
        .slice(0, 5);
    },
    enabled: !!currentPost?.data.category,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
```

### 2.3 Prefetching Strategies

```typescript
// lib/blog/prefetch.ts
import { QueryClient } from '@tanstack/react-query';
import { blogAPI } from '@/lib/api/blog-client';
import { blogKeys } from '@/hooks/blog/query-keys';

export async function prefetchBlogPosts(
  queryClient: QueryClient,
  params: BlogPostsRequest = {}
) {
  await queryClient.prefetchQuery({
    queryKey: blogKeys.postsList(params),
    queryFn: () => blogAPI.getPosts(params),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchBlogPost(
  queryClient: QueryClient,
  slug: string
) {
  await queryClient.prefetchQuery({
    queryKey: blogKeys.post(slug),
    queryFn: () => blogAPI.getPost(slug),
    staleTime: 30 * 60 * 1000,
  });
}

// Usage in Next.js pages/components
export async function getStaticProps({ params }) {
  const queryClient = new QueryClient();
  
  // Prefetch the post and related posts
  await prefetchBlogPost(queryClient, params.slug);
  
  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
    revalidate: 60, // ISR every minute
  };
}
```

---

## 3. Component Examples

### 3.1 Blog Posts List Component

```typescript
// components/blog/BlogPostsList.tsx
import React from 'react';
import { useBlogPosts } from '@/hooks/blog/use-blog-posts';
import { BlogPostCard } from './BlogPostCard';
import { BlogPagination } from './BlogPagination';
import { BlogFilters } from './BlogFilters';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface BlogPostsListProps {
  initialParams?: BlogPostsRequest;
  showFilters?: boolean;
  showPagination?: boolean;
}

export function BlogPostsList({ 
  initialParams = {}, 
  showFilters = true,
  showPagination = true 
}: BlogPostsListProps) {
  const [params, setParams] = React.useState<BlogPostsRequest>(initialParams);
  
  const { 
    data, 
    isLoading, 
    isError, 
    error,
    refetch 
  } = useBlogPosts(params);

  const handleFilterChange = (newFilters: Partial<BlogPostsRequest>) => {
    setParams(prev => ({ 
      ...prev, 
      ...newFilters, 
      page: 1 // Reset to first page on filter change
    }));
  };

  const handlePageChange = (page: number) => {
    setParams(prev => ({ ...prev, page }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage 
        message="Failed to load blog posts"
        retry={refetch}
      />
    );
  }

  if (!data?.data.length) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No posts found
        </h3>
        <p className="text-gray-500">
          {params.search ? 'Try adjusting your search terms.' : 'Check back later for new content.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showFilters && (
        <BlogFilters 
          filters={params}
          onFilterChange={handleFilterChange}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {data.data.map((post) => (
          <BlogPostCard 
            key={post.id} 
            post={post}
          />
        ))}
      </div>

      {showPagination && data.pagination.total_pages > 1 && (
        <BlogPagination
          currentPage={data.pagination.current_page}
          totalPages={data.pagination.total_pages}
          onPageChange={handlePageChange}
        />
      )}

      {/* Results summary */}
      <div className="text-sm text-gray-500 text-center">
        Showing {data.data.length} of {data.pagination.total_posts} posts
      </div>
    </div>
  );
}
```

### 3.2 Individual Blog Post Component

```typescript
// components/blog/BlogPost.tsx
import React from 'react';
import { useBlogPost } from '@/hooks/blog/use-blog-post';
import { useRelatedPosts } from '@/hooks/blog/use-related-posts';
import { BlogPostHeader } from './BlogPostHeader';
import { BlogPostContent } from './BlogPostContent';
import { BlogPostSidebar } from './BlogPostSidebar';
import { RelatedPosts } from './RelatedPosts';
import { SEOHead } from '@/components/seo/SEOHead';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorMessage } from '@/components/ui/ErrorMessage';

interface BlogPostProps {
  slug: string;
}

export function BlogPost({ slug }: BlogPostProps) {
  const { 
    data, 
    isLoading, 
    isError, 
    error 
  } = useBlogPost(slug);

  const { data: relatedPosts } = useRelatedPosts(slug);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (isError) {
    const is404 = error?.message?.includes('404') || error?.message?.includes('not found');
    
    if (is404) {
      return (
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Post Not Found
          </h1>
          <p className="text-gray-600 mb-8">
            The blog post you're looking for doesn't exist or has been removed.
          </p>
          <a 
            href="/blog" 
            className="inline-flex items-center px-4 py-2 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Blog
          </a>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <ErrorMessage 
          message="Failed to load blog post"
          retry={() => window.location.reload()}
        />
      </div>
    );
  }

  const post = data!.data;

  return (
    <>
      <SEOHead
        title={post.seo.title || post.title}
        description={post.seo.description || post.excerpt}
        keywords={post.seo.keywords}
        canonicalUrl={`https://yesgoddess.agency/blog/${post.slug}`}
        ogImage={post.featured_image_url}
        ogType="article"
        article={{
          publishedTime: post.published_at,
          author: post.author?.name,
          tags: post.tags,
        }}
      />

      <article className="max-w-4xl mx-auto px-4 py-8">
        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          <div className="lg:col-span-3">
            <BlogPostHeader post={post} />
            <BlogPostContent 
              content={post.content}
              readTime={post.read_time_minutes}
            />
          </div>
          
          <div className="lg:col-span-1">
            <BlogPostSidebar 
              post={post}
              relatedPosts={relatedPosts}
            />
          </div>
        </div>
      </article>

      {relatedPosts && relatedPosts.length > 0 && (
        <section className="max-w-4xl mx-auto px-4 py-8 border-t">
          <RelatedPosts posts={relatedPosts} />
        </section>
      )}
    </>
  );
}
```

### 3.3 Search Component

```typescript
// components/blog/BlogSearch.tsx
import React from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useBlogPosts } from '@/hooks/blog/use-blog-posts';
import { BlogPostCard } from './BlogPostCard';
import { SearchIcon } from '@heroicons/react/24/outline';

export function BlogSearch() {
  const [query, setQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const debouncedQuery = useDebouncedValue(query, 500);

  const { 
    data,
    isLoading,
    isFetching 
  } = useBlogPosts(
    { 
      search: debouncedQuery || undefined,
      limit: 20 
    },
    { enabled: debouncedQuery.length >= 2 }
  );

  React.useEffect(() => {
    setIsSearching(isFetching);
  }, [isFetching]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (e.target.value.length >= 2) {
      setIsSearching(true);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setIsSearching(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Search Input */}
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={query}
          onChange={handleSearchChange}
          placeholder="Search blog posts..."
          className="block w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />

        {query && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <span className="text-gray-400 hover:text-gray-600">×</span>
          </button>
        )}

        {isSearching && (
          <div className="absolute inset-y-0 right-8 flex items-center">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Search Results */}
      {debouncedQuery.length >= 2 && (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : data?.data.length ? (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">
                  Search Results ({data.pagination.total_posts})
                </h2>
                <p className="text-sm text-gray-500">
                  Results for "{debouncedQuery}"
                </p>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                {data.data.map((post) => (
                  <BlogPostCard key={post.id} post={post} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No results found
              </h3>
              <p className="text-gray-500">
                Try different keywords or check your spelling.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Search Tips */}
      {!debouncedQuery && (
        <div className="text-center py-12 text-gray-500">
          <p>Start typing to search through our blog posts...</p>
          <p className="text-sm mt-2">
            Search across titles, content, and tags
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## 4. Error Boundary & Fallback Components

### 4.1 Blog Error Boundary

```typescript
// components/blog/BlogErrorBoundary.tsx
import React from 'react';

interface BlogErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface BlogErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; retry: () => void }>;
}

export class BlogErrorBoundary extends React.Component<
  BlogErrorBoundaryProps,
  BlogErrorBoundaryState
> {
  constructor(props: BlogErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): BlogErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Blog error boundary caught an error:', error, errorInfo);
    
    // Log to error reporting service
    // reportError(error, { context: 'BlogErrorBoundary', errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultBlogErrorFallback;
      return (
        <FallbackComponent 
          error={this.state.error} 
          retry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// Default fallback component
function DefaultBlogErrorFallback({ 
  error, 
  retry 
}: { 
  error?: Error; 
  retry: () => void; 
}) {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-lg font-medium text-red-800 mb-2">
          Something went wrong
        </h2>
        <p className="text-red-600 mb-4">
          We're having trouble loading the blog content. Please try again.
        </p>
        {error && (
          <details className="text-sm text-red-500 mb-4">
            <summary className="cursor-pointer">Error details</summary>
            <pre className="mt-2 text-left overflow-auto">
              {error.message}
            </pre>
          </details>
        )}
        <button
          onClick={retry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
```

---

## 5. Next.js App Router Integration

### 5.1 Blog Layout

```typescript
// app/blog/layout.tsx
import { QueryClient, Hydrate } from '@tanstack/react-query';
import { BlogErrorBoundary } from '@/components/blog/BlogErrorBoundary';
import { BlogProvider } from '@/context/BlogContext';

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BlogProvider>
      <BlogErrorBoundary>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </BlogErrorBoundary>
    </BlogProvider>
  );
}
```

### 5.2 Blog Posts Page

```typescript
// app/blog/page.tsx
import { Metadata } from 'next';
import { BlogPostsList } from '@/components/blog/BlogPostsList';
import { BlogHero } from '@/components/blog/BlogHero';

export const metadata: Metadata = {
  title: 'Blog | YES GODDESS',
  description: 'Latest insights, updates, and stories from YES GODDESS - empowering creators and brands in the digital space.',
  openGraph: {
    title: 'YES GODDESS Blog',
    description: 'Latest insights, updates, and stories from YES GODDESS',
    url: 'https://yesgoddess.agency/blog',
    type: 'website',
  },
};

export default function BlogPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Parse search params for initial filters
  const initialParams = {
    page: searchParams.page ? parseInt(searchParams.page as string) : 1,
    category: searchParams.category as string,
    tag: searchParams.tag as string,
    search: searchParams.search as string,
    sort: searchParams.sort as 'newest' | 'oldest' | 'popular' | 'featured',
  };

  return (
    <div className="py-8">
      <BlogHero />
      <div className="mt-12">
        <BlogPostsList 
          initialParams={initialParams}
          showFilters={true}
          showPagination={true}
        />
      </div>
    </div>
  );
}
```

### 5.3 Individual Post Page

```typescript
// app/blog/[slug]/page.tsx
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { blogAPI } from '@/lib/api/blog-client';
import { BlogPost } from '@/components/blog/BlogPost';

interface BlogPostPageProps {
  params: { slug: string };
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  try {
    const { data: post } = await blogAPI.getPost(params.slug);
    
    return {
      title: post.seo.title || post.title,
      description: post.seo.description || post.excerpt,
      keywords: post.seo.keywords,
      openGraph: {
        title: post.title,
        description: post.excerpt || '',
        url: `https://yesgoddess.agency/blog/${post.slug}`,
        type: 'article',
        publishedTime: post.published_at,
        authors: post.author?.name ? [post.author.name] : undefined,
        images: post.featured_image_url ? [post.featured_image_url] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: post.title,
        description: post.excerpt || '',
        images: post.featured_image_url ? [post.featured_image_url] : undefined,
      },
    };
  } catch (error) {
    return {
      title: 'Post Not Found | YES GODDESS',
      description: 'The blog post you are looking for could not be found.',
    };
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  try {
    // Validate the post exists (for static generation)
    await blogAPI.getPost(params.slug);
    
    return <BlogPost slug={params.slug} />;
  } catch (error) {
    notFound();
  }
}

// Generate static params for popular posts
export async function generateStaticParams() {
  try {
    const { data } = await blogAPI.getPosts({ 
      limit: 50, 
      sort: 'popular' 
    });
    
    return data.map((post) => ({
      slug: post.slug,
    }));
  } catch {
    return [];
  }
}
```

---

## Next: Advanced Features & SEO
👉 Continue to [**Part 3: Advanced Features & SEO**](./BLOG_PUBLIC_API_SEO_GUIDE.md) for SEO optimization, sitemap integration, RSS feeds, and performance optimization.
