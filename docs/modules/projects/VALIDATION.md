# Project Validation Module

## Overview

The Project Validation Service provides comprehensive validation logic for all project operations, ensuring data integrity, business rule compliance, and preventing common errors before they reach the database.

## Features Implemented

### ✅ Budget Validation

**Validates:**
- Budget is within allowed range ($0 - $10,000,000)
- Budget meets minimum requirements by project type:
  - Campaigns: $1,000 minimum
  - Content: $500 minimum
  - Licensing: $250 minimum
- Brand has sufficient budget allocation across all projects
- Budget changes don't violate existing financial commitments (licenses)
- Large budget increases trigger warning/approval workflows

**Methods:**
- `validateBudget()` - Comprehensive budget validation for creation
- `validateBudgetAdjustment()` - Validates budget changes on existing projects
- `getCommittedBudget()` - Calculates total committed funds (licenses + expenses)
- `checkBrandBudgetAvailability()` - Validates brand-level budget constraints

**Business Rules:**
- Cannot reduce budget below committed amount
- Budget increases >50% trigger warnings for non-admins
- Budget increases >$100k require admin approval
- Total brand allocation >$50M triggers warnings

### ✅ Date Range Validation

**Validates:**
- End date is after start date
- Start dates not more than 30 days in past
- Project duration is reasonable (<365 days)
- Date changes don't invalidate existing licenses
- Date ranges align with fiscal periods

**Methods:**
- `validateDateRange()` - Validates project timeline
- `validateDateChange()` - Validates date modifications on existing projects
- `checkOverlappingProjects()` - Detects concurrent projects
- `spansFiscalYearBoundary()` - Checks fiscal year alignment

**Business Rules:**
- Start dates can be up to 7 days in past (grace period)
- Projects >180 days trigger "long-term project" warning
- Campaign projects <7 days trigger warning
- Cannot shorten end date if licenses extend beyond new date
- Brands with >5 overlapping projects get warning

### ✅ Status Transition Validation

**State Machine:**
```
DRAFT → ACTIVE, CANCELLED
ACTIVE → IN_PROGRESS, CANCELLED, ARCHIVED
IN_PROGRESS → COMPLETED, CANCELLED
COMPLETED → ARCHIVED
CANCELLED → ARCHIVED
ARCHIVED → [terminal state]
```

**Precondition Checks:**

**Activation (DRAFT → ACTIVE):**
- Must have budget > 0
- Should have start/end dates
- Should have description (20+ chars)
- Should have requirements defined

**Completion (IN_PROGRESS → COMPLETED):**
- No pending licenses (DRAFT, PENDING_APPROVAL)
- All deliverables complete (future feature)

**Cancellation:**
- Admins can cancel with active licenses
- Non-admins blocked if active licenses exist
- Requires handling of active licenses

**Archival:**
- No open licenses (only EXPIRED or TERMINATED allowed)
- All financial obligations closed

**Methods:**
- `validateStatusTransition()` - Main status validation
- `validateActivationPreconditions()` - ACTIVE state checks
- `validateCompletionPreconditions()` - COMPLETED state checks
- `validateCancellationPreconditions()` - CANCELLED state checks
- `validateArchivalPreconditions()` - ARCHIVED state checks

### ✅ Permission Validation

**Validates:**
- User role has permission for operation
- Brand account verification status
- Project ownership for updates/deletes
- Resource-based access control

**Methods:**
- `canCreateProject()` - Validates project creation permission
- `canUpdateProject()` - Validates update permission with ownership check
- `canDeleteProject()` - Validates deletion permission

**Permission Rules:**

**Create:**
- Only BRAND and ADMIN roles
- Brand must be verified (verificationStatus = 'approved')
- Brand account must be active (deletedAt = null)

**Update:**
- Admins can update any project
- Brands can only update their own projects
- Archived projects cannot be updated
- Status transitions validated separately

**Delete:**
- Only project owner or admin
- Cannot delete projects with licenses
- Soft deletion preferred (deletedAt timestamp)

### ✅ Duplicate Detection

**Detection Methods:**

1. **Exact Match** - Case-insensitive name matching within same brand
2. **Fuzzy Match** - Levenshtein distance algorithm (85% similarity threshold)
3. **Year Pattern** - Detects similar names with different years ("Campaign 2024" vs "Campaign 2025")

**Methods:**
- `checkForDuplicates()` - Main duplicate detection
- `findSimilarProjects()` - Fuzzy matching algorithm
- `calculateStringSimilarity()` - Levenshtein similarity (0-1 scale)
- `levenshteinDistance()` - Edit distance calculation
- `extractYearPattern()` - Parse year from project name
- `findProjectsByNamePattern()` - Pattern-based matching

**Behavior:**
- Exact duplicates among active projects (DRAFT, ACTIVE, IN_PROGRESS)
- Soft warnings only - doesn't block creation
- Ignores completed/cancelled/archived projects
- Returns similarity scores for review
- Logged for audit trail

**Examples:**
- "Summer Campaign" = "Summer Campaign" → 100% match (blocked)
- "Summer Campaign 2024" vs "Summer Campaign 2024 " → ~95% match (warning)
- "Q1 Marketing Push" vs "Q1 Marketing Campaign" → ~70% match (no warning)
- "Campaign 2024" vs "Campaign 2025" → Year pattern warning

## Integration with Project Service

### Project Creation Flow

```typescript
async createProject(userId: string, data: CreateProjectInput) {
  // 1. Verify brand account
  const brand = await findBrand(userId);
  
  // 2. Permission validation
  const permission = await validationService.canCreateProject(userId, 'BRAND');
  if (!permission.allowed) throw new Unauthorized();
  
  // 3. Budget validation
  const budgetCheck = await validationService.validateBudget(
    data.budgetCents, 
    data.projectType, 
    brand.id
  );
  if (!budgetCheck.valid) throw new Error(budgetCheck.errors);
  
  // 4. Date validation
  const dateCheck = await validationService.validateDateRange(
    data.startDate, 
    data.endDate, 
    data.projectType, 
    brand.id
  );
  if (!dateCheck.valid) throw new Error(dateCheck.errors);
  
  // 5. Duplicate detection
  const dupes = await validationService.checkForDuplicates(
    brand.id, 
    data.name, 
    data.startDate, 
    data.endDate
  );
  if (dupes.isDuplicate) console.warn('Potential duplicate');
  
  // 6. Create project
  return await prisma.project.create({...});
}
```

### Project Update Flow

```typescript
async updateProject(projectId: string, data: UpdateProjectInput, userId: string, userRole: string) {
  // 1. Fetch existing project
  const project = await getProject(projectId);
  
  // 2. Permission check
  const permission = await validationService.canUpdateProject(userId, userRole, projectId, data);
  if (!permission.allowed) throw new Unauthorized();
  
  // 3. Budget adjustment validation (if budget changed)
  if (data.budgetCents !== project.budgetCents) {
    const budgetAdjustment = await validationService.validateBudgetAdjustment(
      projectId, 
      project.budgetCents, 
      data.budgetCents, 
      userRole
    );
    if (!budgetAdjustment.valid) throw new Error(budgetAdjustment.errors);
  }
  
  // 4. Date change validation (if dates changed)
  if (data.startDate || data.endDate) {
    const dateChange = await validationService.validateDateChange(
      projectId,
      project.startDate,
      project.endDate,
      data.startDate || project.startDate,
      data.endDate || project.endDate
    );
    if (!dateChange.valid) throw new Error(dateChange.errors);
  }
  
  // 5. Status transition validation (if status changed)
  if (data.status && data.status !== project.status) {
    const statusTransition = await validationService.validateStatusTransition(
      projectId,
      project.status,
      data.status,
      userRole
    );
    if (!statusTransition.valid) throw new InvalidStatusTransition();
  }
  
  // 6. Update project
  return await prisma.project.update({...});
}
```

## Validation Results Structure

All validation methods return structured results:

### Budget/Date Validation
```typescript
interface ValidationResult {
  valid: boolean;        // Pass/fail
  errors: string[];      // Blocking errors
  warnings: string[];    // Non-blocking warnings
}
```

### Status Transition Validation
```typescript
interface StatusTransitionResult {
  valid: boolean;
  errors: string[];
  requiredActions: string[];  // Steps needed before transition
}
```

### Permission Check
```typescript
interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;  // Explanation if denied
}
```

### Duplicate Detection
```typescript
interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicates: Array<{
    id: string;
    name: string;
    similarity: number;  // 0-1 scale
    status: ProjectStatus;
    createdAt: Date;
  }>;
  warnings: string[];
}
```

## Configuration Constants

Located in `validation.service.ts`:

```typescript
// Budget limits
MIN_BUDGET_BY_TYPE = {
  CAMPAIGN: 100000,   // $1,000
  CONTENT: 50000,     // $500
  LICENSING: 25000    // $250
}
MAX_BUDGET = 1000000000  // $10,000,000

// Date limits
MAX_PROJECT_DURATION_DAYS = 365
LONG_PROJECT_WARNING_DAYS = 180
START_DATE_GRACE_PERIOD_DAYS = 7

// Duplicate detection
DUPLICATE_SIMILARITY_THRESHOLD = 0.85  // 85% match
```

## Error Handling

Validation errors are thrown as domain-specific errors:

```typescript
// Budget errors
throw new ProjectCreationError('Budget validation failed: ...');
throw new BudgetExceededError(budget, committed);

// Date errors
throw new ProjectUpdateError('Date validation failed: ...');
throw new InvalidDateRangeError('End date must be after start date');

// Status errors
throw new InvalidStatusTransitionError(currentStatus, newStatus);

// Permission errors
throw new ProjectUnauthorizedError('Brand must be verified');
throw new OnlyBrandsCanCreateProjectsError();
```

## Testing Recommendations

### Unit Tests

```typescript
describe('ProjectValidationService', () => {
  describe('validateBudget', () => {
    it('should reject negative budgets');
    it('should reject budgets over $10M');
    it('should warn on budgets below type minimum');
    it('should prevent reducing budget below committed amount');
  });
  
  describe('validateDateRange', () => {
    it('should reject end date before start date');
    it('should reject start dates >30 days in past');
    it('should warn on very long projects (>365 days)');
    it('should detect fiscal year spanning');
  });
  
  describe('validateStatusTransition', () => {
    it('should allow DRAFT → ACTIVE');
    it('should reject ARCHIVED → ACTIVE');
    it('should enforce activation preconditions');
    it('should prevent completion with pending licenses');
  });
  
  describe('checkForDuplicates', () => {
    it('should detect exact name matches');
    it('should detect fuzzy matches above threshold');
    it('should extract year patterns');
    it('should ignore completed projects');
  });
});
```

### Integration Tests

```typescript
describe('Project Creation with Validation', () => {
  it('should create project with valid data');
  it('should reject project with invalid budget');
  it('should reject project with end date before start date');
  it('should warn on potential duplicate');
  it('should reject if brand not verified');
});

describe('Project Updates with Validation', () => {
  it('should update budget within limits');
  it('should prevent budget reduction below committed');
  it('should validate status transitions');
  it('should prevent shortening timeline with active licenses');
});
```

## Performance Considerations

1. **Database Queries**: Validation makes multiple DB queries. Consider:
   - Batch queries where possible
   - Cache brand verification status
   - Limit fuzzy matching to recent projects only

2. **Duplicate Detection**: Most expensive operation
   - Only checks active projects (DRAFT, ACTIVE, IN_PROGRESS)
   - Limited to same brand (indexed query)
   - Consider async processing for non-blocking UX

3. **Validation Order**: Fail fast strategy
   - Permission checks first (fastest)
   - Schema validation (Zod) handled at router level
   - Budget/date validation (DB queries)
   - Duplicate detection last (most expensive)

## Future Enhancements

### Planned Features

1. **Brand Budget Tracking**
   - Add `creditLimit` field to Brand model
   - Enforce hard limits on total allocated budget
   - Integration with payment/billing system

2. **Project Templates**
   - Pre-approved budget ranges by project type
   - Template-based validation rules
   - Industry-specific requirements

3. **Advanced Duplicate Detection**
   - ML-based similarity scoring
   - Cross-brand duplicate detection (admin feature)
   - Historical duplicate analysis

4. **Workflow Approvals**
   - Multi-level approval for large budgets
   - Custom approval workflows by brand size
   - Email notifications for approvals

5. **Milestone/Deliverable Tracking**
   - Completion preconditions based on milestones
   - Budget release tied to milestone completion
   - Automated status transitions

## API Usage Examples

### Validate Budget Before UI Submission

```typescript
// Client-side pre-validation (optional)
const budgetCheck = await fetch('/api/projects/validate-budget', {
  method: 'POST',
  body: JSON.stringify({
    budgetCents: 500000,
    projectType: 'CAMPAIGN',
    brandId: 'brand_123'
  })
});

const { valid, errors, warnings } = await budgetCheck.json();
if (warnings.length) {
  // Show warnings to user
  alert(warnings.join('\n'));
}
```

### Check for Duplicates

```typescript
const dupeCheck = await validationService.checkForDuplicates(
  brandId,
  'Summer Campaign 2024',
  new Date('2024-06-01'),
  new Date('2024-08-31')
);

if (dupeCheck.isDuplicate) {
  console.log('Similar projects found:');
  dupeCheck.duplicates.forEach(d => {
    console.log(`- ${d.name} (${Math.round(d.similarity * 100)}% match)`);
  });
}
```

### Validate Status Transition

```typescript
const canComplete = await validationService.validateStatusTransition(
  projectId,
  'IN_PROGRESS',
  'COMPLETED',
  'BRAND'
);

if (!canComplete.valid) {
  console.error('Cannot complete:', canComplete.errors);
}

if (canComplete.requiredActions.length > 0) {
  console.log('Required actions:', canComplete.requiredActions);
  // - Resolve 3 pending license(s) before completion
}
```

## Related Documentation

- [Project Module README](./README.md)
- [Project Schema Documentation](./schemas/project.schema.ts)
- [Project Types](./types/project.types.ts)
- [Error Handling](./errors/project.errors.ts)
- [Roadmap](../../../YesGoddess%20Ops%20-%20Backend%20%26%20Admin%20Development%20Roadmap.md)
