/**
 * Brand Validation Schemas (Zod)
 * Input validation for brand-related API endpoints
 */

import { z } from 'zod';

/**
 * Employee Count Enum
 */
export const EmployeeCountEnum = z.enum([
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
]);

/**
 * Revenue Range Enum
 */
export const RevenueRangeEnum = z.enum([
  '$0-$1M',
  '$1M-$5M',
  '$5M-$10M',
  '$10M-$50M',
  '$50M+',
]);

/**
 * Funding Stage Enum
 */
export const FundingStageEnum = z.enum([
  'bootstrapped',
  'seed',
  'series_a',
  'series_b+',
  'public',
]);

/**
 * Payment Terms Enum
 */
export const PaymentTermsEnum = z.enum(['net_30', 'net_60', 'immediate']);

/**
 * Currency Enum
 */
export const CurrencyEnum = z.enum(['USD', 'EUR', 'GBP']);

/**
 * Verification Status Enum
 */
export const VerificationStatusEnum = z.enum(['pending', 'verified', 'rejected']);

/**
 * Team Member Role Enum
 */
export const TeamMemberRoleEnum = z.enum(['admin', 'manager', 'viewer']);

/**
 * Team Member Permission Enum
 */
export const TeamMemberPermissionEnum = z.enum([
  'create_projects',
  'approve_licenses',
  'view_analytics',
  'manage_team',
  'update_brand_info',
]);

/**
 * Company Size Schema
 */
export const CompanySizeSchema = z.object({
  employeeCount: EmployeeCountEnum,
  revenueRange: RevenueRangeEnum.optional(),
  fundingStage: FundingStageEnum.optional(),
}).strict();

/**
 * Demographics Schema
 */
export const DemographicsSchema = z.object({
  ageRanges: z.array(z.string()).min(1, 'At least one age range required'),
  genders: z.array(z.string()).min(1, 'At least one gender required'),
  locations: z.array(z.string()).min(1, 'At least one location required'),
}).strict();

/**
 * Target Audience Schema
 */
export const TargetAudienceSchema = z.object({
  demographics: DemographicsSchema.optional(),
  interests: z.array(z.string()).optional(),
  psychographics: z.array(z.string()).optional(),
}).strict();

/**
 * Billing Address Schema
 */
export const BillingAddressSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().length(2, 'Country must be 2-letter ISO code'),
}).strict();

/**
 * Billing Info Schema
 */
export const BillingInfoSchema = z.object({
  taxId: z.string().optional(),
  billingEmail: z.string().email('Invalid billing email'),
  billingAddress: BillingAddressSchema,
  paymentTerms: PaymentTermsEnum.optional(),
  preferredCurrency: CurrencyEnum.optional(),
}).strict();

/**
 * Primary Contact Schema
 */
export const PrimaryContactSchema = z.object({
  name: z.string().min(2, 'Contact name must be at least 2 characters'),
  title: z.string().min(2, 'Contact title must be at least 2 characters'),
  email: z.string().email('Invalid contact email'),
  phone: z.string().optional(),
}).strict();

/**
 * Social Links Schema
 */
export const SocialLinksSchema = z.object({
  linkedin: z.string().url('Invalid LinkedIn URL').optional(),
  instagram: z.string().optional(), // Can be handle or URL
  twitter: z.string().optional(), // Can be handle or URL
  facebook: z.string().url('Invalid Facebook URL').optional(),
}).strict();

/**
 * Contact Info Schema
 */
export const ContactInfoSchema = z.object({
  primaryContact: PrimaryContactSchema,
  companyPhone: z.string().optional(),
  website: z.string().url('Invalid website URL').optional(),
  socialLinks: SocialLinksSchema.optional(),
}).strict();

/**
 * Create Brand Input Schema
 */
export const createBrandSchema = z.object({
  companyName: z.string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name must be at most 255 characters'),
  industry: z.string().max(100, 'Industry must be at most 100 characters').optional(),
  companySize: CompanySizeSchema.optional(),
  targetAudience: TargetAudienceSchema.optional(),
  contactInfo: ContactInfoSchema,
  billingInfo: BillingInfoSchema.optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

/**
 * Update Brand Input Schema
 */
export const updateBrandSchema = z.object({
  companyName: z.string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name must be at most 255 characters')
    .optional(),
  industry: z.string().max(100, 'Industry must be at most 100 characters').optional(),
  companySize: CompanySizeSchema.optional(),
  targetAudience: TargetAudienceSchema.optional(),
  contactInfo: ContactInfoSchema.optional(),
  billingInfo: BillingInfoSchema.optional(),
});

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/**
 * Add Team Member Schema
 */
export const addTeamMemberSchema = z.object({
  brandId: z.string().cuid('Invalid brand ID'),
  email: z.string().email('Invalid email address'),
  role: TeamMemberRoleEnum,
  permissions: z.array(TeamMemberPermissionEnum).optional().default([]),
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

/**
 * Remove Team Member Schema
 */
export const removeTeamMemberSchema = z.object({
  brandId: z.string().cuid('Invalid brand ID'),
  userId: z.string().cuid('Invalid user ID'),
});

export type RemoveTeamMemberInput = z.infer<typeof removeTeamMemberSchema>;

/**
 * Update Brand Guidelines Schema
 */
export const updateGuidelinesSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
  fileKey: z.string().min(1, 'File key is required'),
});

export type UpdateGuidelinesInput = z.infer<typeof updateGuidelinesSchema>;

/**
 * Verify Brand Schema (Admin Only)
 */
export const verifyBrandSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
  notes: z.string().optional(),
});

export type VerifyBrandInput = z.infer<typeof verifyBrandSchema>;

/**
 * Reject Brand Schema (Admin Only)
 */
export const rejectBrandSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
  notes: z.string().optional(),
});

export type RejectBrandInput = z.infer<typeof rejectBrandSchema>;

/**
 * Request Additional Info from Brand Schema (Admin Only)
 */
export const requestBrandInfoSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
  requestedInfo: z.array(z.string()).min(1, 'At least one information item must be requested'),
  message: z.string().min(20, 'Message must be at least 20 characters').max(1000, 'Message must be at most 1000 characters'),
  deadline: z.string().datetime().optional(),
});

export type RequestBrandInfoInput = z.infer<typeof requestBrandInfoSchema>;

/**
 * List Brands Schema
 */
export const listBrandsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  filters: z.object({
    industry: z.string().optional(),
    verificationStatus: VerificationStatusEnum.optional(),
    companySize: EmployeeCountEnum.optional(),
    search: z.string().optional(),
  }).optional(),
  sortBy: z.enum(['companyName', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBrandsInput = z.infer<typeof listBrandsSchema>;

/**
 * Search Brands Schema
 */
export const searchBrandsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  filters: z.object({
    industry: z.string().optional(),
    companySize: EmployeeCountEnum.optional(),
  }).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

export type SearchBrandsInput = z.infer<typeof searchBrandsSchema>;

/**
 * Delete Brand Schema
 */
export const deleteBrandSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
  reason: z.string().optional(),
});

export type DeleteBrandInput = z.infer<typeof deleteBrandSchema>;

/**
 * Get Brand by ID Schema
 */
export const getBrandByIdSchema = z.object({
  id: z.string().cuid('Invalid brand ID'),
});

export type GetBrandByIdInput = z.infer<typeof getBrandByIdSchema>;
