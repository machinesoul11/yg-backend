# Creator Search - API Reference & TypeScript Types
## 🌐 SHARED Module - Frontend Integration Guide

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Backend Deployment:** ops.yesgoddess.agency  
**Architecture:** REST API via tRPC + JWT Authentication

---

## Table of Contents
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Authentication](#authentication)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)

---

## Overview

The Creator Search module enables discovery and filtering of creators on the YesGoddess platform. It provides:
- Full-text search across creator names and bios
- Advanced filtering (specialties, verification status, availability)
- Performance-based sorting (collaborations, revenue, ratings)
- Faceted search for building filter UIs
- Role-based access control

### Module Classification
🌐 **SHARED** - Public-facing creator discovery with role-based data access

---

## API Endpoints

All endpoints use tRPC and are accessed via the API client at `api.creators.*`.

### 1. Search Creators

**Endpoint:** `api.creators.searchCreators`  
**Method:** `query`  
**Access:** 🌐 Public (authentication optional, affects results)  
**Rate Limit:** 100 requests per minute per IP

Search and filter creators with advanced options.

#### Request

```typescript
const response = await api.creators.searchCreators.query({
  // Search Parameters
  query?: string;                    // Min 2 chars, max 200. Text search across name/bio
  
  // Filter Parameters
  verificationStatus?: ('pending' | 'approved' | 'rejected')[];  // Admin only
  specialties?: CreatorSpecialty[];  // Array of specialties
  industry?: string[];               // Filter by industry categories
  category?: string[];               // Filter by content categories
  availabilityStatus?: 'available' | 'limited' | 'unavailable';
  
  // Sort Parameters
  sortBy?: 'relevance' | 'created_at' | 'verified_at' | 
           'total_collaborations' | 'total_revenue' | 'average_rating';
  sortOrder?: 'asc' | 'desc';       // Default: 'desc'
  
  // Pagination
  page?: number;                     // Default: 1 (1-indexed)
  pageSize?: number;                 // Default: 20, max: 100
});
```

#### Response

```typescript
{
  results: CreatorSearchResult[];   // Array of creator profiles
  pagination: PaginationMeta;       // Pagination metadata
}
```

#### Complete TypeScript Interface

```typescript
// Request Input
interface SearchCreatorsInput {
  query?: string;
  verificationStatus?: VerificationStatus[];
  specialties?: CreatorSpecialty[];
  industry?: string[];
  category?: string[];
  availabilityStatus?: AvailabilityStatus;
  sortBy?: CreatorSortBy;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

// Response
interface SearchCreatorsResponse {
  results: CreatorSearchResult[];
  pagination: PaginationMeta;
}

interface CreatorSearchResult {
  id: string;                       // CUID format
  userId: string;                   // Associated user account ID
  stageName: string;                // Display name (2-100 chars)
  bio: string | null;               // Bio truncated to 200 chars in search results
  specialties: CreatorSpecialty[];  // Array of specialties
  verificationStatus: VerificationStatus;
  portfolioUrl: string | null;      // External portfolio link
  availability: AvailabilityInfo | null;
  performanceMetrics: PerformanceMetrics | null;
  avatar: string | null;            // URL to avatar image
  verifiedAt: string | null;        // ISO 8601 datetime
  createdAt: string;                // ISO 8601 datetime
  updatedAt: string;                // ISO 8601 datetime
}

interface AvailabilityInfo {
  status: 'available' | 'limited' | 'unavailable';
  nextAvailable?: string;           // ISO 8601 datetime
  hoursPerWeek?: number;            // 1-168
}

interface PerformanceMetrics {
  totalCollaborations?: number;     // Completed projects
  totalRevenue?: number;            // Lifetime earnings in USD cents
  averageRating?: number;           // 0-5 scale
  recentActivityScore?: number;     // Internal scoring metric
}

interface PaginationMeta {
  page: number;                     // Current page (1-indexed)
  pageSize: number;                 // Items per page
  total: number;                    // Total matching results
  totalPages: number;               // Total pages available
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

#### Example Usage

```typescript
// Basic search
const results = await api.creators.searchCreators.query({
  query: "photographer",
  pageSize: 20
});

// Advanced filtering
const availablePhotographers = await api.creators.searchCreators.query({
  specialties: ["photography", "videography"],
  availabilityStatus: "available",
  sortBy: "average_rating",
  sortOrder: "desc",
  page: 1,
  pageSize: 12
});

// Admin: View pending creators
const pendingCreators = await api.creators.searchCreators.query({
  verificationStatus: ["pending"],
  sortBy: "created_at",
  sortOrder: "asc"
});
```

#### Access Control Rules

| User Role | Sees Creators | Can Filter Status | Notes |
|-----------|---------------|-------------------|-------|
| **Public** (unauthenticated) | Approved only | No | Default public discovery |
| **Brand** | Approved only | No | Discovery for hiring |
| **Creator** | Approved only | No | Find collaborators |
| **Admin** | All statuses | Yes | Full access for moderation |

> ⚠️ **Important:** Non-admin users always see only `approved` creators, regardless of `verificationStatus` filter value.

---

### 2. Get Creator Search Facets

**Endpoint:** `api.creators.getCreatorSearchFacets`  
**Method:** `query`  
**Access:** 🌐 Public  
**Rate Limit:** 200 requests per minute per IP

Retrieve filter options with result counts for building dynamic filter UIs.

#### Request

```typescript
const facets = await api.creators.getCreatorSearchFacets.query({
  query?: string;                    // Optional: get facets for search results
  verificationStatus?: VerificationStatus[];  // Admin only
});
```

#### Response

```typescript
interface CreatorSearchFacets {
  specialties: FacetOption[];       // Specialties with counts
  availability: FacetOption[];      // Availability statuses with counts
  verificationStatus: FacetOption[]; // Empty for non-admins
  totalCount: number;               // Total matching creators
}

interface FacetOption {
  specialty?: string;               // For specialty facets
  status?: string;                  // For status facets
  count: number;                    // Number of results with this value
}
```

#### Example Response

```json
{
  "specialties": [
    { "specialty": "photography", "count": 142 },
    { "specialty": "videography", "count": 98 },
    { "specialty": "graphic-design", "count": 76 },
    { "specialty": "illustration", "count": 54 }
  ],
  "availability": [
    { "status": "available", "count": 203 },
    { "status": "limited", "count": 89 },
    { "status": "unavailable", "count": 45 }
  ],
  "verificationStatus": [],  // Empty for non-admin users
  "totalCount": 337
}
```

#### Use Case: Building Filter UI

```typescript
// Fetch facets for current search
const facets = await api.creators.getCreatorSearchFacets.query({
  query: searchQuery
});

// Render checkboxes with counts
facets.specialties.map(facet => (
  <Checkbox 
    label={`${facet.specialty} (${facet.count})`}
    value={facet.specialty}
  />
));
```

---

### 3. Get Featured Creators

**Endpoint:** `api.creators.getFeaturedCreators`  
**Method:** `query`  
**Access:** 🌐 Public  
**Rate Limit:** 200 requests per minute per IP

Retrieve curated list of featured/verified creators for homepage/discovery.

#### Request

```typescript
const featured = await api.creators.getFeaturedCreators.query({
  limit?: number;  // Default: 20, max: 50
});
```

#### Response

```typescript
{
  creators: CreatorSearchResult[];  // Same format as search results
  verificationStatus: 'approved';   // Always approved
}
```

---

## TypeScript Type Definitions

Export these types in your frontend codebase for type safety.

### Enums

```typescript
// Creator Specialties
export type CreatorSpecialty = 
  | 'photography'
  | 'videography'
  | 'motion-graphics'
  | 'illustration'
  | '3d-design'
  | 'graphic-design'
  | 'copywriting'
  | 'music-composition'
  | 'sound-design'
  | 'brand-strategy'
  | 'art-direction'
  | 'animation';

// Verification Status
export type VerificationStatus = 
  | 'pending'   // Awaiting admin review
  | 'approved'  // Verified and active
  | 'rejected'; // Denied verification

// Availability Status
export type AvailabilityStatus = 
  | 'available'    // Accepting new work
  | 'limited'      // Selective/limited capacity
  | 'unavailable'; // Not accepting work

// Sort Options
export type CreatorSortBy = 
  | 'relevance'              // Best match (default for text search)
  | 'created_at'             // Account creation date
  | 'verified_at'            // Verification date
  | 'total_collaborations'   // Most projects completed
  | 'total_revenue'          // Highest earning
  | 'average_rating';        // Highest rated
```

### Specialty Display Names

Map specialty enum values to user-friendly labels:

```typescript
export const SPECIALTY_LABELS: Record<CreatorSpecialty, string> = {
  'photography': 'Photography',
  'videography': 'Videography',
  'motion-graphics': 'Motion Graphics',
  'illustration': 'Illustration',
  '3d-design': '3D Design',
  'graphic-design': 'Graphic Design',
  'copywriting': 'Copywriting',
  'music-composition': 'Music Composition',
  'sound-design': 'Sound Design',
  'brand-strategy': 'Brand Strategy',
  'art-direction': 'Art Direction',
  'animation': 'Animation',
};
```

### Complete Type Bundle

```typescript
// ============================================================================
// CREATOR SEARCH TYPES - Export Bundle
// ============================================================================

export interface CreatorSearchParams {
  query?: string;
  verificationStatus?: VerificationStatus[];
  specialties?: CreatorSpecialty[];
  industry?: string[];
  category?: string[];
  availabilityStatus?: AvailabilityStatus;
  sortBy?: CreatorSortBy;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CreatorSearchResult {
  id: string;
  userId: string;
  stageName: string;
  bio: string | null;
  specialties: CreatorSpecialty[];
  verificationStatus: VerificationStatus;
  portfolioUrl: string | null;
  availability: {
    status: AvailabilityStatus;
    nextAvailable?: string;
    hoursPerWeek?: number;
  } | null;
  performanceMetrics: {
    totalCollaborations?: number;
    totalRevenue?: number;
    averageRating?: number;
    recentActivityScore?: number;
  } | null;
  avatar: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorSearchResponse {
  results: CreatorSearchResult[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CreatorSearchFacets {
  specialties: Array<{ specialty: string; count: number }>;
  availability: Array<{ status: string; count: number }>;
  verificationStatus: Array<{ status: string; count: number }>;
  totalCount: number;
}
```

---

## Authentication

### JWT Token Format

The Creator Search endpoints work with or without authentication, but authentication affects what data is visible.

#### Request Headers

```typescript
// For authenticated requests
headers: {
  'Authorization': `Bearer ${jwtToken}`,
  'Content-Type': 'application/json'
}
```

#### Token Payload

```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'BRAND' | 'CREATOR';
  iat: number;  // Issued at
  exp: number;  // Expires at
}
```

#### Session Context

```typescript
// Available in API context
interface SessionContext {
  user?: {
    id: string;
    email: string;
    role: 'ADMIN' | 'BRAND' | 'CREATOR';
  } | null;
}
```

### Role-Based Feature Matrix

| Feature | Public | Brand | Creator | Admin |
|---------|--------|-------|---------|-------|
| Search approved creators | ✅ | ✅ | ✅ | ✅ |
| View performance metrics | ✅ | ✅ | ✅ | ✅ |
| Filter by verification status | ❌ | ❌ | ❌ | ✅ |
| See pending creators | ❌ | ❌ | ❌ | ✅ |
| See rejected creators | ❌ | ❌ | ❌ | ✅ |

---

## Error Handling

### Standard Error Response

All errors follow tRPC error format:

```typescript
interface TRPCError {
  message: string;
  code: string;
  data?: {
    code: string;
    httpStatus: number;
    path: string;
    zodError?: ZodError;  // For validation errors
  };
}
```

### Error Codes

| HTTP Status | Error Code | Scenario | User-Friendly Message |
|-------------|------------|----------|----------------------|
| `400` | `BAD_REQUEST` | Invalid input parameters | "Please check your search filters and try again" |
| `400` | `BAD_REQUEST` | Query too short (< 2 chars) | "Search query must be at least 2 characters" |
| `400` | `BAD_REQUEST` | Invalid page number | "Invalid page number" |
| `401` | `UNAUTHORIZED` | No/invalid JWT token (admin-only endpoint) | "Please sign in to continue" |
| `403` | `FORBIDDEN` | Non-admin accessing admin features | "You don't have permission to view this" |
| `429` | `TOO_MANY_REQUESTS` | Rate limit exceeded | "Too many requests. Please try again in a minute" |
| `500` | `INTERNAL_SERVER_ERROR` | Database/server error | "Something went wrong. Please try again later" |

### Error Handling Best Practices

```typescript
try {
  const results = await api.creators.searchCreators.query(params);
  return results;
} catch (error) {
  if (error.data?.code === 'BAD_REQUEST') {
    // Show validation errors
    toast.error(error.message);
  } else if (error.data?.httpStatus === 401) {
    // Redirect to login
    router.push('/login');
  } else if (error.data?.httpStatus === 429) {
    // Rate limited
    toast.error('Please slow down and try again in a moment');
  } else {
    // Generic error
    toast.error('Failed to load creators. Please try again.');
  }
}
```

### Validation Errors

When input validation fails, you'll receive a `ZodError` in the error data:

```typescript
{
  "message": "Validation failed",
  "code": "BAD_REQUEST",
  "data": {
    "zodError": {
      "issues": [
        {
          "path": ["query"],
          "message": "String must contain at least 2 character(s)",
          "code": "too_small"
        }
      ]
    }
  }
}
```

#### Displaying Validation Errors

```typescript
if (error.data?.zodError) {
  error.data.zodError.issues.forEach(issue => {
    const field = issue.path.join('.');
    showFieldError(field, issue.message);
  });
}
```

---

## Rate Limiting

### Limits Per Endpoint

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `searchCreators` | 100 requests | 1 minute | Per IP address |
| `getCreatorSearchFacets` | 200 requests | 1 minute | Per IP address |
| `getFeaturedCreators` | 200 requests | 1 minute | Per IP address |

### Rate Limit Headers

Currently not exposed. Monitor for `429` status codes.

### Handling Rate Limits

```typescript
// Implement exponential backoff
async function searchWithRetry(params: CreatorSearchParams, retries = 3) {
  try {
    return await api.creators.searchCreators.query(params);
  } catch (error) {
    if (error.data?.httpStatus === 429 && retries > 0) {
      const delay = Math.pow(2, 3 - retries) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
      return searchWithRetry(params, retries - 1);
    }
    throw error;
  }
}
```

### Best Practices

1. **Debounce search input** - Wait 300-500ms after user stops typing
2. **Cache results** - Use React Query with appropriate stale times
3. **Implement pagination** - Don't load all results at once
4. **Use facets efficiently** - Cache facet results per search query

```typescript
// React Query example with proper caching
const { data, isLoading } = useQuery({
  queryKey: ['creators', 'search', searchParams],
  queryFn: () => api.creators.searchCreators.query(searchParams),
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000,   // 10 minutes (formerly cacheTime)
});
```

---

## Next Steps

Continue to:
- **[Creator Search - Integration Guide](./CREATOR_SEARCH_INTEGRATION_GUIDE.md)** - Implementation patterns, business logic, and UX guidelines
- **[Creator Search - Implementation Checklist](./CREATOR_SEARCH_IMPLEMENTATION_CHECKLIST.md)** - Step-by-step frontend tasks

---

**Document Version:** 1.0  
**Backend API Version:** Current  
**Maintained by:** Backend Team  
**Questions?** Contact the backend team or check the main implementation docs.
