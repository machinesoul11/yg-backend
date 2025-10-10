// Application Constants
export const APP_NAME = 'YesGoddess';
export const APP_DESCRIPTION = 'IP Licensing Platform API & Operations Management';

// API Constants
export const API_ROUTES = {
  IP: '/api/ip',
  LICENSES: '/api/licenses',
  ROYALTIES: '/api/royalties',
  TALENT: '/api/talent',
  BRANDS: '/api/brands',
  ANALYTICS: '/api/analytics',
  AUTH: '/api/auth',
  WEBHOOKS: '/api/webhooks',
} as const;

// Database Constants
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
} as const;

// License Status Constants
export const LICENSE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUSPENDED: 'suspended',
} as const;

// Payment Constants
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

// User Roles
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  TALENT: 'talent',
  BRAND: 'brand',
  VIEWER: 'viewer',
} as const;

// Royalty Types
export const ROYALTY_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
  TIERED: 'tiered',
} as const;

// File Upload Constants
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'video/mp4',
    'video/webm',
  ],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.mp4', '.webm'],
} as const;

// Email Templates
export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  LICENSE_APPROVED: 'license-approved',
  LICENSE_EXPIRED: 'license-expired',
  PAYMENT_RECEIVED: 'payment-received',
  ROYALTY_REPORT: 'royalty-report',
} as const;

// Job Types
export const JOB_TYPES = {
  SEND_EMAIL: 'send-email',
  PROCESS_PAYMENT: 'process-payment',
  GENERATE_REPORT: 'generate-report',
  SYNC_DATA: 'sync-data',
  CLEANUP: 'cleanup',
} as const;

// Analytics Events
export const ANALYTICS_EVENTS = {
  LICENSE_CREATED: 'license_created',
  LICENSE_ACTIVATED: 'license_activated',
  PAYMENT_PROCESSED: 'payment_processed',
  USER_REGISTERED: 'user_registered',
  FILE_UPLOADED: 'file_uploaded',
} as const;

// Cache Keys
export const CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `user:${userId}:profile`,
  LICENSE_DETAILS: (licenseId: string) => `license:${licenseId}:details`,
  BRAND_LICENSES: (brandId: string) => `brand:${brandId}:licenses`,
  TALENT_ROYALTIES: (talentId: string) => `talent:${talentId}:royalties`,
  ANALYTICS_DASHBOARD: (userId: string) => `analytics:${userId}:dashboard`,
} as const;

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  SHORT: 5 * 60, // 5 minutes
  MEDIUM: 30 * 60, // 30 minutes
  LONG: 60 * 60, // 1 hour
  DAILY: 24 * 60 * 60, // 24 hours
} as const;

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;
