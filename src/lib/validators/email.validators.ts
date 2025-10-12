import { z } from 'zod';

export const emailAddressSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim();

export const sendTransactionalEmailSchema = z.object({
  userId: z.string().cuid().optional(),
  email: emailAddressSchema,
  subject: z.string().min(1).max(200),
  template: z.string().min(1),
  variables: z.record(z.string(), z.any()).optional(),
  tags: z.record(z.string(), z.string()).optional(),
  scheduledAt: z.date().optional(),
});

export const sendCampaignEmailSchema = z.object({
  recipients: z
    .array(
      z.object({
        userId: z.string().cuid(),
        email: emailAddressSchema,
        variables: z.record(z.string(), z.any()).optional(),
      })
    )
    .min(1),
  subject: z.string().min(1).max(200),
  template: z.string().min(1),
  tags: z.record(z.string(), z.string()).optional(),
});

export const emailEventWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    message_id: z.string(),
    email: z.string().email(),
    created_at: z.string(),
  }),
});

// Email Campaign Schemas
export const segmentCriteriaSchema = z.object({
  role: z.array(z.enum(['ADMIN', 'CREATOR', 'BRAND', 'VIEWER'])).optional(),
  verificationStatus: z.array(z.string()).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  lastLoginAfter: z.date().optional(),
  hasEmailPreference: z.record(z.string(), z.boolean()).optional(),
  creatorSpecialties: z.array(z.string()).optional(),
  brandIndustries: z.array(z.string()).optional(),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().min(1),
  subject: z.string().min(1).max(500),
  previewText: z.string().max(200).optional(),
  segmentCriteria: segmentCriteriaSchema.optional(),
  scheduledSendTime: z.date().optional(),
  timezone: z.string().default('UTC'),
  messagesPerHour: z.number().int().min(1).max(10000).default(1000),
  batchSize: z.number().int().min(1).max(1000).default(100),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  subject: z.string().min(1).max(500).optional(),
  previewText: z.string().max(200).optional(),
  segmentCriteria: segmentCriteriaSchema.optional(),
  scheduledSendTime: z.date().optional(),
  timezone: z.string().optional(),
  messagesPerHour: z.number().int().min(1).max(10000).optional(),
  batchSize: z.number().int().min(1).max(1000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const sendTestEmailSchema = z.object({
  testEmails: z.array(emailAddressSchema).min(1).max(10),
});

export const cancelCampaignSchema = z.object({
  reason: z.string().optional(),
});

export const updateEmailPreferencesSchema = z.object({
  royaltyStatements: z.boolean().optional(),
  licenseExpiry: z.boolean().optional(),
  projectInvitations: z.boolean().optional(),
  messages: z.boolean().optional(),
  payouts: z.boolean().optional(),
  digestFrequency: z
    .enum(['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER'])
    .optional(),
  newsletters: z.boolean().optional(),
  announcements: z.boolean().optional(),
  categoryPreferences: z.record(z.string(), z.boolean()).optional(),
  frequencyPreference: z.enum(['immediate', 'daily', 'weekly']).optional(),
});

export const unsubscribeSchema = z.object({
  email: emailAddressSchema,
  campaignId: z.string().optional(),
  categories: z.array(z.string()).optional(),
  reason: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});
