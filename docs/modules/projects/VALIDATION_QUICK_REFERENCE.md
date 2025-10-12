# Project Validation - Quick Reference

## Usage in Project Service

```typescript
import { ProjectValidationService } from './validation.service';

// Initialize in constructor
this.validationService = new ProjectValidationService(prisma);
```

## Validation Methods

### Budget Validation
```typescript
// Validate budget for new project
const result = await validationService.validateBudget(
  budgetCents,      // number
  projectType,      // 'CAMPAIGN' | 'CONTENT' | 'LICENSING'
  brandId,          // string
  projectId?        // string (for updates)
);

// Validate budget adjustment
const result = await validationService.validateBudgetAdjustment(
  projectId,        // string
  currentBudget,    // number
  newBudget,        // number
  userRole          // string
);
```

### Date Validation
```typescript
// Validate date range
const result = await validationService.validateDateRange(
  startDate,        // Date | null
  endDate,          // Date | null
  projectType,      // ProjectType
  brandId,          // string
  projectId?        // string (for updates)
);

// Validate date change
const result = await validationService.validateDateChange(
  projectId,        // string
  currentStartDate, // Date | null
  currentEndDate,   // Date | null
  newStartDate,     // Date | null
  newEndDate        // Date | null
);
```

### Status Transition Validation
```typescript
const result = await validationService.validateStatusTransition(
  projectId,        // string
  currentStatus,    // ProjectStatus
  newStatus,        // ProjectStatus
  userRole          // string
);

// Returns: { valid: boolean, errors: string[], requiredActions: string[] }
```

### Permission Checks
```typescript
// Can create project?
const result = await validationService.canCreateProject(
  userId,           // string
  userRole          // string
);

// Can update project?
const result = await validationService.canUpdateProject(
  userId,           // string
  userRole,         // string
  projectId,        // string
  updates           // any
);

// Can delete project?
const result = await validationService.canDeleteProject(
  userId,           // string
  userRole,         // string
  projectId         // string
);

// Returns: { allowed: boolean, reason?: string }
```

### Duplicate Detection
```typescript
const result = await validationService.checkForDuplicates(
  brandId,          // string
  name,             // string
  startDate,        // Date | null
  endDate,          // Date | null
  excludeProjectId? // string
);

// Returns: {
//   isDuplicate: boolean,
//   duplicates: Array<{
//     id: string,
//     name: string,
//     similarity: number,
//     status: ProjectStatus,
//     createdAt: Date
//   }>,
//   warnings: string[]
// }
```

## Response Structures

### Budget/Date Validation
```typescript
{
  valid: boolean,
  errors: string[],    // Blocking errors
  warnings: string[]   // Non-blocking warnings
}
```

### Status Transition
```typescript
{
  valid: boolean,
  errors: string[],
  requiredActions: string[]
}
```

### Permission Check
```typescript
{
  allowed: boolean,
  reason?: string
}
```

## Error Handling

```typescript
try {
  const validation = await validationService.validateBudget(...);
  
  if (!validation.valid) {
    throw new ProjectCreationError(
      `Validation failed: ${validation.errors.join(', ')}`
    );
  }
  
  // Log warnings if any
  if (validation.warnings.length > 0) {
    console.warn('Validation warnings:', validation.warnings);
  }
  
} catch (error) {
  // Handle domain-specific errors
  if (error instanceof ProjectCreationError) {
    throw error;
  }
  // Handle unexpected errors
  console.error('Unexpected validation error:', error);
  throw new ProjectCreationError('Validation failed');
}
```

## Common Patterns

### Complete Validation Pipeline (Create)
```typescript
// 1. Permission
const permission = await validationService.canCreateProject(userId, userRole);
if (!permission.allowed) throw new Unauthorized(permission.reason);

// 2. Budget
const budget = await validationService.validateBudget(budgetCents, projectType, brandId);
if (!budget.valid) throw new Error(budget.errors.join(', '));

// 3. Dates
const dates = await validationService.validateDateRange(startDate, endDate, projectType, brandId);
if (!dates.valid) throw new Error(dates.errors.join(', '));

// 4. Duplicates
const dupes = await validationService.checkForDuplicates(brandId, name, startDate, endDate);
if (dupes.isDuplicate) console.warn('Duplicate detected');

// 5. Create project
const project = await prisma.project.create({...});
```

### Complete Validation Pipeline (Update)
```typescript
// 1. Permission
const permission = await validationService.canUpdateProject(userId, userRole, projectId, updates);
if (!permission.allowed) throw new Unauthorized(permission.reason);

// 2. Budget (if changed)
if (updates.budgetCents !== current.budgetCents) {
  const budget = await validationService.validateBudgetAdjustment(
    projectId, current.budgetCents, updates.budgetCents, userRole
  );
  if (!budget.valid) throw new Error(budget.errors.join(', '));
}

// 3. Dates (if changed)
if (updates.startDate || updates.endDate) {
  const dates = await validationService.validateDateRange(...);
  if (!dates.valid) throw new Error(dates.errors.join(', '));
  
  const dateChange = await validationService.validateDateChange(...);
  if (!dateChange.valid) throw new Error(dateChange.errors.join(', '));
}

// 4. Status (if changed)
if (updates.status !== current.status) {
  const status = await validationService.validateStatusTransition(
    projectId, current.status, updates.status, userRole
  );
  if (!status.valid) throw new InvalidStatusTransition(current.status, updates.status);
}

// 5. Update project
const project = await prisma.project.update({...});
```

## Configuration Constants

Located in `validation.service.ts`:

```typescript
// Budget
MIN_BUDGET_BY_TYPE = {
  CAMPAIGN: 100000,   // $1,000
  CONTENT: 50000,     // $500
  LICENSING: 25000    // $250
}
MAX_BUDGET = 1000000000  // $10,000,000

// Dates
MAX_PROJECT_DURATION_DAYS = 365
LONG_PROJECT_WARNING_DAYS = 180
START_DATE_GRACE_PERIOD_DAYS = 7

// Duplicates
DUPLICATE_SIMILARITY_THRESHOLD = 0.85  // 85% match
```

## Status Transition Matrix

```
DRAFT ──────────────────────────> ACTIVE
  │                                  │
  │                                  ├──> IN_PROGRESS
  │                                  │       │
  │                                  │       └──> COMPLETED
  │                                  │               │
  └──────> CANCELLED                 │               │
              │                      │               │
              └─────────────────────>└───────────────> ARCHIVED
```

## Common Validation Scenarios

### Scenario 1: New Campaign
```typescript
// Budget: Must be >= $1,000
// Dates: Optional but recommended
// Duplicate: Warns if similar name exists
// Permission: BRAND (verified) or ADMIN
```

### Scenario 2: Budget Increase >50%
```typescript
// Non-admin: Warning, allowed
// Budget increase >$100k: Admin approval required
```

### Scenario 3: Shorten End Date
```typescript
// Check: No licenses extend beyond new end date
// If licenses exist: Block change
```

### Scenario 4: Activate Draft Project
```typescript
// Required:
//   - Budget > 0
// Recommended:
//   - Start/end dates
//   - Description (20+ chars)
//   - Requirements defined
```

### Scenario 5: Complete Project
```typescript
// Required:
//   - No pending licenses (DRAFT, PENDING_APPROVAL)
// Future: All milestones complete
```

### Scenario 6: Archive Project
```typescript
// Required:
//   - All licenses closed (EXPIRED or TERMINATED only)
```

## Best Practices

1. **Always validate permissions first** - Fastest check, fails early
2. **Log warnings, don't ignore them** - Helps identify data quality issues
3. **Use fail-fast pattern** - Stop at first validation error
4. **Provide clear error messages** - Include what failed and how to fix
5. **Cache validation results** - Within single request context only
6. **Test edge cases** - Boundary values, null dates, minimum budgets
7. **Document business rules** - Keep validation logic aligned with requirements

## Troubleshooting

### "Budget must have a budget before activation"
- Ensure `budgetCents > 0` before changing status to ACTIVE

### "Cannot reduce budget below committed amount"
- Check `getCommittedBudget()` - sum of active licenses
- Only allow budget >= committed amount

### "Invalid status transition from X to Y"
- Review status transition matrix
- Check if transition is allowed
- Review preconditions for target status

### "Brand must be verified before creating projects"
- Check brand `verificationStatus === 'approved'`
- Admin can override by creating projects for brands

### "Cannot archive project with N open license(s)"
- All licenses must be EXPIRED or TERMINATED
- Close or terminate open licenses first

## See Also

- [Complete Documentation](./VALIDATION.md)
- [Implementation Summary](./VALIDATION_IMPLEMENTATION.md)
- [Usage Examples](../../src/modules/projects/services/validation.examples.ts)
- [Project Schema](../../src/modules/projects/schemas/project.schema.ts)
