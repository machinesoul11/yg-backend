# Search API - Frontend Integration Guide (Part 3)

**Module:** Search Service  
**Classification:** 🌐 SHARED  
**Continued from:** [Part 2 - Request/Response & Error Handling](./SEARCH_API_INTEGRATION_GUIDE_PART2.md)

---

## Table of Contents

1. [Business Logic & Validation](#business-logic--validation)
2. [React Query Implementation](#react-query-implementation)
3. [Complete UI Components](#complete-ui-components)
4. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)
5. [Frontend Implementation Checklist](#frontend-implementation-checklist)
6. [Testing Recommendations](#testing-recommendations)
7. [Performance Optimization](#performance-optimization)

---

## Business Logic & Validation

### Search Query Validation

**Frontend Validation (Before API Call):**

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function validateSearchQuery(query: string): ValidationResult {
  const errors: string[] = [];
  
  // Length validation
  if (query.trim().length < 2) {
    errors.push('Search query must be at least 2 characters');
  }
  
  if (query.length > 200) {
    errors.push('Search query must not exceed 200 characters');
  }
  
  // Special characters (optional, based on UX preference)
  const invalidCharsRegex = /[<>{}[\]\\]/;
  if (invalidCharsRegex.test(query)) {
    errors.push('Search query contains invalid characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Usage
const handleSearch = (query: string) => {
  const validation = validateSearchQuery(query);
  
  if (!validation.isValid) {
    validation.errors.forEach(error => toast.error(error));
    return;
  }
  
  // Proceed with search
  performSearch(query);
};
```

### Filter Validation

```typescript
function validateFilters(filters: SearchFilters): ValidationResult {
  const errors: string[] = [];
  
  // Date range validation
  if (filters.dateFrom && filters.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    
    if (from > to) {
      errors.push('Start date must be before end date');
    }
    
    // Max date range: 2 years
    const maxRange = 730 * 24 * 60 * 60 * 1000; // 2 years in ms
    if (to.getTime() - from.getTime() > maxRange) {
      errors.push('Date range cannot exceed 2 years');
    }
  }
  
  // Array length validation
  if (filters.tags && filters.tags.length > 50) {
    errors.push('Too many tags selected (max: 50)');
  }
  
  if (filters.specialties && filters.specialties.length > 20) {
    errors.push('Too many specialties selected (max: 20)');
  }
  
  // CUID validation (basic)
  const cuidRegex = /^cl[0-9a-z]{24}$/;
  
  if (filters.projectId && !cuidRegex.test(filters.projectId)) {
    errors.push('Invalid project ID format');
  }
  
  if (filters.creatorId && !cuidRegex.test(filters.creatorId)) {
    errors.push('Invalid creator ID format');
  }
  
  if (filters.brandId && !cuidRegex.test(filters.brandId)) {
    errors.push('Invalid brand ID format');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

### Pagination Validation

```typescript
function validatePagination(page: number, limit: number): ValidationResult {
  const errors: string[] = [];
  
  if (page < 1) {
    errors.push('Page must be at least 1');
  }
  
  if (page > 10000) {
    errors.push('Page number too high (max: 10,000)');
  }
  
  if (limit < 1) {
    errors.push('Limit must be at least 1');
  }
  
  if (limit > 100) {
    errors.push('Limit cannot exceed 100');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

### Business Rules

#### 1. Empty Query Handling

**Rule:** Don't execute search if query is empty after trim.

```typescript
const handleSearch = (rawQuery: string) => {
  const query = rawQuery.trim();
  
  if (!query) {
    // Show recent searches or trending searches instead
    setShowRecentSearches(true);
    return;
  }
  
  performSearch(query);
};
```

#### 2. Minimum Query Length

**Rule:** Require at least 2 characters before searching.

```typescript
// Show validation hint in UI
{query.length > 0 && query.length < 2 && (
  <div className="search-hint">
    Type at least 2 characters to search
  </div>
)}
```

#### 3. Debounce Autocomplete

**Rule:** Wait 300ms after user stops typing before fetching suggestions.

```typescript
const debouncedSuggestions = useCallback(
  debounce(async (query: string) => {
    if (query.length >= 2) {
      const result = await trpc.search.getSuggestions.query({ query });
      setSuggestions(result.data);
    }
  }, 300),
  []
);
```

#### 4. Result Click Tracking

**Rule:** Always track clicks for analytics (non-blocking).

```typescript
const handleResultClick = async (result: SearchResult) => {
  // Navigate immediately (don't wait for tracking)
  router.push(`/${result.entityType}/${result.id}`);
  
  // Track click asynchronously (fire-and-forget)
  trpc.search.trackClick.mutate({
    eventId: searchEventId,
    resultId: result.id,
    resultPosition: result.position,
    resultEntityType: result.entityType,
  }).catch(error => {
    // Log but don't show error to user
    console.error('Click tracking failed:', error);
  });
};
```

#### 5. Filter Combination Logic

**Rule:** Multiple filters within same category use OR logic. Across categories use AND logic.

```typescript
// Example:
filters: {
  assetType: ['IMAGE', 'VIDEO'],  // IMAGE OR VIDEO
  tags: ['logo', 'branding'],     // (logo OR branding)
}
// Result: (IMAGE OR VIDEO) AND (logo OR branding)
```

#### 6. Zero Results Handling

**Rule:** If no results, suggest spell correction or show similar searches.

```typescript
if (results.length === 0) {
  // Check for spelling suggestion
  const spelling = await trpc.search.getSpellingSuggestion.query({
    query,
    currentResultCount: 0,
  });
  
  if (spelling.data.hasAlternative) {
    // Show "Did you mean..." suggestion
    setSpellingSuggestion(spelling.data.suggestion);
  } else {
    // Show zero results state with helpful actions
    setShowZeroResultsState(true);
  }
}
```

#### 7. Search Context Preservation

**Rule:** Preserve search state when navigating back from detail page.

```typescript
// Store search state in URL or session storage
const saveSearchState = (state: SearchState) => {
  sessionStorage.setItem('lastSearch', JSON.stringify({
    query: state.query,
    filters: state.filters,
    page: state.page,
    scrollPosition: window.scrollY,
  }));
};

// Restore on mount
useEffect(() => {
  const savedState = sessionStorage.getItem('lastSearch');
  if (savedState) {
    const state = JSON.parse(savedState);
    restoreSearchState(state);
  }
}, []);
```

---

## React Query Implementation

### Setup tRPC Client

```typescript
// lib/trpc/client.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root';

export const trpc = createTRPCReact<AppRouter>();
```

### Provider Setup

```tsx
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import superjson from 'superjson';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          headers() {
            return {
              'x-trpc-source': 'client',
            };
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
```

### Basic Search Hook

```tsx
// hooks/useSearch.ts
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { SearchQuery, SearchableEntity } from '@/types/search';

export function useSearch(initialQuery?: string) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SearchQuery['filters']>({});
  const [entities, setEntities] = useState<SearchableEntity[]>();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.search.search.useQuery(
    {
      query,
      entities,
      filters,
      page,
      limit: 20,
      sortBy: 'relevance',
      sortOrder: 'desc',
    },
    {
      enabled: query.trim().length >= 2,
      keepPreviousData: true, // Smooth pagination
      staleTime: 2 * 60 * 1000, // 2 minutes
    }
  );

  return {
    // State
    query,
    page,
    filters,
    entities,
    
    // Data
    results: data?.data.results ?? [],
    pagination: data?.data.pagination,
    facets: data?.data.facets,
    executionTime: data?.data.executionTimeMs,
    
    // Status
    isLoading,
    isError,
    error,
    
    // Actions
    setQuery,
    setPage,
    setFilters,
    setEntities,
    refetch,
    
    // Computed
    hasResults: (data?.data.results.length ?? 0) > 0,
    isEmpty: !isLoading && (data?.data.results.length ?? 0) === 0,
  };
}
```

### Autocomplete Hook

```tsx
// hooks/useAutocomplete.ts
import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { debounce } from 'lodash';

export function useAutocomplete() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const fetchSuggestions = useCallback(
    debounce(async (q: string) => {
      if (q.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const result = await trpc.search.getSuggestions.query({
          query: q,
          limit: 10,
        });
        setSuggestions(result.data);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setSuggestions([]);
      }
    }, 300),
    []
  );

  const updateQuery = (q: string) => {
    setQuery(q);
    fetchSuggestions(q);
  };

  return {
    query,
    suggestions,
    updateQuery,
    clearSuggestions: () => setSuggestions([]),
  };
}
```

### Click Tracking Hook

```tsx
// hooks/useClickTracking.ts
import { trpc } from '@/lib/trpc/client';
import { useCallback } from 'react';

export function useClickTracking(searchEventId?: string) {
  const trackClick = trpc.search.trackClick.useMutation({
    onError: (error) => {
      console.error('Click tracking failed:', error);
    },
  });

  const track = useCallback(
    (resultId: string, position: number, entityType: string) => {
      if (!searchEventId) return;

      trackClick.mutate({
        eventId: searchEventId,
        resultId,
        resultPosition: position,
        resultEntityType: entityType as any,
      });
    },
    [searchEventId, trackClick]
  );

  return { track };
}
```

### Saved Searches Hook

```tsx
// hooks/useSavedSearches.ts
import { trpc } from '@/lib/trpc/client';

export function useSavedSearches() {
  const utils = trpc.useContext();

  const { data: savedSearches, isLoading } = trpc.search.getSavedSearches.useQuery();

  const saveSearch = trpc.search.saveSearch.useMutation({
    onSuccess: () => {
      utils.search.getSavedSearches.invalidate();
    },
  });

  const updateSearch = trpc.search.updateSavedSearch.useMutation({
    onSuccess: () => {
      utils.search.getSavedSearches.invalidate();
    },
  });

  const deleteSearch = trpc.search.deleteSavedSearch.useMutation({
    onSuccess: () => {
      utils.search.getSavedSearches.invalidate();
    },
  });

  const executeSearch = trpc.search.executeSavedSearch.useQuery;

  return {
    savedSearches: savedSearches?.data ?? [],
    isLoading,
    saveSearch: saveSearch.mutate,
    updateSearch: updateSearch.mutate,
    deleteSearch: deleteSearch.mutate,
    executeSearch,
  };
}
```

---

## Complete UI Components

### Search Input with Autocomplete

```tsx
// components/SearchInput.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export function SearchInput() {
  const router = useRouter();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, suggestions, updateQuery, clearSuggestions } = useAutocomplete();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
      clearSuggestions();
      inputRef.current?.blur();
    }
  };

  const handleSuggestionClick = (suggestionText: string) => {
    updateQuery(suggestionText);
    router.push(`/search?q=${encodeURIComponent(suggestionText)}`);
    clearSuggestions();
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="Search assets, creators, projects..."
          className="w-full px-4 py-3 pl-12 pr-4 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      </form>

      {/* Suggestions Dropdown */}
      {isFocused && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion.text)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between group"
            >
              <span
                dangerouslySetInnerHTML={{ __html: suggestion.highlight }}
                className="text-gray-900"
              />
              <span className="text-xs text-gray-500 group-hover:text-gray-700">
                {suggestion.count} results
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Validation hint */}
      {query.length > 0 && query.length < 2 && (
        <p className="mt-1 text-xs text-gray-500">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}
```

### Search Results Component

```tsx
// components/SearchResults.tsx
'use client';

import { useSearch } from '@/hooks/useSearch';
import { useClickTracking } from '@/hooks/useClickTracking';
import { SearchResultCard } from './SearchResultCard';
import { SearchFilters } from './SearchFilters';
import { Pagination } from './Pagination';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';

interface SearchResultsProps {
  initialQuery: string;
}

export function SearchResults({ initialQuery }: SearchResultsProps) {
  const {
    query,
    results,
    pagination,
    facets,
    isLoading,
    isEmpty,
    filters,
    setFilters,
    page,
    setPage,
  } = useSearch(initialQuery);

  const { track } = useClickTracking(/* searchEventId from results */);

  const handleResultClick = (result: SearchResult, position: number) => {
    track(result.id, position, result.entityType);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        title="No results found"
        description={`No results for "${query}". Try adjusting your search or filters.`}
        action={{
          label: 'Clear filters',
          onClick: () => setFilters({}),
        }}
      />
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Filters Sidebar */}
        <aside className="lg:col-span-1">
          <SearchFilters
            facets={facets}
            filters={filters}
            onChange={setFilters}
          />
        </aside>

        {/* Results */}
        <main className="lg:col-span-3">
          {/* Results header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {pagination?.total.toLocaleString()} results for "{query}"
            </h1>
            {facets && (
              <div className="mt-2 flex gap-4 text-sm text-gray-600">
                {Object.entries(facets.entityCounts).map(([entity, count]) => (
                  count > 0 && (
                    <span key={entity}>
                      {count} {entity}
                    </span>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Results grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {results.map((result, index) => (
              <SearchResultCard
                key={result.id}
                result={result}
                onClick={() => handleResultClick(result, index)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && (
            <div className="mt-12">
              <Pagination
                currentPage={page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
                hasNextPage={pagination.hasNextPage}
                hasPreviousPage={pagination.hasPreviousPage}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

### Search Result Card

```tsx
// components/SearchResultCard.tsx
import Link from 'next/link';
import Image from 'next/image';
import { SearchResult } from '@/types/search';
import { ClockIcon, StarIcon } from '@heroicons/react/24/outline';

interface SearchResultCardProps {
  result: SearchResult;
  onClick: () => void;
}

export function SearchResultCard({ result, onClick }: SearchResultCardProps) {
  const { id, entityType, title, description, metadata, relevanceScore } = result;

  const getThumbnail = () => {
    if (metadata.type === 'asset' && metadata.thumbnailUrl) {
      return metadata.thumbnailUrl;
    }
    if (metadata.type === 'creator' && metadata.avatar) {
      return metadata.avatar;
    }
    return '/placeholder.png';
  };

  const getEntityLabel = () => {
    const labels = {
      assets: 'Asset',
      creators: 'Creator',
      projects: 'Project',
      licenses: 'License',
    };
    return labels[entityType];
  };

  const getDetailUrl = () => {
    const routes = {
      assets: `/assets/${id}`,
      creators: `/creators/${id}`,
      projects: `/projects/${id}`,
      licenses: `/licenses/${id}`,
    };
    return routes[entityType];
  };

  return (
    <Link
      href={getDetailUrl()}
      onClick={onClick}
      className="block bg-white rounded-lg border border-gray-200 hover:border-primary-500 hover:shadow-lg transition-all group"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100 rounded-t-lg overflow-hidden">
        <Image
          src={getThumbnail()}
          alt={title}
          fill
          className="object-cover group-hover:scale-105 transition-transform"
        />
        
        {/* Entity badge */}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-1 text-xs font-medium bg-white/90 backdrop-blur-sm rounded">
            {getEntityLabel()}
          </span>
        </div>
        
        {/* Relevance score (dev only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-2 right-2">
            <span className="px-2 py-1 text-xs font-mono bg-black/70 text-white rounded">
              {(relevanceScore * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="text-lg font-semibold text-gray-900 line-clamp-2 group-hover:text-primary-600"
          dangerouslySetInnerHTML={{ __html: result.highlights.title || title }}
        />
        
        {description && (
          <p
            className="mt-2 text-sm text-gray-600 line-clamp-2"
            dangerouslySetInnerHTML={{
              __html: result.highlights.description || description,
            }}
          />
        )}

        {/* Metadata */}
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <ClockIcon className="w-4 h-4" />
            <span>{new Date(result.createdAt).toLocaleDateString()}</span>
          </div>
          
          {metadata.type === 'creator' && metadata.performanceMetrics?.averageRating && (
            <div className="flex items-center gap-1">
              <StarIcon className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span>{metadata.performanceMetrics.averageRating.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {metadata.type === 'asset' && metadata.tags && metadata.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {metadata.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
              >
                {tag}
              </span>
            ))}
            {metadata.tags.length > 3 && (
              <span className="px-2 py-1 text-xs text-gray-500">
                +{metadata.tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
```

### Search Filters Component

```tsx
// components/SearchFilters.tsx
import { useState } from 'react';
import { SearchFacets, SearchFilters as Filters } from '@/types/search';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface SearchFiltersProps {
  facets?: SearchFacets;
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function SearchFilters({ facets, filters, onChange }: SearchFiltersProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['assetType', 'entityType'])
  );

  const toggleGroup = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  const handleAssetTypeChange = (type: string, checked: boolean) => {
    const current = filters.assetType ?? [];
    const updated = checked
      ? [...current, type]
      : current.filter((t) => t !== type);
    onChange({ ...filters, assetType: updated });
  };

  const handleClearAll = () => {
    onChange({});
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Entity Type Filter */}
      {facets?.entityCounts && (
        <FilterGroup
          title="Content Type"
          isExpanded={expandedGroups.has('entityType')}
          onToggle={() => toggleGroup('entityType')}
        >
          {Object.entries(facets.entityCounts).map(([entity, count]) => (
            count > 0 && (
              <FilterCheckbox
                key={entity}
                label={entity.charAt(0).toUpperCase() + entity.slice(1)}
                count={count}
                checked={false} // Implement entity filtering if needed
                onChange={() => {}}
              />
            )
          ))}
        </FilterGroup>
      )}

      {/* Asset Type Filter */}
      {facets?.assetTypes && Object.keys(facets.assetTypes).length > 0 && (
        <FilterGroup
          title="Asset Type"
          isExpanded={expandedGroups.has('assetType')}
          onToggle={() => toggleGroup('assetType')}
        >
          {Object.entries(facets.assetTypes).map(([type, count]) => (
            <FilterCheckbox
              key={type}
              label={type}
              count={count}
              checked={filters.assetType?.includes(type) ?? false}
              onChange={(checked) => handleAssetTypeChange(type, checked)}
            />
          ))}
        </FilterGroup>
      )}

      {/* Verification Status Filter */}
      {facets?.verificationStatus && (
        <FilterGroup
          title="Verification"
          isExpanded={expandedGroups.has('verification')}
          onToggle={() => toggleGroup('verification')}
        >
          {Object.entries(facets.verificationStatus).map(([status, count]) => (
            <FilterCheckbox
              key={status}
              label={status}
              count={count}
              checked={filters.verificationStatus?.includes(status) ?? false}
              onChange={(checked) => {
                const current = filters.verificationStatus ?? [];
                const updated = checked
                  ? [...current, status]
                  : current.filter((s) => s !== status);
                onChange({ ...filters, verificationStatus: updated });
              }}
            />
          ))}
        </FilterGroup>
      )}

      {/* Date Range Filter */}
      {facets?.dateRanges && (
        <FilterGroup
          title="Date Range"
          isExpanded={expandedGroups.has('dateRange')}
          onToggle={() => toggleGroup('dateRange')}
        >
          <DateRangeFilter
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            onChange={(from, to) =>
              onChange({ ...filters, dateFrom: from, dateTo: to })
            }
          />
        </FilterGroup>
      )}
    </div>
  );
}

// Filter Group Component
function FilterGroup({
  title,
  isExpanded,
  onToggle,
  children,
}: {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-200 py-4">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-sm font-medium text-gray-900 hover:text-gray-700"
      >
        <span>{title}</span>
        {isExpanded ? (
          <ChevronUpIcon className="w-4 h-4" />
        ) : (
          <ChevronDownIcon className="w-4 h-4" />
        )}
      </button>
      {isExpanded && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

// Filter Checkbox Component
function FilterCheckbox({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
        />
        <span className="text-sm text-gray-700 group-hover:text-gray-900">
          {label}
        </span>
      </div>
      <span className="text-xs text-gray-500">{count}</span>
    </label>
  );
}

// Date Range Filter Component
function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom?: string | Date;
  dateTo?: string | Date;
  onChange: (from?: string, to?: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-gray-600 mb-1">From</label>
        <input
          type="date"
          value={dateFrom ? new Date(dateFrom).toISOString().split('T')[0] : ''}
          onChange={(e) => onChange(e.target.value, dateTo?.toString())}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">To</label>
        <input
          type="date"
          value={dateTo ? new Date(dateTo).toISOString().split('T')[0] : ''}
          onChange={(e) => onChange(dateFrom?.toString(), e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
        />
      </div>
    </div>
  );
}
```

---

## Edge Cases & UX Considerations

### 1. Empty Query Handling

**Issue:** User submits empty search  
**Solution:**

```tsx
if (!query.trim()) {
  // Show recent searches or trending content
  return <RecentSearches />;
}
```

### 2. Very Long Queries

**Issue:** User pastes very long text  
**Solution:**

```tsx
const truncatedQuery = query.slice(0, 200);
if (query.length > 200) {
  toast.warning('Search query truncated to 200 characters');
}
```

### 3. Special Characters

**Issue:** User searches with special characters  
**Solution:** Backend sanitizes automatically, but show helpful message:

```tsx
if (/[<>{}[\]\\]/.test(query)) {
  toast.info('Special characters were removed from your search');
}
```

### 4. Zero Results

**Issue:** Search returns no results  
**Solution:**

```tsx
if (isEmpty) {
  return (
    <div className="text-center py-12">
      <h2>No results for "{query}"</h2>
      
      {/* Spelling suggestion */}
      {spellingSuggestion && (
        <p>
          Did you mean{' '}
          <button onClick={() => search(spellingSuggestion.suggestedQuery)}>
            {spellingSuggestion.suggestedQuery}
          </button>
          ?
        </p>
      )}
      
      {/* Suggestions */}
      <div className="mt-6">
        <p>Try:</p>
        <ul>
          <li>Using different keywords</li>
          <li>Removing filters</li>
          <li>Checking your spelling</li>
        </ul>
      </div>
      
      {/* Show popular content */}
      <div className="mt-8">
        <h3>Popular Content</h3>
        <TrendingContent />
      </div>
    </div>
  );
}
```

### 5. Slow Network

**Issue:** Search takes long time  
**Solution:**

```tsx
const [searchTimeout, setSearchTimeout] = useState(false);

useEffect(() => {
  if (isLoading) {
    const timer = setTimeout(() => {
      setSearchTimeout(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }
  setSearchTimeout(false);
}, [isLoading]);

{isLoading && searchTimeout && (
  <div className="text-center text-gray-600">
    <LoadingSpinner />
    <p className="mt-2">Search is taking longer than usual...</p>
  </div>
)}
```

### 6. Browser Back Button

**Issue:** User uses back button, search state lost  
**Solution:** Use URL params:

```tsx
// Store state in URL
const updateURL = (query: string, page: number, filters: Filters) => {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('page', page.toString());
  if (Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters));
  }
  router.push(`/search?${params.toString()}`, { scroll: false });
};

// Restore from URL
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  setQuery(params.get('q') || '');
  setPage(parseInt(params.get('page') || '1'));
  const filtersParam = params.get('filters');
  if (filtersParam) {
    setFilters(JSON.parse(filtersParam));
  }
}, []);
```

### 7. Mobile Keyboard

**Issue:** Mobile keyboard covers search results  
**Solution:**

```tsx
const handleSearchFocus = () => {
  if (window.innerWidth < 768) {
    // Scroll input to top on mobile
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
};
```

### 8. Rapid Filter Changes

**Issue:** User rapidly changes filters  
**Solution:** Debounce filter changes:

```tsx
const debouncedFilterChange = useCallback(
  debounce((newFilters: Filters) => {
    setFilters(newFilters);
    refetch();
  }, 500),
  []
);
```

### 9. Offline Mode

**Issue:** User loses internet connection  
**Solution:**

```tsx
const { isOnline } = useOnlineStatus();

{!isOnline && (
  <div className="fixed bottom-4 left-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
    <p className="text-sm text-yellow-800">
      You're offline. Search results may be outdated.
    </p>
  </div>
)}
```

### 10. Session Expiry

**Issue:** JWT token expires during search  
**Solution:**

```tsx
if (error?.data?.code === 'UNAUTHORIZED') {
  // Save current search state
  sessionStorage.setItem('pendingSearch', JSON.stringify({ query, filters }));
  
  // Redirect to login
  router.push('/login?returnTo=/search');
}

// After login
useEffect(() => {
  const pendingSearch = sessionStorage.getItem('pendingSearch');
  if (pendingSearch) {
    const { query, filters } = JSON.parse(pendingSearch);
    setQuery(query);
    setFilters(filters);
    sessionStorage.removeItem('pendingSearch');
  }
}, []);
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Search (Week 1)

- [ ] Install and configure tRPC client
- [ ] Create search types file from backend types
- [ ] Implement basic search input component
- [ ] Implement search results page
- [ ] Add loading and error states
- [ ] Test basic search functionality
- [ ] Handle authentication errors

### Phase 2: Autocomplete (Week 1)

- [ ] Implement autocomplete hook
- [ ] Add suggestions dropdown UI
- [ ] Add debouncing (300ms)
- [ ] Handle keyboard navigation (↑↓ Enter Esc)
- [ ] Test on mobile devices
- [ ] Add loading state for suggestions

### Phase 3: Filters (Week 2)

- [ ] Implement filter sidebar component
- [ ] Add entity type filters
- [ ] Add asset type filters (if applicable)
- [ ] Add date range picker
- [ ] Add tag filters
- [ ] Add location filters (for creators)
- [ ] Implement "Clear all" functionality
- [ ] Show active filter count badge
- [ ] Test filter combinations

### Phase 4: Pagination (Week 2)

- [ ] Implement pagination component
- [ ] Add page number controls
- [ ] Add "Load More" button (optional)
- [ ] Implement infinite scroll (optional)
- [ ] Preserve scroll position on back navigation
- [ ] Test with large result sets

### Phase 5: Advanced Features (Week 3)

- [ ] Implement click tracking
- [ ] Add spell correction suggestions
- [ ] Implement saved searches
- [ ] Add recent searches display
- [ ] Implement related content
- [ ] Add faceted search UI
- [ ] Test all analytics tracking

### Phase 6: UX Polish (Week 3)

- [ ] Add result highlighting
- [ ] Implement zero results state
- [ ] Add search performance indicator
- [ ] Handle slow network scenarios
- [ ] Test mobile responsiveness
- [ ] Add keyboard shortcuts (Cmd+K for search)
- [ ] Implement URL state preservation
- [ ] Add search history

### Phase 7: Optimization (Week 4)

- [ ] Implement result caching
- [ ] Add optimistic updates
- [ ] Debounce filter changes
- [ ] Lazy load result images
- [ ] Test performance with 1000+ results
- [ ] Implement virtual scrolling (if needed)
- [ ] Add request deduplication

### Phase 8: Testing (Week 4)

- [ ] Unit tests for search hooks
- [ ] Integration tests for search flow
- [ ] E2E tests for critical paths
- [ ] Cross-browser testing
- [ ] Mobile device testing
- [ ] Accessibility testing (screen readers)
- [ ] Load testing

### Phase 9: Documentation

- [ ] Document search API usage
- [ ] Create component usage examples
- [ ] Document edge cases handled
- [ ] Add JSDoc comments to hooks
- [ ] Create troubleshooting guide

---

## Testing Recommendations

### Unit Tests

```typescript
// hooks/__tests__/useSearch.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useSearch } from '../useSearch';

describe('useSearch', () => {
  it('should fetch results when query is valid', async () => {
    const { result } = renderHook(() => useSearch('test'));
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.results).toBeDefined();
  });
  
  it('should not fetch when query is too short', () => {
    const { result } = renderHook(() => useSearch('a'));
    expect(result.current.isLoading).toBe(false);
  });
});
```

### Integration Tests

```typescript
// __tests__/search-flow.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchPage } from '@/app/search/page';

describe('Search Flow', () => {
  it('should complete full search flow', async () => {
    render(<SearchPage />);
    
    // Enter search query
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'logo' } });
    
    // Wait for suggestions
    await waitFor(() => {
      expect(screen.getByText(/logo design/i)).toBeInTheDocument();
    });
    
    // Submit search
    fireEvent.submit(input.closest('form')!);
    
    // Wait for results
    await waitFor(() => {
      expect(screen.getByText(/results for "logo"/i)).toBeInTheDocument();
    });
    
    // Click result
    const firstResult = screen.getAllByRole('link')[0];
    fireEvent.click(firstResult);
    
    // Verify navigation
    expect(window.location.pathname).toContain('/assets/');
  });
});
```

---

## Performance Optimization

### 1. Request Deduplication

```typescript
// React Query automatically deduplicates requests
// Same query within staleTime window won't refetch
const { data } = trpc.search.search.useQuery(
  { query },
  {
    staleTime: 2 * 60 * 1000, // 2 minutes
  }
);
```

### 2. Result Caching

```typescript
// Configure global cache settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes
    },
  },
});
```

### 3. Prefetching

```typescript
// Prefetch likely next searches
const utils = trpc.useContext();

const handleSuggestionHover = (suggestionQuery: string) => {
  utils.search.search.prefetch({
    query: suggestionQuery,
    limit: 20,
  });
};
```

### 4. Lazy Loading

```typescript
// Lazy load result images
<Image
  src={thumbnailUrl}
  alt={title}
  loading="lazy"
  placeholder="blur"
  blurDataURL={placeholderImage}
/>
```

### 5. Virtual Scrolling (for large lists)

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedResults({ results }: { results: SearchResult[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <SearchResultCard result={results[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Summary

This completes the comprehensive Search API frontend integration guide. You now have:

✅ Complete API endpoint documentation  
✅ TypeScript type definitions  
✅ Authentication & authorization details  
✅ Error handling strategies  
✅ Pagination & filtering implementation  
✅ Rate limiting considerations  
✅ Business logic & validation rules  
✅ React Query hooks and patterns  
✅ Complete UI component examples  
✅ Edge case handling  
✅ Implementation checklist  
✅ Testing recommendations  
✅ Performance optimization strategies

**Next Steps:**
1. Copy TypeScript types to your frontend codebase
2. Set up tRPC client with authentication
3. Follow the implementation checklist phase-by-phase
4. Test thoroughly at each phase
5. Monitor performance and user analytics

**Questions or Issues?**
- Refer to backend documentation: `docs/SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md`
- Check error handling section for troubleshooting
- Review edge cases section for uncommon scenarios

**Related Documentation:**
- [Part 1: API Endpoints & Types](./SEARCH_API_INTEGRATION_GUIDE.md)
- [Part 2: Request/Response & Error Handling](./SEARCH_API_INTEGRATION_GUIDE_PART2.md)
- [Backend Implementation](../SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md)
