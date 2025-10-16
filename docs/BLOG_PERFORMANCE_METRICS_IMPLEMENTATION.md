# Blog Performance Metrics Implementation

This document outlines the implementation of the Performance Metrics system for blog posts as specified in the backend development roadmap.

## Overview

The Performance Metrics system tracks and analyzes blog post performance across five key metrics:

1. **Average read time per post** - Time users spend actively engaging with content
2. **Bounce rate by post** - Percentage of single-page sessions with minimal engagement
3. **Social share tracking** - Number of shares across different platforms
4. **Email capture rate per post** - Conversion rate for email subscriptions
5. **Post performance dashboard** - Comprehensive analytics interface

## Architecture

### Database Schema

The system extends the existing blog infrastructure with additional tracking capabilities:

#### Posts Table Extensions
- `avg_read_time_seconds` - Calculated average engagement time
- `bounce_rate` - Calculated bounce percentage  
- `social_shares_count` - Total social media shares
- `email_capture_count` - Total email captures
- `email_capture_rate` - Email conversion percentage
- `unique_visitors` - Count of unique sessions

#### New Tables
- `post_social_shares` - Platform-specific share tracking
- Enhanced `post_daily_metrics` - Daily performance aggregations

### Event Tracking System

The system leverages the existing events infrastructure with new event types:

#### Performance Event Types
- `post_viewed` - Page view tracking
- `post_engagement_time` - Active engagement duration
- `post_scroll_depth` - Content consumption milestones
- `post_social_share_clicked` - Social sharing actions
- `post_email_capture` - Email subscription events
- `post_session_start/end` - Session boundary tracking
- `post_bounce` - Bounce detection
- `post_read_complete` - Full content consumption

## API Endpoints

### Analytics Performance API
```
GET /api/blog/analytics/performance
```
Returns paginated performance metrics for all posts with filtering and sorting options.

**Query Parameters:**
- `sortBy` - Sort field (views, readTime, bounceRate, etc.)
- `order` - Sort direction (asc, desc)
- `limit` - Results per page (default: 20)
- `offset` - Pagination offset
- `dateRange` - Filter by date range (start,end)
- `categoryId` - Filter by category
- `authorId` - Filter by author

### Individual Post Analytics
```
GET /api/admin/blog/posts/[id]/analytics
```
Returns detailed analytics for a specific post including:
- Complete performance metrics
- Social share breakdown by platform
- Referrer source analysis
- Daily trend data
- Engagement patterns

### Dashboard API
```
GET /api/blog/analytics/dashboard
```
Returns comprehensive dashboard data including:
- Overview statistics
- Top performing posts
- Recent posts performance
- Author and category breakdowns
- Month-over-month comparisons
- Growth trends

### Event Tracking API
```
POST /api/blog/analytics/track
```
Accepts client-side analytics events for real-time tracking.

**Event Structure:**
```json
{
  "eventType": "post_viewed",
  "postId": "post-id",
  "sessionId": "session-id",
  "userId": "user-id", // optional
  "eventData": {
    "engagementTimeSeconds": 120,
    "scrollDepthPercentage": 75
  },
  "attribution": {
    "referrer": "https://google.com",
    "utmSource": "google",
    "deviceType": "desktop"
  }
}
```

### Aggregation Job API
```
POST /api/blog/analytics/aggregate
```
Manually triggers metrics calculation (admin only).

**Parameters:**
- `type` - Aggregation type (full, daily)
- `date` - Target date for daily aggregation

## Services

### BlogAnalyticsService
Handles metrics calculation and caching:
- `calculatePostMetrics(postId)` - Calculate all metrics for a post
- `getPostAnalyticsDetail(postId)` - Get detailed analytics
- `getBlogPerformanceDashboard()` - Generate dashboard data

### BlogEventTrackingService  
Manages event ingestion and processing:
- `trackPostView(eventData)` - Record page views
- `trackEngagement(eventData)` - Track engagement time
- `trackSocialShare(eventData)` - Record social shares
- `trackEmailCapture(eventData)` - Track email conversions

### BlogAnalyticsAggregationService
Processes raw events into performance metrics:
- `runFullAggregation()` - Calculate metrics for all posts
- `aggregatePostMetrics(postId)` - Process single post
- `aggregateDailyMetrics(date)` - Generate daily rollups

## Metrics Calculation

### Average Read Time
Calculated from `post_engagement_time` events, filtering outliers (< 1 second or > 30 minutes).

### Bounce Rate
Determined by sessions with:
- Duration ≤ 15 seconds
- No engagement events (scroll, share, email capture)
- Single page view

### Social Share Tracking
Aggregated from `post_social_share_clicked` events, broken down by platform.

### Email Capture Rate
Percentage of unique visitors who submitted email addresses:
```
Email Capture Rate = (Email Captures / Unique Visitors) × 100
```

## Client-Side Integration

The system supports client-side event tracking via the tracking API. Example implementation:

```javascript
// Track page view
fetch('/api/blog/analytics/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventType: 'post_viewed',
    postId: 'post-123',
    sessionId: getSessionId(),
    attribution: {
      referrer: document.referrer,
      deviceType: getDeviceType()
    }
  })
});

// Track scroll milestone
function trackScrollDepth(percentage) {
  fetch('/api/blog/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'post_scroll_depth',
      postId: getCurrentPostId(),
      sessionId: getSessionId(),
      eventData: {
        depthPercentage: percentage,
        timeToReachMs: Date.now() - pageLoadTime
      }
    })
  });
}
```

## Performance Considerations

### Caching Strategy
- Post metrics cached for 5 minutes
- Dashboard data cached for 10 minutes  
- Daily metrics cached for 24 hours
- Redis used for all caching

### Database Optimization
- Indexed fields for performance queries
- Event data retention policies
- Aggregated daily metrics to reduce query load
- Background jobs for metric calculation

### Scalability
- Event ingestion via queue system
- Batch processing for aggregations
- Read replicas for analytics queries
- Incremental metric updates

## Testing

### Test Data Generation
Use the provided script to generate sample analytics data:

```bash
node scripts/generate-blog-analytics-test-data.js
```

This creates realistic event data for testing the analytics system.

### Manual Testing
1. Create test blog posts
2. Generate sample events using the script
3. Run aggregation job: `POST /api/blog/analytics/aggregate?type=full`
4. Verify metrics via dashboard API

## Monitoring

### Key Metrics to Monitor
- Event ingestion rate and success rate
- Aggregation job performance and failures
- API response times for analytics endpoints
- Cache hit rates and memory usage

### Alerts
- Failed aggregation jobs
- High API error rates
- Unusual event volumes
- Cache performance issues

## Future Enhancements

### Planned Features
- Real-time analytics dashboard
- A/B testing integration
- Content recommendation engine
- Advanced segmentation and cohort analysis
- Export functionality for reports

### Technical Improvements
- Stream processing for real-time metrics
- Machine learning for bounce prediction
- Advanced attribution modeling
- Performance optimization for large datasets

## Maintenance

### Regular Tasks
- Run daily aggregation jobs
- Monitor event data quality
- Clean up old events (90-day retention)
- Review and optimize slow queries
- Update cache strategies as needed

### Troubleshooting
- Check event ingestion for missing data
- Verify aggregation job execution
- Monitor database performance
- Validate cache consistency
- Review API error logs

This implementation provides a comprehensive foundation for blog performance tracking while maintaining flexibility for future enhancements and scale.
