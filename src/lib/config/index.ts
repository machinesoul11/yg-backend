export const APP_CONFIG = {
  name: 'YesGoddess Backend',
  version: '1.0.0',
  description: 'IP Licensing Platform API & Operations Management',
  environment: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
} as const;

export const API_CONFIG = {
  version: 'v1',
  prefix: '/api',
  timeout: 30000,
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },
} as const;

export const DATABASE_CONFIG = {
  url: process.env.DATABASE_URL!,
  replicaUrl: process.env.DATABASE_REPLICA_URL,
  connectionLimit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || '10'),
  ssl: process.env.NODE_ENV === 'production',
} as const;

export const REDIS_CONFIG = {
  url: process.env.REDIS_URL!,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
} as const;

export const STORAGE_CONFIG = {
  provider: process.env.STORAGE_PROVIDER || 's3',
  bucket: process.env.STORAGE_BUCKET!,
  region: process.env.STORAGE_REGION || 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  endpoint: process.env.STORAGE_ENDPOINT,
} as const;

export const EMAIL_CONFIG = {
  provider: process.env.EMAIL_PROVIDER || 'postmark',
  postmark: {
    token: process.env.POSTMARK_TOKEN!,
    senderEmail: process.env.POSTMARK_SENDER_EMAIL!,
  },
} as const;

export const STRIPE_CONFIG = {
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  apiVersion: '2023-10-16' as const,
} as const;

export const AUTH_CONFIG = {
  secret: process.env.NEXTAUTH_SECRET!,
  url: process.env.NEXTAUTH_URL!,
  sessionMaxAge: 30 * 24 * 60 * 60, // 30 days
  sessionUpdateAge: 24 * 60 * 60, // 24 hours
} as const;

export const JOBS_CONFIG = {
  provider: process.env.JOBS_PROVIDER || 'bullmq',
  redis: REDIS_CONFIG,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
} as const;
