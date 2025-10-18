# Search Service - Frontend Integration Guide (Part 3: Implementation Guide)

**Classification:** 🌐 SHARED  
**Last Updated:** October 17, 2025  
**Framework:** Next.js 15 + App Router + TypeScript + React Query

---

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [React Query Integration](#react-query-integration)
3. [Component Examples](#component-examples)
4. [State Management Patterns](#state-management-patterns)
5. [Frontend Implementation Checklist](#frontend-implementation-checklist)
6. [Edge Cases & UX Considerations](#edge-cases--ux-considerations)
7. [Performance Optimization](#performance-optimization)
8. [Testing Strategies](#testing-strategies)

---

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install @tanstack/react-query @trpc/client @trpc/react-query
npm install zustand # Optional: for complex state management
npm install dompurify # For sanitizing HTML highlights
npm install @mantine/hooks # Optional: useful hooks like useDebouncedValue
```

### 2. Configure tRPC Client

```typescript
// lib/trpc/client.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/routers/_app';

export const trpc = createTRPCReact<AppRouter>();
```

### 3. Setup React Query Provider

```typescript
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency/api/trpc',
          headers() {
            return {
              'Content-Type': 'application/json',
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

### 4. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency/api/trpc
```

---

## React Query Integration

### Basic Search Query

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = trpc.search.search.useQuery(
    {
      query,
      page,
      limit: 20,
    },
    {
      enabled: query.length >= 2, // Only search if query is long enough
      keepPreviousData: true,     // Keep previous results while loading new ones
    }
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      
      {data?.data.results.map((result) => (
        <SearchResultCard key={result.id} result={result} />
      ))}
    </div>
  );
}
```

### Debounced Search

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState, useEffect } from 'react';
import { useDebouncedValue } from '@mantine/hooks';

export function DebouncedSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 300);

  const { data, isLoading } = trpc.search.search.useQuery(
    {
      query: debouncedQuery,
      limit: 20,
    },
    {
      enabled: debouncedQuery.length >= 2,
      keepPreviousData: true,
    }
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      {isLoading && <Spinner />}
      <SearchResults results={data?.data.results} />
    </div>
  );
}
```

### Autocomplete Suggestions

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';

export function SearchAutocomplete() {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedQuery] = useDebouncedValue(query, 200);

  const { data: suggestions } = trpc.search.getSuggestions.useQuery(
    {
      query: debouncedQuery,
      limit: 10,
    },
    {
      enabled: debouncedQuery.length >= 2 && showSuggestions,
    }
  );

  const handleSelectSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    // Trigger search with suggestion
  };

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Search..."
      />
      
      {showSuggestions && suggestions?.data && suggestions.data.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white shadow-lg rounded-md mt-1">
          {suggestions.data.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectSuggestion(suggestion.text)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100"
            >
              <span className="font-medium">{suggestion.text}</span>
              <span className="text-gray-500 text-sm ml-2">
                ({suggestion.count} results)
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Click Tracking

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';
import type { SearchResult } from '@/types/search';

export function SearchResultCard({ 
  result, 
  position, 
  searchEventId 
}: { 
  result: SearchResult;
  position: number;
  searchEventId: string;
}) {
  const router = useRouter();
  const trackClick = trpc.search.trackClick.useMutation();

  const handleClick = () => {
    // Track click asynchronously (don't block navigation)
    trackClick.mutate({
      eventId: searchEventId,
      resultId: result.id,
      resultPosition: position,
      resultEntityType: result.entityType,
    }, {
      onError: (error) => {
        // Log error silently, don't show to user
        console.error('Failed to track click:', error);
      }
    });

    // Navigate to result
    router.push(`/${result.entityType}/${result.id}`);
  };

  return (
    <div onClick={handleClick} className="cursor-pointer hover:bg-gray-50">
      <h3>{result.title}</h3>
      <p>{result.description}</p>
    </div>
  );
}
```

### Saved Searches

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';

export function SaveSearchButton({ 
  query, 
  entities, 
  filters 
}: { 
  query: string;
  entities?: string[];
  filters?: any;
}) {
  const [name, setName] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const utils = trpc.useContext();
  const saveSearch = trpc.search.saveSearch.useMutation({
    onSuccess: () => {
      utils.search.getSavedSearches.invalidate();
      setShowModal(false);
      toast.success('Search saved!');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleSave = () => {
    saveSearch.mutate({
      name,
      query,
      entities,
      filters,
    });
  };

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Save Search
      </button>

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h2>Save Search</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Search name..."
            maxLength={100}
          />
          <button 
            onClick={handleSave}
            disabled={!name || saveSearch.isLoading}
          >
            {saveSearch.isLoading ? 'Saving...' : 'Save'}
          </button>
        </Modal>
      )}
    </>
  );
}
```

### Pagination

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';

export function PaginatedSearch({ query }: { query: string }) {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = trpc.search.search.useQuery(
    { query, page, limit },
    { 
      enabled: query.length >= 2,
      keepPreviousData: true // Don't unmount results while loading next page
    }
  );

  const pagination = data?.data.pagination;

  return (
    <div>
      <SearchResults results={data?.data.results} />
      
      {pagination && (
        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={!pagination.hasPreviousPage || isLoading}
          >
            Previous
          </button>
          
          <span>
            Page {pagination.page} of {pagination.totalPages}
            ({pagination.total} results)
          </span>
          
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!pagination.hasNextPage || isLoading}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Component Examples

### Complete Search Interface

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import type { SearchableEntity, SearchFilters } from '@/types/search';

export function SearchInterface() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [entities, setEntities] = useState<SearchableEntity[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [debouncedQuery] = useDebouncedValue(query, 300);

  // Main search
  const { data, isLoading, error } = trpc.search.search.useQuery(
    {
      query: debouncedQuery,
      entities: entities.length > 0 ? entities : undefined,
      filters,
      page,
      limit: 20,
    },
    {
      enabled: debouncedQuery.length >= 2,
      keepPreviousData: true,
    }
  );

  // Facets for filters
  const { data: facetsData } = trpc.search.getEnhancedFacets.useQuery(
    {
      query: debouncedQuery,
      entities: entities.length > 0 ? entities : undefined,
      filters,
    },
    {
      enabled: debouncedQuery.length >= 2,
    }
  );

  // Spelling suggestion
  const { data: spellingSuggestion } = trpc.search.getSpellingSuggestion.useQuery(
    {
      query: debouncedQuery,
      currentResultCount: data?.data.results.length || 0,
    },
    {
      enabled: debouncedQuery.length >= 2 && 
               data?.data.results.length !== undefined &&
               data.data.results.length < 3,
    }
  );

  const handleEntityToggle = (entity: SearchableEntity) => {
    setEntities(prev =>
      prev.includes(entity)
        ? prev.filter(e => e !== entity)
        : [...prev, entity]
    );
    setPage(1); // Reset to page 1
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search Input */}
      <div className="mb-8">
        <SearchInput value={query} onChange={setQuery} />
        
        {/* Entity Filter */}
        <div className="flex gap-2 mt-4">
          {(['assets', 'creators', 'projects', 'licenses'] as SearchableEntity[]).map(entity => (
            <button
              key={entity}
              onClick={() => handleEntityToggle(entity)}
              className={`px-4 py-2 rounded ${
                entities.includes(entity) ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}
            >
              {entity}
              {data?.data.facets.entityCounts[entity] && 
                ` (${data.data.facets.entityCounts[entity]})`
              }
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Filters Sidebar */}
        <aside className="col-span-3">
          <FilterPanel 
            facets={facetsData?.data}
            filters={filters}
            onChange={handleFilterChange}
          />
        </aside>

        {/* Results */}
        <main className="col-span-9">
          {/* Spelling suggestion */}
          {spellingSuggestion?.data.hasAlternative && (
            <div className="mb-4 p-4 bg-yellow-50 rounded">
              Did you mean:{' '}
              <button
                onClick={() => setQuery(spellingSuggestion.data.suggestion!.suggestedQuery)}
                className="text-blue-600 underline"
              >
                {spellingSuggestion.data.suggestion!.suggestedQuery}
              </button>
              ?
            </div>
          )}

          {/* Loading state */}
          {isLoading && <SearchLoadingSkeleton />}

          {/* Error state */}
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded">
              {error.message}
            </div>
          )}

          {/* Results */}
          {data && (
            <>
              <div className="mb-4 text-gray-600">
                {data.data.pagination.total} results in {data.data.executionTimeMs}ms
              </div>

              <div className="space-y-4">
                {data.data.results.map((result, idx) => (
                  <SearchResultCard
                    key={result.id}
                    result={result}
                    position={idx}
                    searchEventId={`event-${Date.now()}`}
                  />
                ))}
              </div>

              {/* Pagination */}
              <Pagination
                pagination={data.data.pagination}
                onPageChange={setPage}
              />
            </>
          )}

          {/* Zero state */}
          {data && data.data.results.length === 0 && (
            <ZeroResultsState query={query} />
          )}
        </main>
      </div>
    </div>
  );
}
```

### Filter Panel Component

```typescript
'use client';

import type { EnhancedSearchFacets } from '@/types/search';

interface FilterPanelProps {
  facets?: EnhancedSearchFacets;
  filters: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

export function FilterPanel({ facets, filters, onChange }: FilterPanelProps) {
  if (!facets) return <div>Loading filters...</div>;

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg">Filters</h3>

      {facets.groups.map(group => (
        <div key={group.field} className="border-b pb-4">
          <h4 className="font-medium mb-2">{group.label}</h4>

          {group.type === 'checkbox' && (
            <div className="space-y-2">
              {group.options.map(option => (
                <label key={option.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filters[group.field]?.includes(option.value)}
                    onChange={(e) => {
                      const current = filters[group.field] || [];
                      const updated = e.target.checked
                        ? [...current, option.value]
                        : current.filter((v: string) => v !== option.value);
                      onChange(group.field, updated.length > 0 ? updated : undefined);
                    }}
                  />
                  <span>{option.label}</span>
                  <span className="text-gray-500 text-sm">({option.count})</span>
                </label>
              ))}
            </div>
          )}

          {group.type === 'radio' && (
            <div className="space-y-2">
              {group.options.map(option => (
                <label key={option.value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={group.field}
                    checked={filters[group.field] === option.value}
                    onChange={() => onChange(group.field, option.value)}
                  />
                  <span>{option.label}</span>
                  <span className="text-gray-500 text-sm">({option.count})</span>
                </label>
              ))}
            </div>
          )}

          {group.type === 'range' && (
            <div>
              <input
                type="range"
                min={group.min}
                max={group.max}
                value={filters[group.field] || group.min}
                onChange={(e) => onChange(group.field, parseInt(e.target.value))}
              />
              <div className="text-sm text-gray-600">
                {filters[group.field] || group.min} - {group.max}
              </div>
            </div>
          )}

          {group.type === 'date' && (
            <div className="space-y-2">
              <input
                type="date"
                value={filters[`${group.field}From`] || ''}
                onChange={(e) => onChange(`${group.field}From`, e.target.value)}
                className="w-full"
              />
              <input
                type="date"
                value={filters[`${group.field}To`] || ''}
                onChange={(e) => onChange(`${group.field}To`, e.target.value)}
                className="w-full"
              />
            </div>
          )}
        </div>
      ))}

      {/* Clear filters */}
      {Object.keys(filters).length > 0 && (
        <button
          onClick={() => onChange('', {})}
          className="w-full px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );
}
```

### Search Result Card with Highlights

```typescript
'use client';

import DOMPurify from 'dompurify';
import type { SearchResult } from '@/types/search';

export function SearchResultCard({ result }: { result: SearchResult }) {
  const sanitizeHighlight = (html?: string) => {
    if (!html) return '';
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['mark'] });
  };

  const getEntityIcon = () => {
    switch (result.entityType) {
      case 'assets': return '🎨';
      case 'creators': return '👤';
      case 'projects': return '📁';
      case 'licenses': return '📄';
    }
  };

  const getEntityColor = () => {
    switch (result.entityType) {
      case 'assets': return 'bg-blue-100 text-blue-800';
      case 'creators': return 'bg-green-100 text-green-800';
      case 'projects': return 'bg-purple-100 text-purple-800';
      case 'licenses': return 'bg-orange-100 text-orange-800';
    }
  };

  return (
    <div className="p-4 border rounded-lg hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${getEntityColor()}`}>
            {getEntityIcon()} {result.entityType}
          </span>
          <span className="text-xs text-gray-500">
            Score: {(result.relevanceScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Title with highlights */}
      <h3
        className="text-lg font-semibold mb-2"
        dangerouslySetInnerHTML={{
          __html: sanitizeHighlight(result.highlights.title) || result.title
        }}
      />

      {/* Description with highlights */}
      {result.description && (
        <p
          className="text-gray-600 mb-3"
          dangerouslySetInnerHTML={{
            __html: sanitizeHighlight(result.highlights.description) || result.description
          }}
        />
      )}

      {/* Metadata */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span>Created: {new Date(result.createdAt).toLocaleDateString()}</span>
        
        {/* Entity-specific metadata */}
        {result.metadata.type === 'asset' && (
          <>
            <span>Type: {result.metadata.assetType}</span>
            <span>Status: {result.metadata.status}</span>
          </>
        )}
        
        {result.metadata.type === 'creator' && (
          <>
            <span>@{result.metadata.stageName}</span>
            {result.metadata.verificationStatus === 'VERIFIED' && (
              <span className="text-blue-600">✓ Verified</span>
            )}
          </>
        )}
      </div>

      {/* Score breakdown (optional, for debugging) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-2 text-xs text-gray-500">
          <summary className="cursor-pointer">Score Breakdown</summary>
          <div className="mt-1 space-y-1">
            <div>Textual: {(result.scoreBreakdown.textualRelevance * 100).toFixed(0)}%</div>
            <div>Recency: {(result.scoreBreakdown.recencyScore * 100).toFixed(0)}%</div>
            <div>Popularity: {(result.scoreBreakdown.popularityScore * 100).toFixed(0)}%</div>
            <div>Quality: {(result.scoreBreakdown.qualityScore * 100).toFixed(0)}%</div>
          </div>
        </details>
      )}
    </div>
  );
}
```

### Zero Results State

```typescript
'use client';

import { trpc } from '@/lib/trpc/client';

export function ZeroResultsState({ query }: { query: string }) {
  const { data: relatedContent } = trpc.search.search.useQuery(
    {
      query: '', // Empty query to get popular/recent items
      limit: 6
    }
  );

  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">🔍</div>
      <h2 className="text-2xl font-semibold mb-2">No results found</h2>
      <p className="text-gray-600 mb-6">
        We couldn't find anything matching "{query}"
      </p>

      <div className="space-y-4 mb-8">
        <h3 className="font-medium">Try:</h3>
        <ul className="text-left max-w-md mx-auto space-y-2">
          <li>• Using different keywords</li>
          <li>• Checking your spelling</li>
          <li>• Using fewer or more general terms</li>
          <li>• Removing filters</li>
        </ul>
      </div>

      {relatedContent && relatedContent.data.results.length > 0 && (
        <div>
          <h3 className="font-semibold mb-4">You might be interested in:</h3>
          <div className="grid grid-cols-3 gap-4">
            {relatedContent.data.results.slice(0, 6).map(result => (
              <SearchResultCard key={result.id} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## State Management Patterns

### Using Zustand for Complex Search State

```typescript
// store/searchStore.ts
import { create } from 'zustand';
import type { SearchableEntity, SearchFilters } from '@/types/search';

interface SearchState {
  query: string;
  entities: SearchableEntity[];
  filters: SearchFilters;
  page: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  
  // Actions
  setQuery: (query: string) => void;
  toggleEntity: (entity: SearchableEntity) => void;
  setFilter: (key: string, value: any) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setSorting: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  entities: [],
  filters: {},
  page: 1,
  sortBy: 'relevance',
  sortOrder: 'desc',

  setQuery: (query) => set({ query, page: 1 }),
  
  toggleEntity: (entity) => set((state) => ({
    entities: state.entities.includes(entity)
      ? state.entities.filter(e => e !== entity)
      : [...state.entities, entity],
    page: 1,
  })),
  
  setFilter: (key, value) => set((state) => ({
    filters: { ...state.filters, [key]: value },
    page: 1,
  })),
  
  clearFilters: () => set({ filters: {}, page: 1 }),
  
  setPage: (page) => set({ page }),
  
  setSorting: (sortBy, sortOrder) => set({ sortBy, sortOrder, page: 1 }),
  
  reset: () => set({
    query: '',
    entities: [],
    filters: {},
    page: 1,
    sortBy: 'relevance',
    sortOrder: 'desc',
  }),
}));

// Usage in component
function SearchPage() {
  const { query, entities, filters, page, setQuery, toggleEntity } = useSearchStore();
  
  const { data } = trpc.search.search.useQuery({
    query,
    entities: entities.length > 0 ? entities : undefined,
    filters,
    page,
  });
  
  return <SearchInterface />;
}
```

### URL State Sync (Shareable Search URLs)

```typescript
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useSearchStore } from '@/store/searchStore';

export function useSearchUrlSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { query, entities, filters, page, setQuery, toggleEntity, setFilter, setPage } = useSearchStore();

  // Load from URL on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    const urlEntities = searchParams.get('entities')?.split(',');
    const urlPage = searchParams.get('page');
    
    if (urlQuery) setQuery(urlQuery);
    if (urlEntities) {
      urlEntities.forEach(e => toggleEntity(e as any));
    }
    if (urlPage) setPage(parseInt(urlPage));
    
    // Load filters
    searchParams.forEach((value, key) => {
      if (key.startsWith('filter_')) {
        const filterKey = key.replace('filter_', '');
        setFilter(filterKey, value);
      }
    });
  }, []);

  // Sync to URL when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    
    if (query) params.set('q', query);
    if (entities.length > 0) params.set('entities', entities.join(','));
    if (page > 1) params.set('page', page.toString());
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(`filter_${key}`, Array.isArray(value) ? value.join(',') : value);
      }
    });

    const url = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(url, { scroll: false });
  }, [query, entities, filters, page]);
}

// Usage
function SearchPage() {
  useSearchUrlSync();
  return <SearchInterface />;
}
```

---

## Frontend Implementation Checklist

### Phase 1: Basic Search (MVP)

- [ ] **Setup**
  - [ ] Install dependencies (React Query, tRPC client)
  - [ ] Configure tRPC client
  - [ ] Setup providers in app layout
  - [ ] Add environment variables

- [ ] **Search Input**
  - [ ] Create search input component
  - [ ] Add debouncing (300ms)
  - [ ] Implement minimum query length validation (2 chars)
  - [ ] Add loading indicator

- [ ] **Search Results**
  - [ ] Create search result card component
  - [ ] Display title, description, entity type
  - [ ] Show relevance score
  - [ ] Implement click navigation

- [ ] **Error Handling**
  - [ ] Handle network errors
  - [ ] Show validation errors
  - [ ] Add error boundary

- [ ] **Authentication**
  - [ ] Protect search pages (require login)
  - [ ] Redirect unauthenticated users

### Phase 2: Enhanced Search

- [ ] **Autocomplete**
  - [ ] Create suggestions dropdown
  - [ ] Debounce suggestion requests (200ms)
  - [ ] Show result counts per suggestion
  - [ ] Handle keyboard navigation (arrow keys, enter)

- [ ] **Filters**
  - [ ] Entity type filter (pills/checkboxes)
  - [ ] Asset type filter
  - [ ] Date range filter
  - [ ] Status filter
  - [ ] Clear all filters button

- [ ] **Pagination**
  - [ ] Previous/next buttons
  - [ ] Page number display
  - [ ] Jump to page input
  - [ ] Preserve scroll position option

- [ ] **Search Highlights**
  - [ ] Sanitize HTML highlights
  - [ ] Style `<mark>` tags
  - [ ] Handle missing highlights

### Phase 3: Advanced Features

- [ ] **Faceted Search**
  - [ ] Get enhanced facets
  - [ ] Build filter sidebar
  - [ ] Show result counts per filter
  - [ ] Dynamic filter updates

- [ ] **Spell Correction**
  - [ ] Request spelling suggestions
  - [ ] Show "Did you mean..." banner
  - [ ] Handle suggestion click

- [ ] **Zero Results**
  - [ ] Create zero state component
  - [ ] Show search tips
  - [ ] Display related/popular content

- [ ] **Click Tracking**
  - [ ] Track result clicks
  - [ ] Send analytics asynchronously
  - [ ] Handle tracking errors gracefully

- [ ] **Saved Searches**
  - [ ] Save search button
  - [ ] Name input modal
  - [ ] List saved searches
  - [ ] Execute saved search
  - [ ] Update/delete saved searches

### Phase 4: Optimization

- [ ] **Performance**
  - [ ] Implement React Query caching
  - [ ] Add keepPreviousData for smooth transitions
  - [ ] Prefetch next page
  - [ ] Virtual scrolling for large result sets

- [ ] **UX**
  - [ ] Loading skeletons
  - [ ] Optimistic updates for saved searches
  - [ ] Toast notifications
  - [ ] Empty state illustrations

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] ARIA labels
  - [ ] Focus management
  - [ ] Screen reader announcements

- [ ] **SEO (if public)**
  - [ ] Server-side rendering for initial results
  - [ ] Meta tags for search pages
  - [ ] Structured data

### Phase 5: Admin Features (Admin Only)

- [ ] **Analytics Dashboard**
  - [ ] Search analytics component
  - [ ] Charts for trending searches
  - [ ] Zero-result query report
  - [ ] Performance metrics display

- [ ] **Admin Controls**
  - [ ] Role-based rendering
  - [ ] Analytics date range selector
  - [ ] Export analytics data

---

## Edge Cases & UX Considerations

### 1. Empty Query

```typescript
// Don't search on empty query
const { data } = trpc.search.search.useQuery(
  { query },
  { enabled: query.trim().length >= 2 }
);
```

### 2. Special Characters

```typescript
// Backend handles sanitization, but validate on frontend
const sanitizeQuery = (input: string) => {
  return input.trim().slice(0, 200);
};
```

### 3. Rapid Filter Changes

```typescript
// Debounce filter changes
const [filters, setFilters] = useState({});
const [debouncedFilters] = useDebouncedValue(filters, 300);

const { data } = trpc.search.search.useQuery({
  query,
  filters: debouncedFilters
});
```

### 4. Offline Handling

```typescript
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function SearchPage() {
  const isOnline = useOnlineStatus();
  
  if (!isOnline) {
    return <OfflineMessage />;
  }
  
  return <SearchInterface />;
}
```

### 5. Slow Network

```typescript
const { data, isLoading, isError } = trpc.search.search.useQuery(
  { query },
  {
    timeout: 10000, // 10 second timeout
    retry: 1,       // Only retry once
    onError: (error) => {
      if (error.message.includes('timeout')) {
        toast.error('Search is taking longer than expected. Please try again.');
      }
    }
  }
);
```

### 6. No Results After Filters

```typescript
if (data?.data.results.length === 0 && Object.keys(filters).length > 0) {
  return (
    <div>
      <p>No results with current filters.</p>
      <button onClick={clearFilters}>Clear Filters</button>
    </div>
  );
}
```

### 7. Mobile Considerations

```typescript
// Reduce limit on mobile
const isMobile = useMediaQuery('(max-width: 768px)');
const limit = isMobile ? 10 : 20;

const { data } = trpc.search.search.useQuery({
  query,
  limit
});
```

### 8. Browser Back Button

```typescript
// URL state sync automatically handles this
useSearchUrlSync(); // From earlier example
```

---

## Performance Optimization

### 1. React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 minutes
      cacheTime: 10 * 60 * 1000,    // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});
```

### 2. Prefetching

```typescript
const utils = trpc.useContext();

// Prefetch next page on hover
const handleResultHover = (nextPage: number) => {
  utils.search.search.prefetch({
    query,
    page: nextPage,
    limit: 20
  });
};
```

### 3. Virtual Scrolling

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedResults({ results }: { results: SearchResult[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated height of each item
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <SearchResultCard result={results[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Image Lazy Loading

```typescript
<img
  src={result.metadata.thumbnailUrl}
  alt={result.title}
  loading="lazy"
  className="w-full h-48 object-cover"
/>
```

### 5. Code Splitting

```typescript
import dynamic from 'next/dynamic';

const AnalyticsDashboard = dynamic(
  () => import('@/components/search/AnalyticsDashboard'),
  { ssr: false }
);

// Only load for admins
{isAdmin && <AnalyticsDashboard />}
```

---

## Testing Strategies

### 1. Unit Tests

```typescript
// __tests__/components/SearchInput.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchInput } from '@/components/search/SearchInput';

describe('SearchInput', () => {
  it('debounces input changes', async () => {
    const handleChange = jest.fn();
    render(<SearchInput value="" onChange={handleChange} />);
    
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'test' } });
    
    // Should not call immediately
    expect(handleChange).not.toHaveBeenCalled();
    
    // Should call after debounce
    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith('test');
    }, { timeout: 400 });
  });

  it('validates minimum length', () => {
    const handleChange = jest.fn();
    render(<SearchInput value="a" onChange={handleChange} minLength={2} />);
    
    expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
  });
});
```

### 2. Integration Tests

```typescript
// __tests__/integration/search.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { TRPCProvider } from '@/lib/trpc/client';
import { SearchPage } from '@/app/search/page';

describe('Search Integration', () => {
  it('performs search and displays results', async () => {
    render(
      <TRPCProvider>
        <SearchPage />
      </TRPCProvider>
    );

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'logo' } });

    await waitFor(() => {
      expect(screen.getByText(/results/i)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('article')).toHaveLength(20);
  });
});
```

### 3. E2E Tests (Playwright)

```typescript
// e2e/search.spec.ts
import { test, expect } from '@playwright/test';

test('complete search flow', async ({ page }) => {
  await page.goto('/search');

  // Enter search query
  await page.fill('input[placeholder="Search..."]', 'logo design');
  
  // Wait for results
  await page.waitForSelector('[data-testid="search-results"]');
  
  // Verify results displayed
  const results = await page.locator('[data-testid="search-result"]').count();
  expect(results).toBeGreaterThan(0);
  
  // Click first result
  await page.locator('[data-testid="search-result"]').first().click();
  
  // Verify navigation
  await expect(page).toHaveURL(/\/(assets|creators|projects|licenses)\/\w+/);
});

test('filter results', async ({ page }) => {
  await page.goto('/search?q=design');
  
  // Select asset type filter
  await page.click('text=Assets');
  
  // Wait for filtered results
  await page.waitForSelector('[data-testid="search-results"]');
  
  // Verify URL updated
  expect(page.url()).toContain('entities=assets');
});
```

### 4. Accessibility Tests

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('search interface is accessible', async () => {
  const { container } = render(<SearchInterface />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## Next Steps

Refer back to:
- **Part 1**: [API Reference Guide](./SEARCH_SERVICE_API_REFERENCE.md)
- **Part 2**: [Error Handling & Authorization](./SEARCH_SERVICE_ERRORS_AND_AUTH.md)

For questions or issues:
1. Check the implementation examples in this guide
2. Review error handling patterns in Part 2
3. Consult API documentation in Part 1
4. Contact backend team for advanced troubleshooting
