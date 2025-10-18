# Advanced Search Features Implementation

## Overview

This document describes the advanced search features that have been implemented in the YesGoddess backend search system. These features enhance the search experience for admin and internal staff with intelligent suggestions, faceted filtering, spell correction, and content recommendations.

## Features Implemented

### 1. Enhanced Faceted Search with Dynamic Counts

**Purpose**: Provides real-time filter options with result counts, allowing users to refine searches intelligently.

**Implementation**:
- **Service**: `SearchService.getEnhancedFacets()`
- **Endpoint**: `search.getEnhancedFacets`
- **File**: `src/modules/search/services/search.service.ts`

**Features**:
- Counts available results for each filter option
- Shows counts contextually based on other applied filters
- Supports multiple facet types:
  - Asset Type (checkbox multi-select)
  - Asset Status (checkbox multi-select)
  - Creator Verification Status (checkbox multi-select)
  - Project Type (checkbox multi-select)
  - License Type (checkbox multi-select)
- Real-time count updates as filters are applied
- Indicates which filters are currently active

**Usage Example**:
```typescript
const facets = await trpc.search.getEnhancedFacets.query({
  query: 'logo design',
  entities: ['assets', 'creators'],
  filters: {
    assetType: ['IMAGE'],
  },
});

// Response structure:
{
  success: true,
  data: {
    groups: [
      {
        field: 'assetType',
        label: 'Asset Type',
        type: 'checkbox',
        options: [
          { value: 'IMAGE', label: 'IMAGE', count: 42, isSelected: true },
          { value: 'VIDEO', label: 'VIDEO', count: 15, isSelected: false },
        ]
      }
    ],
    appliedFilters: {
      assetType: ['IMAGE']
    },
    totalResults: 200,
    filteredResults: 42
  }
}
```

**Key Components**:
- `EnhancedSearchFacets`: Main response type
- `FacetGroup`: Groups related filter options
- `FacetOption`: Individual filter option with count

### 2. Spell Correction ("Did You Mean")

**Purpose**: Suggests corrected queries when searches yield few or no results, improving user experience and reducing zero-result frustration.

**Implementation**:
- **Service**: `SpellCorrectionService`
- **Endpoint**: `search.getSpellingSuggestion`
- **File**: `src/modules/search/services/spell-correction.service.ts`

**Algorithm**:
1. **Levenshtein Distance Calculation**: Measures string similarity
2. **Corpus Building**: Analyzes searchable content (titles, descriptions, creator names)
3. **Frequency Analysis**: Weights words by occurrence
4. **Confidence Scoring**: Combines similarity and frequency
5. **Result Estimation**: Predicts how many results the suggestion would return

**Features**:
- Automatic corpus updates (hourly)
- Includes successful search queries in corpus
- Only suggests when current results are low (< 5 results)
- Suggests only when confidence is high
- Provides multiple alternative suggestions
- Calculates expected result counts

**Usage Example**:
```typescript
const suggestion = await trpc.search.getSpellingSuggestion.query({
  query: 'loge desing',  // misspelled
  currentResultCount: 0,
});

// Response:
{
  success: true,
  data: {
    hasAlternative: true,
    suggestion: {
      originalQuery: 'loge desing',
      suggestedQuery: 'logo design',
      confidence: 0.85,
      expectedResultCount: 42,
      distance: 2
    },
    alternatives: [
      // Additional suggestions if available
    ]
  }
}
```

**Configuration**:
- Minimum similarity threshold: 0.7
- Corpus update interval: 1 hour
- Maximum corpus size: 5000 assets, 2000 creators, 2000 projects
- Result improvement factor: 2x (only suggest if new query has 2x more results)

### 3. Related Content Recommendations

**Purpose**: Suggests related content based on the item being viewed, increasing discovery and engagement.

**Implementation**:
- **Service**: `RecommendationsService`
- **Endpoint**: `search.getRelatedContent`
- **File**: `src/modules/search/services/recommendations.service.ts`

**Recommendation Strategies**:

#### Content-Based Filtering
- **Similar Type**: Items of the same type (e.g., same asset type)
- **Same Category**: Items in the same category or classification
- **Same Creator**: Other works by the same creator
- **Same Project**: Other items from the same project

#### Relationship Types
- `similar_content`: Items with similar attributes
- `same_category`: Items in the same classification
- `same_creator`: Items by the same creator
- `same_project`: Items from the same project
- `collaborative_filtering`: Based on user behavior patterns (future)
- `frequently_viewed_together`: Co-occurrence patterns (future)

**Usage Example**:
```typescript
const related = await trpc.search.getRelatedContent.query({
  entityType: 'assets',
  entityId: 'asset_id_here',
  limit: 10,
  includeTypes: ['similar_content', 'same_creator'],
  minRelevanceScore: 0.5,
});

// Response:
{
  success: true,
  data: [
    {
      id: 'related_asset_id',
      entityType: 'assets',
      title: 'Similar Logo Design',
      description: '...',
      thumbnailUrl: '...',
      relevanceScore: 0.85,
      relationshipType: 'similar_content',
      relationshipReason: 'Similar asset type: IMAGE',
      metadata: { /* Asset metadata */ }
    }
  ]
}
```

**Relevance Scoring**:
- Same project: 0.9
- Same creator: 0.75
- Similar type: 0.8
- Same category: 0.6-0.85

### 4. Saved Search Enhancements

**Purpose**: Allow users to save frequently used searches and execute them quickly.

**Implementation**:
- **Model**: `SavedSearch` (Prisma model)
- **Endpoints**: 
  - `search.saveSearch` - Create new saved search
  - `search.getSavedSearches` - List user's saved searches
  - `search.updateSavedSearch` - Update existing saved search
  - `search.executeSavedSearch` - Run a saved search
  - `search.deleteSavedSearch` - Remove saved search

**Features Already Implemented**:
- ✅ Save search with custom name
- ✅ Store query, entities, and filters
- ✅ List all user's saved searches
- ✅ Execute saved search with one click
- ✅ Delete saved searches
- ✅ Ownership verification

**New Enhancement**:
- ✅ Update saved search parameters
- ✅ Execute with pagination support

**Usage Example**:
```typescript
// Save a search
const saved = await trpc.search.saveSearch.mutate({
  name: 'My Logo Searches',
  query: 'logo',
  entities: ['assets'],
  filters: { assetType: ['IMAGE'] },
});

// Execute saved search later
const results = await trpc.search.executeSavedSearch.query({
  id: saved.data.id,
  page: 1,
  limit: 20,
});

// Update saved search
await trpc.search.updateSavedSearch.mutate({
  id: saved.data.id,
  name: 'Updated Search Name',
  filters: { assetType: ['IMAGE', 'VIDEO'] },
});
```

## API Reference

### Enhanced Faceted Search

```typescript
search.getEnhancedFacets({
  query: string,              // Search query (optional)
  entities?: SearchableEntity[],  // Entity types to include
  filters?: SearchFilters,    // Current filters
})
```

### Spell Correction

```typescript
search.getSpellingSuggestion({
  query: string,              // Query to check
  currentResultCount: number, // Current number of results
})
```

### Related Content

```typescript
search.getRelatedContent({
  entityType: SearchableEntity,  // Type of source entity
  entityId: string,              // ID of source entity
  limit?: number,                // Max results (default: 10)
  includeTypes?: RelationshipType[], // Types to include
  excludeIds?: string[],         // IDs to exclude
  minRelevanceScore?: number,    // Min score (default: 0.3)
})
```

### Update Saved Search

```typescript
search.updateSavedSearch({
  id: string,                 // Saved search ID
  name?: string,              // New name (optional)
  query?: string,             // New query (optional)
  entities?: SearchableEntity[], // New entities (optional)
  filters?: SearchFilters,    // New filters (optional)
})
```

### Execute Saved Search

```typescript
search.executeSavedSearch({
  id: string,                 // Saved search ID
  page?: number,              // Page number (default: 1)
  limit?: number,             // Results per page (default: 20)
})
```

## Database Schema

### Existing Tables

#### SearchAnalyticsEvent
```sql
CREATE TABLE "search_analytics_events" (
  "id" TEXT PRIMARY KEY,
  "query" TEXT NOT NULL,
  "entities" JSONB DEFAULT '[]',
  "filters" JSONB,
  "results_count" INTEGER DEFAULT 0,
  "execution_time_ms" INTEGER NOT NULL,
  "user_id" TEXT,
  "session_id" TEXT,
  "clicked_result_id" TEXT,
  "clicked_result_position" INTEGER,
  "clicked_result_entity_type" TEXT,
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "search_analytics_events_query_idx" ON "search_analytics_events"("query");
CREATE INDEX "search_analytics_events_user_id_idx" ON "search_analytics_events"("user_id");
CREATE INDEX "search_analytics_events_created_at_idx" ON "search_analytics_events"("created_at");
```

#### SavedSearch
```sql
CREATE TABLE "saved_searches" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "search_query" VARCHAR(200) NOT NULL,
  "entities" JSONB DEFAULT '[]',
  "filters" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches"("user_id");
CREATE INDEX "saved_searches_created_at_idx" ON "saved_searches"("created_at");
```

## Performance Considerations

### Spell Correction Corpus
- **Update Frequency**: Hourly automatic updates
- **Memory Usage**: Approximately 10-50MB for 10k unique words
- **Cache Strategy**: In-memory word frequency map
- **Update Strategy**: Non-blocking background updates

### Faceted Search
- **Database Impact**: Multiple GROUP BY queries per request
- **Optimization**: Queries run in parallel
- **Caching Strategy**: Consider Redis cache for popular queries
- **Index Requirements**: Ensure proper indexes on filter fields

### Recommendations
- **Query Complexity**: Multiple database queries per recommendation type
- **Optimization**: Parallel execution of recommendation strategies
- **Limit Recommendations**: Default limit of 10 to control query load
- **Caching**: Consider caching recommendations for popular items

## Integration Guidelines

### Frontend Integration

1. **Faceted Search UI**:
   - Display facet groups as filter panels
   - Show counts next to each option
   - Update counts on filter changes
   - Indicate active filters clearly

2. **Spell Correction**:
   - Display suggestion above results
   - Make suggestion clickable
   - Show expected result count
   - Provide option to search original query

3. **Related Content**:
   - Display in sidebar or below main content
   - Show relationship type/reason
   - Include thumbnails when available
   - Allow clicking to navigate to related item

4. **Saved Searches**:
   - Provide dropdown/list of saved searches
   - Show search name and parameter summary
   - Quick execute button
   - Edit and delete options

## Testing

### Manual Testing

```bash
# Test spell correction
curl -X POST https://api.example.com/trpc/search.getSpellingSuggestion \
  -H "Content-Type: application/json" \
  -d '{"query": "loge", "currentResultCount": 0}'

# Test faceted search
curl -X POST https://api.example.com/trpc/search.getEnhancedFacets \
  -H "Content-Type: application/json" \
  -d '{"query": "logo", "entities": ["assets"]}'

# Test recommendations
curl -X POST https://api.example.com/trpc/search.getRelatedContent \
  -H "Content-Type: application/json" \
  -d '{"entityType": "assets", "entityId": "clxyz123", "limit": 5}'
```

### Integration Tests

Test files should verify:
- Spell correction accuracy
- Facet count correctness
- Recommendation relevance
- Saved search persistence
- Permission enforcement

## Monitoring

### Key Metrics

1. **Spell Correction**:
   - Suggestion acceptance rate
   - Corpus size over time
   - Average confidence scores

2. **Faceted Search**:
   - Average facets displayed
   - Filter usage frequency
   - Query performance (< 200ms target)

3. **Recommendations**:
   - Click-through rate on recommendations
   - Average relevance scores
   - Query performance (< 150ms target)

4. **Saved Searches**:
   - Number of saved searches per user
   - Execution frequency
   - Most popular saved queries

## Future Enhancements

1. **Collaborative Filtering**:
   - Track user interactions
   - Build user similarity models
   - Recommend based on similar users

2. **Machine Learning**:
   - Neural spell correction
   - Deep learning for recommendations
   - Personalized ranking

3. **Advanced Facets**:
   - Date range sliders
   - Numeric range filters
   - Hierarchical facets

4. **Saved Search Notifications**:
   - Alert users when new results match saved searches
   - Scheduled search execution
   - Email/in-app notifications

## Support

For issues or questions:
- Check existing search documentation
- Review API error responses
- Check server logs for detailed errors
- Verify database indexes are in place

## Changelog

### Version 1.0.0 (October 2025)
- ✅ Enhanced faceted search with dynamic counts
- ✅ Spell correction with Levenshtein distance
- ✅ Content-based recommendations
- ✅ Saved search updates and execution
- ✅ Comprehensive TypeScript types
- ✅ Full tRPC API integration
