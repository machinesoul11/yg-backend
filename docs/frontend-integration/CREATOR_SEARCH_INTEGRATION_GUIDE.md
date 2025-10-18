# Creator Search - Integration Guide
## 🌐 SHARED Module - Business Logic & Frontend Implementation

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Part 2 of 3** - Frontend Integration Documentation

---

## Table of Contents
1. [Business Logic & Validation](#business-logic--validation)
2. [Search Strategies & Best Practices](#search-strategies--best-practices)
3. [Pagination & Filtering Patterns](#pagination--filtering-patterns)
4. [Performance Optimization](#performance-optimization)
5. [UX Guidelines](#ux-guidelines)
6. [React Implementation Examples](#react-implementation-examples)

---

## Business Logic & Validation

### Field Validation Requirements

#### Search Query
- **Minimum Length:** 2 characters
- **Maximum Length:** 200 characters
- **Sanitization:** Trimmed automatically by backend
- **Special Characters:** Allowed (no escaping needed)
- **Empty String:** Treated as no filter (shows all)

```typescript
// Frontend validation before API call
function validateSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null; // No filter
  if (trimmed.length < 2) return "Search must be at least 2 characters";
  if (trimmed.length > 200) return "Search query too long (max 200 characters)";
  return null; // Valid
}
```

#### Specialties
- **Type:** Array of enums
- **Minimum:** 0 (optional filter)
- **Maximum:** All specialties can be selected
- **Validation:** Must match `CreatorSpecialty` enum values

```typescript
const VALID_SPECIALTIES = [
  'photography', 'videography', 'motion-graphics', 'illustration',
  '3d-design', 'graphic-design', 'copywriting', 'music-composition',
  'sound-design', 'brand-strategy', 'art-direction', 'animation'
] as const;

function validateSpecialties(specialties: string[]): boolean {
  return specialties.every(s => VALID_SPECIALTIES.includes(s as any));
}
```

#### Pagination
- **Page:** Must be positive integer (1-indexed)
- **Page Size:** 1-100 (default: 20)
- **Recommended Sizes:** 12 (grid), 20 (list), 50 (table)

```typescript
function normalizePagination(page?: number, pageSize?: number) {
  return {
    page: Math.max(1, page || 1),
    pageSize: Math.min(100, Math.max(1, pageSize || 20))
  };
}
```

#### Sort Options
- **Default Sort:** `relevance` when query exists, `created_at` otherwise
- **Sort Order:** Default `desc` for metrics, `asc` for dates

```typescript
function getDefaultSort(hasQuery: boolean): CreatorSortBy {
  return hasQuery ? 'relevance' : 'created_at';
}
```

---

## Search Strategies & Best Practices

### 1. Relevance Scoring

When using `sortBy: 'relevance'`, the backend calculates scores based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Textual Relevance | 50% | Exact match > partial match > word match |
| Recency | 20% | Exponential decay from creation date |
| Popularity | 20% | Based on collaborations (40%), revenue (30%), rating (30%) |
| Quality | 10% | Verification status (approved: 1.0, pending: 0.7) |

**Best For:**
- Text searches with query string
- General discovery
- "Find similar" features

```typescript
// Use relevance for text search
const textResults = await api.creators.searchCreators.query({
  query: userInput,
  sortBy: 'relevance', // Default when query exists
});
```

### 2. Performance-Based Sorting

**Sort by Metrics:**
- `total_collaborations` - Most experienced creators
- `total_revenue` - Highest earning creators  
- `average_rating` - Highest quality creators

**Use Cases:**
```typescript
// "Top Performers" section
const topPerformers = await api.creators.searchCreators.query({
  sortBy: 'total_revenue',
  sortOrder: 'desc',
  pageSize: 10
});

// "Rising Stars" (new + high rated)
const risingStars = await api.creators.searchCreators.query({
  sortBy: 'average_rating',
  sortOrder: 'desc',
  // Additional filter: created in last 6 months (implement client-side)
});
```

### 3. Availability-First Search

For urgent hiring needs:

```typescript
// Immediate availability
const availableNow = await api.creators.searchCreators.query({
  availabilityStatus: 'available',
  specialties: ['photography'],
  sortBy: 'average_rating',
  sortOrder: 'desc'
});
```

### 4. Multi-Criteria Filtering

Combine filters for precise discovery:

```typescript
const specificSearch = await api.creators.searchCreators.query({
  query: 'fashion editorial',
  specialties: ['photography', 'art-direction'],
  availabilityStatus: 'available',
  sortBy: 'total_collaborations',
  sortOrder: 'desc',
  pageSize: 20
});
```

---

## Pagination & Filtering Patterns

### Pagination Strategy

#### Offset-Based Pagination

The API uses page-based pagination (not cursor-based).

```typescript
interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
}

function usePagination() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const goToPage = (newPage: number) => {
    setPage(Math.max(1, newPage));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const nextPage = () => goToPage(page + 1);
  const prevPage = () => goToPage(page - 1);

  return { page, pageSize, setPageSize, goToPage, nextPage, prevPage };
}
```

#### Load More Pattern

```typescript
function useInfiniteCreators(filters: CreatorSearchParams) {
  const [allResults, setAllResults] = useState<CreatorSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    const response = await api.creators.searchCreators.query({
      ...filters,
      page: page + 1,
      pageSize: 20
    });

    setAllResults(prev => [...prev, ...response.results]);
    setPage(page + 1);
    setHasMore(response.pagination.hasNextPage);
  };

  return { results: allResults, loadMore, hasMore };
}
```

### Filter State Management

#### URL-Based Filters (Recommended)

Preserve filter state in URL for:
- Shareable search results
- Browser back/forward support
- SEO benefits

```typescript
// Using Next.js 15 App Router
import { useRouter, useSearchParams } from 'next/navigation';

function CreatorSearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (newFilters: Partial<CreatorSearchParams>) => {
    const params = new URLSearchParams(searchParams);
    
    // Update query params
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        params.delete(key);
      } else if (Array.isArray(value)) {
        params.delete(key);
        value.forEach(v => params.append(key, v));
      } else {
        params.set(key, String(value));
      }
    });

    router.push(`/creators?${params.toString()}`);
  };

  return (
    <FilterControls onFilterChange={updateFilters} />
  );
}
```

#### Reading Filters from URL

```typescript
function parseFiltersFromURL(searchParams: URLSearchParams): CreatorSearchParams {
  return {
    query: searchParams.get('q') || undefined,
    specialties: searchParams.getAll('specialty') as CreatorSpecialty[],
    availabilityStatus: searchParams.get('availability') as AvailabilityStatus,
    sortBy: (searchParams.get('sortBy') || 'relevance') as CreatorSortBy,
    sortOrder: (searchParams.get('order') || 'desc') as 'asc' | 'desc',
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: parseInt(searchParams.get('pageSize') || '20'),
  };
}
```

### Filter UI Patterns

#### Faceted Search with Counts

```typescript
function SpecialtyFilter() {
  const [facets, setFacets] = useState<CreatorSearchFacets | null>(null);
  const [selected, setSelected] = useState<CreatorSpecialty[]>([]);

  // Load facets
  useEffect(() => {
    api.creators.getCreatorSearchFacets.query({ query })
      .then(setFacets);
  }, [query]);

  return (
    <div className="filter-group">
      <h3>Specialties</h3>
      {facets?.specialties.map(facet => (
        <Checkbox
          key={facet.specialty}
          checked={selected.includes(facet.specialty)}
          onChange={(checked) => {
            setSelected(prev => 
              checked 
                ? [...prev, facet.specialty]
                : prev.filter(s => s !== facet.specialty)
            );
          }}
          label={`${SPECIALTY_LABELS[facet.specialty]} (${facet.count})`}
        />
      ))}
    </div>
  );
}
```

#### Active Filter Pills

```typescript
function ActiveFilters({ filters, onRemove }) {
  return (
    <div className="active-filters">
      {filters.specialties?.map(specialty => (
        <FilterPill
          key={specialty}
          label={SPECIALTY_LABELS[specialty]}
          onRemove={() => onRemove('specialties', specialty)}
        />
      ))}
      {filters.availabilityStatus && (
        <FilterPill
          label={`Available: ${filters.availabilityStatus}`}
          onRemove={() => onRemove('availabilityStatus')}
        />
      )}
    </div>
  );
}
```

---

## Performance Optimization

### 1. Debounced Search Input

Prevent excessive API calls while typing:

```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300); // 300ms delay

  // Only trigger search on debounced value
  const { data } = useQuery({
    queryKey: ['creators', 'search', debouncedQuery],
    queryFn: () => api.creators.searchCreators.query({ query: debouncedQuery }),
    enabled: debouncedQuery.length >= 2
  });

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search creators..."
    />
  );
}
```

### 2. React Query Configuration

```typescript
import { QueryClient, useQuery } from '@tanstack/react-query';

// Configure query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5 minutes
      gcTime: 10 * 60 * 1000,        // 10 minutes (cache time)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Usage
function useCreatorSearch(params: CreatorSearchParams) {
  return useQuery({
    queryKey: ['creators', 'search', params],
    queryFn: () => api.creators.searchCreators.query(params),
    enabled: !params.query || params.query.length >= 2,
    keepPreviousData: true, // Smooth transitions between pages
  });
}
```

### 3. Prefetching

```typescript
// Prefetch next page on hover
function CreatorCard({ creator, currentPage, filters }) {
  const queryClient = useQueryClient();

  const prefetchNextPage = () => {
    queryClient.prefetchQuery({
      queryKey: ['creators', 'search', { ...filters, page: currentPage + 1 }],
      queryFn: () => api.creators.searchCreators.query({
        ...filters,
        page: currentPage + 1
      }),
    });
  };

  return (
    <div onMouseEnter={prefetchNextPage}>
      {/* Card content */}
    </div>
  );
}
```

### 4. Optimistic Updates (for future favoriting)

```typescript
// When implementing "favorite creator" feature
function useFavoriteCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (creatorId: string) => api.creators.favorite.mutate(creatorId),
    onMutate: async (creatorId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['creators'] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(['creators', 'search']);

      // Optimistically update
      queryClient.setQueryData(['creators', 'search'], (old: any) => ({
        ...old,
        results: old.results.map((c: CreatorSearchResult) =>
          c.id === creatorId ? { ...c, isFavorited: true } : c
        ),
      }));

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['creators', 'search'], context.previousData);
    },
  });
}
```

---

## UX Guidelines

### Empty States

#### No Results

```typescript
function NoResults({ query, hasFilters }) {
  return (
    <EmptyState
      icon={<SearchIcon />}
      title="No creators found"
      description={
        hasFilters
          ? "Try adjusting your filters or search terms"
          : query
          ? `No results for "${query}"`
          : "No creators available"
      }
      action={
        hasFilters && (
          <Button onClick={clearFilters}>
            Clear Filters
          </Button>
        )
      }
    />
  );
}
```

#### Initial State

```typescript
function InitialSearchState() {
  return (
    <div className="text-center py-12">
      <h2>Discover Talented Creators</h2>
      <p>Search by name, specialty, or browse all creators</p>
      <QuickFilters>
        <FilterChip onClick={() => setSpecialty('photography')}>
          📷 Photographers
        </FilterChip>
        <FilterChip onClick={() => setSpecialty('videography')}>
          🎥 Videographers
        </FilterChip>
        {/* More quick filters */}
      </QuickFilters>
    </div>
  );
}
```

### Loading States

```typescript
function CreatorSearchResults() {
  const { data, isLoading, isFetching } = useCreatorSearch(filters);

  if (isLoading) {
    return <CreatorGridSkeleton count={12} />;
  }

  return (
    <>
      {isFetching && <LoadingBar />}
      <CreatorGrid creators={data.results} />
    </>
  );
}
```

### Result Count Display

```typescript
function ResultsHeader({ total, query, appliedFilters }) {
  return (
    <div className="results-header">
      <h2>
        {total.toLocaleString()} creator{total !== 1 ? 's' : ''}
        {query && ` matching "${query}"`}
      </h2>
      <div className="meta">
        {appliedFilters.length > 0 && (
          <span>{appliedFilters.length} filter{appliedFilters.length !== 1 ? 's' : ''} applied</span>
        )}
      </div>
    </div>
  );
}
```

### Performance Metrics Display

```typescript
function CreatorPerformanceStats({ metrics }: { metrics: PerformanceMetrics }) {
  return (
    <div className="stats-grid">
      {metrics.totalCollaborations !== undefined && (
        <Stat
          label="Projects"
          value={metrics.totalCollaborations}
          icon={<ProjectIcon />}
        />
      )}
      {metrics.averageRating !== undefined && (
        <Stat
          label="Rating"
          value={`${metrics.averageRating.toFixed(1)}/5`}
          icon={<StarIcon />}
        />
      )}
      {/* Don't show revenue to non-admins if sensitive */}
    </div>
  );
}
```

### Availability Indicators

```typescript
function AvailabilityBadge({ availability }: { availability: AvailabilityInfo }) {
  const config = {
    available: {
      color: 'green',
      icon: '✓',
      label: 'Available'
    },
    limited: {
      color: 'yellow',
      icon: '⚠',
      label: 'Limited Availability'
    },
    unavailable: {
      color: 'red',
      icon: '✕',
      label: 'Unavailable'
    }
  };

  const { color, icon, label } = config[availability.status];

  return (
    <Badge color={color}>
      <span>{icon}</span>
      {label}
      {availability.nextAvailable && (
        <span className="ml-2 text-xs">
          (from {new Date(availability.nextAvailable).toLocaleDateString()})
        </span>
      )}
    </Badge>
  );
}
```

---

## React Implementation Examples

### Complete Search Page Component

```typescript
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreatorSearchParams } from '@/types/creators';

export default function CreatorSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Parse filters from URL
  const filters: CreatorSearchParams = {
    query: searchParams.get('q') || undefined,
    specialties: searchParams.getAll('specialty') as CreatorSpecialty[],
    availabilityStatus: searchParams.get('availability') as AvailabilityStatus,
    sortBy: (searchParams.get('sortBy') || 'relevance') as CreatorSortBy,
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: 20,
  };

  // Fetch creators
  const { data, isLoading, error } = useQuery({
    queryKey: ['creators', 'search', filters],
    queryFn: () => api.creators.searchCreators.query(filters),
    keepPreviousData: true,
  });

  // Fetch facets for filter UI
  const { data: facets } = useQuery({
    queryKey: ['creators', 'facets', filters.query],
    queryFn: () => api.creators.getCreatorSearchFacets.query({
      query: filters.query
    }),
  });

  const updateFilter = (key: string, value: any) => {
    const params = new URLSearchParams(searchParams);
    if (value === undefined || value === null) {
      params.delete(key);
    } else if (Array.isArray(value)) {
      params.delete(key);
      value.forEach(v => params.append(key, v));
    } else {
      params.set(key, String(value));
    }
    params.set('page', '1'); // Reset to page 1 on filter change
    router.push(`/creators?${params.toString()}`);
  };

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Discover Creators</h1>
        <SearchInput
          value={filters.query || ''}
          onChange={(value) => updateFilter('q', value)}
        />
      </div>

      <div className="flex gap-8">
        {/* Filters Sidebar */}
        <aside className="w-64 flex-shrink-0">
          <FilterPanel
            facets={facets}
            selectedSpecialties={filters.specialties}
            availabilityStatus={filters.availabilityStatus}
            onSpecialtyChange={(specs) => updateFilter('specialty', specs)}
            onAvailabilityChange={(status) => updateFilter('availability', status)}
          />
        </aside>

        {/* Results */}
        <main className="flex-1">
          {/* Results Header */}
          {data && (
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-gray-600">
                  {data.pagination.total.toLocaleString()} creators found
                </p>
              </div>
              <SortSelector
                value={filters.sortBy}
                onChange={(sortBy) => updateFilter('sortBy', sortBy)}
              />
            </div>
          )}

          {/* Loading State */}
          {isLoading && <CreatorGridSkeleton count={12} />}

          {/* Results Grid */}
          {data && (
            <>
              <CreatorGrid creators={data.results} />
              
              {/* Pagination */}
              <Pagination
                currentPage={data.pagination.page}
                totalPages={data.pagination.totalPages}
                hasNextPage={data.pagination.hasNextPage}
                hasPreviousPage={data.pagination.hasPreviousPage}
                onPageChange={(page) => updateFilter('page', page)}
              />
            </>
          )}

          {/* Empty State */}
          {data && data.results.length === 0 && (
            <NoResults
              query={filters.query}
              hasFilters={filters.specialties.length > 0}
              onClearFilters={() => router.push('/creators')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
```

### Reusable Hooks

```typescript
// hooks/useCreatorSearch.ts
export function useCreatorSearch(initialFilters?: CreatorSearchParams) {
  const searchParams = useSearchParams();
  const filters = parseFiltersFromURL(searchParams);

  return useQuery({
    queryKey: ['creators', 'search', filters],
    queryFn: () => api.creators.searchCreators.query(filters),
    keepPreviousData: true,
    enabled: !filters.query || filters.query.length >= 2,
  });
}

// hooks/useCreatorFacets.ts
export function useCreatorFacets(query?: string) {
  return useQuery({
    queryKey: ['creators', 'facets', query],
    queryFn: () => api.creators.getCreatorSearchFacets.query({ query }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

---

## Next Steps

Continue to:
- **[Creator Search - Implementation Checklist](./CREATOR_SEARCH_IMPLEMENTATION_CHECKLIST.md)** - Step-by-step frontend tasks and edge cases

---

**Document Version:** 1.0  
**Part:** 2 of 3  
**Maintained by:** Backend Team
