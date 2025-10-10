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
});

export const addToSuppressionListSchema = z.object({
  email: emailAddressSchema,
  reason: z.enum(['BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL']),
  bounceType: z.string().optional(),
  bounceReason: z.string().optional(),
});

export const emailEventWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    message_id: z.string(),
    email: z.string().email(),
    created_at: z.string(),
  }),
});
