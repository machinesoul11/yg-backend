/**
 * Brand Type Definitions
 * TypeScript interfaces for brand-related entities
 */

export type EmployeeCountRange = 
  | '1-10' 
  | '11-50' 
  | '51-200' 
  | '201-500' 
  | '501-1000' 
  | '1000+';

export type RevenueRange = 
  | '$0-$1M' 
  | '$1M-$5M' 
  | '$5M-$10M' 
  | '$10M-$50M' 
  | '$50M+';

export type FundingStage = 
  | 'bootstrapped' 
  | 'seed' 
  | 'series_a' 
  | 'series_b+' 
  | 'public';

export type PaymentTerms = 'net_30' | 'net_60' | 'immediate';

export type Currency = 'USD' | 'EUR' | 'GBP';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type TeamMemberRole = 'admin' | 'manager' | 'viewer';

export type TeamMemberPermission = 
  | 'create_projects'
  | 'approve_licenses'
  | 'view_analytics'
  | 'manage_team'
  | 'update_brand_info';

/**
 * Company Size Structure
 */
export interface CompanySize {
  employeeCount: EmployeeCountRange;
  revenueRange?: RevenueRange;
  fundingStage?: FundingStage;
}

/**
 * Target Audience Demographics
 */
export interface Demographics {
  ageRanges: string[];
  genders: string[];
  locations: string[];
}

/**
 * Target Audience Structure
 */
export interface TargetAudience {
  demographics?: Demographics;
  interests?: string[];
  psychographics?: string[];
}

/**
 * Billing Address Structure
 */
export interface BillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO country code (2 letters)
}

/**
 * Billing Information Structure
 */
export interface BillingInfo {
  taxId?: string;
  billingEmail: string;
  billingAddress: BillingAddress;
  paymentTerms?: PaymentTerms;
  preferredCurrency?: Currency;
  stripeCustomerId?: string; // Future use
  defaultPaymentMethod?: string; // Future use
}

/**
 * Primary Contact Structure
 */
export interface PrimaryContact {
  name: string;
  title: string;
  email: string;
  phone?: string;
}

/**
 * Social Links Structure
 */
export interface SocialLinks {
  linkedin?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
}

/**
 * Contact Information Structure
 */
export interface ContactInfo {
  primaryContact: PrimaryContact;
  companyPhone?: string;
  website?: string;
  socialLinks?: SocialLinks;
}

/**
 * Team Member Structure
 */
export interface TeamMember {
  userId: string;
  role: TeamMemberRole;
  permissions: TeamMemberPermission[];
  addedAt: string; // ISO timestamp
  addedBy: string; // User ID who added this member
}

/**
 * Brand Entity (Database Model)
 */
export interface Brand {
  id: string;
  userId: string;
  companyName: string;
  industry: string | null;
  companySize: CompanySize | null;
  targetAudience: TargetAudience | null;
  billingInfo: BillingInfo | null;
  brandGuidelinesUrl: string | null;
  contactInfo: ContactInfo | null;
  teamMembers: TeamMember[] | null;
  verificationStatus: VerificationStatus;
  verifiedAt: Date | null;
  verificationNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // Legacy fields
  website?: string | null;
  description?: string | null;
  logo?: string | null;
  isVerified?: boolean;
  totalSpent?: number;
}

/**
 * Brand with User Information
 */
export interface BrandWithUser extends Brand {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * Paginated Brand List Response
 */
export interface BrandListResponse {
  brands: Brand[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Brand Search Filters
 */
export interface BrandSearchFilters {
  industry?: string;
  verificationStatus?: VerificationStatus;
  companySize?: EmployeeCountRange;
  search?: string; // Company name search
}

/**
 * Brand Statistics (for admin dashboard)
 */
export interface BrandStatistics {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  active: number; // Brands with active projects
  inactive: number; // Brands with no activity in 90 days
}
