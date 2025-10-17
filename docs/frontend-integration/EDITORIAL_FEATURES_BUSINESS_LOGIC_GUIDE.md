# Editorial Features - Business Logic & Workflow Integration Guide

🔒 **ADMIN ONLY** - Internal operations and admin interface only

## Overview
This guide covers the business logic, validation rules, workflow state machines, and data relationships for the Editorial Features module. Essential for implementing correct UI behavior and validation.

---

## 🔄 Content Workflow State Machine

### Post Status Transitions
```typescript
type PostStatus = 
  | 'DRAFT'           // Initial state, being written
  | 'PENDING_REVIEW'  // Submitted for editorial review
  | 'APPROVED'        // Approved for publication
  | 'REJECTED'        // Rejected, needs revision
  | 'PUBLISHED'       // Live on the website
  | 'SCHEDULED'       // Scheduled for future publication
  | 'ARCHIVED';       // Archived/withdrawn

// Valid State Transitions
const workflowTransitions = {
  'submit_for_review': {
    from: ['DRAFT'],
    to: 'PENDING_REVIEW',
    requiredRoles: ['AUTHOR', 'EDITOR', 'ADMIN'],
    notificationRecipients: ['assignee', 'editors']
  },
  'approve': {
    from: ['PENDING_REVIEW'],
    to: 'APPROVED',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author']
  },
  'reject': {
    from: ['PENDING_REVIEW', 'APPROVED'],
    to: 'REJECTED',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author', 'assignee']
  },
  'request_changes': {
    from: ['PENDING_REVIEW'],
    to: 'DRAFT',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author', 'assignee']
  },
  'publish': {
    from: ['APPROVED', 'DRAFT'],
    to: 'PUBLISHED',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author']
  },
  'schedule': {
    from: ['APPROVED', 'DRAFT'],
    to: 'SCHEDULED',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author']
  },
  'archive': {
    from: ['PUBLISHED', 'DRAFT', 'REJECTED'],
    to: 'ARCHIVED',
    requiredRoles: ['EDITOR', 'ADMIN'],
    notificationRecipients: ['author']
  },
  'restore_to_draft': {
    from: ['ARCHIVED', 'REJECTED'],
    to: 'DRAFT',
    requiredRoles: ['AUTHOR', 'EDITOR', 'ADMIN'],
    notificationRecipients: []
  }
};
```

### Visual Workflow Diagram
```
DRAFT → submit_for_review → PENDING_REVIEW → approve → APPROVED → publish → PUBLISHED
  ↑                            ↓                        ↓           ↓
  ← request_changes ←──────── reject                   schedule    archive
  ↑                            ↓                        ↓           ↓
  ← restore_to_draft ←─── REJECTED                  SCHEDULED → PUBLISHED
  ↑                                                      ↓           ↓
  ← restore_to_draft ←─────────────────────────────── ARCHIVED ←─── archive
```

---

## 📋 Field Validation Rules

### Post Assignment Validation
```typescript
interface AssignmentValidation {
  // Business Rules
  assignedToId: {
    required: false;               // Assignment is optional
    validRoles: ['EDITOR', 'ADMIN']; // Only editors/admins can be assigned
    constraint: 'Must be active user';
  };
  
  // Frontend Validation
  assignPost: {
    permissions: ['EDITOR', 'ADMIN']; // Who can assign posts
    validation: {
      postExists: true;
      targetUserExists: true;
      targetUserRole: ['EDITOR', 'ADMIN'];
      targetUserActive: true;
    };
  };
}
```

### Revision Management Rules
```typescript
interface RevisionValidation {
  // Revision Creation
  createRevision: {
    contentRequired: true;
    minContentLength: 1;
    maxContentLength: 2000000;      // 2MB HTML content
    permissions: ['AUTHOR', 'EDITOR', 'ADMIN'];
    businessRules: {
      mustOwnPostOrHaveEditPermission: true;
      contentMustDifferFromCurrent: true;
    };
  };
  
  // Revision Restoration
  restoreRevision: {
    permissions: ['EDITOR', 'ADMIN']; // Authors cannot restore
    businessRules: {
      createsBackupBeforeRestore: true;
      validatePostNotPublished: false; // Can restore published posts
      auditTrailRequired: true;
    };
  };
  
  // Automatic Revision Creation Triggers
  autoRevisionTriggers: {
    significantContentChange: {
      charactersChanged: 100;        // Create revision if >100 chars changed
      wordsChanged: 20;              // Or if >20 words changed
    };
    statusTransition: {
      fromApprovedToDraft: true;     // Always create revision
      beforePublishing: true;        // Create revision before publish
    };
  };
}
```

### Calendar Scheduling Rules
```typescript
interface SchedulingValidation {
  schedulePost: {
    permissions: ['EDITOR', 'ADMIN'];
    validation: {
      scheduledFor: {
        required: true;
        mustBeFuture: true;
        maxAdvanceDays: 365;         // Cannot schedule >1 year ahead
        businessHoursRecommended: false; // Allow 24/7 scheduling
      };
      postStatus: {
        allowedStates: ['DRAFT', 'APPROVED'];
        preventIfPublished: true;
      };
    };
  };
  
  reschedulePost: {
    permissions: ['EDITOR', 'ADMIN'];
    validation: {
      mustBeScheduled: true;         // Can only reschedule SCHEDULED posts
      newDateInFuture: true;
      reasonRecommended: true;       // UX should encourage reason
    };
  };
  
  cancelSchedule: {
    permissions: ['EDITOR', 'ADMIN'];
    reverts: {
      toPreviousStatus: true;        // Returns to status before SCHEDULED
      clearsScheduledDate: true;
    };
  };
}
```

### Bulk Operation Rules
```typescript
interface BulkOperationValidation {
  general: {
    maxPostsPerOperation: 100;     // Hard limit
    permissions: ['EDITOR', 'ADMIN'];
    requiresConfirmation: true;    // UI should show preview first
  };
  
  operations: {
    publish: {
      allowedFromStates: ['APPROVED', 'DRAFT'];
      validation: {
        requiresApprovedStateRecommended: true; // Warn if publishing drafts
        checkScheduledPosts: true;    // Warn if has future schedule
      };
    };
    
    delete: {
      isSoftDelete: true;           // Sets deletedAt, doesn't remove from DB
      allowedFromStates: ['DRAFT', 'REJECTED', 'ARCHIVED'];
      restrictions: {
        preventPublishedDelete: true; // Cannot bulk delete published posts
        requiresReason: true;         // Must provide deletion reason
      };
    };
    
    assign: {
      validation: {
        assigneeExists: true;
        assigneeRole: ['EDITOR', 'ADMIN'];
        assigneeActive: true;
      };
      businessRules: {
        notifiesAllAssignees: true;   // Sends notification to each assignee
        createsAuditTrail: true;
      };
    };
    
    categorize: {
      validation: {
        categoryExists: true;
        categoryActive: true;
      };
      allowsNull: true;             // Can remove category assignment
    };
  };
}
```

---

## 🔐 Authorization Matrix

### Role-Based Permissions
```typescript
interface PermissionMatrix {
  AUTHOR: {
    posts: {
      create: true;
      read: 'own';                  // Can only read own posts
      update: 'own_if_draft';       // Can only edit own drafts
      delete: false;
    };
    workflow: {
      submitForReview: 'own';       // Can submit own posts
      approve: false;
      reject: false;
      publish: false;
      schedule: false;
      restoreToDraft: 'own';        // Can restore own posts to draft
    };
    revisions: {
      create: 'own';                // Can create revisions of own posts
      view: 'own';
      restore: false;               // Cannot restore revisions
    };
    assignments: {
      assign: false;                // Cannot assign posts
      viewAssigned: false;
    };
    bulk: {
      any: false;                   // No bulk operations
    };
  };
  
  EDITOR: {
    posts: {
      create: true;
      read: 'all';                  // Can read all posts
      update: 'all';                // Can edit all posts
      delete: 'soft';               // Can soft delete non-published
    };
    workflow: {
      submitForReview: 'all';
      approve: true;                // Can approve posts
      reject: true;                 // Can reject posts
      publish: true;                // Can publish posts
      schedule: true;               // Can schedule posts
      restoreToDraft: 'all';
    };
    revisions: {
      create: 'all';
      view: 'all';
      restore: true;                // Can restore any revision
    };
    assignments: {
      assign: true;                 // Can assign posts
      viewAssigned: 'all';
    };
    bulk: {
      publish: true;
      delete: 'non_published';      // Cannot bulk delete published
      archive: true;
      assign: true;
      categorize: true;
    };
  };
  
  ADMIN: {
    posts: 'full_access';           // Full CRUD on all posts
    workflow: 'full_access';        // All workflow operations
    revisions: 'full_access';       // All revision operations
    assignments: 'full_access';     // All assignment operations
    bulk: 'full_access';            // All bulk operations including history
    system: {
      viewAuditLogs: true;
      managePermissions: true;
      systemConfiguration: true;
    };
  };
}
```

### Resource Ownership Rules
```typescript
interface OwnershipRules {
  posts: {
    authorOwnership: {
      field: 'authorId';
      grants: ['read', 'edit_if_draft', 'submit_for_review'];
    };
    assignmentOwnership: {
      field: 'assignedToId';
      grants: ['read', 'review', 'approve', 'reject'];
    };
  };
  
  revisions: {
    inheritFromPost: true;          // Uses parent post ownership rules
    creatorCanView: true;           // Revision creator can always view
  };
  
  bulkOperations: {
    requiresPermissionOnEachPost: true; // Must have permission on every target post
    failsGracefully: true;          // Continues with allowed posts, reports failures
  };
}
```

---

## 🧮 Calculated Fields & Derived Data

### Revision Statistics
```typescript
interface RevisionCalculations {
  comparison: {
    charactersAdded: 'count of new characters in diff';
    charactersRemoved: 'count of removed characters in diff';
    wordsAdded: 'count of new words in diff';
    wordsRemoved: 'count of removed words in diff';
    changePercentage: '(charactersAdded + charactersRemoved) / oldContent.length * 100';
  };
  
  // Frontend should calculate and display
  metadata: {
    relativeChangeSize: 'small < 5% < medium < 20% < large';
    changeType: 'addition_heavy | deletion_heavy | balanced';
    contentGrowth: 'newLength - oldLength (can be negative)';
  };
}
```

### Calendar Summary Statistics
```typescript
interface CalendarCalculations {
  summary: {
    total: 'count of all posts in date range';
    scheduled: 'count with status SCHEDULED';
    published: 'count with status PUBLISHED and publishedAt in range';
    draft: 'count with status DRAFT';
    pendingReview: 'count with status PENDING_REVIEW';
  };
  
  // Additional metrics for dashboard
  derived: {
    publishingRate: 'published / total * 100';
    averageTimeToPublish: 'average days from creation to publication';
    overdueCount: 'posts scheduled in past but not published';
    upcomingCount: 'posts scheduled in next 7 days';
  };
}
```

### Assignment Statistics
```typescript
interface AssignmentMetrics {
  userWorkload: {
    totalAssigned: 'count of posts assigned to user';
    byStatus: {
      draft: number;
      pendingReview: number;
      approved: number;
    };
  };
  
  teamMetrics: {
    averageAssignmentsPerEditor: number;
    unassignedPosts: number;
    overdueReviews: 'posts in PENDING_REVIEW > 3 days';
  };
}
```

---

## ⚡ State Management Recommendations

### Frontend State Structure
```typescript
interface EditorialFeatureState {
  // Current workflow context
  workflow: {
    currentPost?: {
      id: string;
      status: PostStatus;
      assignedTo?: User;
      workflowHistory: WorkflowEvent[];
    };
    availableTransitions: string[];  // Based on current user role + post status
    transitionInProgress?: string;   // For loading states
  };
  
  // Revision management
  revisions: {
    list: PostRevision[];
    currentComparison?: {
      oldRevision: PostRevision;
      newRevision: PostRevision;
      diff: ComparisonResult;
    };
    restoreInProgress?: boolean;
  };
  
  // Calendar view
  calendar: {
    currentView: 'month' | 'week' | 'day';
    currentDate: Date;
    events: CalendarEvent[];
    filters: CalendarFilters;
    summary: CalendarSummary;
  };
  
  // Bulk operations
  bulk: {
    selectedPosts: string[];
    currentOperation?: BulkOperationInput;
    preview?: BulkOperationPreviewResponse;
    executing: boolean;
    lastResult?: BulkOperationResult;
  };
}
```

### UI State Synchronization
```typescript
interface StateSyncRules {
  // When to refresh data
  refreshTriggers: {
    postStatusChanged: ['workflow.availableTransitions', 'calendar.events'];
    revisionCreated: ['revisions.list', 'post.updatedAt'];
    postScheduled: ['calendar.events', 'calendar.summary'];
    bulkOperationCompleted: ['calendar.events', 'posts.list', 'workflow.currentPost'];
  };
  
  // Optimistic updates (show immediately, rollback on error)
  optimisticUpdates: {
    postAssignment: true;           // Update assignedTo immediately
    postStatusTransition: true;     // Update status immediately
    scheduleDateChange: true;       // Update scheduled date immediately
  };
  
  // Real-time updates needed
  realTimeEvents: {
    postAssignedToUser: 'notification + refresh assigned posts';
    postStatusChanged: 'refresh if user has access';
    bulkOperationCompleted: 'refresh affected views';
  };
}
```

---

## 🔔 Notification Business Rules

### Automatic Notifications
```typescript
interface NotificationRules {
  postAssigned: {
    recipient: 'assignedUser';
    trigger: 'immediately on assignment';
    channels: ['in_app', 'email'];
    content: {
      title: 'Post Assigned to You';
      message: 'You have been assigned to review "{postTitle}"';
      actionUrl: '/admin/blog/posts/{postId}';
    };
  };
  
  statusTransitions: {
    submitForReview: {
      recipients: ['assignee', 'all_editors'];
      message: 'Post "{postTitle}" submitted for review';
    };
    approved: {
      recipients: ['author'];
      message: 'Your post "{postTitle}" has been approved';
    };
    rejected: {
      recipients: ['author', 'assignee'];
      message: 'Post "{postTitle}" needs revision';
    };
    published: {
      recipients: ['author'];
      message: 'Your post "{postTitle}" has been published';
    };
  };
  
  scheduling: {
    postScheduled: {
      recipients: ['author_if_different_from_scheduler'];
      delay: 'immediate';
    };
    scheduleReminder: {
      recipients: ['assigned_editor', 'original_scheduler'];
      trigger: '1_hour_before_publication';
    };
    overduePost: {
      recipients: ['all_editors', 'admins'];
      trigger: '1_hour_after_scheduled_time';
      recurring: 'daily_until_published';
    };
  };
}
```

---

## 📈 Performance & Optimization Guidelines

### Query Optimization
```typescript
interface QueryOptimization {
  // Database indexes (already implemented)
  indexes: {
    posts_assigned_to_id_idx: 'for assignment queries';
    posts_assigned_to_id_status_idx: 'for workload queries';
    post_workflow_history_post_id_idx: 'for audit trails';
    posts_scheduled_for_idx: 'for calendar queries';
  };
  
  // Frontend query patterns
  recommended: {
    useInfiniteQueries: ['revision_lists', 'workflow_history'];
    usePagination: ['bulk_operation_history'];
    cacheIndefinitely: ['revision_content'];  // Revisions never change
    shortCache: ['calendar_today', 'overdue_posts'];
  };
  
  // Expensive operations to avoid
  avoid: {
    frequentRevisionComparisons: 'cache comparison results';
    largeBulkOperationPreviews: 'limit to 50 posts max in UI';
    nestedAssignmentQueries: 'use single query with includes';
  };
}
```

---

## 🧪 Testing Considerations

### Critical Business Logic Tests
```typescript
interface TestingRequirements {
  workflowTransitions: {
    testInvalidTransitions: 'ensure proper error handling';
    testPermissionValidation: 'verify role-based restrictions';
    testNotificationDelivery: 'confirm notifications sent';
  };
  
  bulkOperations: {
    testPartialFailures: 'some succeed, some fail gracefully';
    testPermissionBoundaries: 'user can only affect allowed posts';
    testOperationLimits: 'enforce 100 post maximum';
  };
  
  revisionManagement: {
    testComparisonAccuracy: 'diff algorithm correctness';
    testRestoreIntegrity: 'backup creation and restoration';
    testAutoRevisionTriggers: 'significant change detection';
  };
  
  scheduling: {
    testDateValidation: 'past date rejection';
    testTimezoneHandling: 'proper UTC storage and display';
    testOverdueDetection: 'accurate overdue identification';
  };
}
```
