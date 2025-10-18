/**
 * Analytics Module Exports
 * Centralizes all analytics-related functionality
 */

// Services
export { EventService } from './services/event.service';
export { EventIngestionService } from './services/event-ingestion.service';
export { EventEnrichmentService } from './services/event-enrichment.service';
export { EventDeduplicationService } from './services/event-deduplication.service';
export { PostAnalyticsService } from './services/post-analytics.service';
export { PostExperimentService } from './services/post-experiment.service';
export { MetricsAggregationService } from './services/metrics-aggregation.service';
export { WeeklyMetricsRollupService } from './services/weekly-metrics-rollup.service';
export { MonthlyMetricsRollupService } from './services/monthly-metrics-rollup.service';
export { RealtimeMetricsService } from './services/realtime-metrics.service';
export { MetricsCacheService } from './services/metrics-cache.service';
export { CustomMetricsService } from './services/custom-metrics.service';
export { AnalyticsDashboardService } from './services/analytics-dashboard.service';
export { PlatformAnalyticsService } from './services/platform-analytics.service';
export { RevenueAnalyticsService } from './services/revenue-analytics.service';
export { PlatformAssetsAnalyticsService } from './services/platform-assets-analytics.service';
export { PlatformLicensesAnalyticsService } from './services/platform-licenses-analytics.service';
export { PlatformProjectsAnalyticsService } from './services/platform-projects-analytics.service';

// Routers
export { eventIngestionRouter } from './routers/event-ingestion.router';
export { postAnalyticsRouter } from './routers/post-analytics.router';
export { platformAnalyticsRouter } from './routers/platform-analytics.router';

// Types
export type * from './types';

// Utilities
export * from './utils/event-tracking-helpers';
