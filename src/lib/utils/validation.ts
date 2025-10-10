import { z } from 'zod';

/**
 * Validation schemas for common data types
 */

// User validation schemas
export const userCreateSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'manager', 'talent', 'brand', 'viewer']),
});

export const userUpdateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  avatar: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

// License validation schemas
export const licenseCreateSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  terms: z.string().min(50, 'Terms must be at least 50 characters'),
  talentId: z.string().uuid(),
  brandId: z.string().uuid(),
  ipId: z.string().uuid(),
  royaltyRate: z.number().min(0).max(100),
  royaltyType: z.enum(['percentage', 'fixed', 'tiered']),
  totalValue: z.number().min(0),
});

export const licenseUpdateSchema = licenseCreateSchema.partial();

// IP validation schemas
export const ipCreateSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  type: z.enum(['image', 'video', 'audio', 'text', 'brand', 'trademark']),
  category: z.string().min(2, 'Category is required'),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
  metadata: z.record(z.string(), z.any()).optional(),
  talentId: z.string().uuid(),
});

export const ipUpdateSchema = ipCreateSchema.partial();

// Pagination validation schema
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// File upload validation schema
export const fileUploadSchema = z.object({
  purpose: z.enum(['avatar', 'ip-content', 'document', 'media']),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Search validation schema
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  filters: z.record(z.string(), z.any()).optional(),
}).merge(paginationSchema);

// Payment validation schema
export const paymentCreateSchema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  paymentMethod: z.string().min(1, 'Payment method is required'),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Royalty validation schema
export const royaltyCreateSchema = z.object({
  licenseId: z.string().uuid(),
  amount: z.number().min(0),
  currency: z.string().length(3),
  period: z.enum(['monthly', 'quarterly', 'annual']),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

// Talent profile validation schema
export const talentProfileSchema = z.object({
  stageName: z.string().min(2, 'Stage name must be at least 2 characters'),
  bio: z.string().min(20, 'Bio must be at least 20 characters'),
  socialMediaLinks: z.object({
    instagram: z.string().url().optional(),
    twitter: z.string().url().optional(),
    tiktok: z.string().url().optional(),
    youtube: z.string().url().optional(),
    facebook: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    website: z.string().url().optional(),
  }).optional(),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
});

// Brand profile validation schema
export const brandProfileSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  industry: z.string().min(2, 'Industry is required'),
  website: z.string().url().optional(),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  logo: z.string().url().optional(),
});

// Email validation schema
export const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1, 'Subject is required'),
  template: z.string().min(1, 'Template is required'),
  variables: z.record(z.string(), z.any()),
});

// Webhook validation schema
export const webhookSchema = z.object({
  event: z.string().min(1, 'Event type is required'),
  data: z.any(),
  timestamp: z.string(),
  signature: z.string(),
});

/**
 * Helper function to validate data against a schema
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: string[];
} {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.issues.map((err) => `${err.path.join('.')}: ${err.message}`),
      };
    }
    return {
      success: false,
      errors: ['Validation failed'],
    };
  }
}

/**
 * Helper function to safely parse data with a schema
 */
export function safeParseData<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  try {
    return schema.parse(data);
  } catch {
    return null;
  }
}
