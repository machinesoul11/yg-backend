# 🔍 Project & License Search - Frontend Integration Guide

> **Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
> **Module:** Project & License Search  
> **Last Updated:** October 17, 2025  
> **Backend Version:** v1.0  

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Authentication & Authorization](#authentication--authorization)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Pagination & Filtering](#pagination--filtering)
8. [Rate Limiting](#rate-limiting)
9. [Frontend Implementation Guide](#frontend-implementation-guide)
10. [React Query Integration](#react-query-integration)
11. [Implementation Checklist](#implementation-checklist)

---

## Overview

The Project & License Search module provides advanced search capabilities for finding and filtering projects and licenses in the YesGoddess platform. This guide covers two primary endpoints:

- **Project Search** - Search and filter projects by name, status, type, brand, budget, and dates
- **License Search** - Search and filter licenses by asset, brand, status, type, and date ranges

### Key Features

✅ **Text Search** - Search by project/asset names and descriptions  
✅ **Multi-Field Filtering** - Filter by status, type, brand, creator, date ranges  
✅ **Budget/Fee Filtering** - Filter projects by budget range  
✅ **Date Range Filtering** - Creation dates, start/end dates, expiring licenses  
✅ **Pagination** - Server-side pagination with configurable page size  
✅ **Sorting** - Multiple sort options (relevance, date, name, budget)  
✅ **Faceted Results** - Aggregate counts by status and type  
✅ **Role-Based Filtering** - Automatic filtering based on user role  

### Architecture

- **Protocol:** tRPC over HTTP
- **Transport:** JSON with SuperJSON serialization (supports Date objects, BigInt, etc.)
- **Authentication:** JWT via NextAuth session
- **Base URL:** `https://ops.yesgoddess.agency/api/trpc`

---

## API Endpoints

### 1. Project Search

**tRPC Procedure:** `projects.search`  
**HTTP Method:** `GET` (tRPC query)  
**Authentication:** Required (protectedProcedure)  
**Full Path:** `GET /api/trpc/projects.search`

#### Purpose
Search and filter projects with advanced filtering options. Results are automatically filtered based on user role.

#### Access Control
- **ADMIN**: Can search all projects
- **BRAND**: Can only search their own brand's projects
- **CREATOR**: Can search projects they're involved in (via IP asset ownership)
- **VIEWER**: Read-only access

---

### 2. License Search

**tRPC Procedure:** `licenses.search`  
**HTTP Method:** `GET` (tRPC query)  
**Authentication:** Required (protectedProcedure)  
**Full Path:** `GET /api/trpc/licenses.search`

#### Purpose
Search and filter licenses with support for expiration tracking, asset/brand filtering, and date range queries.

#### Access Control
- **ADMIN**: Can search all licenses
- **BRAND**: Can only search licenses for their brand
- **CREATOR**: Can only search licenses for their IP assets (active ownership)
- **VIEWER**: Read-only access

---

## TypeScript Type Definitions

### Project Search Types

```typescript
// ============================================================================
// ENUMS
// ============================================================================

export type ProjectStatus = 
  | 'DRAFT'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ProjectType = 
  | 'CAMPAIGN'
  | 'CONTENT'
  | 'LICENSING';

export type ProjectSortBy = 
  | 'relevance'
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'budgetCents'
  | 'startDate';

export type SortOrder = 'asc' | 'desc';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface SearchProjectsInput {
  // Search query (optional)
  query?: string; // Min 2 chars, max 200 chars
  
  // Filters
  status?: ProjectStatus[];
  projectType?: ProjectType[];
  brandId?: string; // CUID format
  creatorId?: string; // CUID format - search by creator involvement
  dateFrom?: string; // ISO 8601 datetime
  dateTo?: string; // ISO 8601 datetime
  budgetMin?: number; // In cents
  budgetMax?: number; // In cents
  
  // Pagination
  page?: number; // Default: 1, min: 1
  limit?: number; // Default: 20, min: 1, max: 100
  
  // Sorting
  sortBy?: ProjectSortBy; // Default: 'relevance'
  sortOrder?: SortOrder; // Default: 'desc'
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  budgetCents: number;
  startDate: string | null; // ISO 8601 datetime
  endDate: string | null; // ISO 8601 datetime
  objectives: string[] | null;
  requirements: ProjectRequirements | null;
  metadata: ProjectMetadata | null;
  brandId: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  deletedAt: string | null;
  
  // Included relations
  brand: {
    id: string;
    companyName: string;
    logo: string | null;
  };
  
  // Counts
  _count: {
    ipAssets: number;
    licenses: number;
  };
}

export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];
  territory?: string[];
  duration?: string;
  [key: string]: any; // Flexible structure
}

export interface ProjectMetadata {
  attachments?: {
    key: string;
    url: string;
    name: string;
    size: number;
    type: string;
  }[];
  tags?: string[];
  categories?: string[];
  [key: string]: any; // Flexible structure
}

export interface ProjectSearchResponse {
  data: {
    projects: Project[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    facets: {
      statuses: Record<ProjectStatus, number>;
      projectTypes: Record<ProjectType, number>;
    };
  };
}
```

### License Search Types

```typescript
// ============================================================================
// ENUMS
// ============================================================================

export type LicenseStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'PENDING_SIGNATURE'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'RENEWED'
  | 'TERMINATED'
  | 'DISPUTED'
  | 'CANCELED'
  | 'SUSPENDED';

export type LicenseType = 
  | 'EXCLUSIVE'
  | 'NON_EXCLUSIVE'
  | 'EXCLUSIVE_TERRITORY';

export type BillingFrequency = 
  | 'ONE_TIME'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUALLY';

export type LicenseSortBy = 
  | 'relevance'
  | 'createdAt'
  | 'updatedAt'
  | 'startDate'
  | 'endDate'
  | 'feeCents';

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface SearchLicensesInput {
  // Search query (optional)
  query?: string; // Min 2 chars, max 200 chars
  
  // Filters
  status?: LicenseStatus[];
  licenseType?: LicenseType[];
  brandId?: string; // CUID format
  creatorId?: string; // CUID format - via IP asset ownership
  ipAssetId?: string; // CUID format
  projectId?: string; // CUID format
  
  // Date filters
  dateFrom?: string; // ISO 8601 datetime - creation date
  dateTo?: string; // ISO 8601 datetime - creation date
  startDateFrom?: string; // ISO 8601 datetime - license start date
  startDateTo?: string; // ISO 8601 datetime - license start date
  endDateFrom?: string; // ISO 8601 datetime - license end date
  endDateTo?: string; // ISO 8601 datetime - license end date
  expiringWithinDays?: number; // Find licenses expiring in N days (0-365)
  
  // Pagination
  page?: number; // Default: 1, min: 1
  limit?: number; // Default: 20, min: 1, max: 100
  
  // Sorting
  sortBy?: LicenseSortBy; // Default: 'relevance'
  sortOrder?: SortOrder; // Default: 'desc'
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface LicenseScope {
  media: {
    digital: boolean;
    print: boolean;
    broadcast: boolean;
    ooh: boolean; // Out-of-home (billboards, transit)
  };
  placement: {
    social: boolean;
    website: boolean;
    email: boolean;
    paid_ads: boolean;
    packaging: boolean;
  };
  geographic?: {
    territories: string[]; // ISO country codes or "GLOBAL"
  };
  exclusivity?: {
    category?: string;
    competitors?: string[]; // Blocked competitor brand IDs
  };
  cutdowns?: {
    allowEdits: boolean;
    maxDuration?: number; // For video, in seconds
    aspectRatios?: string[]; // e.g., ["16:9", "1:1", "9:16"]
  };
  attribution?: {
    required: boolean;
    format?: string; // e.g., "Photo by @creator"
  };
}

export interface License {
  id: string;
  ipAssetId: string;
  brandId: string;
  projectId: string | null;
  licenseType: LicenseType;
  status: LicenseStatus;
  startDate: string; // ISO 8601 datetime
  endDate: string; // ISO 8601 datetime
  signedAt: string | null; // ISO 8601 datetime
  feeCents: number;
  feeDollars: number; // Computed: feeCents / 100
  revShareBps: number; // Basis points (100 bps = 1%)
  revSharePercent: number; // Computed: revShareBps / 100
  paymentTerms: string | null;
  billingFrequency: BillingFrequency | null;
  scope: LicenseScope;
  autoRenew: boolean;
  renewalNotifiedAt: string | null;
  parentLicenseId: string | null;
  signatureProof: string | null;
  metadata: Record<string, any> | null;
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
  
  // Included relations
  ipAsset: {
    id: string;
    title: string;
    type: string;
    thumbnailUrl: string | null;
  };
  brand: {
    id: string;
    companyName: string;
    logo: string | null;
  };
  project: {
    id: string;
    name: string;
  } | null;
  
  // Counts
  _count: {
    amendments: number;
    extensions: number;
  };
}

export interface LicenseSearchResponse {
  data: {
    licenses: License[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    facets: {
      statuses: Record<LicenseStatus, number>;
      licenseTypes: Record<LicenseType, number>;
    };
  };
}
```

---

## Authentication & Authorization

### Authentication Requirements

Both search endpoints require authentication via NextAuth session.

```typescript
// Session structure
interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'BRAND' | 'CREATOR' | 'VIEWER';
  };
  expires: string;
}
```

### Authorization Rules

#### Project Search

| User Role | Access Rules |
|-----------|-------------|
| **ADMIN** | Can search all projects without restrictions |
| **BRAND** | Can only search projects belonging to their brand (automatic filter applied) |
| **CREATOR** | Can search projects they're involved in via IP asset ownership (must provide `creatorId` filter) |
| **VIEWER** | Read-only access to projects they have permission to view |

#### License Search

| User Role | Access Rules |
|-----------|-------------|
| **ADMIN** | Can search all licenses without restrictions |
| **BRAND** | Can only search licenses for their brand (automatic filter applied) |
| **CREATOR** | Can only search licenses for IP assets they own with active ownership (automatic filter applied) |
| **VIEWER** | Read-only access to licenses they have permission to view |

### Permission Notes

> ⚠️ **Important:** The backend automatically applies role-based filtering. Frontend should not attempt to bypass these filters.

> 💡 **Tip:** If a BRAND user without a brand profile or CREATOR without a creator profile attempts to search, the API will return empty results with 200 OK (not an error).

---

## Request/Response Examples

### Example 1: Project Search - Basic Text Search

**Request:**
```typescript
const input: SearchProjectsInput = {
  query: "marketing campaign",
  page: 1,
  limit: 20,
};

// Using tRPC client
const result = await trpc.projects.search.query(input);
```

**Response:**
```json
{
  "data": {
    "projects": [
      {
        "id": "clxx123456",
        "name": "Summer Marketing Campaign 2025",
        "description": "Q3 social media marketing initiative",
        "status": "ACTIVE",
        "projectType": "CAMPAIGN",
        "budgetCents": 500000,
        "startDate": "2025-07-01T00:00:00.000Z",
        "endDate": "2025-09-30T23:59:59.999Z",
        "objectives": ["Increase brand awareness", "Drive conversions"],
        "requirements": {
          "assetTypes": ["image", "video"],
          "deliverables": 10,
          "exclusivity": false
        },
        "metadata": {
          "tags": ["summer", "social", "paid-ads"],
          "categories": ["marketing"]
        },
        "brandId": "clbrand789",
        "createdBy": "clusr456",
        "updatedBy": null,
        "createdAt": "2025-06-01T10:00:00.000Z",
        "updatedAt": "2025-06-15T14:30:00.000Z",
        "deletedAt": null,
        "brand": {
          "id": "clbrand789",
          "companyName": "Acme Corp",
          "logo": "https://cdn.yesgoddess.agency/brands/acme-logo.png"
        },
        "_count": {
          "ipAssets": 15,
          "licenses": 8
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    },
    "facets": {
      "statuses": {
        "DRAFT": 5,
        "ACTIVE": 12,
        "IN_PROGRESS": 8,
        "COMPLETED": 3
      },
      "projectTypes": {
        "CAMPAIGN": 20,
        "CONTENT": 5,
        "LICENSING": 3
      }
    }
  }
}
```

### Example 2: Project Search - Advanced Filters

**Request:**
```typescript
const input: SearchProjectsInput = {
  status: ['ACTIVE', 'IN_PROGRESS'],
  projectType: ['CAMPAIGN'],
  budgetMin: 100000, // $1,000
  budgetMax: 1000000, // $10,000
  dateFrom: "2024-01-01T00:00:00.000Z",
  dateTo: "2024-12-31T23:59:59.999Z",
  page: 1,
  limit: 20,
  sortBy: "budgetCents",
  sortOrder: "desc",
};

const result = await trpc.projects.search.query(input);
```

### Example 3: License Search - Find Expiring Licenses

**Request:**
```typescript
const input: SearchLicensesInput = {
  status: ['ACTIVE', 'EXPIRING_SOON'],
  expiringWithinDays: 30, // Licenses expiring in next 30 days
  sortBy: "endDate",
  sortOrder: "asc",
  page: 1,
  limit: 20,
};

const result = await trpc.licenses.search.query(input);
```

**Response:**
```json
{
  "data": {
    "licenses": [
      {
        "id": "cllic123456",
        "ipAssetId": "classet789",
        "brandId": "clbrand456",
        "projectId": "clproj321",
        "licenseType": "EXCLUSIVE",
        "status": "ACTIVE",
        "startDate": "2024-01-01T00:00:00.000Z",
        "endDate": "2025-11-15T23:59:59.999Z",
        "signedAt": "2024-01-01T10:30:00.000Z",
        "feeCents": 250000,
        "feeDollars": 2500.00,
        "revShareBps": 1000,
        "revSharePercent": 10.00,
        "paymentTerms": "Net 30",
        "billingFrequency": "MONTHLY",
        "scope": {
          "media": {
            "digital": true,
            "print": false,
            "broadcast": false,
            "ooh": false
          },
          "placement": {
            "social": true,
            "website": true,
            "email": true,
            "paid_ads": true,
            "packaging": false
          },
          "geographic": {
            "territories": ["US", "CA"]
          }
        },
        "autoRenew": true,
        "renewalNotifiedAt": "2025-10-15T09:00:00.000Z",
        "parentLicenseId": null,
        "signatureProof": "ipfs://Qm...",
        "metadata": null,
        "createdAt": "2023-12-15T08:00:00.000Z",
        "updatedAt": "2025-10-15T09:00:00.000Z",
        "ipAsset": {
          "id": "classet789",
          "title": "Brand Logo - Vertical",
          "type": "IMAGE",
          "thumbnailUrl": "https://cdn.yesgoddess.agency/assets/thumb-123.jpg"
        },
        "brand": {
          "id": "clbrand456",
          "companyName": "Fashion Co",
          "logo": "https://cdn.yesgoddess.agency/brands/fashion-logo.png"
        },
        "project": {
          "id": "clproj321",
          "name": "Winter Collection 2024"
        },
        "_count": {
          "amendments": 2,
          "extensions": 1
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPreviousPage": false
    },
    "facets": {
      "statuses": {
        "ACTIVE": 15,
        "EXPIRING_SOON": 5,
        "EXPIRED": 2
      },
      "licenseTypes": {
        "EXCLUSIVE": 8,
        "NON_EXCLUSIVE": 12,
        "EXCLUSIVE_TERRITORY": 2
      }
    }
  }
}
```

### Example 4: License Search - Filter by Creator

**Request:**
```typescript
const input: SearchLicensesInput = {
  creatorId: "clcreator123", // Search licenses for this creator's IP assets
  status: ['ACTIVE'],
  page: 1,
  limit: 10,
};

const result = await trpc.licenses.search.query(input);
```

---

## Error Handling

### Error Response Format

tRPC errors follow a standard format:

```typescript
interface TRPCError {
  message: string;
  code: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    zodError?: any; // If validation error
  };
}
```

### Error Codes

| HTTP Status | tRPC Code | Error Type | Description |
|------------|-----------|------------|-------------|
| 401 | `UNAUTHORIZED` | Authentication | No valid session or expired token |
| 403 | `FORBIDDEN` | Authorization | User doesn't have permission to access resource |
| 400 | `BAD_REQUEST` | Validation | Invalid input parameters (Zod validation failed) |
| 404 | `NOT_FOUND` | Resource | Requested resource doesn't exist |
| 500 | `INTERNAL_SERVER_ERROR` | Server | Unexpected server error |

### Common Validation Errors

#### Project Search Validation Errors

```typescript
// Query too short
{
  "message": "Validation error",
  "code": "BAD_REQUEST",
  "data": {
    "zodError": {
      "fieldErrors": {
        "query": ["Search query must be at least 2 characters"]
      }
    }
  }
}

// Invalid budget range
{
  "message": "Validation error",
  "code": "BAD_REQUEST",
  "data": {
    "zodError": {
      "fieldErrors": {
        "budgetMax": ["Maximum budget must be greater than or equal to minimum budget"]
      }
    }
  }
}

// Invalid date range
{
  "message": "Validation error",
  "code": "BAD_REQUEST",
  "data": {
    "zodError": {
      "fieldErrors": {
        "dateTo": ["End date must be after or equal to start date"]
      }
    }
  }
}
```

#### License Search Validation Errors

```typescript
// Invalid expiring days range
{
  "message": "Validation error",
  "code": "BAD_REQUEST",
  "data": {
    "zodError": {
      "fieldErrors": {
        "expiringWithinDays": ["Number must be less than or equal to 365"]
      }
    }
  }
}
```

### Error Handling Best Practices

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  const result = await trpc.projects.search.query(input);
  // Handle success
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        // Redirect to login
        router.push('/login');
        break;
        
      case 'FORBIDDEN':
        // Show permission denied message
        toast.error('You do not have permission to access this resource');
        break;
        
      case 'BAD_REQUEST':
        // Show validation errors
        if (error.data?.zodError) {
          const fieldErrors = error.data.zodError.fieldErrors;
          Object.entries(fieldErrors).forEach(([field, errors]) => {
            toast.error(`${field}: ${errors[0]}`);
          });
        } else {
          toast.error(error.message);
        }
        break;
        
      case 'INTERNAL_SERVER_ERROR':
        // Show generic error
        toast.error('An unexpected error occurred. Please try again later.');
        break;
        
      default:
        toast.error(error.message || 'An error occurred');
    }
  } else {
    // Network error or other unexpected error
    toast.error('Connection error. Please check your network.');
  }
}
```

### User-Friendly Error Messages

Map technical errors to user-friendly messages:

```typescript
const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Please sign in to continue',
  FORBIDDEN: 'You don\'t have permission to view this',
  BAD_REQUEST: 'Please check your input and try again',
  NOT_FOUND: 'The requested item could not be found',
  INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again later',
};

function getUserFriendlyError(error: TRPCClientError): string {
  return ERROR_MESSAGES[error.data?.code] || error.message;
}
```

---

## Pagination & Filtering

### Pagination Parameters

Both endpoints support cursor-free offset pagination:

```typescript
interface PaginationParams {
  page: number;    // Default: 1, Min: 1
  limit: number;   // Default: 20, Min: 1, Max: 100
}
```

### Pagination Response

```typescript
interface PaginationMeta {
  page: number;           // Current page number
  limit: number;          // Items per page
  total: number;          // Total number of items
  totalPages: number;     // Total number of pages
  hasNextPage: boolean;   // Whether there's a next page
  hasPreviousPage: boolean; // Whether there's a previous page
}
```

### Implementing Pagination UI

```typescript
import { useState } from 'react';

function ProjectSearchResults() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  
  const { data, isLoading } = trpc.projects.search.useQuery({
    page,
    limit,
    status: ['ACTIVE'],
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  const { projects, pagination } = data.data;
  
  return (
    <div>
      {/* Results */}
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
      
      {/* Pagination Controls */}
      <div className="pagination">
        <button
          disabled={!pagination.hasPreviousPage}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        
        <span>
          Page {pagination.page} of {pagination.totalPages}
        </span>
        
        <button
          disabled={!pagination.hasNextPage}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      
      {/* Total count */}
      <p>{pagination.total} results found</p>
    </div>
  );
}
```

### Advanced Pagination with Page Numbers

```typescript
function PaginationControls({ pagination, onPageChange }: Props) {
  const { page, totalPages } = pagination;
  
  // Generate page numbers to show
  const getPageNumbers = () => {
    const delta = 2; // Pages to show on each side of current
    const range: number[] = [];
    
    for (
      let i = Math.max(2, page - delta);
      i <= Math.min(totalPages - 1, page + delta);
      i++
    ) {
      range.push(i);
    }
    
    if (page - delta > 2) {
      range.unshift(-1); // Ellipsis
    }
    if (page + delta < totalPages - 1) {
      range.push(-1); // Ellipsis
    }
    
    range.unshift(1);
    if (totalPages > 1) range.push(totalPages);
    
    return range;
  };
  
  return (
    <div className="flex gap-2">
      {getPageNumbers().map((pageNum, idx) => {
        if (pageNum === -1) {
          return <span key={`ellipsis-${idx}`}>...</span>;
        }
        return (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            disabled={pageNum === page}
            className={pageNum === page ? 'active' : ''}
          >
            {pageNum}
          </button>
        );
      })}
    </div>
  );
}
```

### Filter Persistence

Save filters to URL for shareable search results:

```typescript
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

function useSearchFilters() {
  const router = useRouter();
  const [filters, setFilters] = useState<SearchProjectsInput>({
    page: 1,
    limit: 20,
  });
  
  // Load filters from URL on mount
  useEffect(() => {
    const urlFilters: SearchProjectsInput = {
      query: router.query.query as string,
      status: router.query.status 
        ? (router.query.status as string).split(',') as ProjectStatus[]
        : undefined,
      page: router.query.page ? parseInt(router.query.page as string) : 1,
      limit: router.query.limit ? parseInt(router.query.limit as string) : 20,
    };
    setFilters(urlFilters);
  }, [router.query]);
  
  // Update URL when filters change
  const updateFilters = (newFilters: Partial<SearchProjectsInput>) => {
    const merged = { ...filters, ...newFilters };
    setFilters(merged);
    
    // Build query params
    const query: Record<string, string> = {};
    if (merged.query) query.query = merged.query;
    if (merged.status) query.status = merged.status.join(',');
    query.page = merged.page.toString();
    query.limit = merged.limit.toString();
    
    router.push({ pathname: router.pathname, query }, undefined, { shallow: true });
  };
  
  return { filters, updateFilters };
}
```

---

## Rate Limiting

### Current Implementation

> ℹ️ **Note:** The current implementation does not enforce explicit rate limits on search endpoints. However, standard best practices should be followed.

### Recommended Client-Side Practices

1. **Debounce Search Input**
   ```typescript
   import { useDebouncedValue } from '@/hooks/useDebouncedValue';
   
   function SearchInput() {
     const [query, setQuery] = useState('');
     const debouncedQuery = useDebouncedValue(query, 500); // 500ms delay
     
     const { data } = trpc.projects.search.useQuery({
       query: debouncedQuery,
     }, {
       enabled: debouncedQuery.length >= 2,
     });
     
     return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
   }
   ```

2. **Implement Request Cancellation**
   ```typescript
   // React Query automatically cancels previous requests
   // when a new request is made
   const { data } = trpc.projects.search.useQuery(input, {
     keepPreviousData: true, // Show previous results while loading
   });
   ```

3. **Cache Results**
   ```typescript
   // React Query caches by default
   const { data } = trpc.projects.search.useQuery(input, {
     staleTime: 5 * 60 * 1000, // 5 minutes
     cacheTime: 30 * 60 * 1000, // 30 minutes
   });
   ```

### Future Rate Limiting

If rate limiting is implemented in the future, the API will return:

```typescript
// 429 Too Many Requests
{
  "message": "Rate limit exceeded",
  "code": "TOO_MANY_REQUESTS",
  "data": {
    "retryAfter": 60, // Seconds until retry allowed
    "limit": 100, // Requests per window
    "remaining": 0,
    "reset": "2025-10-17T15:00:00.000Z" // When limit resets
  }
}
```

---

## Frontend Implementation Guide

### Step 1: Set Up tRPC Client

```typescript
// lib/trpc/client.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root'; // Backend router type

export const trpc = createTRPCReact<AppRouter>();
```

```typescript
// pages/_app.tsx
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc/client';
import superjson from 'superjson';

function MyApp({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
      },
    },
  }));
  
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
          transformer: superjson,
          headers() {
            return {
              // NextAuth automatically includes session cookie
            };
          },
        }),
      ],
    })
  );
  
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Step 2: Create Search Components

```typescript
// components/ProjectSearch.tsx
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { SearchProjectsInput, ProjectStatus, ProjectType } from '@/types/project';

export function ProjectSearch() {
  const [filters, setFilters] = useState<SearchProjectsInput>({
    page: 1,
    limit: 20,
    sortBy: 'relevance',
    sortOrder: 'desc',
  });
  
  const { data, isLoading, error } = trpc.projects.search.useQuery(filters, {
    keepPreviousData: true,
  });
  
  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;
  
  const { projects, pagination, facets } = data.data;
  
  return (
    <div className="project-search">
      {/* Search Input */}
      <SearchInput
        value={filters.query || ''}
        onChange={(query) => setFilters({ ...filters, query, page: 1 })}
      />
      
      {/* Filters */}
      <FilterPanel>
        <StatusFilter
          selected={filters.status}
          options={facets.statuses}
          onChange={(status) => setFilters({ ...filters, status, page: 1 })}
        />
        <TypeFilter
          selected={filters.projectType}
          options={facets.projectTypes}
          onChange={(projectType) => setFilters({ ...filters, projectType, page: 1 })}
        />
        <BudgetRangeFilter
          min={filters.budgetMin}
          max={filters.budgetMax}
          onChange={(budgetMin, budgetMax) => 
            setFilters({ ...filters, budgetMin, budgetMax, page: 1 })
          }
        />
      </FilterPanel>
      
      {/* Results */}
      <ResultsGrid>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </ResultsGrid>
      
      {/* Pagination */}
      <Pagination
        pagination={pagination}
        onPageChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

### Step 3: Implement Filter Components

```typescript
// components/filters/StatusFilter.tsx
interface StatusFilterProps {
  selected?: ProjectStatus[];
  options: Record<ProjectStatus, number>;
  onChange: (status: ProjectStatus[]) => void;
}

export function StatusFilter({ selected = [], options, onChange }: StatusFilterProps) {
  const handleToggle = (status: ProjectStatus) => {
    const newSelected = selected.includes(status)
      ? selected.filter(s => s !== status)
      : [...selected, status];
    onChange(newSelected);
  };
  
  return (
    <div className="filter-group">
      <h3>Status</h3>
      {Object.entries(options).map(([status, count]) => (
        <label key={status}>
          <input
            type="checkbox"
            checked={selected.includes(status as ProjectStatus)}
            onChange={() => handleToggle(status as ProjectStatus)}
          />
          <span>{status}</span>
          <span className="count">({count})</span>
        </label>
      ))}
    </div>
  );
}
```

```typescript
// components/filters/BudgetRangeFilter.tsx
interface BudgetRangeFilterProps {
  min?: number;
  max?: number;
  onChange: (min?: number, max?: number) => void;
}

export function BudgetRangeFilter({ min, max, onChange }: BudgetRangeFilterProps) {
  const [minInput, setMinInput] = useState(min ? min / 100 : '');
  const [maxInput, setMaxInput] = useState(max ? max / 100 : '');
  
  const handleApply = () => {
    onChange(
      minInput ? Number(minInput) * 100 : undefined,
      maxInput ? Number(maxInput) * 100 : undefined
    );
  };
  
  return (
    <div className="filter-group">
      <h3>Budget Range</h3>
      <div className="range-inputs">
        <input
          type="number"
          placeholder="Min ($)"
          value={minInput}
          onChange={(e) => setMinInput(e.target.value)}
        />
        <span>to</span>
        <input
          type="number"
          placeholder="Max ($)"
          value={maxInput}
          onChange={(e) => setMaxInput(e.target.value)}
        />
      </div>
      <button onClick={handleApply}>Apply</button>
    </div>
  );
}
```

### Step 4: Handle Search State

```typescript
// hooks/useProjectSearch.ts
import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { SearchProjectsInput } from '@/types/project';

export function useProjectSearch(initialFilters?: Partial<SearchProjectsInput>) {
  const [filters, setFilters] = useState<SearchProjectsInput>({
    page: 1,
    limit: 20,
    sortBy: 'relevance',
    sortOrder: 'desc',
    ...initialFilters,
  });
  
  const searchQuery = trpc.projects.search.useQuery(filters, {
    keepPreviousData: true,
  });
  
  const updateFilters = useCallback((updates: Partial<SearchProjectsInput>) => {
    setFilters(prev => ({
      ...prev,
      ...updates,
      page: 'page' in updates ? updates.page : 1, // Reset to page 1 on filter change
    }));
  }, []);
  
  const resetFilters = useCallback(() => {
    setFilters({
      page: 1,
      limit: 20,
      sortBy: 'relevance',
      sortOrder: 'desc',
    });
  }, []);
  
  return {
    filters,
    updateFilters,
    resetFilters,
    ...searchQuery,
  };
}

// Usage
function ProjectSearchPage() {
  const { data, isLoading, filters, updateFilters } = useProjectSearch();
  
  return (
    <div>
      <input
        value={filters.query || ''}
        onChange={(e) => updateFilters({ query: e.target.value })}
      />
      {/* Rest of component */}
    </div>
  );
}
```

---

## React Query Integration

### Basic Query Usage

```typescript
// Simple query
const { data, isLoading, error } = trpc.projects.search.useQuery({
  query: 'marketing',
  page: 1,
  limit: 20,
});
```

### Advanced Query Configuration

```typescript
const { data, isLoading, error, refetch, isFetching } = trpc.projects.search.useQuery(
  filters,
  {
    // Cache configuration
    staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    
    // Keep previous data while fetching new data
    keepPreviousData: true,
    
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
    
    // Retry failed requests
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    
    // Conditional fetching
    enabled: filters.query ? filters.query.length >= 2 : true,
    
    // Transform data
    select: (data) => ({
      ...data,
      data: {
        ...data.data,
        projects: data.data.projects.map(p => ({
          ...p,
          budgetFormatted: formatCurrency(p.budgetCents),
        })),
      },
    }),
    
    // Callbacks
    onSuccess: (data) => {
      console.log('Search completed:', data.data.pagination.total);
    },
    onError: (error) => {
      console.error('Search failed:', error);
      toast.error('Failed to load projects');
    },
  }
);
```

### Prefetching for Better UX

```typescript
import { useQueryClient } from '@tanstack/react-query';

function ProjectList() {
  const queryClient = useQueryClient();
  const trpcUtils = trpc.useContext();
  
  const { data } = trpc.projects.search.useQuery({ page: 1, limit: 20 });
  
  // Prefetch next page on hover
  const prefetchNextPage = (currentPage: number) => {
    trpcUtils.projects.search.prefetch({
      page: currentPage + 1,
      limit: 20,
    });
  };
  
  return (
    <div>
      {/* Results */}
      <button
        onMouseEnter={() => prefetchNextPage(data?.data.pagination.page || 1)}
        onClick={() => goToNextPage()}
      >
        Next Page
      </button>
    </div>
  );
}
```

### Infinite Scroll Implementation

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function InfiniteProjectList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.projects.search.useInfiniteQuery(
    {
      limit: 20,
      query: 'campaign',
    },
    {
      getNextPageParam: (lastPage) => {
        const { pagination } = lastPage.data;
        return pagination.hasNextPage ? pagination.page + 1 : undefined;
      },
    }
  );
  
  return (
    <div>
      {data?.pages.map((page, pageIndex) => (
        <div key={pageIndex}>
          {page.data.projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ))}
      
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

### Optimistic Updates

```typescript
// While this module is read-only, here's how to handle optimistic updates
// for related mutations (e.g., updating project status)

const utils = trpc.useContext();

const updateProject = trpc.projects.update.useMutation({
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await utils.projects.search.cancel();
    
    // Snapshot current value
    const previousData = utils.projects.search.getData();
    
    // Optimistically update
    utils.projects.search.setData(
      filters,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          data: {
            ...old.data,
            projects: old.data.projects.map((p) =>
              p.id === newData.id ? { ...p, ...newData } : p
            ),
          },
        };
      }
    );
    
    return { previousData };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    utils.projects.search.setData(filters, context?.previousData);
  },
  onSettled: () => {
    // Refetch after mutation
    utils.projects.search.invalidate();
  },
});
```

### Debounced Search

```typescript
import { useDebounce } from '@/hooks/useDebounce';

function SearchWithDebounce() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);
  
  const { data } = trpc.projects.search.useQuery(
    { query: debouncedSearch, page: 1, limit: 20 },
    { enabled: debouncedSearch.length >= 2 }
  );
  
  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search projects..."
    />
  );
}

// useDebounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}
```

---

## Implementation Checklist

### Phase 1: Setup & Configuration

- [ ] Install tRPC React Query package (`@trpc/react-query`)
- [ ] Install SuperJSON transformer (`superjson`)
- [ ] Set up tRPC client with proper configuration
- [ ] Configure QueryClient with appropriate cache settings
- [ ] Add API base URL to environment variables
- [ ] Set up TypeScript types (copy from this document)
- [ ] Configure NextAuth session handling

### Phase 2: Core Search Implementation

**Project Search:**
- [ ] Create `useProjectSearch` hook
- [ ] Implement search input with debouncing
- [ ] Build status filter component with facet counts
- [ ] Build project type filter component
- [ ] Build budget range filter component
- [ ] Build date range filter component
- [ ] Create project card display component
- [ ] Implement pagination controls
- [ ] Add sort dropdown (relevance, date, name, budget)
- [ ] Add loading states
- [ ] Add empty state
- [ ] Add error handling

**License Search:**
- [ ] Create `useLicenseSearch` hook
- [ ] Implement search input with debouncing
- [ ] Build status filter component with facet counts
- [ ] Build license type filter component
- [ ] Build expiring licenses filter (30/60/90 days)
- [ ] Build date range filters (creation, start, end)
- [ ] Create license card display component
- [ ] Implement pagination controls
- [ ] Add sort dropdown (relevance, date, fee, end date)
- [ ] Add loading states
- [ ] Add empty state
- [ ] Add error handling

### Phase 3: Advanced Features

- [ ] Implement filter persistence in URL query params
- [ ] Add "Clear all filters" button
- [ ] Add active filter badges/chips
- [ ] Implement saved search functionality (if needed)
- [ ] Add export to CSV functionality (if needed)
- [ ] Add results count display
- [ ] Implement infinite scroll (alternative to pagination)
- [ ] Add prefetching for next page
- [ ] Add keyboard navigation support
- [ ] Add mobile-responsive design

### Phase 4: UX Enhancements

- [ ] Add search suggestions/autocomplete
- [ ] Implement "Did you mean?" for typos
- [ ] Add recent searches
- [ ] Add search analytics tracking
- [ ] Optimize mobile layout
- [ ] Add skeleton loaders
- [ ] Add transition animations
- [ ] Add accessibility (ARIA labels, keyboard nav)
- [ ] Add tooltips for filters
- [ ] Add "No results" suggestions

### Phase 5: Testing & Quality Assurance

- [ ] Test with empty results
- [ ] Test with large result sets (100+ items)
- [ ] Test all filter combinations
- [ ] Test pagination edge cases
- [ ] Test network errors
- [ ] Test validation errors
- [ ] Test permission-based filtering (as different roles)
- [ ] Test on mobile devices
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Load test with concurrent searches
- [ ] Test filter persistence after page reload

### Phase 6: Documentation & Handoff

- [ ] Document component props
- [ ] Create Storybook stories (if using)
- [ ] Write unit tests for filters
- [ ] Write integration tests for search flow
- [ ] Document custom hooks
- [ ] Add JSDoc comments
- [ ] Create user guide for search features
- [ ] Document known limitations

### Edge Cases to Handle

- [ ] User without brand/creator profile (empty results)
- [ ] Search query < 2 characters (disable search)
- [ ] Invalid date ranges (show validation error)
- [ ] Budget max < budget min (show validation error)
- [ ] Network timeout (show retry option)
- [ ] Session expired (redirect to login)
- [ ] No search results (show helpful message)
- [ ] Very long search query (truncate display)
- [ ] Special characters in search (handle properly)
- [ ] Page number exceeds total pages (show last page)

### Performance Considerations

- [ ] Debounce search input (500ms recommended)
- [ ] Cache search results (5 minutes recommended)
- [ ] Use `keepPreviousData` for smooth transitions
- [ ] Prefetch next page on hover
- [ ] Lazy load filter options if many
- [ ] Optimize image loading (lazy load thumbnails)
- [ ] Memoize expensive computations
- [ ] Virtualize long lists (if 100+ items)
- [ ] Monitor bundle size
- [ ] Use React.memo for list items

---

## Additional Resources

### Helpful Links

- [tRPC Documentation](https://trpc.io/docs)
- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Zod Validation](https://zod.dev/)

### Internal Documentation

- [Backend API Documentation](../YesGoddess%20Ops%20-%20Backend%20&%20Admin%20Development%20Roadmap.md)
- [Project/License Search Implementation](../PROJECT_LICENSE_SEARCH_IMPLEMENTATION.md)
- [Authentication Implementation](../AUTH_IMPLEMENTATION.md)

### Support

For questions or issues:
- **Backend Team:** Backend developer contact
- **API Issues:** Check backend logs at `/api/logs`
- **Type Mismatches:** Ensure backend and frontend types are in sync

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-17 | 1.0 | Initial release |

---

**End of Document**
