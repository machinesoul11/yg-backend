# Editorial Features - API Endpoints & Types Integration Guide

🔒 **ADMIN ONLY** - Internal operations and admin interface only

## Overview
This guide covers the Editorial Features module API endpoints for author assignment, content approval workflow, revision comparison, scheduling calendar, and bulk operations. All endpoints are accessible via the `/api/trpc/blog.contentWorkflow.*` namespace.

---

## 📡 API Endpoints Reference

### 1. Revision Management (`/revisions/`)

#### Create Revision
```typescript
blog.contentWorkflow.revisions.create

// Input Schema
interface CreateRevisionInput {
  postId: string;           // CUID format
  content: string;          // HTML/Markdown content
  revisionNote?: string;    // Optional description of changes
}

// Response
interface RevisionResponse {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  revisionNote: string | null;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string;
  };
}
```

#### List Revisions
```typescript
blog.contentWorkflow.revisions.list

// Input Schema
interface ListRevisionsInput {
  postId: string;
  page?: number;           // Default: 1, Min: 1
  limit?: number;          // Default: 20, Min: 1, Max: 100
}

// Response
interface RevisionsListResponse {
  revisions: RevisionResponse[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
```

#### Compare Revisions
```typescript
blog.contentWorkflow.revisions.compare

// Input Schema
interface CompareRevisionsInput {
  postId: string;
  oldRevisionId: string;
  newRevisionId: string;
}

// Response
interface RevisionComparisonResponse {
  postId: string;
  oldRevision: RevisionResponse;
  newRevision: RevisionResponse;
  diff: {
    html: string;           // HTML with diff highlighting
    statistics: {
      charactersAdded: number;
      charactersRemoved: number;
      wordsAdded: number;
      wordsRemoved: number;
      changePercentage: number;
    };
  };
}
```

#### Compare with Current
```typescript
blog.contentWorkflow.revisions.compareWithCurrent

// Input Schema
interface CompareWithCurrentInput {
  postId: string;
  revisionId: string;
}

// Response: Same as RevisionComparisonResponse
```

#### Restore Revision
```typescript
blog.contentWorkflow.revisions.restore

// Input Schema
interface RestoreRevisionInput {
  postId: string;
  revisionId: string;
  reason?: string;         // Explanation for restoration
}

// Response
interface RestoreRevisionResponse {
  success: boolean;
  post: {
    id: string;
    title: string;
    content: string;      // Content restored to selected revision
    updatedAt: Date;
  };
  backupRevision: RevisionResponse; // Auto-created backup before restore
}
```

---

### 2. Content Calendar (`/calendar/`)

#### Schedule Post
```typescript
blog.contentWorkflow.calendar.schedulePost

// Input Schema
interface SchedulePostInput {
  postId: string;
  scheduledFor: Date;      // Must be in the future
  reason?: string;
}

// Response
interface ScheduledPostResponse {
  id: string;
  title: string;
  status: 'SCHEDULED';
  scheduledFor: Date;
  author: {
    id: string;
    name: string | null;
  };
  category: {
    id: string;
    name: string;
  } | null;
}
```

#### Cancel Scheduled Post
```typescript
blog.contentWorkflow.calendar.cancelScheduled

// Input Schema
interface CancelScheduledInput {
  postId: string;
  reason?: string;
}

// Response: Updated post with status reverted to previous state
```

#### Reschedule Post
```typescript
blog.contentWorkflow.calendar.reschedule

// Input Schema
interface ReschedulePostInput {
  postId: string;
  newScheduledFor: Date;   // Must be in the future
  reason?: string;
}

// Response: ScheduledPostResponse with updated scheduledFor
```

#### Get Calendar View
```typescript
blog.contentWorkflow.calendar.getView

// Input Schema
interface CalendarViewInput {
  startDate: Date;
  endDate: Date;
  filters?: {
    authorId?: string;
    categoryId?: string;
    status?: PostStatus[];
    tags?: string[];
    isFeatured?: boolean;
  };
}

// Response
interface CalendarViewResponse {
  events: CalendarEvent[];
  summary: {
    total: number;
    scheduled: number;
    published: number;
    draft: number;
    pendingReview: number;
  };
  period: {
    start: Date;
    end: Date;
  };
}

interface CalendarEvent {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  scheduledFor: Date;
  publishedAt: Date | null;
  authorId: string;
  authorName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  excerpt: string | null;
  tags: string[];
  isFeatured: boolean;
}
```

#### Monthly Calendar
```typescript
blog.contentWorkflow.calendar.getMonthly

// Input Schema
interface MonthlyCalendarInput {
  year: number;
  month: number;           // 1-12
  filters?: CalendarFilters;
}

// Response: CalendarViewResponse for the specified month
```

#### Today's Scheduled Posts
```typescript
blog.contentWorkflow.calendar.getToday

// No input required
// Response: CalendarEvent[] for posts scheduled today
```

#### Upcoming Posts
```typescript
blog.contentWorkflow.calendar.getUpcoming

// Input Schema
interface UpcomingPostsInput {
  days?: number;           // Default: 7, next N days to check
}

// Response: CalendarEvent[] for posts scheduled in next N days
```

#### Overdue Posts (Admin Only)
```typescript
blog.contentWorkflow.calendar.getOverdue

// No input required
// Response: CalendarEvent[] for posts that should have been published but weren't
```

---

### 3. Bulk Operations (`/bulk/`)

#### Preview Bulk Operation (Dry Run)
```typescript
blog.contentWorkflow.bulk.preview

// Input Schema
interface BulkOperationInput {
  postIds: string[];       // Min: 1, Max: 100 posts
  operation: 'publish' | 'delete' | 'archive' | 'assign' | 'categorize' | 'tag' | 'feature' | 'unfeature';
  parameters?: {
    assignedToId?: string; // Required for 'assign' operation
    categoryId?: string;   // Required for 'categorize' operation
    tags?: string[];       // Required for 'tag' operation
    reason?: string;       // Optional description
  };
}

// Response
interface BulkOperationPreviewResponse {
  eligible: string[];      // Post IDs that can be processed
  ineligible: Array<{
    postId: string;
    reason: string;        // Why this post can't be processed
  }>;
  warnings: Array<{
    postId: string;
    message: string;       // Warnings about the operation
  }>;
  summary: {
    total: number;
    eligible: number;
    ineligible: number;
  };
}
```

#### Execute Bulk Operation
```typescript
blog.contentWorkflow.bulk.execute

// Input Schema: Same as BulkOperationInput
// Response
interface BulkOperationResult {
  successful: string[];    // Post IDs successfully processed
  failed: Array<{
    postId: string;
    error: string;         // Error message for failed operation
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}
```

#### Get Bulk Operation History (Admin Only)
```typescript
blog.contentWorkflow.bulk.getHistory

// Input Schema
interface BulkHistoryInput {
  userId?: string;         // Filter by user who performed operation
  operation?: string;      // Filter by operation type
  limit?: number;          // Default: 50, Max: 100
}

// Response
interface BulkOperationHistory {
  operations: Array<{
    id: string;
    operation: string;
    userId: string;
    userName: string;
    postIds: string[];
    parameters: Record<string, any>;
    result: BulkOperationResult;
    executionTime: number; // Milliseconds
    createdAt: Date;
  }>;
  total: number;
}
```

---

## 🔐 Authentication Requirements

All endpoints require authentication and role-based authorization:

| Endpoint Group | Required Roles | Notes |
|----------------|----------------|--------|
| Revisions (create, list, compare) | AUTHOR, EDITOR, ADMIN | Authors can only access own posts |
| Revisions (restore) | EDITOR, ADMIN | Restoration requires editorial permissions |
| Calendar (schedule, cancel, reschedule) | EDITOR, ADMIN | Scheduling operations |
| Calendar (views) | AUTHOR, EDITOR, ADMIN | All can view calendar |
| Calendar (getOverdue) | ADMIN | Admin-only monitoring |
| Bulk (preview, execute) | EDITOR, ADMIN | Bulk operations |
| Bulk (getHistory) | ADMIN | Admin-only audit trail |

---

## 📊 Query Parameters & Pagination

### Standard Pagination Pattern
```typescript
interface PaginationInput {
  page?: number;           // Default: 1, Min: 1
  limit?: number;          // Default: 20, Min: 1, Max: 100
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}
```

### Calendar Filtering
All calendar endpoints support consistent filtering:
```typescript
interface CalendarFilters {
  authorId?: string;       // Filter by post author
  categoryId?: string;     // Filter by post category
  status?: PostStatus[];   // Filter by post status(es)
  tags?: string[];         // Filter by post tags (AND logic)
  isFeatured?: boolean;    // Filter by featured status
}
```

---

## 🚨 Rate Limiting

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Revision Operations | 30 requests | per minute |
| Calendar Views | 60 requests | per minute |
| Bulk Operations | 5 requests | per minute |
| Preview Operations | 20 requests | per minute |

**Headers to Check:**
- `X-RateLimit-Limit`: Total requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Timestamp when limit resets

---

## 💾 Caching Strategy

### Client-Side Caching Recommendations
```typescript
// React Query cache times
const cacheConfig = {
  revisions: {
    list: 5 * 60 * 1000,        // 5 minutes
    compare: 10 * 60 * 1000,    // 10 minutes
  },
  calendar: {
    views: 2 * 60 * 1000,       // 2 minutes
    today: 30 * 1000,           // 30 seconds
    upcoming: 1 * 60 * 1000,    // 1 minute
  },
  bulk: {
    preview: 0,                  // No caching for previews
    history: 5 * 60 * 1000,     // 5 minutes
  }
};
```

### Cache Invalidation
Invalidate relevant queries after these operations:
- **Revision created/restored**: Invalidate revision lists and post data
- **Post scheduled/rescheduled**: Invalidate calendar views and upcoming posts
- **Bulk operation executed**: Invalidate affected post lists and calendar views

---

## 🔧 Client Implementation Helpers

### API Client Setup
```typescript
// Example React Query setup
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../path-to-your-trpc-router';

export const trpc = createTRPCReact<AppRouter>();

// Usage example
const { data: revisions, isLoading } = trpc.blog.contentWorkflow.revisions.list.useQuery({
  postId: 'cm2example',
  page: 1,
  limit: 20
});
```

### Error Handling Pattern
```typescript
// Standard error handling for all endpoints
try {
  const result = await trpc.blog.contentWorkflow.revisions.create.mutate(input);
  // Handle success
} catch (error) {
  if (error.data?.code === 'POST_NOT_FOUND') {
    // Handle specific error
  } else if (error.data?.code === 'INSUFFICIENT_PERMISSIONS') {
    // Handle permission error
  } else {
    // Handle generic error
  }
}
```
