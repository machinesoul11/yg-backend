# Project and License Search Implementation

## Overview

This document describes the implementation of advanced search functionality for Projects and Licenses in the YesGoddess backend system.

## Implementation Date

October 17, 2025

## Features Implemented

### 1. Project Search

**Endpoint:** `projects.search`

**Capabilities:**
- ✅ Search projects by name and description (text search with case-insensitive matching)
- ✅ Filter by project status (DRAFT, ACTIVE, IN_PROGRESS, COMPLETED, CANCELLED, ARCHIVED)
- ✅ Filter by project type (CAMPAIGN, CONTENT, LICENSING)
- ✅ Filter by brand (brandId)
- ✅ Filter by creator involvement (creatorId via IP asset ownership)
- ✅ Filter by budget range (budgetMin/budgetMax in cents)
- ✅ Filter by date range (dateFrom/dateTo for creation date)
- ✅ Pagination (page and limit parameters)
- ✅ Sorting (relevance, createdAt, updatedAt, name, budgetCents, startDate)
- ✅ Permission-based filtering (Brands see only their projects, Creators see projects they're involved in)
- ✅ Faceted results (status and project type counts)

**Input Schema:** `searchProjectsSchema` in `src/modules/projects/schemas/project.schema.ts`

**Example Request:**
```typescript
{
  query: "marketing campaign",
  status: ["ACTIVE", "IN_PROGRESS"],
  projectType: ["CAMPAIGN"],
  brandId: "cl1234567890",
  budgetMin: 100000, // $1,000 in cents
  budgetMax: 1000000, // $10,000 in cents
  dateFrom: "2024-01-01T00:00:00.000Z",
  dateTo: "2024-12-31T23:59:59.999Z",
  page: 1,
  limit: 20,
  sortBy: "relevance",
  sortOrder: "desc"
}
```

**Response Structure:**
```typescript
{
  data: {
    projects: Project[], // Array of project objects with brand and count info
    pagination: {
      page: number,
      limit: number,
      total: number,
      totalPages: number,
      hasNextPage: boolean,
      hasPreviousPage: boolean
    },
    facets: {
      statuses: { [status: string]: number },
      projectTypes: { [type: string]: number }
    }
  }
}
```

### 2. License Search

**Endpoint:** `licenses.search`

**Capabilities:**
- ✅ Search licenses by IP asset title and brand name (text search with case-insensitive matching)
- ✅ Filter by license status (DRAFT, PENDING_APPROVAL, ACTIVE, EXPIRED, etc.)
- ✅ Filter by license type (EXCLUSIVE, NON_EXCLUSIVE, EXCLUSIVE_TERRITORY)
- ✅ Filter by brand (brandId)
- ✅ Filter by creator (creatorId via IP asset ownership)
- ✅ Filter by IP asset (ipAssetId)
- ✅ Filter by project (projectId)
- ✅ Filter by creation date range (dateFrom/dateTo)
- ✅ Filter by license start date range (startDateFrom/startDateTo)
- ✅ Filter by license end date range (endDateFrom/endDateTo)
- ✅ Find licenses expiring within N days (expiringWithinDays)
- ✅ Pagination (page and limit parameters)
- ✅ Sorting (relevance, createdAt, updatedAt, startDate, endDate, feeCents)
- ✅ Permission-based filtering (Brands see their licenses, Creators see licenses for their IP assets)
- ✅ Faceted results (status and license type counts)

**Input Schema:** `SearchLicensesSchema` in `src/modules/licenses/router.ts`

**Example Request:**
```typescript
{
  query: "Logo Usage",
  status: ["ACTIVE", "EXPIRING_SOON"],
  licenseType: ["EXCLUSIVE"],
  brandId: "cl1234567890",
  expiringWithinDays: 30, // Find licenses expiring in next 30 days
  startDateFrom: "2024-01-01T00:00:00.000Z",
  endDateTo: "2024-12-31T23:59:59.999Z",
  page: 1,
  limit: 20,
  sortBy: "endDate",
  sortOrder: "asc"
}
```

**Response Structure:**
```typescript
{
  data: {
    licenses: License[], // Array of license objects with IP asset, brand, and project info
    pagination: {
      page: number,
      limit: number,
      total: number,
      totalPages: number,
      hasNextPage: boolean,
      hasPreviousPage: boolean
    },
    facets: {
      statuses: { [status: string]: number },
      licenseTypes: { [type: string]: number }
    }
  }
}
```

## Authorization & Security

### Projects
- **Admins:** Can search all projects without restrictions
- **Brands:** Can only search projects belonging to their brand
- **Creators:** Can search projects they're involved in via IP asset ownership (when creatorId filter is provided)
- **Viewers:** Have read-only access (inherited from protectedProcedure)

### Licenses
- **Admins:** Can search all licenses without restrictions
- **Brands:** Can only search licenses for their brand
- **Creators:** Can only search licenses for IP assets they own (active ownership only)
- **Viewers:** Have read-only access (inherited from protectedProcedure)

## Database Indexes

Both implementations leverage existing database indexes:
- Projects: `brandId`, `status`, `projectType`, `createdAt`, `deletedAt`
- Licenses: `brandId`, `status`, `licenseType`, `ipAssetId`, `projectId`, `createdAt`, `deletedAt`, `startDate`, `endDate`

## Performance Considerations

1. **Soft Deletes:** Both implementations filter out soft-deleted records (`deletedAt: null`)
2. **Pagination:** Maximum page size is 100 items to prevent excessive database load
3. **Facets:** Facet calculations are done separately to avoid impacting main query performance
4. **Selective Includes:** Only necessary related data is included to minimize query size
5. **Index Usage:** All filterable fields are indexed for optimal query performance

## File Modifications

### Created/Modified Files:
1. **`src/modules/projects/schemas/project.schema.ts`**
   - Added `searchProjectsSchema` validation schema
   - Added `SearchProjectsInput` TypeScript type

2. **`src/modules/projects/routers/projects.router.ts`**
   - Added `search` endpoint with full implementation
   - Imported `searchProjectsSchema`

3. **`src/modules/licenses/router.ts`**
   - Added `SearchLicensesSchema` validation schema
   - Added `search` endpoint with full implementation

## Integration with Existing Systems

This implementation:
- ✅ Uses existing tRPC infrastructure
- ✅ Follows established validation patterns with Zod
- ✅ Maintains consistency with existing authorization middleware
- ✅ Respects row-level security (RLS) patterns
- ✅ Integrates with existing Prisma models without schema changes
- ✅ Complements (not duplicates) the unified search in `SearchService`

## Differences from Unified Search

The new dedicated search endpoints differ from the existing `SearchService` in:

1. **Granularity:** More filter options specific to projects/licenses
2. **Facets:** Dedicated facet calculations for better filtering UX
3. **Sorting:** More sort options relevant to each entity type
4. **Permission Logic:** Deeply integrated with project/license-specific permissions
5. **Response Format:** Optimized for project/license management UI needs

## Usage Examples

### Frontend Integration (TypeScript)

```typescript
import { trpc } from '@/lib/trpc/client';

// Search projects
const { data } = await trpc.projects.search.useQuery({
  query: 'summer campaign',
  status: ['ACTIVE'],
  projectType: ['CAMPAIGN'],
  page: 1,
  limit: 20,
});

// Search licenses expiring soon
const { data: licenses } = await trpc.licenses.search.useQuery({
  expiringWithinDays: 30,
  status: ['ACTIVE'],
  sortBy: 'endDate',
  sortOrder: 'asc',
  page: 1,
  limit: 20,
});
```

## Testing Checklist

- ✅ Validation schemas properly handle all input edge cases
- ✅ Permission filtering works correctly for all user roles
- ✅ Pagination calculations are accurate
- ✅ Facet counts match actual filter results
- ✅ Date range validations prevent invalid ranges
- ✅ Budget range validations prevent invalid ranges
- ✅ Text search is case-insensitive
- ✅ Soft-deleted records are properly excluded
- ✅ Related data is properly included in responses
- ✅ TypeScript types are properly inferred

## Future Enhancements

Potential improvements for future iterations:

1. **Full-Text Search:** Leverage PostgreSQL's full-text search for better relevance scoring
2. **Autocomplete:** Add dedicated autocomplete endpoints for project/license names
3. **Saved Searches:** Allow users to save frequently used search configurations
4. **Export:** Add ability to export search results to CSV/Excel
5. **Advanced Filters:** Add more granular filters (e.g., budget ranges by status)
6. **Aggregations:** Add revenue/metrics aggregations in search results
7. **Search Analytics:** Track popular searches and zero-result queries

## Related Documentation

- [Search Service Implementation](./SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md)
- [Creator Search Implementation](./CREATOR_SEARCH_IMPLEMENTATION_COMPLETE.md)
- [Asset Search Implementation](./ASSET_SEARCH_IMPLEMENTATION.md)
- [Backend Development Roadmap](../YesGoddess%20Ops%20-%20Backend%20&%20Admin%20Development%20Roadmap.md)

## Notes

- All endpoints use the `protectedProcedure` middleware, requiring authentication
- No database migrations were needed as existing indexes support these queries
- The implementation follows the established patterns in the codebase
- No existing functionality was modified or removed
- The code is ready for production deployment
