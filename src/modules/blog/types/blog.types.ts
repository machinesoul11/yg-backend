/**
 * Blog Types
 * TypeScript type definitions for blog module
 */

// Enums (matching Prisma)
export type PostStatus = 
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'SCHEDULED'
  | 'ARCHIVED';

// Core Blog Types
export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentCategoryId: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  parentCategory?: Category | null;
  childCategories?: Category[];
  posts?: Post[];
  postCount?: number; // Virtual field for category stats
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  authorId: string;
  assignedToId: string | null;
  categoryId: string | null;
  featuredImageUrl: string | null;
  status: PostStatus;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  readTimeMinutes: number;
  viewCount: number;
  isFeatured: boolean;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  
  // Relations
  author?: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
  assignedTo?: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  } | null;
  category?: Category | null;
  revisions?: PostRevision[];
  workflowHistory?: PostWorkflowHistory[];
  revisionCount?: number; // Virtual field for revision stats
}

export interface PostRevision {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  revisionNote: string | null;
  createdAt: Date;
  
  // Relations
  post?: Post;
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface PostWorkflowHistory {
  id: string;
  postId: string;
  fromStatus: PostStatus;
  toStatus: PostStatus;
  userId: string;
  comments: string | null;
  reason: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  
  // Relations
  post?: Post;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
}

// Request/Response Types
export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string;
  parentCategoryId?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface CreatePostRequest {
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  assignedToId?: string;
  categoryId?: string;
  featuredImageUrl?: string;
  status?: PostStatus;
  publishedAt?: Date;
  scheduledFor?: Date;
  isFeatured?: boolean;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
}

export interface UpdatePostRequest {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  assignedToId?: string;
  categoryId?: string;
  featuredImageUrl?: string;
  status?: PostStatus;
  publishedAt?: Date;
  scheduledFor?: Date;
  isFeatured?: boolean;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  revisionNote?: string; // For tracking changes
}

export interface CreatePostRevisionRequest {
  postId: string;
  content: string;
  revisionNote?: string;
}

// Query Types
export interface CategoryFilters {
  parentCategoryId?: string | null;
  isActive?: boolean;
  search?: string;
}

export interface PostFilters {
  status?: PostStatus;
  authorId?: string;
  assignedToId?: string;
  categoryId?: string;
  published?: boolean;
  tags?: string[];
  search?: string;
  dateRange?: {
    start: Date | string;
    end: Date | string;
  };
}

export interface PostsQueryOptions {
  filters?: PostFilters;
  sortBy?: 'title' | 'publishedAt' | 'createdAt' | 'updatedAt' | 'viewCount';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  includeRevisions?: boolean;
}

export interface CategoriesQueryOptions {
  parentCategoryId?: string | null;
  includeChildren?: boolean;
  includePostCount?: boolean;
  filters?: CategoryFilters;
  sortBy?: 'name' | 'displayOrder' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Response Types
export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoriesResponse {
  categories: Category[];
  total: number;
}

// Analytics Types
export interface PostAnalytics {
  postId: string;
  viewCount: number;
  readTimeMinutes: number;
  engagementRate?: number;
  shareCount?: number;
  commentCount?: number;
}

export interface CategoryAnalytics {
  categoryId: string;
  postCount: number;
  totalViews: number;
  averageReadTime: number;
  publishedPostCount: number;
}

// Search Types
export interface SearchResult {
  id: string;
  title: string;
  excerpt: string | null;
  slug: string;
  publishedAt: Date | null;
  author: {
    name: string | null;
    avatar: string | null;
  };
  category: {
    name: string;
    slug: string;
  } | null;
  score: number; // Relevance score
  highlights: {
    title?: string;
    content?: string;
    excerpt?: string;
  };
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  categoryId?: string;
  authorId?: string;
  status?: PostStatus;
  publishedAfter?: Date;
  publishedBefore?: Date;
}

// Utility Types
export interface SlugGenerationOptions {
  title: string;
  existingSlugs?: string[];
  maxLength?: number;
}

export interface ReadTimeCalculationOptions {
  content: string;
  wordsPerMinute?: number; // Default: 200 WPM
}

export interface SEOMetadata {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonicalUrl?: string;
}

// Error Types
export interface BlogError {
  code: string;
  message: string;
  field?: string;
  value?: any;
}
