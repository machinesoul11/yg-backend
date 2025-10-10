/**
 * Redis Key Naming Conventions
 * 
 * Hierarchical structure: {namespace}:{entity}:{identifier}:{subkey}
 * 
 * TTL Strategy:
 * - User/Creator/Brand profiles: 1 hour (frequently accessed, rarely updated)
 * - Projects/Assets: 30 minutes (moderate access, occasional updates)
 * - Licenses: 15 minutes (may change due to status updates)
 * - Session data: 24 hours (expires with user session)
 * - Rate limit counters: 1 hour window (reset hourly)
 * - Idempotency keys: 24 hours (prevent duplicate submissions)
 */

export const RedisKeys = {
  // Cache keys
  cache: {
    user: (userId: string) => `cache:user:${userId}`,
    creator: (creatorId: string) => `cache:creator:${creatorId}`,
    brand: (brandId: string) => `cache:brand:${brandId}`,
    project: (projectId: string) => `cache:project:${projectId}`,
    asset: (assetId: string) => `cache:asset:${assetId}`,
    license: (licenseId: string) => `cache:license:${licenseId}`,
    royaltyStatement: (statementId: string) => `cache:royalty:${statementId}`,
    analytics: (key: string) => `cache:analytics:${key}`,
    // Composite keys for related entities
    creatorAssets: (creatorId: string) => `cache:creator:${creatorId}:assets`,
    brandLicenses: (brandId: string) => `cache:brand:${brandId}:licenses`,
    projectAssets: (projectId: string) => `cache:project:${projectId}:assets`,
  },

  // Session keys (temporary data)
  session: {
    upload: (sessionId: string) => `session:upload:${sessionId}`,
    onboarding: (userId: string) => `session:onboarding:${userId}`,
    payment: (sessionId: string) => `session:payment:${sessionId}`,
    verification: (userId: string) => `session:verification:${userId}`,
  },

  // Job queue keys (managed by BullMQ)
  jobs: {
    email: 'jobs:email',
    fileProcessing: 'jobs:file-processing',
    royaltyCalculation: 'jobs:royalty-calculation',
    analytics: 'jobs:analytics',
    notifications: 'jobs:notifications',
    webhooks: 'jobs:webhooks',
  },

  // Rate limiting keys
  rateLimit: {
    api: (userId: string) => `ratelimit:api:${userId}`,
    upload: (userId: string) => `ratelimit:upload:${userId}`,
    message: (userId: string) => `ratelimit:message:${userId}`,
    login: (identifier: string) => `ratelimit:login:${identifier}`,
    passwordReset: (email: string) => `ratelimit:password-reset:${email}`,
    webhook: (endpoint: string) => `ratelimit:webhook:${endpoint}`,
  },

  // Idempotency keys (prevent duplicate operations)
  idempotency: (key: string) => `idempotency:${key}`,

  // Distributed locks
  lock: {
    royaltyRun: (runId: string) => `lock:royalty-run:${runId}`,
    payout: (creatorId: string) => `lock:payout:${creatorId}`,
    assetProcessing: (assetId: string) => `lock:asset-processing:${assetId}`,
    licenseActivation: (licenseId: string) => `lock:license-activation:${licenseId}`,
  },

  // Counters and metrics
  counter: {
    apiRequests: (date: string) => `counter:api-requests:${date}`,
    uploads: (date: string) => `counter:uploads:${date}`,
    licenses: (date: string) => `counter:licenses:${date}`,
    royalties: (date: string) => `counter:royalties:${date}`,
  },

  // Temporary verification codes
  verification: {
    email: (email: string) => `verification:email:${email}`,
    phone: (phone: string) => `verification:phone:${phone}`,
    twoFactor: (userId: string) => `verification:2fa:${userId}`,
  },

  // Queue monitoring
  queue: {
    health: (queueName: string) => `queue:health:${queueName}`,
    metrics: (queueName: string) => `queue:metrics:${queueName}`,
  },
} as const;

// TTL constants (in seconds)
export const RedisTTL = {
  // Cache TTLs
  USER_PROFILE: 3600, // 1 hour
  CREATOR_PROFILE: 3600, // 1 hour
  BRAND_PROFILE: 3600, // 1 hour
  PROJECT: 1800, // 30 minutes
  ASSET: 1800, // 30 minutes
  LICENSE: 900, // 15 minutes
  ROYALTY_STATEMENT: 1800, // 30 minutes
  ANALYTICS: 300, // 5 minutes

  // Session TTLs
  UPLOAD_SESSION: 900, // 15 minutes
  ONBOARDING_SESSION: 86400, // 24 hours
  PAYMENT_SESSION: 1800, // 30 minutes
  VERIFICATION_SESSION: 3600, // 1 hour

  // Rate limit windows
  API_RATE_LIMIT: 3600, // 1 hour
  UPLOAD_RATE_LIMIT: 3600, // 1 hour
  MESSAGE_RATE_LIMIT: 60, // 1 minute
  LOGIN_RATE_LIMIT: 900, // 15 minutes
  PASSWORD_RESET_RATE_LIMIT: 3600, // 1 hour

  // Idempotency
  IDEMPOTENCY_KEY: 86400, // 24 hours

  // Locks
  ROYALTY_LOCK: 300, // 5 minutes
  PAYOUT_LOCK: 300, // 5 minutes
  ASSET_PROCESSING_LOCK: 600, // 10 minutes
  LICENSE_ACTIVATION_LOCK: 60, // 1 minute

  // Verification codes
  EMAIL_VERIFICATION: 600, // 10 minutes
  PHONE_VERIFICATION: 600, // 10 minutes
  TWO_FACTOR_CODE: 300, // 5 minutes
} as const;

// Helper function to build pattern for deletion
export function buildKeyPattern(namespace: string, pattern: string = '*'): string {
  return `${namespace}:${pattern}`;
}
