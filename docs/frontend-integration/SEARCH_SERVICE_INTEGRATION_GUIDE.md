# Search Service - Frontend Integration Guide

## Overview

This guide provides comprehensive examples for integrating the Search Service into your admin frontend application.

## Installation & Setup

The search service is available through the existing tRPC client. No additional setup required.

```typescript
import { trpc } from '@/lib/trpc/client';
```

## Basic Usage

### Simple Search Component

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function SearchBar() {
  const [query, setQuery] = useState('');
  
  const { data, isLoading } = trpc.search.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assets, creators, projects..."
        className="w-full px-4 py-2 border rounded"
      />
      
      {isLoading && <div>Searching...</div>}
      
      {data?.data.results.map((result) => (
        <SearchResultItem key={result.id} result={result} />
      ))}
    </div>
  );
}
```

### Advanced Search with Filters

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { SearchableEntity, SearchFiltersInput } from '@/modules/search';

export function AdvancedSearch() {
  const [query, setQuery] = useState('');
  const [entities, setEntities] = useState<SearchableEntity[]>([
    'assets',
    'creators',
    'projects',
    'licenses',
  ]);
  const [filters, setFilters] = useState<SearchFiltersInput>({});
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.search.search.useQuery(
    {
      query,
      entities,
      filters,
      page,
      limit: 20,
      sortBy: 'relevance',
    },
    { enabled: query.length >= 2 }
  );

  return (
    <div className="grid grid-cols-4 gap-6">
      {/* Filters Sidebar */}
      <aside className="col-span-1 space-y-4">
        <div>
          <h3 className="font-semibold mb-2">Entity Types</h3>
          {(['assets', 'creators', 'projects', 'licenses'] as const).map((entity) => (
            <label key={entity} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={entities.includes(entity)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEntities([...entities, entity]);
                  } else {
                    setEntities(entities.filter((e) => e !== entity));
                  }
                }}
              />
              <span className="capitalize">{entity}</span>
            </label>
          ))}
        </div>

        <div>
          <h3 className="font-semibold mb-2">Date Range</h3>
          <input
            type="date"
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
            className="w-full px-2 py-1 border rounded mb-2"
          />
          <input
            type="date"
            onChange={(e) =>
              setFilters({ ...filters, dateTo: e.target.value })
            }
            className="w-full px-2 py-1 border rounded"
          />
        </div>

        {/* Asset Filters */}
        {entities.includes('assets') && (
          <div>
            <h3 className="font-semibold mb-2">Asset Type</h3>
            <select
              onChange={(e) =>
                setFilters({
                  ...filters,
                  assetType: e.target.value ? [e.target.value] : undefined,
                })
              }
              className="w-full px-2 py-1 border rounded"
            >
              <option value="">All Types</option>
              <option value="IMAGE">Image</option>
              <option value="VIDEO">Video</option>
              <option value="AUDIO">Audio</option>
              <option value="DOCUMENT">Document</option>
            </select>
          </div>
        )}
      </aside>

      {/* Results */}
      <main className="col-span-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="w-full px-4 py-3 border rounded-lg mb-6"
        />

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        )}

        {data && (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Found {data.data.pagination.total} results in{' '}
              {data.data.executionTimeMs}ms
            </div>

            <div className="space-y-4">
              {data.data.results.map((result) => (
                <SearchResultCard
                  key={result.id}
                  result={result}
                  onTrackClick={(position) => {
                    // Track click for analytics
                    trackClick.mutate({
                      eventId: result.id,
                      resultId: result.id,
                      resultPosition: position,
                      resultEntityType: result.entityType,
                    });
                  }}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex justify-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data.data.pagination.hasPreviousPage}
                className="px-4 py-2 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-4 py-2">
                Page {page} of {data.data.pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.data.pagination.hasNextPage}
                className="px-4 py-2 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
```

### Search Result Card Component

```typescript
import type { SearchResult } from '@/modules/search';
import { useRouter } from 'next/navigation';

interface SearchResultCardProps {
  result: SearchResult;
  onTrackClick: (position: number) => void;
}

export function SearchResultCard({ result, onTrackClick }: SearchResultCardProps) {
  const router = useRouter();

  const handleClick = () => {
    onTrackClick(0);
    
    // Navigate to appropriate detail page
    const baseUrls = {
      assets: '/admin/assets',
      creators: '/admin/creators',
      projects: '/admin/projects',
      licenses: '/admin/licenses',
    };
    
    router.push(`${baseUrls[result.entityType]}/${result.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="p-4 border rounded-lg hover:shadow-md cursor-pointer transition"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
              {result.entityType}
            </span>
            <span className="text-xs text-gray-500">
              Relevance: {(result.relevanceScore * 100).toFixed(0)}%
            </span>
          </div>

          <h3
            className="text-lg font-semibold mb-1"
            dangerouslySetInnerHTML={{ __html: result.highlights.title || result.title }}
          />

          {result.description && (
            <p
              className="text-gray-600 text-sm mb-2"
              dangerouslySetInnerHTML={{
                __html: result.highlights.description || result.description,
              }}
            />
          )}

          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span>Created: {new Date(result.createdAt).toLocaleDateString()}</span>
            {renderEntityMetadata(result)}
          </div>
        </div>

        {renderThumbnail(result)}
      </div>

      {/* Score Breakdown (for debugging/admin) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-gray-500">Score Breakdown</summary>
          <div className="mt-2 space-y-1 pl-4">
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

function renderEntityMetadata(result: SearchResult) {
  switch (result.metadata.type) {
    case 'asset':
      return (
        <>
          <span>{result.metadata.assetType}</span>
          <span>{result.metadata.status}</span>
        </>
      );
    case 'creator':
      return (
        <>
          <span>{result.metadata.stageName}</span>
          <span>{result.metadata.verificationStatus}</span>
        </>
      );
    case 'project':
      return (
        <>
          <span>{result.metadata.projectType}</span>
          <span>{result.metadata.status}</span>
          <span>{result.metadata.brandName}</span>
        </>
      );
    case 'license':
      return (
        <>
          <span>{result.metadata.licenseType}</span>
          <span>{result.metadata.status}</span>
        </>
      );
  }
}

function renderThumbnail(result: SearchResult) {
  if (result.metadata.type === 'asset' && result.metadata.thumbnailUrl) {
    return (
      <img
        src={result.metadata.thumbnailUrl}
        alt={result.title}
        className="w-24 h-24 object-cover rounded"
      />
    );
  }
  
  if (result.metadata.type === 'creator' && result.metadata.avatar) {
    return (
      <img
        src={result.metadata.avatar}
        alt={result.title}
        className="w-16 h-16 object-cover rounded-full"
      />
    );
  }
  
  return null;
}
```

### Debounced Search Hook

```typescript
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delay: number = 500): T {
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

// Usage
export function SearchWithDebounce() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 500);

  const { data } = trpc.search.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <input
      type="search"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

## Admin Analytics Dashboard

```typescript
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export function SearchAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  });

  const { data: analytics } = trpc.search.getAnalytics.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const { data: performance } = trpc.search.getPerformanceMetrics.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const { data: trending } = trpc.search.getTrendingSearches.useQuery({
    hours: 24,
    limit: 10,
  });

  const { data: zeroResults } = trpc.search.getZeroResultQueries.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    limit: 20,
  });

  if (!analytics) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Search Analytics</h1>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="Total Searches"
          value={analytics.data.totalSearches}
        />
        <MetricCard
          title="Avg Results"
          value={analytics.data.averageResultsCount.toFixed(1)}
        />
        <MetricCard
          title="Zero Result Rate"
          value={`${(analytics.data.zeroResultsRate * 100).toFixed(1)}%`}
          warning={analytics.data.zeroResultsRate > 0.2}
        />
        <MetricCard
          title="Click-Through Rate"
          value={`${(analytics.data.clickThroughRate * 100).toFixed(1)}%`}
          warning={analytics.data.clickThroughRate < 0.3}
        />
      </div>

      {/* Performance Metrics */}
      {performance && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Performance</h2>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Average</div>
              <div className="text-2xl font-bold">
                {performance.data.averageExecutionTime.toFixed(0)}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">P50</div>
              <div className="text-2xl font-bold">
                {performance.data.p50ExecutionTime}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">P95</div>
              <div className="text-2xl font-bold">
                {performance.data.p95ExecutionTime}ms
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">P99</div>
              <div className="text-2xl font-bold">
                {performance.data.p99ExecutionTime}ms
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Queries */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Top Searches</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Query</th>
              <th className="text-right py-2">Count</th>
              <th className="text-right py-2">Avg Results</th>
            </tr>
          </thead>
          <tbody>
            {analytics.data.topQueries.map((item) => (
              <tr key={item.query} className="border-b">
                <td className="py-2">{item.query}</td>
                <td className="text-right">{item.count}</td>
                <td className="text-right">{item.averageResultsCount.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trending Searches */}
      {trending && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Trending (24h)</h2>
          <div className="space-y-2">
            {trending.data.map((item) => (
              <div key={item.query} className="flex justify-between">
                <span>{item.query}</span>
                <span className="text-green-600">
                  +{item.growth.toFixed(0)}% ({item.count} searches)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zero Result Queries */}
      {zeroResults && zeroResults.data.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 text-red-600">
            Zero-Result Queries (Action Required)
          </h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Query</th>
                <th className="text-right py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {zeroResults.data.map((item) => (
                <tr key={item.query} className="border-b">
                  <td className="py-2">{item.query}</td>
                  <td className="text-right">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  warning,
}: {
  title: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <div className={`bg-white p-6 rounded-lg shadow ${warning ? 'border-l-4 border-yellow-500' : ''}`}>
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
```

## Best Practices

1. **Debounce Search Input** - Wait 300-500ms before triggering search
2. **Minimum Query Length** - Require at least 2 characters
3. **Track Clicks** - Always track result clicks for analytics
4. **Show Loading States** - Provide clear feedback during search
5. **Handle Empty States** - Show helpful message when no results
6. **Keyboard Navigation** - Support arrow keys and Enter for results
7. **Highlight Matches** - Use dangerouslySetInnerHTML for highlights (already escaped)

## Performance Tips

1. Cache search results with React Query's stale time
2. Implement infinite scroll for better UX
3. Prefetch common searches
4. Use skeleton loaders during loading
5. Optimize re-renders with React.memo

## Error Handling

```typescript
const { data, error, isError } = trpc.search.search.useQuery({ query });

if (isError) {
  return <ErrorMessage error={error.message} />;
}
```

## TypeScript Support

Full TypeScript support with type inference:

```typescript
import type {
  SearchResult,
  SearchableEntity,
  SearchFiltersInput,
  AssetMetadata,
  CreatorMetadata,
} from '@/modules/search';
```

## Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchBar } from './SearchBar';

test('searches when typing', async () => {
  render(<SearchBar />);
  
  const input = screen.getByPlaceholderText(/search/i);
  fireEvent.change(input, { target: { value: 'logo' } });
  
  await waitFor(() => {
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });
});
```
