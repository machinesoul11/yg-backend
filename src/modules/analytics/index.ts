/**
 * Analytics Module Exports
 * Centralized exports for analytics services, routers, and types
 */

// Services
export { EventService } from './services/event.service';
export { AnalyticsDashboardService } from './services/analytics-dashboard.service';
export { MetricsAggregationService } from './services/metrics-aggregation.service';
export { PostAnalyticsService } from './services/post-analytics.service';
export { PostExperimentService } from './services/post-experiment.service';

// Routers
export { postAnalyticsRouter } from './routers/post-analytics.router';

// Types
export type * from './types';

// Module interface for future extensibility
export interface AnalyticsModuleTypes {
  PostAnalytics: typeof PostAnalyticsService;
  PostExperiments: typeof PostExperimentService;
}
