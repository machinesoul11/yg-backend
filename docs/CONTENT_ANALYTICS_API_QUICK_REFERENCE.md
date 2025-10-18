# Content Analytics API - Quick Reference

## Endpoints

### Asset Analytics
```
GET /api/analytics/platform/assets
```
**Required Params**: `startDate`, `endDate`  
**Optional Params**: `granularity`, `assetType`, `projectId`, `status`  
**Returns**: Upload trends, popular types, storage metrics

### License Analytics
```
GET /api/analytics/platform/licenses
```
**Required Params**: `startDate`, `endDate`  
**Optional Params**: `granularity`, `licenseType`, `brandId`, `projectId`  
**Returns**: Active counts, renewal rates, expiration forecasts, revenue metrics

### Project Analytics
```
GET /api/analytics/platform/projects
```
**Required Params**: `startDate`, `endDate`  
**Optional Params**: `granularity`, `projectType`, `brandId`, `status`  
**Returns**: Completion rates, timeline metrics, budget utilization

## Quick Test Commands

### Test Assets Endpoint
```bash
curl -X GET "http://localhost:3000/api/analytics/platform/assets?startDate=2024-09-01&endDate=2024-10-17&granularity=weekly" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### Test Licenses Endpoint
```bash
curl -X GET "http://localhost:3000/api/analytics/platform/licenses?startDate=2024-09-01&endDate=2024-10-17&granularity=monthly" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

### Test Projects Endpoint
```bash
curl -X GET "http://localhost:3000/api/analytics/platform/projects?startDate=2024-09-01&endDate=2024-10-17&granularity=weekly" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN"
```

## Key Features

✅ **Admin-Only Access**: All endpoints require ADMIN role  
✅ **Caching**: 10-minute Redis cache with automatic invalidation  
✅ **Date Validation**: Prevents future dates, enforces 2-year max range  
✅ **Performance**: Optimized queries with indexes and parallel execution  
✅ **Filtering**: Supports type, status, brand, and project filters  
✅ **Granularity**: Daily, weekly, or monthly time buckets  

## Service Files

- `src/modules/analytics/services/platform-assets-analytics.service.ts`
- `src/modules/analytics/services/platform-licenses-analytics.service.ts`
- `src/modules/analytics/services/platform-projects-analytics.service.ts`

## API Routes

- `src/app/api/analytics/platform/assets/route.ts`
- `src/app/api/analytics/platform/licenses/route.ts`
- `src/app/api/analytics/platform/projects/route.ts`

## Common Errors

### 401 Unauthorized
- Missing or invalid JWT token
- User not authenticated

### 403 Forbidden
- User does not have ADMIN role
- Account is soft-deleted or inactive

### 400 Bad Request
- Invalid date format (must be YYYY-MM-DD)
- Start date after end date
- Date range exceeds 730 days
- End date in the future
- Invalid enum values for filters

## Cache Management

**Cache Keys Pattern**:
- Assets: `analytics:platform:assets:{start}:{end}:{granularity}:{filters}`
- Licenses: `analytics:platform:licenses:{start}:{end}:{granularity}:{filters}`
- Projects: `analytics:platform:projects:{start}:{end}:{granularity}:{filters}`

**Cache TTL**: 600 seconds (10 minutes)

**Manual Invalidation**:
```typescript
import { PlatformAssetsAnalyticsService } from '@/modules/analytics';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

const service = new PlatformAssetsAnalyticsService(prisma, redis);
await service.invalidateCache(); // Clears all asset analytics cache
```

## Response Metadata

All responses include:
```json
{
  "metadata": {
    "cached": boolean,          // True if served from cache
    "cacheTimestamp": string,   // When cache was written (ISO 8601)
    "queryExecutionTimeMs": number  // Query execution time in milliseconds
  }
}
```

## Integration Checklist

- [ ] Verify ADMIN user exists in database
- [ ] Generate valid JWT token with admin role
- [ ] Test each endpoint with sample date ranges
- [ ] Verify cache is working (check Redis)
- [ ] Test with various filters
- [ ] Validate error responses
- [ ] Check query performance with EXPLAIN ANALYZE
- [ ] Set up monitoring alerts for slow queries
- [ ] Document endpoint usage for frontend team
- [ ] Create dashboard visualizations

## Database Requirements

**Required Tables**:
- `ip_assets` (with indexes on created_at, type, status)
- `licenses` (with indexes on created_at, end_date, status)
- `projects` (with indexes on created_at, updated_at, status)
- `daily_metrics` (optional, for performance)

**Required Indexes**:
```sql
CREATE INDEX idx_ip_assets_created_at ON ip_assets(created_at);
CREATE INDEX idx_ip_assets_type_status ON ip_assets(type, status);
CREATE INDEX idx_licenses_created_at ON licenses(created_at);
CREATE INDEX idx_licenses_end_date ON licenses(end_date);
CREATE INDEX idx_projects_created_at ON projects(created_at);
CREATE INDEX idx_projects_updated_at ON projects(updated_at);
```

## Performance Benchmarks

**Expected Response Times** (without cache):
- Assets: 100-300ms for 30-day range
- Licenses: 150-400ms for 30-day range
- Projects: 200-500ms for 30-day range

**With Cache**:
- All endpoints: < 50ms

**Cache Hit Rate Target**: > 80%

## Monitoring Queries

### Check Cache Performance
```bash
redis-cli INFO stats | grep keyspace_hits
redis-cli INFO stats | grep keyspace_misses
redis-cli KEYS "analytics:platform:*" | wc -l
```

### Check Query Performance
```sql
-- Find slow analytics queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%ip_assets%' OR query LIKE '%licenses%' OR query LIKE '%projects%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## Support

For issues or questions:
1. Check logs: `src/app/api/analytics/platform/*/route.ts`
2. Verify authentication: `src/lib/middleware/auth.middleware.ts`
3. Review service logic: `src/modules/analytics/services/platform-*-analytics.service.ts`
4. Check documentation: `docs/CONTENT_ANALYTICS_API_IMPLEMENTATION.md`
