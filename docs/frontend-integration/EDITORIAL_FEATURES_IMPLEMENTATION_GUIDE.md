# Editorial Features - Error Handling & Implementation Guide

🔒 **ADMIN ONLY** - Internal operations and admin interface only

## Overview
This guide covers error handling, TypeScript definitions, UI implementation patterns, and frontend development checklist for the Editorial Features module.

---

## 🚨 Error Handling & Status Codes

### HTTP Status Codes Used
```typescript
interface HTTPStatusCodes {
  200: 'OK - Successful operation';
  201: 'Created - Resource created successfully';
  400: 'Bad Request - Validation errors or invalid input';
  401: 'Unauthorized - Authentication required';
  403: 'Forbidden - Insufficient permissions';
  404: 'Not Found - Resource not found';
  409: 'Conflict - Business rule violation';
  422: 'Unprocessable Entity - Validation failed';
  429: 'Too Many Requests - Rate limit exceeded';
  500: 'Internal Server Error - Unexpected server error';
}
```

### Error Code Reference
```typescript
// Post-related errors
interface PostErrors {
  POST_NOT_FOUND: {
    code: 'POST_NOT_FOUND';
    status: 404;
    message: 'Post with {type} "{identifier}" not found';
    userMessage: 'The requested post could not be found.';
    recovery: 'Check the post ID or refresh the page';
  };
  
  INVALID_STATUS_TRANSITION: {
    code: 'INVALID_STATUS_TRANSITION';
    status: 409;
    message: 'Cannot transition from {fromStatus} to {toStatus}';
    userMessage: 'This action is not allowed for the current post status.';
    recovery: 'Check post status and available actions';
  };
  
  INSUFFICIENT_PERMISSIONS: {
    code: 'INSUFFICIENT_PERMISSIONS';
    status: 403;
    message: 'User role {userRole} cannot perform {action}';
    userMessage: 'You do not have permission to perform this action.';
    recovery: 'Contact an administrator for access';
  };
}

// Revision-related errors
interface RevisionErrors {
  POST_REVISION_NOT_FOUND: {
    code: 'POST_REVISION_NOT_FOUND';
    status: 404;
    message: 'Post revision with ID "{revisionId}" not found';
    userMessage: 'The requested revision could not be found.';
    recovery: 'Select a different revision or refresh the list';
  };
  
  REVISION_RESTORE_FAILED: {
    code: 'REVISION_RESTORE_FAILED';
    status: 500;
    message: 'Failed to restore revision: {reason}';
    userMessage: 'Could not restore to the selected revision.';
    recovery: 'Try again or contact support';
  };
  
  CONTENT_UNCHANGED: {
    code: 'CONTENT_UNCHANGED';
    status: 400;
    message: 'Content has not changed from current version';
    userMessage: 'No changes detected in the content.';
    recovery: 'Make changes before creating a revision';
  };
}

// Scheduling-related errors
interface SchedulingErrors {
  SCHEDULED_DATE_IN_PAST: {
    code: 'SCHEDULED_DATE_IN_PAST';
    status: 400;
    message: 'Scheduled date {date} is in the past';
    userMessage: 'Please select a future date and time.';
    recovery: 'Choose a date in the future';
  };
  
  POST_ALREADY_PUBLISHED: {
    code: 'POST_ALREADY_PUBLISHED';
    status: 409;
    message: 'Cannot schedule a post that is already published';
    userMessage: 'This post is already published and cannot be scheduled.';
    recovery: 'Create a new post or edit the published one';
  };
}

// Bulk operation errors
interface BulkErrors {
  BULK_LIMIT_EXCEEDED: {
    code: 'BULK_LIMIT_EXCEEDED';
    status: 400;
    message: 'Bulk operation limit exceeded: maximum {maxPosts} posts per operation';
    userMessage: 'Too many posts selected. Maximum is 100 posts per operation.';
    recovery: 'Reduce selection and try again';
  };
  
  BULK_OPERATION_FAILED: {
    code: 'BULK_OPERATION_FAILED';
    status: 500;
    message: 'Bulk operation failed: {details}';
    userMessage: 'The bulk operation could not be completed.';
    recovery: 'Review the operation details and try again';
  };
}

// Assignment errors
interface AssignmentErrors {
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND';
    status: 404;
    message: 'User with ID "{userId}" not found';
    userMessage: 'The selected user could not be found.';
    recovery: 'Select a different user';
  };
  
  INVALID_ASSIGNEE_ROLE: {
    code: 'INVALID_ASSIGNEE_ROLE';
    status: 400;
    message: 'User role {role} cannot be assigned posts';
    userMessage: 'Only editors and admins can be assigned posts.';
    recovery: 'Select an editor or admin user';
  };
}
```

### Error Response Format
```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Technical error message
    details?: any;          // Additional error context
  };
  // tRPC specific fields
  data?: {
    code: string;          // Same as error.code
    httpStatus: number;    // HTTP status code
    stack?: string;        // Stack trace (development only)
    path?: string;         // API endpoint path
  };
}

// Usage in frontend error handling
function handleError(error: TRPCError) {
  const errorCode = error.data?.code || error.message;
  
  switch (errorCode) {
    case 'POST_NOT_FOUND':
      showNotification('Post not found', 'error');
      redirectToPostList();
      break;
    case 'INSUFFICIENT_PERMISSIONS':
      showNotification('Permission denied', 'error');
      break;
    case 'BULK_LIMIT_EXCEEDED':
      showNotification('Too many posts selected (max 100)', 'warning');
      break;
    default:
      showNotification('An unexpected error occurred', 'error');
      logError(error);
  }
}
```

---

## 📚 Complete TypeScript Definitions

### Core Type Definitions (Copy to Frontend)
```typescript
// ===== ENUMS =====
export type PostStatus = 
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHED'
  | 'SCHEDULED'
  | 'ARCHIVED';

export type UserRole = 'AUTHOR' | 'EDITOR' | 'ADMIN';

export type BulkOperation = 
  | 'publish'
  | 'delete'
  | 'archive'
  | 'assign'
  | 'categorize'
  | 'tag'
  | 'feature'
  | 'unfeature';

// ===== CORE ENTITIES =====
export interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  avatar: string | null;
  isActive: boolean;
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
  
  // Relations (include as needed)
  author?: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
  assignedTo?: Pick<User, 'id' | 'name' | 'email' | 'avatar'> | null;
  category?: Category | null;
  revisions?: PostRevision[];
  workflowHistory?: PostWorkflowHistory[];
}

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
}

export interface PostRevision {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  revisionNote: string | null;
  createdAt: Date;
  
  // Relations
  author?: Pick<User, 'id' | 'name' | 'email'>;
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
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

// ===== WORKFLOW TYPES =====
export interface WorkflowTransition {
  from: PostStatus[];
  to: PostStatus;
  requiredRoles: UserRole[];
  notificationRecipients: ('author' | 'assignee' | 'editors' | 'admins')[];
}

export interface WorkflowContext {
  userId: string;
  userRole: UserRole;
  comments?: string;
  reason?: string;
  metadata?: Record<string, any>;
}

// ===== REVISION TYPES =====
export interface RevisionComparison {
  postId: string;
  oldRevision: PostRevision;
  newRevision: PostRevision;
  diff: {
    html: string;
    statistics: {
      charactersAdded: number;
      charactersRemoved: number;
      wordsAdded: number;
      wordsRemoved: number;
      changePercentage: number;
    };
  };
}

export interface CreateRevisionInput {
  postId: string;
  content: string;
  revisionNote?: string;
}

export interface RestoreRevisionInput {
  postId: string;
  revisionId: string;
  reason?: string;
}

// ===== CALENDAR TYPES =====
export interface CalendarEvent {
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

export interface CalendarView {
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

export interface CalendarFilters {
  authorId?: string;
  categoryId?: string;
  status?: PostStatus[];
  tags?: string[];
  isFeatured?: boolean;
}

export interface SchedulePostInput {
  postId: string;
  scheduledFor: Date;
  reason?: string;
}

// ===== BULK OPERATION TYPES =====
export interface BulkOperationInput {
  postIds: string[];
  operation: BulkOperation;
  parameters?: {
    assignedToId?: string;
    categoryId?: string;
    tags?: string[];
    reason?: string;
  };
}

export interface BulkOperationResult {
  successful: string[];
  failed: Array<{
    postId: string;
    error: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export interface BulkOperationPreview {
  eligible: string[];
  ineligible: Array<{
    postId: string;
    reason: string;
  }>;
  warnings: Array<{
    postId: string;
    message: string;
  }>;
  summary: {
    total: number;
    eligible: number;
    ineligible: number;
  };
}

// ===== ASSIGNMENT TYPES =====
export interface AssignmentRequest {
  postId: string;
  assignedToId: string;
  reason?: string;
}

// ===== RESPONSE WRAPPER TYPES =====
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}
```

---

## 🎨 UI Implementation Patterns

### Status Badge Component
```typescript
interface StatusBadgeProps {
  status: PostStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<PostStatus, { color: string; label: string; icon?: string }> = {
  DRAFT: { color: 'gray', label: 'Draft', icon: 'pencil' },
  PENDING_REVIEW: { color: 'yellow', label: 'Pending Review', icon: 'clock' },
  APPROVED: { color: 'green', label: 'Approved', icon: 'check' },
  REJECTED: { color: 'red', label: 'Rejected', icon: 'x' },
  PUBLISHED: { color: 'blue', label: 'Published', icon: 'globe' },
  SCHEDULED: { color: 'purple', label: 'Scheduled', icon: 'calendar' },
  ARCHIVED: { color: 'gray', label: 'Archived', icon: 'archive' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-${size} font-medium bg-${config.color}-100 text-${config.color}-800`}>
      {config.icon && <Icon name={config.icon} className="mr-1" />}
      {config.label}
    </span>
  );
};
```

### Workflow Action Buttons
```typescript
interface WorkflowActionsProps {
  post: Post;
  currentUserRole: UserRole;
  onTransition: (transition: string, context?: { comments?: string; reason?: string }) => void;
  isLoading?: boolean;
}

// Available transitions based on current status and user role
const getAvailableTransitions = (status: PostStatus, userRole: UserRole): string[] => {
  const transitions = workflowTransitions; // Import from business logic
  
  return Object.entries(transitions)
    .filter(([_, config]) => 
      config.from.includes(status) && 
      config.requiredRoles.includes(userRole)
    )
    .map(([key]) => key);
};

export const WorkflowActions: React.FC<WorkflowActionsProps> = ({ 
  post, 
  currentUserRole, 
  onTransition,
  isLoading 
}) => {
  const availableTransitions = getAvailableTransitions(post.status, currentUserRole);
  
  return (
    <div className="flex space-x-2">
      {availableTransitions.map(transition => (
        <WorkflowButton 
          key={transition}
          transition={transition}
          onTransition={onTransition}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
};
```

### Calendar Component Pattern
```typescript
interface CalendarViewProps {
  events: CalendarEvent[];
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
  filters: CalendarFilters;
  onFiltersChange: (filters: CalendarFilters) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  currentDate,
  onDateSelect,
  onEventClick,
  filters,
  onFiltersChange
}) => {
  // Group events by date for calendar display
  const eventsByDate = useMemo(() => {
    return events.reduce((acc, event) => {
      const dateKey = format(event.scheduledFor, 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(event);
      return acc;
    }, {} as Record<string, CalendarEvent[]>);
  }, [events]);

  return (
    <div className="calendar-container">
      <CalendarFilters filters={filters} onChange={onFiltersChange} />
      <Calendar 
        value={currentDate}
        onChange={onDateSelect}
        tileContent={({ date }) => (
          <CalendarDayEvents 
            events={eventsByDate[format(date, 'yyyy-MM-dd')] || []}
            onEventClick={onEventClick}
          />
        )}
      />
    </div>
  );
};
```

### Bulk Operations Interface
```typescript
interface BulkOperationsPanelProps {
  selectedPosts: string[];
  onSelectionChange: (postIds: string[]) => void;
  onExecute: (operation: BulkOperationInput) => void;
}

export const BulkOperationsPanel: React.FC<BulkOperationsPanelProps> = ({
  selectedPosts,
  onSelectionChange,
  onExecute
}) => {
  const [operation, setOperation] = useState<BulkOperation>('publish');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [preview, setPreview] = useState<BulkOperationPreview | null>(null);

  const handlePreview = async () => {
    const previewResult = await trpc.blog.contentWorkflow.bulk.preview.mutate({
      postIds: selectedPosts,
      operation,
      parameters
    });
    setPreview(previewResult);
  };

  const handleExecute = () => {
    onExecute({
      postIds: selectedPosts,
      operation,
      parameters
    });
  };

  return (
    <div className="bulk-operations-panel">
      <BulkOperationSelector 
        operation={operation}
        onChange={setOperation}
        selectedCount={selectedPosts.length}
      />
      
      <BulkOperationParameters 
        operation={operation}
        parameters={parameters}
        onChange={setParameters}
      />
      
      <div className="actions">
        <button onClick={handlePreview}>Preview Changes</button>
        <button 
          onClick={handleExecute}
          disabled={!preview || preview.eligible.length === 0}
        >
          Execute Operation
        </button>
      </div>
      
      {preview && (
        <BulkOperationPreview preview={preview} />
      )}
    </div>
  );
};
```

---

## 🔧 Frontend Implementation Checklist

### Phase 1: Core API Integration
- [ ] **Setup tRPC Client** with proper error handling
- [ ] **Implement Authentication** for all editorial endpoints
- [ ] **Create Base Types** using provided TypeScript definitions
- [ ] **Setup React Query** with appropriate cache configurations
- [ ] **Test Basic CRUD** for posts with new workflow fields

### Phase 2: Workflow Management
- [ ] **Status Badge Component** with proper styling for all statuses
- [ ] **Workflow Action Buttons** with role-based visibility
- [ ] **Post Assignment Interface** with user selection dropdown
- [ ] **Workflow History Display** showing audit trail
- [ ] **Status Transition Validation** on frontend before API calls
- [ ] **Permission-based UI** hiding unavailable actions

### Phase 3: Revision Management
- [ ] **Revision List Component** with pagination
- [ ] **Revision Comparison View** with HTML diff rendering
- [ ] **Create Revision Dialog** with content change detection
- [ ] **Restore Revision Confirmation** with backup creation notice
- [ ] **Revision Statistics Display** showing change metrics
- [ ] **Auto-revision Triggers** for significant content changes

### Phase 4: Calendar & Scheduling
- [ ] **Calendar Component** with monthly/weekly/daily views
- [ ] **Schedule Post Dialog** with date/time picker validation
- [ ] **Calendar Event Display** showing post details on hover/click
- [ ] **Filtering Interface** for author, category, status, tags
- [ ] **Today's Posts Widget** for dashboard
- [ ] **Overdue Posts Alert** for admin users
- [ ] **Scheduling Conflicts Detection** (optional enhancement)

### Phase 5: Bulk Operations
- [ ] **Post Selection Interface** with select all/none/filtered
- [ ] **Bulk Operation Panel** with operation type selector
- [ ] **Operation Parameters Form** dynamic based on selected operation
- [ ] **Bulk Preview Modal** showing eligible/ineligible posts
- [ ] **Progress Indicator** during bulk execution
- [ ] **Results Display** with success/failure breakdown
- [ ] **Operation History** for admin audit trail

### Phase 6: Error Handling & UX
- [ ] **Global Error Handler** for all editorial API calls
- [ ] **User-Friendly Error Messages** mapped from error codes
- [ ] **Loading States** for all async operations
- [ ] **Optimistic Updates** for immediate UI feedback
- [ ] **Confirmation Dialogs** for destructive operations
- [ ] **Toast Notifications** for operation results
- [ ] **Form Validation** before API submission

### Phase 7: Performance & Polish
- [ ] **Query Optimization** with proper caching strategies
- [ ] **Infinite Loading** for large revision lists
- [ ] **Search & Filtering** for all list views
- [ ] **Keyboard Shortcuts** for common operations
- [ ] **Mobile Responsiveness** for all components
- [ ] **Accessibility** (ARIA labels, keyboard navigation)
- [ ] **Loading Skeletons** for better perceived performance

---

## 🎯 Key UX Considerations

### Workflow Transitions
- **Clear State Indicators**: Use consistent colors and icons for post statuses
- **Action Confirmation**: Require confirmation for state changes (especially publish/reject)
- **Context Preservation**: Keep user on same page after transitions when possible
- **Progress Feedback**: Show transition in progress with loading states

### Revision Management
- **Visual Diff**: Use color coding (green for additions, red for deletions)
- **Change Summary**: Show character/word count changes prominently
- **Backup Notice**: Clearly indicate when backups are created during restore
- **Revision Context**: Show when and why each revision was created

### Calendar Interface
- **Visual Density**: Balance information density with readability
- **Status Color Coding**: Use consistent status colors across calendar views
- **Quick Actions**: Allow scheduling directly from calendar interface
- **Conflict Detection**: Highlight scheduling conflicts or heavy publication days

### Bulk Operations
- **Clear Preview**: Show exactly what will happen before execution
- **Partial Success Handling**: Gracefully handle mixed success/failure results
- **Operation Limits**: Clearly communicate 100-post limit with selection counter
- **Undo Capability**: Consider implementing undo for reversible operations

### Permission-Based UI
- **Progressive Disclosure**: Show/hide features based on user permissions
- **Clear Restrictions**: Explain why certain actions are not available
- **Role Indicators**: Show user's role and capabilities clearly
- **Graceful Degradation**: Provide read-only views when edit permissions missing

### Error Recovery
- **Actionable Errors**: Provide clear next steps for error resolution
- **Retry Mechanisms**: Allow retrying failed operations when appropriate
- **Context Preservation**: Maintain form state during error scenarios
- **Help Documentation**: Link to relevant help sections for complex errors
