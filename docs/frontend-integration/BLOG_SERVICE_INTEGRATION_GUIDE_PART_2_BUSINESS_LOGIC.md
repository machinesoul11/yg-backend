# Blog Service - Frontend Integration Guide (Part 2: Business Logic & Validation)

## Classification Key
* 🌐 **SHARED** - Used by both public-facing website and admin backend
* 🔒 **ADMIN ONLY** - Internal operations and admin interface only
* ⚡ **HYBRID** - Core functionality used by both, with different access levels

---

## 1. Business Logic & Validation Rules

### Field Validation Requirements

#### Post Creation/Update
```typescript
// Title validation
const titleValidation = {
  required: true,
  minLength: 1,
  maxLength: 500,
  trim: true
};

// Content validation
const contentValidation = {
  required: true,
  minLength: 1,
  maxLength: 100000, // 100K characters
  richTextSupported: true
};

// Slug validation
const slugValidation = {
  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  maxLength: 150,
  uniqueRequired: true
};

// SEO fields
const seoValidation = {
  seoTitle: { maxLength: 70, optional: true },
  seoDescription: { maxLength: 160, optional: true },
  seoKeywords: { maxLength: 500, optional: true }
};

// Tags validation
const tagsValidation = {
  maxCount: 20,
  maxTagLength: 50,
  allowedCharacters: /^[a-zA-Z0-9\s\-_]+$/
};
```

#### Category Management
```typescript
const categoryValidation = {
  name: {
    required: true,
    maxLength: 100,
    trim: true
  },
  description: {
    maxLength: 5000,
    optional: true
  },
  displayOrder: {
    type: 'integer',
    min: 0,
    max: 9999,
    default: 0
  }
};
```

### Business Rules Frontend Should Enforce

#### Post Status Transitions
```typescript
const allowedStatusTransitions = {
  'DRAFT': ['PENDING_REVIEW', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'],
  'PENDING_REVIEW': ['APPROVED', 'REJECTED', 'DRAFT'],
  'APPROVED': ['PUBLISHED', 'SCHEDULED', 'DRAFT'],
  'REJECTED': ['DRAFT', 'PENDING_REVIEW'],
  'PUBLISHED': ['ARCHIVED'],  // Cannot go back to draft once published
  'SCHEDULED': ['DRAFT', 'PUBLISHED'], // Can cancel or publish early
  'ARCHIVED': ['PUBLISHED'] // Can restore published posts
};

// Frontend validation function
function canTransitionStatus(currentStatus: PostStatus, newStatus: PostStatus): boolean {
  return allowedStatusTransitions[currentStatus]?.includes(newStatus) ?? false;
}
```

#### Scheduling Rules
```typescript
// Scheduling validation
function validateScheduledDate(scheduledFor: Date): { valid: boolean; error?: string } {
  const now = new Date();
  
  if (scheduledFor <= now) {
    return { valid: false, error: 'Scheduled date must be in the future' };
  }
  
  // Optional: Limit how far in advance posts can be scheduled
  const maxAdvanceDays = 365; // 1 year
  const maxDate = new Date(now.getTime() + (maxAdvanceDays * 24 * 60 * 60 * 1000));
  
  if (scheduledFor > maxDate) {
    return { valid: false, error: `Cannot schedule more than ${maxAdvanceDays} days in advance` };
  }
  
  return { valid: true };
}
```

#### Category Hierarchy Rules
```typescript
// Prevent circular references
function validateCategoryParent(categoryId: string, parentCategoryId: string): boolean {
  // Frontend should maintain category tree and check for cycles
  // Cannot set a category as its own parent or create circular references
  return parentCategoryId !== categoryId && !isDescendantOf(parentCategoryId, categoryId);
}

// Maximum nesting depth
const MAX_CATEGORY_DEPTH = 5;
```

### Calculated/Derived Values

#### Read Time Calculation
```typescript
// Frontend can display estimated read time (backend calculates actual)
function calculateReadTime(content: string, wordsPerMinute: number = 250): number {
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}
```

#### Slug Generation
```typescript
// Frontend can preview slug generation
function generateSlug(title: string, existingSlugs: string[] = []): string {
  let baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  
  // Handle duplicates
  let slug = baseSlug;
  let counter = 1;
  
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
}
```

#### Excerpt Generation
```typescript
// Auto-generate excerpt if not provided
function generateExcerpt(content: string, maxLength: number = 160): string {
  // Strip HTML tags
  const plainText = content.replace(/<[^>]*>/g, '');
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  // Find last complete sentence within limit
  const truncated = plainText.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('. ');
  
  if (lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1);
  }
  
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.substring(0, lastSpace) + '...';
}
```

---

## 2. State Machine Logic

### Post Lifecycle State Machine
```typescript
interface PostStateMachine {
  currentState: PostStatus;
  allowedTransitions: PostStatus[];
  requiredFields: Record<PostStatus, string[]>;
  businessRules: Record<PostStatus, (post: Post) => boolean>;
}

const postStateMachine: Record<PostStatus, PostStateMachine> = {
  'DRAFT': {
    currentState: 'DRAFT',
    allowedTransitions: ['PENDING_REVIEW', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED'],
    requiredFields: ['title', 'content'],
    businessRules: {
      toPublished: (post) => post.title.length > 0 && post.content.length > 0,
      toScheduled: (post) => post.scheduledFor !== null && post.scheduledFor > new Date()
    }
  },
  // ... other states
};
```

---

## 3. Frontend Validation Implementation

### React Hook for Post Validation
```typescript
import { useState, useEffect } from 'react';
import { z } from 'zod';

// Zod schema for client-side validation
const createPostSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  content: z.string().min(1, 'Content is required').max(100000, 'Content too long'),
  excerpt: z.string().max(1000, 'Excerpt too long').optional(),
  categoryId: z.string().cuid('Invalid category').optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']).default('DRAFT'),
  scheduledFor: z.string().datetime().optional(),
  tags: z.array(z.string().max(50)).max(20, 'Too many tags'),
  seoTitle: z.string().max(70, 'SEO title too long').optional(),
  seoDescription: z.string().max(160, 'SEO description too long').optional(),
}).refine((data) => {
  // Business rule: If status is SCHEDULED, scheduledFor is required
  if (data.status === 'SCHEDULED') {
    return !!data.scheduledFor && new Date(data.scheduledFor) > new Date();
  }
  return true;
}, {
  message: 'Future scheduled date required when status is SCHEDULED',
  path: ['scheduledFor']
});

export function usePostValidation() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const validatePost = (post: Partial<CreatePostRequest>): boolean => {
    try {
      createPostSchema.parse(post);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            fieldErrors[err.path[0]] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };
  
  return { validatePost, errors };
}
```

### Form Validation Component
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

interface PostFormProps {
  initialData?: Partial<Post>;
  onSubmit: (data: CreatePostRequest) => void;
}

export function PostForm({ initialData, onSubmit }: PostFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<CreatePostRequest>({
    resolver: zodResolver(createPostSchema),
    defaultValues: initialData
  });
  
  const watchedTitle = watch('title');
  const watchedContent = watch('content');
  
  // Auto-generate slug when title changes
  useEffect(() => {
    if (watchedTitle && !initialData?.slug) {
      const slug = generateSlug(watchedTitle);
      setValue('slug', slug);
    }
  }, [watchedTitle]);
  
  // Auto-generate excerpt when content changes
  useEffect(() => {
    if (watchedContent && !watch('excerpt')) {
      const excerpt = generateExcerpt(watchedContent);
      setValue('excerpt', excerpt);
    }
  }, [watchedContent]);
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Form fields with validation */}
      <div>
        <label>Title</label>
        <input {...register('title')} />
        {errors.title && <span className="error">{errors.title.message}</span>}
      </div>
      
      {/* Status transition validation */}
      <div>
        <label>Status</label>
        <select {...register('status')}>
          {getAvailableStatuses(initialData?.status).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
      
      <button type="submit" disabled={!isValid}>
        Save Post
      </button>
    </form>
  );
}
```

---

## 4. Content Processing Rules

### Rich Text Content Validation
```typescript
interface ContentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedContent?: string;
}

function validateRichTextContent(content: string): ContentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for required content
  if (!content || content.trim().length === 0) {
    errors.push('Content cannot be empty');
  }
  
  // Check content length
  if (content.length > 100000) {
    errors.push('Content exceeds maximum length of 100,000 characters');
  }
  
  // Check for potentially dangerous HTML
  const dangerousTags = /<script|<iframe|<object|<embed/gi;
  if (dangerousTags.test(content)) {
    errors.push('Content contains potentially dangerous HTML tags');
  }
  
  // Check for broken HTML structure
  const openTags = content.match(/<[^/][^>]*>/g) || [];
  const closeTags = content.match(/<\/[^>]*>/g) || [];
  if (openTags.length !== closeTags.length) {
    warnings.push('Content may contain unclosed HTML tags');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    sanitizedContent: content // In production, run through HTML sanitizer
  };
}
```

### Tag Processing
```typescript
function normalizeTags(tags: string[]): string[] {
  return tags
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)
    .filter((tag, index, array) => array.indexOf(tag) === index) // Remove duplicates
    .slice(0, 20); // Limit to 20 tags
}

function validateTag(tag: string): { valid: boolean; error?: string } {
  if (tag.length === 0) {
    return { valid: false, error: 'Tag cannot be empty' };
  }
  
  if (tag.length > 50) {
    return { valid: false, error: 'Tag cannot exceed 50 characters' };
  }
  
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(tag)) {
    return { valid: false, error: 'Tag contains invalid characters' };
  }
  
  return { valid: true };
}
```

---

## 5. SEO Optimization Rules

### SEO Score Calculation
```typescript
interface SEOScore {
  score: number; // 0-100
  issues: string[];
  suggestions: string[];
}

function calculateSEOScore(post: CreatePostRequest): SEOScore {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let score = 100;
  
  // Title optimization
  if (!post.seoTitle && !post.title) {
    issues.push('Missing SEO title');
    score -= 20;
  } else {
    const title = post.seoTitle || post.title;
    if (title.length < 30) {
      suggestions.push('SEO title could be longer (30-60 characters optimal)');
      score -= 5;
    }
    if (title.length > 60) {
      issues.push('SEO title too long (may be truncated in search results)');
      score -= 10;
    }
  }
  
  // Description optimization
  if (!post.seoDescription && !post.excerpt) {
    issues.push('Missing SEO description');
    score -= 15;
  } else {
    const description = post.seoDescription || post.excerpt;
    if (description && description.length < 120) {
      suggestions.push('SEO description could be longer (120-160 characters optimal)');
      score -= 5;
    }
    if (description && description.length > 160) {
      issues.push('SEO description too long (may be truncated)');
      score -= 10;
    }
  }
  
  // Content optimization
  if (post.content.length < 300) {
    suggestions.push('Content could be longer for better SEO');
    score -= 5;
  }
  
  // Featured image
  if (!post.featuredImageUrl) {
    suggestions.push('Add a featured image for better social sharing');
    score -= 5;
  }
  
  return { score: Math.max(0, score), issues, suggestions };
}
```

---

## 6. Real-time Validation Hooks

### useRealtimeValidation Hook
```typescript
import { useState, useEffect, useMemo } from 'react';
import { debounce } from 'lodash';

export function useRealtimeValidation<T>(
  data: T,
  validationFn: (data: T) => { valid: boolean; errors: Record<string, string> }
) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValid, setIsValid] = useState(false);
  
  const debouncedValidation = useMemo(
    () => debounce((data: T) => {
      const result = validationFn(data);
      setErrors(result.errors);
      setIsValid(result.valid);
    }, 300),
    [validationFn]
  );
  
  useEffect(() => {
    debouncedValidation(data);
    return () => debouncedValidation.cancel();
  }, [data, debouncedValidation]);
  
  return { errors, isValid };
}
```

### Usage Example
```typescript
function PostEditor() {
  const [postData, setPostData] = useState<Partial<CreatePostRequest>>({});
  
  const { errors, isValid } = useRealtimeValidation(
    postData,
    (data) => {
      try {
        createPostSchema.parse(data);
        return { valid: true, errors: {} };
      } catch (error) {
        // ... handle validation errors
        return { valid: false, errors: fieldErrors };
      }
    }
  );
  
  return (
    <div>
      {/* Form fields with real-time validation feedback */}
    </div>
  );
}
```

---

Continue to [Part 3: Error Handling & Implementation](./BLOG_SERVICE_INTEGRATION_GUIDE_PART_3_ERROR_HANDLING_IMPLEMENTATION.md) for comprehensive error handling, rate limiting, file uploads, and complete implementation examples.
