# Content Workflow Editorial Features Implementation

## Overview

This implementation adds comprehensive editorial workflow features to the YesGoddess blog system, including author assignment, approval workflows, revision comparison, content scheduling, and bulk operations.

## Features Implemented

### 1. Author Assignment System ✅

**Database Changes:**
- Added `assignedToId` field to `Post` model
- Added `PostsAssignedTo` relation in `User` model
- Added indexes for performance optimization

**Functionality:**
- Assign posts to editors or reviewers
- Reassign posts between users
- Bulk reassignment operations
- Assignment history tracking
- Notification system for assignments

**API Endpoints:**
- Assignment operations will be added to existing blog router
- Bulk assignment via bulk operations router

### 2. Content Approval Workflow System ✅

**Database Changes:**
- Extended `PostStatus` enum with new states:
  - `PENDING_REVIEW` - Submitted for editorial review
  - `APPROVED` - Approved for publication
  - `REJECTED` - Rejected, needs revision
- Added `PostWorkflowHistory` model for complete audit trail

**Workflow States:**
```
DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED
                    ↓         ↓
                REJECTED  SCHEDULED
                    ↓         ↓
                DRAFT    PUBLISHED
```

**Transitions Available:**
- `submit_for_review`: DRAFT → PENDING_REVIEW
- `approve`: PENDING_REVIEW → APPROVED  
- `reject`: PENDING_REVIEW/APPROVED → REJECTED
- `request_changes`: PENDING_REVIEW → DRAFT
- `publish`: APPROVED/DRAFT → PUBLISHED
- `schedule`: APPROVED/DRAFT → SCHEDULED
- `archive`: PUBLISHED/DRAFT/REJECTED → ARCHIVED
- `restore_to_draft`: ARCHIVED/REJECTED → DRAFT

**Features:**
- Role-based transition permissions
- Automatic notifications to relevant users
- Comprehensive audit trail
- Comments and reasons for transitions

### 3. Revision Comparison Tool ✅

**Services Implemented:**
- `RevisionComparisonService` - Complete revision management

**Features:**
- Automatic revision creation on significant changes
- Side-by-side revision comparison
- HTML diff visualization with syntax highlighting
- Statistical analysis (characters/words added/removed)
- Restore to previous revision with rollback safety
- Revision history with pagination

**API Endpoints:**
- `POST /revisions/create` - Create new revision
- `GET /revisions/list` - Get post revision history
- `GET /revisions/compare` - Compare two revisions
- `GET /revisions/compareWithCurrent` - Compare revision with current
- `POST /revisions/restore` - Restore to previous revision

### 4. Content Scheduling Calendar View ✅

**Services Implemented:**
- `ContentCalendarService` - Complete calendar management

**Features:**
- Schedule posts for future publication
- Visual calendar interface support
- Monthly, weekly, and daily views
- Reschedule and cancel operations
- Overdue post detection
- Today's scheduled posts
- Upcoming posts preview (configurable days)
- Advanced filtering (author, category, status, tags)

**API Endpoints:**
- `POST /calendar/schedulePost` - Schedule a post
- `POST /calendar/cancelScheduled` - Cancel scheduled post
- `POST /calendar/reschedule` - Reschedule a post
- `GET /calendar/getView` - Get calendar for date range
- `GET /calendar/getMonthly` - Get monthly calendar
- `GET /calendar/getToday` - Today's scheduled posts
- `GET /calendar/getUpcoming` - Upcoming scheduled posts
- `GET /calendar/getOverdue` - Overdue scheduled posts

### 5. Bulk Operations System ✅

**Services Implemented:**
- `EnhancedBulkOperationsService` - Advanced bulk operations

**Operations Supported:**
- `publish` - Bulk publish posts
- `delete` - Bulk soft delete posts
- `archive` - Bulk archive posts
- `assign` - Bulk reassign posts
- `categorize` - Bulk change categories
- `tag` - Bulk add tags
- `feature` - Bulk feature posts
- `unfeature` - Bulk unfeature posts

**Features:**
- Dry-run preview with validation
- Batch processing for performance
- Comprehensive error handling
- Individual success/failure tracking
- Operation limits and validation
- Authorization checks per operation
- Execution time tracking
- Operation history and auditing

**API Endpoints:**
- `POST /bulk/preview` - Preview bulk operation (dry run)
- `POST /bulk/execute` - Execute bulk operation
- `GET /bulk/getHistory` - Get bulk operation history

## Integration Points

### 1. Existing Blog System
- Builds on existing `Post`, `PostRevision`, and `Category` models
- Extends existing `BlogService` functionality
- Maintains compatibility with existing API endpoints

### 2. User Management
- Integrates with existing user roles and permissions
- Uses existing `AuditService` for comprehensive logging
- Leverages existing `NotificationService` for alerts

### 3. Job System
- Enhanced existing `scheduled-blog-publishing.job.ts`
- Integrates with existing BullMQ job infrastructure
- Supports background processing for bulk operations

### 4. Email & Notifications
- Uses existing notification system for workflow alerts
- Sends emails for assignment changes
- Notifies on status transitions

## Database Schema Changes

### New Enum Values
```sql
-- Extended PostStatus enum
ALTER TYPE "PostStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "PostStatus" ADD VALUE 'APPROVED'; 
ALTER TYPE "PostStatus" ADD VALUE 'REJECTED';

-- Extended NotificationType enum  
ALTER TYPE "NotificationType" ADD VALUE 'POST_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'POST_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'BLOG';
```

### New Tables
```sql
-- Post workflow history table
CREATE TABLE "post_workflow_history" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "from_status" "PostStatus" NOT NULL,
    "to_status" "PostStatus" NOT NULL, 
    "user_id" TEXT NOT NULL,
    "comments" TEXT,
    "reason" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "post_workflow_history_pkey" PRIMARY KEY ("id")
);
```

### Modified Tables
```sql
-- Added assignment field to posts table
ALTER TABLE "posts" ADD COLUMN "assigned_to_id" TEXT;
ALTER TABLE "posts" ADD CONSTRAINT "posts_assigned_to_id_fkey" 
    FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL;
```

## Security & Authorization

### Role-Based Access Control
- **Authors**: Can create drafts, submit for review, restore to draft
- **Editors**: Can approve, reject, request changes, publish, schedule, assign
- **Admins**: Full access to all operations including bulk operations

### Operation Validation
- Users can only transition posts they have permissions for
- Assignment operations verify target user has appropriate role
- Bulk operations include per-post authorization checks

### Audit Trail
- All workflow transitions logged with user, timestamp, and reason
- Bulk operations tracked with comprehensive metadata
- Revision history maintains complete change audit

## Performance Considerations

### Indexing Strategy
- Added indexes on `assigned_to_id` and status combinations
- Workflow history indexed by post and timestamp
- Calendar queries optimized with date range indexes

### Bulk Operations
- Processing in configurable batches (default: 10 posts)
- Operation limits (maximum 100 posts per bulk operation)
- Async processing for large operations

### Caching
- Calendar views can be cached for common date ranges
- Bulk operation previews cached temporarily
- Revision comparisons cached for repeated access

## Error Handling

### Validation Errors
- Comprehensive input validation with clear error messages
- Business rule validation (e.g., can't approve already published post)
- Permission validation with specific denial reasons

### Recovery Mechanisms
- Revision restore creates safety backup before changes
- Bulk operations continue processing despite individual failures
- Workflow transitions maintain referential integrity

## Configuration

### Workflow Rules
```typescript
// Configurable transition rules in ContentWorkflowService
private transitions: Record<string, WorkflowTransition> = {
  'submit_for_review': {
    from: ['DRAFT'],
    to: 'PENDING_REVIEW',
    requiredRoles: ['AUTHOR', 'EDITOR', 'ADMIN'],
    notificationRecipients: ['assignee', 'editors']
  },
  // ... additional transitions
};
```

### Operation Limits
```typescript
// Configurable limits in EnhancedBulkOperationsService
const maxBulkSize = 100; // Maximum posts per bulk operation
const batchSize = 10;    // Processing batch size
```

## Future Enhancements

### Phase 2 Features
1. **Advanced Workflow Rules**
   - Custom approval workflows per category
   - Multi-step approval process
   - Conditional routing based on content criteria

2. **Enhanced Collaboration**
   - Real-time collaborative editing
   - Comment system on posts and revisions
   - @mention notifications

3. **Advanced Scheduling**
   - Recurring post schedules
   - Timezone-aware scheduling
   - Social media integration scheduling

4. **Analytics Integration**
   - Workflow performance metrics
   - Editorial team productivity analytics
   - Content lifecycle tracking

## Testing Strategy

### Unit Tests
- Service method validation
- Workflow transition logic
- Bulk operation validation
- Permission checks

### Integration Tests
- End-to-end workflow scenarios
- Calendar view accuracy
- Bulk operation execution
- Notification delivery

### Performance Tests
- Bulk operation scalability
- Calendar query performance
- Revision comparison speed
- Database index effectiveness

## Deployment Notes

### Migration Requirements
1. Run database migration to add new schema elements
2. Regenerate Prisma client with new schema
3. Update environment variables if needed
4. Test workflow transitions in staging environment

### Rollback Considerations
- Database schema changes are additive (safe rollback)
- New API endpoints can be disabled via feature flags
- Existing functionality remains unchanged

This implementation provides a robust, scalable editorial workflow system that enhances the existing blog management capabilities while maintaining backward compatibility and system performance.
