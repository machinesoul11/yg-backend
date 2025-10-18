# Asset Search Frontend Implementation Guide

**🌐 SHARED** - Used by both public-facing website and admin backend

> **Last Updated:** January 2025  
> **Purpose:** Step-by-step guide for implementing Asset Search UI

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Implementation Checklist](#implementation-checklist)
4. [Component Architecture](#component-architecture)
5. [Feature Implementation](#feature-implementation)
6. [Business Logic & Validation](#business-logic--validation)
7. [Error Handling](#error-handling)
8. [Performance Optimization](#performance-optimization)
9. [Testing Recommendations](#testing-recommendations)
10. [Common Pitfalls](#common-pitfalls)
11. [UX Considerations](#ux-considerations)

---

## Prerequisites

### Required Dependencies
```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@trpc/client": "^11.0.0",
    "@trpc/react-query": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "next": "^15.0.0",
    "next-auth": "^4.24.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "superjson": "^2.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "typescript": "^5.0.0"
  }
}
```

### Knowledge Requirements
- TypeScript (interfaces, generics, type guards)
- React 18+ (hooks, Suspense)
- Next.js 15 App Router
- React Query / tRPC patterns
- Form validation with Zod

---

## Project Setup

### 1. tRPC Client Configuration

Create `src/utils/trpc.ts`:

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/api/root'; // Adjust path

export const trpc = createTRPCReact<AppRouter>();

// Type helpers
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
```

### 2. Provider Setup

Create `src/app/providers.tsx`:

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { trpc } from '@/utils/trpc';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`,
          transformer: superjson,
          // Include credentials for session cookies
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: 'include',
            });
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

Update `src/app/layout.tsx`:

```typescript
import { TRPCProvider } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
```

### 3. Type Definitions

Create `src/types/search.types.ts` and copy types from `ASSET_SEARCH_TYPES.md`.

### 4. Authentication Check

Create `src/hooks/useRequireAuth.ts`:

```typescript
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function useRequireAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  return { session, isLoading: status === 'loading' };
}
```

---

## Implementation Checklist

### Phase 1: Basic Search (2-3 days)
- [ ] Set up tRPC client and providers
- [ ] Create basic search input component
- [ ] Implement debounced search query
- [ ] Display search results in grid/list
- [ ] Add loading states
- [ ] Add empty state (no results)
- [ ] Add error handling UI

### Phase 2: Filters (2-3 days)
- [ ] Create filter sidebar/panel component
- [ ] Implement asset type filter (checkboxes)
- [ ] Implement status filter (checkboxes)
- [ ] Implement date range picker
- [ ] Implement tag filter (multi-select)
- [ ] Fetch and display facet counts
- [ ] Add "Clear filters" button
- [ ] Show active filter count badge

### Phase 3: Pagination & Sorting (1 day)
- [ ] Implement page navigation (prev/next)
- [ ] Add page number display
- [ ] Create sort dropdown (relevance, date, title)
- [ ] Add sort order toggle (asc/desc)
- [ ] Update URL with query params
- [ ] Handle direct URL access with params

### Phase 4: Autocomplete (1 day)
- [ ] Create autocomplete dropdown
- [ ] Implement throttled suggestions fetch
- [ ] Add keyboard navigation (up/down/enter)
- [ ] Show thumbnail + type in suggestions
- [ ] Navigate to asset on selection

### Phase 5: Saved Searches (1-2 days)
- [ ] Create "Save search" button/modal
- [ ] Implement save search form
- [ ] Display saved searches list
- [ ] Add execute saved search action
- [ ] Implement edit saved search
- [ ] Implement delete saved search

### Phase 6: Recent Searches (0.5 day)
- [ ] Display recent searches below input
- [ ] Add click handler to re-run search
- [ ] Style as chips/pills

### Phase 7: Polish & Optimization (1-2 days)
- [ ] Add animations/transitions
- [ ] Implement skeleton loaders
- [ ] Add analytics tracking
- [ ] Optimize images (lazy loading)
- [ ] Add keyboard shortcuts
- [ ] Mobile responsive design
- [ ] Accessibility (ARIA labels)

### Phase 8: Testing (1-2 days)
- [ ] Unit tests for hooks
- [ ] Integration tests for components
- [ ] E2E tests for user flows
- [ ] Permission testing (different roles)

**Total Estimated Time: 10-14 days**

---

## Component Architecture

### Recommended File Structure

```
src/
├── app/
│   ├── search/
│   │   ├── page.tsx              # Main search page
│   │   └── layout.tsx
├── components/
│   ├── search/
│   │   ├── AssetSearchPage.tsx   # Container component
│   │   ├── SearchInput.tsx       # Search input + autocomplete
│   │   ├── SearchResults.tsx     # Results grid/list
│   │   ├── SearchFilters.tsx     # Filter sidebar
│   │   ├── SearchPagination.tsx  # Pagination controls
│   │   ├── SearchSort.tsx        # Sort controls
│   │   ├── SavedSearches.tsx     # Saved searches manager
│   │   ├── RecentSearches.tsx    # Recent searches
│   │   └── AssetCard.tsx         # Individual result card
├── hooks/
│   ├── search/
│   │   ├── useAssetSearch.ts     # Main search hook
│   │   ├── useSearchFilters.ts   # Filter state management
│   │   ├── useSearchPagination.ts # Pagination logic
│   │   ├── useDebouncedValue.ts  # Debounce utility
│   │   └── useSavedSearches.ts   # Saved search operations
├── types/
│   └── search.types.ts           # All search types
└── utils/
    └── trpc.ts                   # tRPC client
```

### Component Hierarchy

```
<AssetSearchPage>
  ├── <SearchInput>
  │   └── <AutocompleteDropdown>
  ├── <RecentSearches>
  ├── <SearchFilters>
  │   ├── <AssetTypeFilter>
  │   ├── <StatusFilter>
  │   ├── <DateRangeFilter>
  │   └── <TagFilter>
  ├── <SearchSort>
  ├── <SearchResults>
  │   ├── <LoadingState>
  │   ├── <EmptyState>
  │   ├── <ErrorState>
  │   └── <AssetCard> (multiple)
  ├── <SearchPagination>
  └── <SavedSearches>
```

---

## Feature Implementation

### 1. Basic Search with Debouncing

Create `src/hooks/useDebouncedValue.ts`:

```typescript
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay: number = 300): T {
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

Create `src/hooks/search/useAssetSearch.ts`:

```typescript
import { useState } from 'react';
import { trpc } from '@/utils/trpc';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { SearchFilters } from '@/types/search.types';

export function useAssetSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'relevance' | 'created_at' | 'updated_at' | 'title'>('relevance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const debouncedQuery = useDebouncedValue(query, 300);

  const searchQuery = trpc.search.search.useQuery(
    {
      query: debouncedQuery,
      filters,
      page,
      limit: 20,
      sortBy,
      sortOrder,
    },
    {
      enabled: debouncedQuery.length >= 2,
      keepPreviousData: true, // Smooth pagination
    }
  );

  const resetSearch = () => {
    setQuery('');
    setFilters({});
    setPage(1);
    setSortBy('relevance');
    setSortOrder('desc');
  };

  return {
    // State
    query,
    filters,
    page,
    sortBy,
    sortOrder,
    
    // Setters
    setQuery,
    setFilters,
    setPage,
    setSortBy,
    setSortOrder,
    resetSearch,
    
    // Query result
    ...searchQuery,
  };
}
```

Create `src/components/search/SearchInput.tsx`:

```typescript
'use client';

import { useState } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSuggestionSelect?: (assetId: string) => void;
}

export function SearchInput({ value, onChange, onSuggestionSelect }: SearchInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const { data: suggestions, isLoading: suggestionsLoading } = trpc.search.getAssetSuggestions.useQuery(
    { query: value, limit: 10 },
    { enabled: value.length >= 2 && showSuggestions }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setShowSuggestions(true);
  };

  const handleSuggestionClick = (assetId: string, title: string) => {
    onChange(title);
    setShowSuggestions(false);
    onSuggestionSelect?.(assetId);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Search assets..."
        className="w-full px-4 py-2 border rounded-lg"
      />
      
      {showSuggestions && suggestions?.data && suggestions.data.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg">
          {suggestions.data.map((suggestion) => (
            <button
              key={suggestion.id}
              onClick={() => handleSuggestionClick(suggestion.id, suggestion.title)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-3"
            >
              {suggestion.thumbnailUrl && (
                <img
                  src={suggestion.thumbnailUrl}
                  alt=""
                  className="w-10 h-10 object-cover rounded"
                />
              )}
              <div className="flex-1">
                <div className="font-medium">{suggestion.title}</div>
                <div className="text-sm text-gray-500">{suggestion.type}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 2. Search Filters

Create `src/hooks/search/useSearchFilters.ts`:

```typescript
import { useState } from 'react';
import type { SearchFilters } from '@/types/search.types';

export function useSearchFilters(initialFilters: SearchFilters = {}) {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleArrayFilter = <K extends keyof SearchFilters>(
    key: K,
    value: string
  ) => {
    setFilters((prev) => {
      const currentArray = (prev[key] as string[] | undefined) || [];
      const newArray = currentArray.includes(value)
        ? currentArray.filter((v) => v !== value)
        : [...currentArray, value];
      
      return {
        ...prev,
        [key]: newArray.length > 0 ? newArray : undefined,
      };
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== undefined && value !== null && 
    (Array.isArray(value) ? value.length > 0 : true)
  ).length;

  return {
    filters,
    updateFilter,
    toggleArrayFilter,
    clearFilters,
    activeFilterCount,
  };
}
```

Create `src/components/search/SearchFilters.tsx`:

```typescript
'use client';

import { trpc } from '@/utils/trpc';
import type { SearchFilters } from '@/types/search.types';

interface SearchFiltersProps {
  filters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
  query?: string;
}

export function SearchFilters({ filters, onFilterChange, query }: SearchFiltersProps) {
  const { data: facets } = trpc.search.getAssetFacets.useQuery({
    query: query || '',
    filters: {
      projectId: filters.projectId,
      creatorId: filters.creatorId,
      tags: filters.tags,
    },
  });

  const toggleArrayFilter = (key: keyof SearchFilters, value: string) => {
    const currentArray = (filters[key] as string[] | undefined) || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter((v) => v !== value)
      : [...currentArray, value];
    
    onFilterChange({
      ...filters,
      [key]: newArray.length > 0 ? newArray : undefined,
    });
  };

  const clearFilters = () => {
    onFilterChange({});
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="w-64 bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Filters</h3>
        {activeCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear all ({activeCount})
          </button>
        )}
      </div>

      {/* Asset Type Filter */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">Asset Type</h4>
        {Object.entries(facets?.data.assetTypes || {}).map(([type, count]) => (
          <label key={type} className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={filters.assetType?.includes(type) || false}
              onChange={() => toggleArrayFilter('assetType', type)}
            />
            <span className="text-sm">
              {type} ({count})
            </span>
          </label>
        ))}
      </div>

      {/* Status Filter */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">Status</h4>
        {Object.entries(facets?.data.statuses || {}).map(([status, count]) => (
          <label key={status} className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={filters.assetStatus?.includes(status) || false}
              onChange={() => toggleArrayFilter('assetStatus', status)}
            />
            <span className="text-sm">
              {status} ({count})
            </span>
          </label>
        ))}
      </div>

      {/* Date Range Filter */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">Date Range</h4>
        <div className="space-y-2">
          <input
            type="date"
            value={filters.dateFrom ? new Date(filters.dateFrom).toISOString().split('T')[0] : ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                dateFrom: e.target.value ? new Date(e.target.value) : undefined,
              })
            }
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={filters.dateTo ? new Date(filters.dateTo).toISOString().split('T')[0] : ''}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                dateTo: e.target.value ? new Date(e.target.value) : undefined,
              })
            }
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="To"
          />
        </div>
      </div>
    </div>
  );
}
```

### 3. Search Results

Create `src/components/search/AssetCard.tsx`:

```typescript
import type { SearchResult } from '@/types/search.types';
import Link from 'next/link';

interface AssetCardProps {
  result: SearchResult;
}

export function AssetCard({ result }: AssetCardProps) {
  const metadata = result.metadata;

  // Format file size
  const formatFileSize = (size: bigint) => {
    const bytes = Number(size);
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;
    
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  };

  return (
    <Link href={`/assets/${result.id}`} className="block group">
      <div className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
        {/* Thumbnail */}
        <div className="aspect-video bg-gray-100 relative">
          {metadata.type === 'asset' && metadata.thumbnailUrl ? (
            <img
              src={metadata.thumbnailUrl}
              alt={result.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No preview
            </div>
          )}
          {/* Asset Type Badge */}
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {metadata.type === 'asset' && metadata.assetType}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1 group-hover:text-blue-600">
            {result.highlights.title ? (
              <span dangerouslySetInnerHTML={{ __html: result.highlights.title }} />
            ) : (
              result.title
            )}
          </h3>
          
          {result.description && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {result.highlights.description ? (
                <span dangerouslySetInnerHTML={{ __html: result.highlights.description }} />
              ) : (
                result.description
              )}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="px-2 py-1 bg-gray-100 rounded">
              {metadata.type === 'asset' && metadata.status}
            </span>
            {metadata.type === 'asset' && (
              <span>{formatFileSize(metadata.fileSize)}</span>
            )}
            <span>
              Score: {(result.relevanceScore * 100).toFixed(0)}%
            </span>
          </div>

          {/* Tags */}
          {metadata.type === 'asset' && metadata.tags && metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {metadata.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
              {metadata.tags.length > 3 && (
                <span className="text-xs text-gray-500">
                  +{metadata.tags.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
```

Create `src/components/search/SearchResults.tsx`:

```typescript
import { AssetCard } from './AssetCard';
import type { SearchResult } from '@/types/search.types';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
  error: any;
  query: string;
}

export function SearchResults({ results, isLoading, error, query }: SearchResultsProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border rounded-lg overflow-hidden animate-pulse">
            <div className="aspect-video bg-gray-200" />
            <div className="p-4">
              <div className="h-6 bg-gray-200 rounded mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">⚠️ Search failed</div>
        <p className="text-gray-600">{error.message || 'Please try again'}</p>
      </div>
    );
  }

  // Empty state
  if (results.length === 0 && query.length >= 2) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔍</div>
        <h3 className="text-xl font-semibold mb-2">No results found</h3>
        <p className="text-gray-600">
          Try adjusting your search or filters
        </p>
      </div>
    );
  }

  // Results
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {results.map((result) => (
        <AssetCard key={result.id} result={result} />
      ))}
    </div>
  );
}
```

### 4. Pagination

Create `src/components/search/SearchPagination.tsx`:

```typescript
interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
}

export function SearchPagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
}: SearchPaginationProps) {
  return (
    <div className="flex items-center justify-center gap-4 mt-8">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPreviousPage}
        className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        ← Previous
      </button>

      <span className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage}
        className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
      >
        Next →
      </button>
    </div>
  );
}
```

### 5. Main Search Page

Create `src/components/search/AssetSearchPage.tsx`:

```typescript
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAssetSearch } from '@/hooks/search/useAssetSearch';
import { SearchInput } from './SearchInput';
import { SearchFilters } from './SearchFilters';
import { SearchResults } from './SearchResults';
import { SearchPagination } from './SearchPagination';

export function AssetSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const {
    query,
    setQuery,
    filters,
    setFilters,
    page,
    setPage,
    data,
    isLoading,
    error,
  } = useAssetSearch();

  // Sync URL with state
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page > 1) params.set('page', page.toString());
    
    const newUrl = params.toString() ? `/search?${params.toString()}` : '/search';
    router.replace(newUrl, { scroll: false });
  }, [query, page, router]);

  // Initialize from URL
  useEffect(() => {
    const q = searchParams.get('q');
    const p = searchParams.get('page');
    
    if (q) setQuery(q);
    if (p) setPage(parseInt(p, 10));
  }, []);

  const results = data?.data.results || [];
  const pagination = data?.data.pagination;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Search Assets</h1>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSuggestionSelect={(id) => router.push(`/assets/${id}`)}
        />
      </div>

      <div className="flex gap-6">
        <aside>
          <SearchFilters
            filters={filters}
            onFilterChange={setFilters}
            query={query}
          />
        </aside>

        <main className="flex-1">
          {data?.data.executionTimeMs && (
            <div className="text-sm text-gray-500 mb-4">
              {data.data.pagination.total} results in {data.data.executionTimeMs}ms
            </div>
          )}

          <SearchResults
            results={results}
            isLoading={isLoading}
            error={error}
            query={query}
          />

          {pagination && pagination.totalPages > 1 && (
            <SearchPagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              hasNextPage={pagination.hasNextPage}
              hasPreviousPage={pagination.hasPreviousPage}
              onPageChange={setPage}
            />
          )}
        </main>
      </div>
    </div>
  );
}
```

Create `src/app/search/page.tsx`:

```typescript
import { AssetSearchPage } from '@/components/search/AssetSearchPage';

export default function SearchPage() {
  return <AssetSearchPage />;
}
```

---

## Business Logic & Validation

### Client-Side Validation

```typescript
import { z } from 'zod';

const searchInputSchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters').max(200),
});

function validateSearchInput(query: string): { valid: boolean; error?: string } {
  const result = searchInputSchema.safeParse({ query });
  
  if (!result.success) {
    return {
      valid: false,
      error: result.error.errors[0]?.message,
    };
  }
  
  return { valid: true };
}

// Usage in component
const handleSearch = (query: string) => {
  const validation = validateSearchInput(query);
  
  if (!validation.valid) {
    setError(validation.error);
    return;
  }
  
  setQuery(query);
};
```

### Business Rules

#### 1. Minimum Query Length
**Rule:** Search query must be at least 2 characters  
**Enforcement:** Client-side validation + server-side Zod schema  
**UI Feedback:** Show hint below input "Enter at least 2 characters"

#### 2. Permission-Based Results
**Rule:** Users only see assets they have permission to access  
**Enforcement:** Server-side (automatic)  
**UI Feedback:** No special handling needed (transparent to user)

#### 3. Filter Combinations
**Rule:** All filters use AND logic, except within same filter (OR)  
**Example:** `type=[IMAGE,VIDEO]` AND `status=[APPROVED]`  
**UI Feedback:** Show active filter count

#### 4. Date Range Validation
**Rule:** `dateFrom` must be before `dateTo`  
**Enforcement:** Client-side validation

```typescript
const validateDateRange = (from: Date | null, to: Date | null): string | null => {
  if (from && to && from > to) {
    return 'Start date must be before end date';
  }
  return null;
};
```

---

## Error Handling

### Global Error Boundary

Create `src/components/ErrorBoundary.tsx`:

```typescript
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Something went wrong
            </h2>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### tRPC Error Handling

```typescript
import { toast } from 'react-hot-toast'; // or your toast library

function useSearchWithErrorHandling() {
  const searchQuery = trpc.search.search.useQuery(params, {
    onError: (error) => {
      // Log to error tracking (e.g., Sentry)
      console.error('Search error:', error);
      
      // Show user-friendly message
      if (error.data?.code === 'UNAUTHORIZED') {
        toast.error('Please log in to search');
        router.push('/login');
      } else if (error.data?.code === 'BAD_REQUEST') {
        const zodErrors = error.data?.zodError?.fieldErrors;
        const message = zodErrors?.query?.[0] || 'Invalid search parameters';
        toast.error(message);
      } else {
        toast.error('Search failed. Please try again.');
      }
    },
    retry: (failureCount, error) => {
      // Don't retry auth errors
      if (error.data?.code === 'UNAUTHORIZED') return false;
      // Retry server errors up to 3 times
      return failureCount < 3;
    },
  });

  return searchQuery;
}
```

---

## Performance Optimization

### 1. Debouncing Search Input
Already implemented in `useDebouncedValue` hook (300ms delay)

### 2. Request Batching
tRPC automatically batches requests made within 10ms

### 3. Prefetching Next Page
```typescript
const utils = trpc.useContext();

const prefetchNextPage = () => {
  if (pagination?.hasNextPage) {
    utils.search.search.prefetch({
      ...currentParams,
      page: page + 1,
    });
  }
};

// Call in useEffect or on hover
useEffect(() => {
  if (pagination?.hasNextPage) {
    prefetchNextPage();
  }
}, [page, pagination]);
```

### 4. Image Lazy Loading
```typescript
<img
  src={thumbnailUrl}
  alt={title}
  loading="lazy"
  className="w-full h-full object-cover"
/>
```

### 5. Virtual Scrolling for Long Lists
Consider `react-window` or `@tanstack/react-virtual` for 100+ results

### 6. Memoization
```typescript
import { useMemo } from 'react';

const sortedResults = useMemo(() => {
  return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
}, [results]);
```

---

## Testing Recommendations

### Unit Tests

```typescript
// __tests__/hooks/useAssetSearch.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAssetSearch } from '@/hooks/search/useAssetSearch';

describe('useAssetSearch', () => {
  it('debounces search query', async () => {
    const { result } = renderHook(() => useAssetSearch());
    
    act(() => {
      result.current.setQuery('test');
    });
    
    // Query should not execute immediately
    expect(result.current.isLoading).toBe(false);
    
    // Wait for debounce
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    }, { timeout: 400 });
  });
});
```

### Integration Tests

```typescript
// __tests__/components/AssetSearchPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssetSearchPage } from '@/components/search/AssetSearchPage';

describe('AssetSearchPage', () => {
  it('displays search results', async () => {
    render(<AssetSearchPage />);
    
    const input = screen.getByPlaceholderText('Search assets...');
    fireEvent.change(input, { target: { value: 'logo' } });
    
    await waitFor(() => {
      expect(screen.getByText(/results in/)).toBeInTheDocument();
    });
  });
});
```

### E2E Tests (Playwright)

```typescript
// tests/e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test('search flow', async ({ page }) => {
  await page.goto('/search');
  
  // Enter search query
  await page.fill('input[placeholder="Search assets..."]', 'logo');
  
  // Wait for results
  await page.waitForSelector('[data-testid="search-results"]');
  
  // Check pagination
  const nextButton = page.locator('button:has-text("Next")');
  await expect(nextButton).toBeVisible();
  
  // Click result
  await page.click('[data-testid="asset-card"]:first-child');
  await expect(page).toHaveURL(/\/assets\/.+/);
});
```

---

## Common Pitfalls

### ❌ 1. Not Debouncing Input
**Problem:** API called on every keystroke  
**Solution:** Use `useDebouncedValue` hook (300ms)

### ❌ 2. Forgetting `enabled` Flag
**Problem:** Query runs even when input is too short  
**Solution:**
```typescript
const { data } = trpc.search.search.useQuery(params, {
  enabled: query.length >= 2
});
```

### ❌ 3. Not Handling Loading State
**Problem:** UI feels unresponsive  
**Solution:** Show skeleton loaders during fetch

### ❌ 4. Ignoring Pagination State
**Problem:** Page resets when filters change  
**Solution:**
```typescript
const handleFilterChange = (newFilters) => {
  setFilters(newFilters);
  setPage(1); // Reset to page 1
};
```

### ❌ 5. Not Syncing URL with State
**Problem:** Users can't share search results  
**Solution:** Use `useSearchParams` and `router.replace`

### ❌ 6. Treating BigInt as Number
**Problem:** File sizes (BigInt) cause errors  
**Solution:**
```typescript
const bytes = Number(fileSize); // Convert BigInt to Number
```

### ❌ 7. Not Handling Empty States
**Problem:** Blank screen when no results  
**Solution:** Show friendly "No results" message

### ❌ 8. Missing Error Boundaries
**Problem:** App crashes on error  
**Solution:** Wrap components in ErrorBoundary

---

## UX Considerations

### 1. Search Feedback
- Show "Searching..." indicator during fetch
- Display result count and execution time
- Highlight matching text in results

### 2. Filter Discoverability
- Show filter counts in facets
- Indicate active filters with badge
- Provide "Clear all" button

### 3. Empty States
- Friendly message when no results
- Suggest adjusting search or filters
- Show recent/saved searches as fallback

### 4. Loading States
- Skeleton loaders > spinners
- Keep previous results visible during refetch
- Disable controls during loading

### 5. Mobile Responsiveness
- Collapsible filter sidebar
- Touch-friendly controls
- Responsive grid layout

### 6. Accessibility
```typescript
<input
  type="search"
  role="searchbox"
  aria-label="Search assets"
  aria-describedby="search-hint"
/>
<div id="search-hint" className="sr-only">
  Enter at least 2 characters to search
</div>
```

### 7. Keyboard Shortcuts
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Focus search on "/" key
    if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 8. Progressive Enhancement
- Basic functionality works without JS
- Use `<form>` with `action` attribute
- Server-side rendering for initial results

---

## Final Checklist

Before launching to production:

### Functionality
- [ ] Search works with 2+ character queries
- [ ] All filters apply correctly
- [ ] Pagination functions properly
- [ ] Sort options work
- [ ] Autocomplete displays suggestions
- [ ] Saved searches CRUD works
- [ ] Recent searches display
- [ ] URL reflects search state

### Performance
- [ ] Search input is debounced
- [ ] Images lazy load
- [ ] Next page prefetches
- [ ] No unnecessary re-renders
- [ ] Bundle size is optimized

### Error Handling
- [ ] Auth errors redirect to login
- [ ] Validation errors show inline
- [ ] Server errors show friendly message
- [ ] Retry logic for transient failures
- [ ] Error boundary catches crashes

### UX
- [ ] Loading states are clear
- [ ] Empty states are helpful
- [ ] Active filters are visible
- [ ] Result count is displayed
- [ ] Mobile layout works
- [ ] Keyboard navigation works

### Accessibility
- [ ] ARIA labels are present
- [ ] Keyboard navigation works
- [ ] Focus management is correct
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader tested

### Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Different user roles tested
- [ ] Edge cases covered

### Documentation
- [ ] Code is commented
- [ ] README is updated
- [ ] Storybook stories (if applicable)
- [ ] API integration documented

---

## Support & Resources

### Documentation
- API Reference: `ASSET_SEARCH_API_REFERENCE.md`
- Type Definitions: `ASSET_SEARCH_TYPES.md`

### External Resources
- [tRPC Docs](https://trpc.io)
- [React Query Docs](https://tanstack.com/query)
- [Zod Docs](https://zod.dev)
- [Next.js App Router](https://nextjs.org/docs/app)

### Getting Help
1. Review this implementation guide
2. Check API reference for endpoint details
3. Test with Postman/API client first
4. Review backend logs for errors

---

**Document Version:** 1.0.0  
**Last Updated:** January 2025  
**Estimated Implementation Time:** 10-14 days
