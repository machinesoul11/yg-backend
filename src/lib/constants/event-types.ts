/**
 * Event Type Constants
 * Centralized registry of all event types tracked in the analytics system
 */

export const EVENT_TYPES = {
  // User Events
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  USER_LOGGED_OUT: 'user_logged_out',
  USER_PROFILE_UPDATED: 'user_profile_updated',
  USER_PASSWORD_CHANGED: 'user_password_changed',
  USER_EMAIL_VERIFIED: 'user_email_verified',

  // Asset Events
  ASSET_UPLOADED: 'asset_uploaded',
  ASSET_VIEWED: 'asset_viewed',
  ASSET_DOWNLOADED: 'asset_downloaded',
  ASSET_PREVIEW_GENERATED: 'asset_preview_generated',
  ASSET_APPROVED: 'asset_approved',
  ASSET_REJECTED: 'asset_rejected',
  ASSET_UPDATED: 'asset_updated',
  ASSET_DELETED: 'asset_deleted',
  ASSET_SHARED: 'asset_shared',

  // Project Events
  PROJECT_CREATED: 'project_created',
  PROJECT_STARTED: 'project_started',
  PROJECT_COMPLETED: 'project_completed',
  PROJECT_ARCHIVED: 'project_archived',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',

  // License Events
  LICENSE_CREATED: 'license_created',
  LICENSE_SIGNED: 'license_signed',
  LICENSE_RENEWED: 'license_renewed',
  LICENSE_EXPIRED: 'license_expired',
  LICENSE_TERMINATED: 'license_terminated',
  LICENSE_VIEWED: 'license_viewed',
  LICENSE_CLICKED: 'license_clicked',

  // Royalty Events
  ROYALTY_CALCULATED: 'royalty_calculated',
  ROYALTY_STATEMENT_GENERATED: 'royalty_statement_generated',
  ROYALTY_STATEMENT_REVIEWED: 'royalty_statement_reviewed',
  PAYOUT_COMPLETED: 'payout_completed',
  PAYOUT_FAILED: 'payout_failed',

  // Engagement Events
  PAGE_VIEWED: 'page_viewed',
  CTA_CLICKED: 'cta_clicked',
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  BUTTON_CLICKED: 'button_clicked',
  FORM_SUBMITTED: 'form_submitted',
  MODAL_OPENED: 'modal_opened',
  MODAL_CLOSED: 'modal_closed',

  // Creator Events
  CREATOR_PROFILE_CREATED: 'creator_profile_created',
  CREATOR_PROFILE_UPDATED: 'creator_profile_updated',
  CREATOR_VERIFIED: 'creator_verified',
  CREATOR_PORTFOLIO_VIEWED: 'creator_portfolio_viewed',

  // Brand Events
  BRAND_PROFILE_CREATED: 'brand_profile_created',
  BRAND_PROFILE_UPDATED: 'brand_profile_updated',
  BRAND_VERIFIED: 'brand_verified',
  BRAND_PROJECT_VIEWED: 'brand_project_viewed',

  // System Events
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
  WEBHOOK_RECEIVED: 'webhook_received',
  JOB_COMPLETED: 'job_completed',
  JOB_FAILED: 'job_failed',
  ERROR_OCCURRED: 'error_occurred',
  API_REQUEST: 'api_request',
  
  // Ownership Events
  OWNERSHIP_CREATED: 'ownership_created',
  OWNERSHIP_TRANSFERRED: 'ownership_transferred',
  OWNERSHIP_VERIFIED: 'ownership_verified',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export const EVENT_TYPE_ARRAY = Object.values(EVENT_TYPES);

/**
 * Event Source Types
 */
export const EVENT_SOURCES = {
  WEB: 'web',
  API: 'api',
  MOBILE: 'mobile',
  SYSTEM: 'system',
  WEBHOOK: 'webhook',
} as const;

export type EventSource = typeof EVENT_SOURCES[keyof typeof EVENT_SOURCES];

/**
 * Actor Types
 */
export const ACTOR_TYPES = {
  USER: 'user',
  CREATOR: 'creator',
  BRAND: 'brand',
  SYSTEM: 'system',
  ADMIN: 'admin',
} as const;

export type ActorType = typeof ACTOR_TYPES[keyof typeof ACTOR_TYPES];

/**
 * Entity Types
 */
export const ENTITY_TYPES = {
  PROJECT: 'project',
  ASSET: 'asset',
  LICENSE: 'license',
  CREATOR: 'creator',
  BRAND: 'brand',
  USER: 'user',
  ROYALTY: 'royalty',
  PAYOUT: 'payout',
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];
