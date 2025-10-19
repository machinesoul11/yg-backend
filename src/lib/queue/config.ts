/**
 * Background Jobs Queue Configuration
 * 
 * Centralized configuration for worker concurrency, priority queues,
 * rate limits, memory limits, timeouts, and scaling strategies.
 */

// ============================================================================
// Worker Concurrency Configuration
// ============================================================================

export const WORKER_CONCURRENCY = {
  // Critical - User-facing operations
  NOTIFICATION_DELIVERY: parseInt(process.env.WORKER_CONCURRENCY_NOTIFICATION || '10'),
  PASSWORD_RESET: parseInt(process.env.WORKER_CONCURRENCY_PASSWORD_RESET || '10'),
  PAYMENT_PROCESSING: parseInt(process.env.WORKER_CONCURRENCY_PAYMENT || '5'),
  
  // High Priority - Time-sensitive operations
  EMAIL_DELIVERY: parseInt(process.env.WORKER_CONCURRENCY_EMAIL || '15'),
  EMAIL_RETRY: parseInt(process.env.WORKER_CONCURRENCY_EMAIL_RETRY || '8'),
  NOTIFICATION_DIGEST: parseInt(process.env.WORKER_CONCURRENCY_DIGEST || '5'),
  SEARCH_INDEX_UPDATE: parseInt(process.env.WORKER_CONCURRENCY_SEARCH || '20'),
  
  // Normal Priority - Regular operations
  EMAIL_CAMPAIGN: parseInt(process.env.WORKER_CONCURRENCY_EMAIL_CAMPAIGN || '10'),
  TAX_DOCUMENT_GENERATION: parseInt(process.env.WORKER_CONCURRENCY_TAX_DOC || '5'),
  TAX_FORM_PROCESSING: parseInt(process.env.WORKER_CONCURRENCY_TAX_FORM || '3'),
  ASSET_PROCESSING: parseInt(process.env.WORKER_CONCURRENCY_ASSET || '8'),
  ANALYTICS_AGGREGATION: parseInt(process.env.WORKER_CONCURRENCY_ANALYTICS || '5'),
  
  // Low Priority - Background tasks
  CACHE_MAINTENANCE: parseInt(process.env.WORKER_CONCURRENCY_CACHE || '2'),
  SEARCH_INDEX_BULK: parseInt(process.env.WORKER_CONCURRENCY_SEARCH_BULK || '5'),
  METRICS_ROLLUP: parseInt(process.env.WORKER_CONCURRENCY_METRICS || '2'),
  
  // Background - Cleanup and maintenance
  SESSION_CLEANUP: parseInt(process.env.WORKER_CONCURRENCY_CLEANUP || '1'),
  TOKEN_CLEANUP: parseInt(process.env.WORKER_CONCURRENCY_TOKEN_CLEANUP || '1'),
  ASSET_CLEANUP: parseInt(process.env.WORKER_CONCURRENCY_ASSET_CLEANUP || '2'),
  UPLOAD_CLEANUP: parseInt(process.env.WORKER_CONCURRENCY_UPLOAD_CLEANUP || '2'),
  SEARCH_REINDEX: parseInt(process.env.WORKER_CONCURRENCY_REINDEX || '1'),
  
  // Message/Communication
  MESSAGE_DELIVERY: parseInt(process.env.WORKER_CONCURRENCY_MESSAGE || '8'),
  
  // License Management
  LICENSE_MANAGEMENT: parseInt(process.env.WORKER_CONCURRENCY_LICENSE || '3'),
  LICENSE_EXPIRY_CHECK: parseInt(process.env.WORKER_CONCURRENCY_LICENSE_EXPIRY || '2'),
  
  // Payout Processing
  PAYOUT_PROCESSING: parseInt(process.env.WORKER_CONCURRENCY_PAYOUT || '3'),
  ROYALTY_CALCULATION: parseInt(process.env.WORKER_CONCURRENCY_ROYALTY || '5'),
} as const;

// ============================================================================
// Priority Queue Configuration
// ============================================================================

export enum JobPriority {
  CRITICAL = 1,    // User-facing, must complete quickly
  HIGH = 3,        // Time-sensitive operations
  NORMAL = 5,      // Regular background jobs
  LOW = 7,         // Can be delayed during peak load
  BACKGROUND = 10, // Maintenance tasks, lowest priority
}

export const QUEUE_PRIORITIES = {
  // Critical (1-2)
  'password-reset': JobPriority.CRITICAL,
  'payment-processing': JobPriority.CRITICAL,
  'notification-delivery': JobPriority.CRITICAL,
  
  // High (3-4)
  'scheduled-emails': JobPriority.HIGH,
  'email-retry': JobPriority.HIGH,
  'search-index-realtime': JobPriority.HIGH,
  'notification-digest': JobPriority.HIGH,
  'tax-document-generation': JobPriority.HIGH,
  
  // Normal (5-6)
  'email-campaigns': JobPriority.NORMAL,
  'asset-processing': JobPriority.NORMAL,
  'analytics-events': JobPriority.NORMAL,
  'tax-form-processing': JobPriority.NORMAL,
  'message-delivery': JobPriority.NORMAL,
  'license-management': JobPriority.NORMAL,
  'payout-processing': JobPriority.NORMAL,
  
  // Low (7-9)
  'cache-maintenance': JobPriority.LOW,
  'search-index-bulk': JobPriority.LOW,
  'metrics-rollup': JobPriority.LOW,
  'scheduled-blog-publishing': JobPriority.LOW,
  'deliverability-monitoring': JobPriority.LOW,
  'royalty-calculation': JobPriority.LOW,
  
  // Background (10+)
  'session-cleanup': JobPriority.BACKGROUND,
  'token-cleanup': JobPriority.BACKGROUND,
  'asset-cleanup': JobPriority.BACKGROUND,
  'upload-cleanup': JobPriority.BACKGROUND,
  'search-reindex': JobPriority.BACKGROUND,
  'event-deduplication': JobPriority.BACKGROUND,
} as const;

// ============================================================================
// Rate Limiting Configuration
// ============================================================================

export const RATE_LIMITS = {
  // Email sending rate limits (per minute)
  EMAIL_SENDING: {
    perMinute: parseInt(process.env.RATE_LIMIT_EMAIL_PER_MINUTE || '300'),
    perHour: parseInt(process.env.RATE_LIMIT_EMAIL_PER_HOUR || '10000'),
    perDay: parseInt(process.env.RATE_LIMIT_EMAIL_PER_DAY || '100000'),
  },
  
  // Email campaign rate limits (per minute)
  EMAIL_CAMPAIGN: {
    perMinute: parseInt(process.env.RATE_LIMIT_CAMPAIGN_PER_MINUTE || '100'),
    perHour: parseInt(process.env.RATE_LIMIT_CAMPAIGN_PER_HOUR || '5000'),
  },
  
  // External API rate limits
  STRIPE_API: {
    perSecond: parseInt(process.env.RATE_LIMIT_STRIPE_PER_SECOND || '100'),
    perHour: parseInt(process.env.RATE_LIMIT_STRIPE_PER_HOUR || '100000'),
  },
  
  RESEND_API: {
    perSecond: parseInt(process.env.RATE_LIMIT_RESEND_PER_SECOND || '10'),
    perHour: parseInt(process.env.RATE_LIMIT_RESEND_PER_HOUR || '3000'),
  },
  
  // Database operations rate limits
  DATABASE_WRITES: {
    perSecond: parseInt(process.env.RATE_LIMIT_DB_WRITES_PER_SECOND || '100'),
    perMinute: parseInt(process.env.RATE_LIMIT_DB_WRITES_PER_MINUTE || '5000'),
  },
  
  // Search indexing rate limits
  SEARCH_INDEXING: {
    perSecond: parseInt(process.env.RATE_LIMIT_SEARCH_PER_SECOND || '50'),
    perMinute: parseInt(process.env.RATE_LIMIT_SEARCH_PER_MINUTE || '2000'),
  },
  
  // Asset processing rate limits
  ASSET_PROCESSING: {
    perMinute: parseInt(process.env.RATE_LIMIT_ASSET_PER_MINUTE || '20'),
    perHour: parseInt(process.env.RATE_LIMIT_ASSET_PER_HOUR || '1000'),
  },
  
  // Tax document generation
  TAX_GENERATION: {
    perMinute: parseInt(process.env.RATE_LIMIT_TAX_PER_MINUTE || '30'),
    perHour: parseInt(process.env.RATE_LIMIT_TAX_PER_HOUR || '1500'),
  },
} as const;

// ============================================================================
// Memory Limit Configuration
// ============================================================================

export const MEMORY_LIMITS = {
  // Per-worker memory limits (in MB)
  WORKER_SOFT_LIMIT: parseInt(process.env.WORKER_MEMORY_SOFT_LIMIT || '512'),
  WORKER_HARD_LIMIT: parseInt(process.env.WORKER_MEMORY_HARD_LIMIT || '1024'),
  
  // Job-specific memory limits
  ASSET_PROCESSING_LIMIT: parseInt(process.env.MEMORY_LIMIT_ASSET_PROCESSING || '2048'),
  PDF_GENERATION_LIMIT: parseInt(process.env.MEMORY_LIMIT_PDF_GENERATION || '1024'),
  BULK_OPERATION_LIMIT: parseInt(process.env.MEMORY_LIMIT_BULK_OPERATION || '1024'),
  SEARCH_REINDEX_LIMIT: parseInt(process.env.MEMORY_LIMIT_SEARCH_REINDEX || '2048'),
  
  // Memory monitoring thresholds (percentage)
  WARNING_THRESHOLD: parseInt(process.env.MEMORY_WARNING_THRESHOLD || '75'),
  CRITICAL_THRESHOLD: parseInt(process.env.MEMORY_CRITICAL_THRESHOLD || '90'),
  
  // Worker recycling configuration
  RECYCLE_AFTER_JOBS: parseInt(process.env.WORKER_RECYCLE_AFTER_JOBS || '1000'),
  RECYCLE_AFTER_HOURS: parseInt(process.env.WORKER_RECYCLE_AFTER_HOURS || '4'),
} as const;

// ============================================================================
// Job Timeout Configuration
// ============================================================================

export const JOB_TIMEOUTS = {
  // Critical jobs (short timeouts)
  NOTIFICATION_DELIVERY: parseInt(process.env.TIMEOUT_NOTIFICATION || '30000'), // 30s
  PASSWORD_RESET: parseInt(process.env.TIMEOUT_PASSWORD_RESET || '30000'), // 30s
  PAYMENT_PROCESSING: parseInt(process.env.TIMEOUT_PAYMENT || '120000'), // 2min
  
  // Standard jobs (medium timeouts)
  EMAIL_SENDING: parseInt(process.env.TIMEOUT_EMAIL || '60000'), // 1min
  SEARCH_INDEX_UPDATE: parseInt(process.env.TIMEOUT_SEARCH_UPDATE || '120000'), // 2min
  ASSET_THUMBNAIL: parseInt(process.env.TIMEOUT_ASSET_THUMBNAIL || '180000'), // 3min
  TAX_DOCUMENT_GENERATION: parseInt(process.env.TIMEOUT_TAX_DOC || '300000'), // 5min
  
  // Long-running jobs (extended timeouts)
  ASSET_PREVIEW_GENERATION: parseInt(process.env.TIMEOUT_ASSET_PREVIEW || '600000'), // 10min
  PDF_GENERATION: parseInt(process.env.TIMEOUT_PDF_GENERATION || '600000'), // 10min
  EMAIL_CAMPAIGN: parseInt(process.env.TIMEOUT_EMAIL_CAMPAIGN || '1800000'), // 30min
  BULK_SEARCH_INDEX: parseInt(process.env.TIMEOUT_SEARCH_BULK || '1800000'), // 30min
  
  // Very long jobs (maximum timeouts)
  FULL_REINDEX: parseInt(process.env.TIMEOUT_FULL_REINDEX || '3600000'), // 1hr
  METRICS_AGGREGATION: parseInt(process.env.TIMEOUT_METRICS_AGGREGATION || '3600000'), // 1hr
  ANALYTICS_ROLLUP: parseInt(process.env.TIMEOUT_ANALYTICS_ROLLUP || '7200000'), // 2hr
  
  // Soft timeout warning (percentage of total timeout)
  SOFT_TIMEOUT_PERCENTAGE: parseInt(process.env.TIMEOUT_SOFT_PERCENTAGE || '80'),
} as const;

// ============================================================================
// Horizontal Scaling Configuration
// ============================================================================

export const SCALING_CONFIG = {
  // Auto-scaling thresholds
  SCALE_UP_QUEUE_DEPTH: parseInt(process.env.SCALE_UP_QUEUE_DEPTH || '100'),
  SCALE_UP_QUEUE_LATENCY_MS: parseInt(process.env.SCALE_UP_QUEUE_LATENCY || '30000'), // 30s
  SCALE_UP_CPU_THRESHOLD: parseInt(process.env.SCALE_UP_CPU_THRESHOLD || '75'),
  SCALE_UP_MEMORY_THRESHOLD: parseInt(process.env.SCALE_UP_MEMORY_THRESHOLD || '80'),
  
  SCALE_DOWN_QUEUE_DEPTH: parseInt(process.env.SCALE_DOWN_QUEUE_DEPTH || '10'),
  SCALE_DOWN_QUEUE_LATENCY_MS: parseInt(process.env.SCALE_DOWN_QUEUE_LATENCY || '5000'), // 5s
  SCALE_DOWN_CPU_THRESHOLD: parseInt(process.env.SCALE_DOWN_CPU_THRESHOLD || '30'),
  SCALE_DOWN_MEMORY_THRESHOLD: parseInt(process.env.SCALE_DOWN_MEMORY_THRESHOLD || '40'),
  
  // Scaling policies
  MIN_WORKERS: parseInt(process.env.MIN_WORKERS || '1'),
  MAX_WORKERS: parseInt(process.env.MAX_WORKERS || '10'),
  SCALE_UP_COOLDOWN_SECONDS: parseInt(process.env.SCALE_UP_COOLDOWN || '60'),
  SCALE_DOWN_COOLDOWN_SECONDS: parseInt(process.env.SCALE_DOWN_COOLDOWN || '300'),
  
  // Per-queue scaling overrides
  CRITICAL_MIN_WORKERS: parseInt(process.env.CRITICAL_MIN_WORKERS || '2'),
  CRITICAL_MAX_WORKERS: parseInt(process.env.CRITICAL_MAX_WORKERS || '20'),
  
  BACKGROUND_MIN_WORKERS: parseInt(process.env.BACKGROUND_MIN_WORKERS || '1'),
  BACKGROUND_MAX_WORKERS: parseInt(process.env.BACKGROUND_MAX_WORKERS || '5'),
  
  // Health check configuration
  HEALTH_CHECK_INTERVAL_MS: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30s
  UNHEALTHY_THRESHOLD: parseInt(process.env.UNHEALTHY_THRESHOLD || '3'),
  
  // Graceful shutdown configuration
  SHUTDOWN_TIMEOUT_MS: parseInt(process.env.SHUTDOWN_TIMEOUT || '30000'), // 30s
  SHUTDOWN_DRAIN_TIME_MS: parseInt(process.env.SHUTDOWN_DRAIN_TIME || '5000'), // 5s
} as const;

// ============================================================================
// Monitoring and Alerting Configuration
// ============================================================================

export const MONITORING_CONFIG = {
  // Metrics collection intervals
  METRICS_COLLECTION_INTERVAL_MS: parseInt(process.env.METRICS_INTERVAL || '60000'), // 1min
  METRICS_RETENTION_HOURS: parseInt(process.env.METRICS_RETENTION_HOURS || '168'), // 7 days
  
  // Alert thresholds
  ALERT_QUEUE_DEPTH_CRITICAL: parseInt(process.env.ALERT_QUEUE_DEPTH_CRITICAL || '500'),
  ALERT_QUEUE_DEPTH_WARNING: parseInt(process.env.ALERT_QUEUE_DEPTH_WARNING || '200'),
  
  ALERT_ERROR_RATE_CRITICAL: parseFloat(process.env.ALERT_ERROR_RATE_CRITICAL || '10'), // 10%
  ALERT_ERROR_RATE_WARNING: parseFloat(process.env.ALERT_ERROR_RATE_WARNING || '5'), // 5%
  
  ALERT_TIMEOUT_RATE_CRITICAL: parseFloat(process.env.ALERT_TIMEOUT_RATE_CRITICAL || '5'), // 5%
  ALERT_TIMEOUT_RATE_WARNING: parseFloat(process.env.ALERT_TIMEOUT_RATE_WARNING || '2'), // 2%
  
  ALERT_PROCESSING_TIME_P99_MS: parseInt(process.env.ALERT_PROCESSING_TIME_P99 || '300000'), // 5min
  ALERT_PROCESSING_TIME_P95_MS: parseInt(process.env.ALERT_PROCESSING_TIME_P95 || '120000'), // 2min
  
  // Dashboard refresh rates
  DASHBOARD_REFRESH_INTERVAL_MS: parseInt(process.env.DASHBOARD_REFRESH_INTERVAL || '5000'), // 5s
  
  // Log retention
  LOG_RETENTION_COMPLETED_HOURS: parseInt(process.env.LOG_RETENTION_COMPLETED || '24'), // 1 day
  LOG_RETENTION_FAILED_HOURS: parseInt(process.env.LOG_RETENTION_FAILED || '168'), // 7 days
  LOG_MAX_COMPLETED_JOBS: parseInt(process.env.LOG_MAX_COMPLETED || '1000'),
  LOG_MAX_FAILED_JOBS: parseInt(process.env.LOG_MAX_FAILED || '5000'),
} as const;

// ============================================================================
// Queue-Specific Configuration Builder
// ============================================================================

export interface QueueConfig {
  concurrency: number;
  priority: JobPriority;
  rateLimit?: {
    max: number;
    duration: number; // in milliseconds
  };
  memoryLimit?: number;
  timeout?: number;
  minWorkers?: number;
  maxWorkers?: number;
}

export function getQueueConfig(queueName: string): QueueConfig {
  const priority = QUEUE_PRIORITIES[queueName as keyof typeof QUEUE_PRIORITIES] || JobPriority.NORMAL;
  
  // Map queue names to concurrency settings
  const concurrencyMap: Record<string, number> = {
    'notification-delivery': WORKER_CONCURRENCY.NOTIFICATION_DELIVERY,
    'scheduled-emails': WORKER_CONCURRENCY.EMAIL_DELIVERY,
    'email-retry': WORKER_CONCURRENCY.EMAIL_RETRY,
    'email-campaigns': WORKER_CONCURRENCY.EMAIL_CAMPAIGN,
    'search-index-realtime': WORKER_CONCURRENCY.SEARCH_INDEX_UPDATE,
    'search-index-bulk': WORKER_CONCURRENCY.SEARCH_INDEX_BULK,
    'search-reindex': WORKER_CONCURRENCY.SEARCH_REINDEX,
    'cache-maintenance': WORKER_CONCURRENCY.CACHE_MAINTENANCE,
    'tax-document-generation': WORKER_CONCURRENCY.TAX_DOCUMENT_GENERATION,
    'tax-form-processing': WORKER_CONCURRENCY.TAX_FORM_PROCESSING,
    'asset-processing': WORKER_CONCURRENCY.ASSET_PROCESSING,
    'analytics-events': WORKER_CONCURRENCY.ANALYTICS_AGGREGATION,
    'metrics-rollup': WORKER_CONCURRENCY.METRICS_ROLLUP,
  };
  
  const concurrency = concurrencyMap[queueName] || 5;
  
  // Determine scaling limits based on priority
  let minWorkers = SCALING_CONFIG.MIN_WORKERS;
  let maxWorkers = SCALING_CONFIG.MAX_WORKERS;
  
  if (priority === JobPriority.CRITICAL) {
    minWorkers = SCALING_CONFIG.CRITICAL_MIN_WORKERS;
    maxWorkers = SCALING_CONFIG.CRITICAL_MAX_WORKERS;
  } else if (priority === JobPriority.BACKGROUND) {
    minWorkers = SCALING_CONFIG.BACKGROUND_MIN_WORKERS;
    maxWorkers = SCALING_CONFIG.BACKGROUND_MAX_WORKERS;
  }
  
  return {
    concurrency,
    priority,
    minWorkers,
    maxWorkers,
  };
}

// ============================================================================
// Environment-Specific Configuration
// ============================================================================

export const ENV_CONFIG = {
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isServerless: process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined,
  
  // Development overrides
  get developmentOverrides() {
    if (!this.isDevelopment) return {};
    
    return {
      // Lower concurrency in development
      concurrencyMultiplier: 0.5,
      // Shorter timeouts in development
      timeoutMultiplier: 0.5,
      // More aggressive logging
      verboseLogging: true,
    };
  },
  
  // Production optimizations
  get productionOptimizations() {
    if (!this.isProduction) return {};
    
    return {
      // Enable full concurrency
      concurrencyMultiplier: 1.0,
      // Standard timeouts
      timeoutMultiplier: 1.0,
      // Minimal logging
      verboseLogging: false,
    };
  },
} as const;
