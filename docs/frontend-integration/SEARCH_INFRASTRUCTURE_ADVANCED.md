# Search Infrastructure - Advanced Features Guide

🌐 **SHARED** - Advanced search features for both public website and admin interface

**Module Status:** ✅ Complete  
**Backend Version:** 1.0.0  
**Last Updated:** October 17, 2025

---

## Overview

This guide covers advanced search features including analytics, faceted search, spell correction, related content recommendations, and performance optimization strategies.

---

## Table of Contents

1. [Search Analytics](#search-analytics)
2. [Faceted Search & Filters](#faceted-search--filters)
3. [Spell Correction & Suggestions](#spell-correction--suggestions)
4. [Related Content & Recommendations](#related-content--recommendations)
5. [Performance Optimization](#performance-optimization)
6. [Real-Time Features](#real-time-features)
7. [Advanced UI Patterns](#advanced-ui-patterns)

---

## Search Analytics

### Overview

Search analytics track user behavior, performance metrics, and search effectiveness. All searches are automatically logged with metadata.

---

### Automatic Tracking

**Every search query automatically records:**
- Query string
- Entities searched
- Filters applied
- Result count
- Execution time (ms)
- User ID (if authenticated)
- Session ID (if available)
- Timestamp

**No frontend action required** - tracking is server-side.

---

### Click Tracking

**Track when users click search results:**

```typescript
const SearchResultCard = ({ result, position, searchEventId }: Props) => {
  const trackClick = trpc.search.trackClick.useMutation();
  
  const handleClick = () => {
    // Track click asynchronously (don't await)
    trackClick.mutate({
      eventId: searchEventId,      // From search response
      resultId: result.id,
      resultPosition: position,    // 0-based index
      resultEntityType: result.entityType
    });
    
    // Navigate to result
    router.push(`/${result.entityType}/${result.id}`);
  };
  
  return (
    <Card onClick={handleClick}>
      <h3>{result.title}</h3>
      <p>{result.description}</p>
    </Card>
  );
};
```

**Best Practices:**
- Fire asynchronously - don't block navigation
- Track position accurately (0-based index)
- Include search event ID from original response
- Handle tracking failures silently

---

### Analytics Dashboard (Admin Only)

#### Get Comprehensive Analytics

```typescript
const AnalyticsDashboard = () => {
  const [dateRange, setDateRange] = useState({
    startDate: startOfMonth(new Date()).toISOString(),
    endDate: endOfDay(new Date()).toISOString()
  });
  
  const { data } = trpc.search.getAnalytics.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });
  
  if (!data) return <Loading />;
  
  const analytics = data.data;
  
  return (
    <div>
      <AnalyticsCard
        title="Total Searches"
        value={analytics.totalSearches}
      />
      <AnalyticsCard
        title="Avg Execution Time"
        value={`${analytics.averageExecutionTimeMs}ms`}
      />
      <AnalyticsCard
        title="Click-Through Rate"
        value={`${(analytics.clickThroughRate * 100).toFixed(1)}%`}
      />
      <AnalyticsCard
        title="Zero Results Rate"
        value={`${(analytics.zeroResultsRate * 100).toFixed(1)}%`}
        alert={analytics.zeroResultsRate > 0.2}  // Alert if >20%
      />
      
      <TopQueriesTable queries={analytics.topQueries} />
      <ZeroResultQueriesTable queries={analytics.zeroResultQueries} />
      <EntityDistribution data={analytics.topEntities} />
    </div>
  );
};
```

---

#### Top Queries Chart

```typescript
const TopQueriesTable = ({ queries }: Props) => {
  return (
    <Table>
      <thead>
        <tr>
          <th>Query</th>
          <th>Count</th>
          <th>Avg Results</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {queries.map(q => (
          <tr key={q.query}>
            <td>
              <code>{q.query}</code>
            </td>
            <td>{q.count}</td>
            <td>{q.averageResultsCount.toFixed(1)}</td>
            <td>
              <Button onClick={() => runSearch(q.query)}>
                Try Search
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};
```

---

#### Zero-Result Queries Analysis

```typescript
const ZeroResultInsights = () => {
  const { data } = trpc.search.getZeroResultQueries.useQuery({
    startDate: startOfMonth(new Date()).toISOString(),
    endDate: new Date().toISOString(),
    limit: 50
  });
  
  return (
    <Card>
      <h3>Zero-Result Queries</h3>
      <p>Queries that returned no results (opportunities for improvement)</p>
      
      <List>
        {data?.data.map(q => (
          <ListItem key={q.query}>
            <span>{q.query}</span>
            <Badge>{q.count} searches</Badge>
            <Button onClick={() => analyzeMisspelling(q.query)}>
              Analyze
            </Button>
          </ListItem>
        ))}
      </List>
    </Card>
  );
};
```

---

#### Performance Metrics

```typescript
const PerformanceMetrics = () => {
  const { data } = trpc.search.getPerformanceMetrics.useQuery({
    startDate: subDays(new Date(), 7).toISOString(),
    endDate: new Date().toISOString()
  });
  
  const metrics = data?.data;
  
  return (
    <Grid cols={4}>
      <MetricCard
        title="Avg Execution Time"
        value={`${metrics.averageExecutionTimeMs}ms`}
        status={metrics.averageExecutionTimeMs < 100 ? 'good' : 'warning'}
      />
      <MetricCard
        title="P95 Latency"
        value={`${metrics.p95ExecutionTimeMs}ms`}
        status={metrics.p95ExecutionTimeMs < 200 ? 'good' : 'warning'}
      />
      <MetricCard
        title="P99 Latency"
        value={`${metrics.p99ExecutionTimeMs}ms`}
        status={metrics.p99ExecutionTimeMs < 500 ? 'good' : 'error'}
      />
      <MetricCard
        title="Slowest Query"
        value={`${metrics.slowestQueries[0]?.executionTimeMs}ms`}
      />
    </Grid>
  );
};
```

---

#### Trending Searches

```typescript
const TrendingSearches = () => {
  const { data } = trpc.search.getTrendingSearches.useQuery({
    hours: 24,  // Last 24 hours
    limit: 10
  });
  
  return (
    <Card>
      <h3>🔥 Trending Searches (Last 24h)</h3>
      <List>
        {data?.data.map((search, idx) => (
          <TrendingItem key={search.query} rank={idx + 1}>
            <RankBadge>{idx + 1}</RankBadge>
            <QueryText>{search.query}</QueryText>
            <TrendIndicator>↑ {search.trendScore}%</TrendIndicator>
          </TrendingItem>
        ))}
      </List>
    </Card>
  );
};
```

---

## Faceted Search & Filters

### Overview

Facets provide dynamic filter options with result counts, enabling users to refine searches interactively.

---

### Basic Facets

#### Get Asset Facets

```typescript
const AssetFilterSidebar = ({ query, currentFilters }: Props) => {
  const { data } = trpc.search.getAssetFacets.useQuery({
    query,
    filters: currentFilters
  });
  
  const facets = data?.data;
  
  return (
    <Sidebar>
      {/* Asset Type Facets */}
      <FilterGroup title="Asset Type">
        {Object.entries(facets.assetTypes).map(([type, count]) => (
          <Checkbox
            key={type}
            label={`${type} (${count})`}
            checked={currentFilters.assetType?.includes(type)}
            onChange={() => toggleFilter('assetType', type)}
          />
        ))}
      </FilterGroup>
      
      {/* Status Facets */}
      <FilterGroup title="Status">
        {Object.entries(facets.statuses).map(([status, count]) => (
          <Checkbox
            key={status}
            label={`${status} (${count})`}
            checked={currentFilters.assetStatus?.includes(status)}
            onChange={() => toggleFilter('assetStatus', status)}
          />
        ))}
      </FilterGroup>
      
      {/* Project Facets */}
      <FilterGroup title="Projects">
        {facets.projects.slice(0, 10).map(project => (
          <Checkbox
            key={project.id}
            label={`${project.name} (${project.count})`}
            checked={currentFilters.projectId === project.id}
            onChange={() => setFilter('projectId', project.id)}
          />
        ))}
      </FilterGroup>
      
      {/* Tags Facets */}
      <FilterGroup title="Tags">
        {facets.tags.slice(0, 15).map(tag => (
          <Chip
            key={tag.value}
            label={`${tag.value} (${tag.count})`}
            onClick={() => toggleTagFilter(tag.value)}
            selected={currentFilters.tags?.includes(tag.value)}
          />
        ))}
      </FilterGroup>
    </Sidebar>
  );
};
```

---

### Enhanced Facets

**Get structured facet groups for advanced filter UIs:**

```typescript
const EnhancedFilterUI = ({ query, entities, filters }: Props) => {
  const { data } = trpc.search.getEnhancedFacets.useQuery({
    query,
    entities,
    filters
  });
  
  const facets = data?.data;
  
  return (
    <FilterPanel>
      {facets.groups.map(group => (
        <FacetGroup key={group.field} group={group} />
      ))}
      
      <FilterSummary
        appliedFilters={facets.appliedFilters}
        totalResults={facets.totalResults}
        filteredResults={facets.filteredResults}
      />
    </FilterPanel>
  );
};

const FacetGroup = ({ group }: { group: FacetGroup }) => {
  switch (group.type) {
    case 'checkbox':
      return (
        <CheckboxGroup title={group.label}>
          {group.options.map(option => (
            <Checkbox
              key={option.value}
              label={`${option.label} (${option.count})`}
              checked={option.isSelected}
              onChange={() => toggleOption(group.field, option.value)}
            />
          ))}
        </CheckboxGroup>
      );
      
    case 'radio':
      return (
        <RadioGroup title={group.label}>
          {group.options.map(option => (
            <Radio
              key={option.value}
              label={`${option.label} (${option.count})`}
              checked={option.isSelected}
              onChange={() => selectOption(group.field, option.value)}
            />
          ))}
        </RadioGroup>
      );
      
    case 'range':
      return (
        <RangeSlider
          title={group.label}
          min={group.min}
          max={group.max}
          onChange={(range) => setRangeFilter(group.field, range)}
        />
      );
      
    case 'date':
      return (
        <DateRangePicker
          title={group.label}
          onChange={(range) => setDateFilter(group.field, range)}
        />
      );
  }
};
```

---

### Active Filter Display

```typescript
const ActiveFilters = ({ filters, onRemove, onClearAll }: Props) => {
  const filterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    
    // Asset type chips
    filters.assetType?.forEach(type => {
      chips.push({
        id: `assetType-${type}`,
        label: `Type: ${type}`,
        onRemove: () => onRemove('assetType', type)
      });
    });
    
    // Status chips
    filters.assetStatus?.forEach(status => {
      chips.push({
        id: `status-${status}`,
        label: `Status: ${status}`,
        onRemove: () => onRemove('assetStatus', status)
      });
    });
    
    // Date range chip
    if (filters.dateFrom || filters.dateTo) {
      chips.push({
        id: 'dateRange',
        label: `Date: ${formatDateRange(filters.dateFrom, filters.dateTo)}`,
        onRemove: () => onRemove('dateRange')
      });
    }
    
    // Tags
    filters.tags?.forEach(tag => {
      chips.push({
        id: `tag-${tag}`,
        label: `Tag: ${tag}`,
        onRemove: () => onRemove('tags', tag)
      });
    });
    
    return chips;
  }, [filters]);
  
  if (filterChips.length === 0) return null;
  
  return (
    <FilterChipsContainer>
      {filterChips.map(chip => (
        <FilterChip
          key={chip.id}
          label={chip.label}
          onRemove={chip.onRemove}
        />
      ))}
      <ClearAllButton onClick={onClearAll}>
        Clear All
      </ClearAllButton>
    </FilterChipsContainer>
  );
};
```

---

### Filter State Management

```typescript
type FilterState = {
  assetType: string[];
  assetStatus: string[];
  projectId?: string;
  tags: string[];
  dateFrom?: string;
  dateTo?: string;
};

const useFilterState = (initialFilters?: Partial<FilterState>) => {
  const [filters, setFilters] = useState<FilterState>({
    assetType: [],
    assetStatus: [],
    tags: [],
    ...initialFilters
  });
  
  const toggleArrayFilter = (key: keyof FilterState, value: string) => {
    setFilters(prev => {
      const array = prev[key] as string[] || [];
      const newArray = array.includes(value)
        ? array.filter(v => v !== value)
        : [...array, value];
      
      return { ...prev, [key]: newArray };
    });
  };
  
  const setSingleFilter = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const removeFilter = (key: keyof FilterState, value?: string) => {
    if (value) {
      // Remove from array
      setFilters(prev => ({
        ...prev,
        [key]: (prev[key] as string[]).filter(v => v !== value)
      }));
    } else {
      // Remove entire filter
      setFilters(prev => {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      });
    }
  };
  
  const clearAllFilters = () => {
    setFilters({
      assetType: [],
      assetStatus: [],
      tags: []
    });
  };
  
  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(v => 
      Array.isArray(v) ? v.length > 0 : v !== undefined
    );
  }, [filters]);
  
  return {
    filters,
    toggleArrayFilter,
    setSingleFilter,
    removeFilter,
    clearAllFilters,
    hasActiveFilters
  };
};
```

---

## Spell Correction & Suggestions

### Overview

Spell correction suggests alternative queries when searches return poor results.

---

### "Did You Mean?" Feature

```typescript
const SearchWithSpellCorrection = ({ query, results }: Props) => {
  const { data: suggestion } = trpc.search.getSpellingSuggestion.useQuery({
    query,
    currentResultCount: results.length
  }, {
    enabled: results.length < 5  // Only check if few results
  });
  
  if (!suggestion?.data.hasAlternative) {
    return <SearchResults results={results} />;
  }
  
  const alt = suggestion.data.suggestion;
  
  return (
    <>
      <DidYouMeanBanner
        originalQuery={query}
        suggestedQuery={alt.suggestedQuery}
        expectedResults={alt.expectedResultCount}
        onAccept={() => handleSearch(alt.suggestedQuery)}
      />
      <SearchResults results={results} />
    </>
  );
};

const DidYouMeanBanner = ({ 
  originalQuery, 
  suggestedQuery, 
  expectedResults,
  onAccept 
}: Props) => {
  return (
    <Banner variant="info">
      <span>
        Did you mean{' '}
        <SuggestedQuery onClick={onAccept}>
          "{suggestedQuery}"
        </SuggestedQuery>?
      </span>
      <span className="text-sm text-gray-500">
        ({expectedResults} results)
      </span>
    </Banner>
  );
};
```

---

### Auto-Correction Option

```typescript
const SearchWithAutoCorrect = ({ initialQuery }: Props) => {
  const [query, setQuery] = useState(initialQuery);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  
  const { data: results } = trpc.search.search.useQuery({ query });
  
  const { data: suggestion } = trpc.search.getSpellingSuggestion.useQuery({
    query,
    currentResultCount: results?.data.results.length || 0
  }, {
    enabled: !!results && results.data.results.length < 3
  });
  
  useEffect(() => {
    if (suggestion?.data.hasAlternative && suggestion.data.suggestion.confidence > 0.8) {
      // Auto-correct with high confidence
      const corrected = suggestion.data.suggestion.suggestedQuery;
      setCorrectedQuery(query);  // Store original
      setQuery(corrected);       // Use corrected
    }
  }, [suggestion]);
  
  return (
    <>
      {correctedQuery && (
        <CorrectionNotice>
          Showing results for "{query}". 
          <RevertButton onClick={() => setQuery(correctedQuery)}>
            Search instead for "{correctedQuery}"
          </RevertButton>
        </CorrectionNotice>
      )}
      <SearchResults results={results?.data.results} />
    </>
  );
};
```

---

### Multiple Suggestions

```typescript
const AlternativeQueries = ({ query }: Props) => {
  const { data } = trpc.search.getSpellingSuggestion.useQuery({
    query,
    currentResultCount: 0
  });
  
  const alternatives = data?.data.alternatives;
  
  if (!alternatives || alternatives.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <h4>Try these searches instead:</h4>
      <AlternativeList>
        {alternatives.map(alt => (
          <AlternativeItem key={alt.suggestedQuery}>
            <QueryButton onClick={() => handleSearch(alt.suggestedQuery)}>
              {alt.suggestedQuery}
            </QueryButton>
            <ResultCount>{alt.expectedResultCount} results</ResultCount>
            <ConfidenceBadge confidence={alt.confidence} />
          </AlternativeItem>
        ))}
      </AlternativeList>
    </Card>
  );
};
```

---

## Related Content & Recommendations

### Overview

Get recommendations for content related to a specific entity based on various relationship types.

---

### Similar Content

```typescript
const RelatedAssets = ({ assetId }: Props) => {
  const { data } = trpc.search.getRelatedContent.useQuery({
    entityType: 'assets',
    entityId: assetId,
    limit: 6,
    includeTypes: ['similar_content', 'same_category'],
    minRelevanceScore: 0.5
  });
  
  const related = data?.data;
  
  return (
    <Section>
      <h3>Similar Assets</h3>
      <Grid cols={3}>
        {related?.map(item => (
          <RelatedCard
            key={item.id}
            item={item}
            relationshipLabel={formatRelationship(item.relationshipType)}
          />
        ))}
      </Grid>
    </Section>
  );
};

const formatRelationship = (type: RelationshipType): string => {
  const labels = {
    similar_content: 'Similar',
    same_category: 'Same Category',
    same_creator: 'By Same Creator',
    same_project: 'From Same Project',
    collaborative_filtering: 'Recommended',
    frequently_viewed_together: 'Often Viewed Together'
  };
  return labels[type] || 'Related';
};
```

---

### Creator Recommendations

```typescript
const CreatorRecommendations = ({ creatorId }: Props) => {
  const { data } = trpc.search.getRelatedContent.useQuery({
    entityType: 'creators',
    entityId: creatorId,
    limit: 10,
    includeTypes: ['similar_content', 'collaborative_filtering'],
    minRelevanceScore: 0.6
  });
  
  return (
    <RecommendationsSection>
      <h3>Similar Creators</h3>
      <CreatorList>
        {data?.data.map(creator => (
          <CreatorCard key={creator.id}>
            <Avatar src={creator.thumbnailUrl} />
            <CreatorName>{creator.title}</CreatorName>
            <RelationshipBadge>
              {creator.relationshipReason}
            </RelationshipBadge>
            <RelevanceScore>
              Match: {(creator.relevanceScore * 100).toFixed(0)}%
            </RelevanceScore>
          </CreatorCard>
        ))}
      </CreatorList>
    </RecommendationsSection>
  );
};
```

---

### Frequently Viewed Together

```typescript
const FrequentlyViewedTogether = ({ assetId }: Props) => {
  const { data } = trpc.search.getRelatedContent.useQuery({
    entityType: 'assets',
    entityId: assetId,
    includeTypes: ['frequently_viewed_together'],
    limit: 4
  });
  
  if (!data?.data || data.data.length === 0) return null;
  
  return (
    <FrequentlyViewedSection>
      <h4>Frequently Viewed Together</h4>
      <HorizontalScroll>
        {data.data.map(item => (
          <CompactCard key={item.id} item={item} />
        ))}
      </HorizontalScroll>
    </FrequentlyViewedSection>
  );
};
```

---

## Performance Optimization

### Client-Side Caching

```typescript
// React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // Consider data fresh for 5 minutes
      cacheTime: 10 * 60 * 1000,     // Keep in cache for 10 minutes
      refetchOnWindowFocus: false,   // Don't refetch on tab focus
      refetchOnMount: false,         // Don't refetch on component mount
      retry: 1,                      // Retry failed requests once
    },
  },
});

// Prefetch on hover
const SearchResultCard = ({ result }: Props) => {
  const utils = trpc.useContext();
  
  const handleHover = () => {
    // Prefetch detail page data
    utils.assets.getById.prefetch({ id: result.id });
  };
  
  return (
    <Card onMouseEnter={handleHover}>
      {/* ... */}
    </Card>
  );
};
```

---

### Debounced Search

```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const SearchWithDebounce = () => {
  const [inputValue, setInputValue] = useState('');
  const debouncedQuery = useDebouncedValue(inputValue, 300);
  
  const { data, isFetching } = trpc.search.search.useQuery(
    { query: debouncedQuery },
    { 
      enabled: debouncedQuery.length >= 2,
      keepPreviousData: true  // Show old results while loading new
    }
  );
  
  return (
    <>
      <SearchInput 
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        loading={isFetching}
      />
      <SearchResults results={data?.data.results} />
    </>
  );
};

// Hook implementation
export const useDebouncedValue = <T,>(value: T, delay: number): T => {
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
};
```

---

### Request Deduplication

```typescript
// React Query automatically deduplicates identical queries
// Multiple components requesting same data = single network request

const SearchPage = () => {
  const query = useSearchParams().get('q');
  
  // Component 1: Results list
  const { data: results } = trpc.search.search.useQuery({ query });
  
  return (
    <>
      <SearchResults data={results} />
      <SearchSidebar query={query} />  {/* Also uses search data */}
    </>
  );
};

const SearchSidebar = ({ query }: Props) => {
  // Same query = reuses cached data, no duplicate request
  const { data } = trpc.search.search.useQuery({ query });
  
  return (
    <Sidebar>
      <ResultCount>{data?.data.pagination.total}</ResultCount>
      <FacetFilters facets={data?.data.facets} />
    </Sidebar>
  );
};
```

---

### Pagination Prefetching

```typescript
const PaginatedSearch = ({ query, page }: Props) => {
  const utils = trpc.useContext();
  
  const { data } = trpc.search.search.useQuery({
    query,
    page,
    limit: 20
  });
  
  // Prefetch next page
  useEffect(() => {
    if (data?.data.pagination.hasNextPage) {
      utils.search.search.prefetch({
        query,
        page: page + 1,
        limit: 20
      });
    }
  }, [data, query, page]);
  
  return <SearchResults results={data?.data.results} />;
};
```

---

### Infinite Scroll Implementation

```typescript
const InfiniteSearchResults = ({ query }: Props) => {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.search.search.useInfiniteQuery(
    { query, limit: 20 },
    {
      getNextPageParam: (lastPage) => {
        const { page, totalPages } = lastPage.data.pagination;
        return page < totalPages ? page + 1 : undefined;
      },
    }
  );
  
  const { ref: loadMoreRef } = useInView({
    onChange: (inView) => {
      if (inView && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  });
  
  const allResults = data?.pages.flatMap(page => page.data.results) || [];
  
  return (
    <>
      <ResultsList results={allResults} />
      {hasNextPage && (
        <div ref={loadMoreRef}>
          {isFetchingNextPage ? <LoadingSpinner /> : <LoadMoreTrigger />}
        </div>
      )}
    </>
  );
};
```

---

## Real-Time Features

### Search Query Sync

**Sync search state with URL for shareability:**

```typescript
const useSearchState = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const entities = searchParams.getAll('entity') as SearchableEntity[];
  
  const updateSearch = (updates: Partial<SearchState>) => {
    const params = new URLSearchParams(searchParams);
    
    if (updates.query !== undefined) {
      params.set('q', updates.query);
    }
    if (updates.page !== undefined) {
      params.set('page', updates.page.toString());
    }
    if (updates.entities !== undefined) {
      params.delete('entity');
      updates.entities.forEach(e => params.append('entity', e));
    }
    
    router.push(`/search?${params.toString()}`);
  };
  
  return { query, page, entities, updateSearch };
};

// Usage
const SearchPage = () => {
  const { query, page, updateSearch } = useSearchState();
  
  return (
    <SearchInput 
      value={query}
      onChange={(q) => updateSearch({ query: q, page: 1 })}
    />
  );
};
```

---

### Live Search Results

**Show results as user types:**

```typescript
const LiveSearch = () => {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);
  
  const { data, isFetching } = trpc.search.search.useQuery(
    { query: debouncedQuery, limit: 10 },
    { 
      enabled: debouncedQuery.length >= 2,
      keepPreviousData: true 
    }
  );
  
  return (
    <LiveSearchContainer>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search as you type..."
      />
      
      {isFetching && <InlineLoader />}
      
      {data && (
        <LiveResultsDropdown>
          {data.data.results.map(result => (
            <QuickResultItem key={result.id} result={result} />
          ))}
          <ViewAllButton>
            View all {data.data.pagination.total} results
          </ViewAllButton>
        </LiveResultsDropdown>
      )}
    </LiveSearchContainer>
  );
};
```

---

## Advanced UI Patterns

### Search Command Palette

**Keyboard-driven search interface:**

```typescript
const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const { data } = trpc.search.search.useQuery(
    { query, limit: 20 },
    { enabled: open && query.length >= 2 }
  );
  
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput 
        placeholder="Search anything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {data?.data.results.map(result => (
          <CommandItem
            key={result.id}
            onSelect={() => navigateTo(result)}
          >
            <EntityIcon type={result.entityType} />
            <span>{result.title}</span>
            <RelevanceBadge score={result.relevanceScore} />
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
```

---

### Search History Autocomplete

```typescript
const SearchWithHistory = () => {
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  const { data: history } = trpc.search.getRecentSearches.useQuery({
    limit: 10
  });
  
  const { data: suggestions } = trpc.search.getSuggestions.useQuery(
    { query, limit: 5 },
    { enabled: query.length >= 2 }
  );
  
  const showDropdown = showHistory || (query.length >= 2 && suggestions);
  
  return (
    <SearchContainer>
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setShowHistory(true)}
        onBlur={() => setTimeout(() => setShowHistory(false), 200)}
      />
      
      {showDropdown && (
        <Dropdown>
          {query.length < 2 && (
            <HistorySection>
              <SectionTitle>Recent Searches</SectionTitle>
              {history?.data.map(item => (
                <HistoryItem
                  key={item.query}
                  onClick={() => setQuery(item.query)}
                >
                  <ClockIcon />
                  <span>{item.query}</span>
                </HistoryItem>
              ))}
            </HistorySection>
          )}
          
          {query.length >= 2 && suggestions && (
            <SuggestionsSection>
              <SectionTitle>Suggestions</SectionTitle>
              {suggestions.data.map(item => (
                <SuggestionItem
                  key={item.id}
                  onClick={() => navigate(item)}
                >
                  <EntityBadge type={item.entityType} />
                  <span>{item.title}</span>
                </SuggestionItem>
              ))}
            </SuggestionsSection>
          )}
        </Dropdown>
      )}
    </SearchContainer>
  );
};
```

---

### Multi-Step Search Builder

```typescript
const AdvancedSearchBuilder = () => {
  const [step, setStep] = useState<'query' | 'entities' | 'filters'>(query');
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    query: '',
    entities: [],
    filters: {}
  });
  
  const executeSearch = () => {
    router.push({
      pathname: '/search',
      query: {
        q: searchConfig.query,
        entities: searchConfig.entities.join(','),
        filters: JSON.stringify(searchConfig.filters)
      }
    });
  };
  
  return (
    <Wizard>
      {step === 'query' && (
        <QueryStep
          value={searchConfig.query}
          onChange={(q) => setSearchConfig({ ...searchConfig, query: q })}
          onNext={() => setStep('entities')}
        />
      )}
      
      {step === 'entities' && (
        <EntitySelectionStep
          selected={searchConfig.entities}
          onChange={(entities) => setSearchConfig({ ...searchConfig, entities })}
          onNext={() => setStep('filters')}
          onBack={() => setStep('query')}
        />
      )}
      
      {step === 'filters' && (
        <FilterBuilderStep
          filters={searchConfig.filters}
          onChange={(filters) => setSearchConfig({ ...searchConfig, filters })}
          onBack={() => setStep('entities')}
          onExecute={executeSearch}
        />
      )}
    </Wizard>
  );
};
```

---

## Performance Checklist

### Backend Performance

- ✅ Database indexes implemented
- ✅ Query optimization applied
- ✅ Result caching enabled
- ✅ Connection pooling configured
- ✅ Execution time tracking active

### Frontend Performance

- [ ] Implement request debouncing (300ms)
- [ ] Enable React Query caching (5-10 min)
- [ ] Prefetch on hover/scroll
- [ ] Use keepPreviousData for pagination
- [ ] Implement virtual scrolling for large lists
- [ ] Lazy load images/thumbnails
- [ ] Code split search components
- [ ] Monitor bundle size

### UX Performance

- [ ] Show loading states immediately
- [ ] Keep previous results while loading
- [ ] Show skeleton loaders
- [ ] Display result count early
- [ ] Enable keyboard shortcuts
- [ ] Implement infinite scroll option
- [ ] Add "Back to top" button
- [ ] Save scroll position on navigation

---

## Next Steps

- **Review:** [Search Infrastructure - API Reference](./SEARCH_INFRASTRUCTURE_API.md)
- **Implementation:** [Search Infrastructure - Implementation Guide](./SEARCH_INFRASTRUCTURE_IMPLEMENTATION.md)
- **Backend Docs:** `/docs/SEARCH_SERVICE_IMPLEMENTATION_COMPLETE.md`

---

## Support

For questions or issues:
- Backend Team: [contact info]
- Documentation: `/docs/` directory
- API Playground: `https://ops.yesgoddess.agency/api/playground`
