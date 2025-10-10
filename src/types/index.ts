import { z } from 'zod';

// Base Types
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

// User Types
export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'manager' | 'talent' | 'brand' | 'viewer';
  isActive: boolean;
  lastLoginAt?: Date;
}

// License Types
export interface License extends BaseEntity {
  title: string;
  description: string;
  status: 'draft' | 'pending' | 'active' | 'expired' | 'cancelled' | 'suspended';
  startDate: Date;
  endDate: Date;
  terms: string;
  talentId: string;
  brandId: string;
  ipId: string;
  royaltyRate: number;
  royaltyType: 'percentage' | 'fixed' | 'tiered';
  totalValue: number;
}

// IP (Intellectual Property) Types
export interface IntellectualProperty extends BaseEntity {
  name: string;
  description: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'brand' | 'trademark';
  category: string;
  tags: string[];
  metadata: Record<string, any>;
  files: IPFile[];
  talentId: string;
  isActive: boolean;
}

export interface IPFile {
  id: string;
  url: string;
  type: string;
  size: number;
  originalName: string;
  mimeType: string;
}

// Talent Types
export interface Talent extends BaseEntity {
  userId: string;
  stageName: string;
  bio: string;
  socialMediaLinks: SocialMediaLinks;
  categories: string[];
  isVerified: boolean;
  rating: number;
  totalEarnings: number;
}

// Brand Types
export interface Brand extends BaseEntity {
  userId: string;
  companyName: string;
  industry: string;
  website?: string;
  description: string;
  logo?: string;
  isVerified: boolean;
  totalSpent: number;
}

// Royalty Types
export interface Royalty extends BaseEntity {
  licenseId: string;
  amount: number;
  currency: string;
  period: 'monthly' | 'quarterly' | 'annual';
  periodStart: Date;
  periodEnd: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  paidAt?: Date;
}

// Payment Types
export interface Payment extends BaseEntity {
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  paymentMethod: string;
  stripePaymentIntentId?: string;
  metadata: Record<string, any>;
  paidAt?: Date;
  refundedAt?: Date;
}

// Analytics Types
export interface AnalyticsEvent {
  id: string;
  type: string;
  userId?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface AnalyticsDashboard {
  totalRevenue: number;
  totalLicenses: number;
  activeLicenses: number;
  totalTalent: number;
  totalBrands: number;
  recentActivity: AnalyticsEvent[];
  revenueChart: ChartData[];
  topPerformingIP: IntellectualProperty[];
}

// File Upload Types
export interface FileUpload {
  file: File;
  purpose: 'avatar' | 'ip-content' | 'document' | 'media';
  metadata?: Record<string, any>;
}

export interface UploadedFile {
  id: string;
  url: string;
  key: string;
  size: number;
  type: string;
  originalName: string;
}

// Common Utility Types
export interface SocialMediaLinks {
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  youtube?: string;
  facebook?: string;
  linkedin?: string;
  website?: string;
}

export interface ChartData {
  label: string;
  value: number;
  date?: Date;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

// Job Types
export interface JobData {
  type: string;
  payload: any;
  options?: {
    delay?: number;
    priority?: number;
    attempts?: number;
  };
}

// Email Types
export interface EmailTemplate {
  to: string;
  subject: string;
  template: string;
  variables: Record<string, any>;
}

// Webhook Types
export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  signature: string;
}

// Search and Filter Types
export interface SearchParams {
  query?: string;
  filters?: Record<string, any>;
  pagination?: PaginationParams;
}

export interface FilterOption {
  label: string;
  value: string;
  count?: number;
}

// Form Types
export interface FormFieldError {
  field: string;
  message: string;
}

export interface FormState<T = any> {
  data: T;
  errors: FormFieldError[];
  isSubmitting: boolean;
  isValid: boolean;
}
