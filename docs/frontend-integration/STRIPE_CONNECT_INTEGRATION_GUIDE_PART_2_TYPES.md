# 🌐 Stripe Connect Payouts - Frontend Integration Guide (Part 2: TypeScript Definitions & Business Logic)

> **Classification**: ⚡ HYBRID - Core functionality used by both public website (creators) and admin backend (monitoring)

## Overview

This document provides complete TypeScript type definitions, Zod validation schemas, and business logic rules for the Stripe Connect payout module implementation.

---

## 1. TypeScript Type Definitions

### 1.1 Core Response Types

```typescript
// Export format for frontend to copy
// File: types/stripe-connect.types.ts

/**
 * Onboarding status enumeration
 */
export type OnboardingStatus = 
  | 'pending'              // Account created but onboarding not started
  | 'in_progress'          // Onboarding form started  
  | 'pending_verification' // Waiting for Stripe verification
  | 'completed'            // Onboarding complete and verified
  | 'failed';              // Verification failed

/**
 * Stripe account link response
 */
export interface StripeAccountLinkResponse {
  url: string;       // Stripe Connect onboarding URL
  expiresAt: number; // Unix timestamp (expires in ~1 hour)
}

/**
 * Stripe account status response
 */
export interface StripeAccountStatusResponse {
  hasAccount: boolean;        // Whether creator has Stripe account
  onboardingStatus: OnboardingStatus;
  chargesEnabled: boolean;    // Can accept payments (usually false for Express)
  payoutsEnabled: boolean;    // Can receive payouts (main concern)
  requiresAction: boolean;    // User needs to take action
  currentlyDue: string[];     // Fields that must be completed now
  errors: string[];           // Verification error messages
}

/**
 * Detailed account information
 */
export interface StripeAccountDetails {
  id: string;                 // Stripe account ID (acct_...)
  type: 'express';            // Always 'express' for creator accounts
  country: string;            // ISO country code (e.g., 'US')
  email: string;              // Account email
  businessProfile: StripeBusinessProfile | null;
  capabilities: StripeCapability[];
  externalAccounts: StripeBankAccount[];
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;  // All required info provided
  requirements: StripeRequirements;
  created: number;            // Unix timestamp when account created
  metadata: Record<string, string>; // Custom metadata
}

/**
 * Business profile information
 */
export interface StripeBusinessProfile {
  name: string;                    // Business/stage name
  url?: string;                    // Website URL
  supportEmail?: string;           // Support contact email  
  supportPhone?: string;           // Support phone number
  supportUrl?: string;             // Support page URL
  productDescription?: string;     // What creator offers
  mcc?: string;                    // Merchant Category Code
}

/**
 * Account capability status
 */
export interface StripeCapability {
  name: string;   // 'transfers', 'card_payments', etc.
  status: string; // 'active', 'pending', 'inactive', 'unrequested'
}

/**
 * Bank account information (masked for security)
 */
export interface StripeBankAccount {
  id: string;          // Bank account ID (ba_...)
  object: 'bank_account';
  bankName: string;    // Full bank name
  last4: string;       // Last 4 digits only
  currency: string;    // Currency code (e.g., 'usd')
  country: string;     // ISO country code
  routingNumber: string; // Masked: "***1234" (last 4 digits only)
  default: boolean;    // Default account for payouts
}

/**
 * Categorized account requirements
 */
export interface StripeRequirements {
  currentlyDue: StripeAccountRequirement[];     // Must complete now
  eventuallyDue: StripeAccountRequirement[];   // Will need eventually
  pastDue: StripeAccountRequirement[];         // Overdue items
  pendingVerification: StripeAccountRequirement[]; // Being reviewed
}

/**
 * Individual account requirement
 */
export interface StripeAccountRequirement {
  fieldName: string;           // Stripe field name (e.g., 'individual.ssn_last_4')
  requirementType: 'currently_due' | 'eventually_due' | 'past_due' | 'pending_verification';
  deadline: string | null;     // ISO date string when due (null if no deadline)
  errorCode: string | null;    // Stripe error code if rejected
  errorReason: string | null;  // Human-readable error reason
  description: string;         // What user needs to provide
}
```

### 1.2 Request/Update Types

```typescript
/**
 * Onboard request (optional parameters)
 */
export interface OnboardRequest {
  returnUrl?: string;  // Where to redirect after successful onboarding
  refreshUrl?: string; // Where to redirect if link expires
}

/**
 * Account update request
 */
export interface UpdateAccountRequest {
  businessProfile?: Partial<StripeBusinessProfileUpdate>;
  settings?: StripeAccountSettings;
  metadata?: Record<string, string>;
}

/**
 * Business profile update fields
 */
export interface StripeBusinessProfileUpdate {
  name?: string;              // Business/stage name (max 255 chars)
  url?: string;               // Website URL (must be valid URL)
  supportEmail?: string;      // Support email (must be valid email)
  supportPhone?: string;      // Support phone number
  productDescription?: string; // Description (max 500 chars)
}

/**
 * Account settings
 */
export interface StripeAccountSettings {
  payouts?: {
    schedule?: {
      interval?: 'daily' | 'weekly' | 'monthly' | 'manual';
    };
  };
}
```

### 1.3 API Response Wrappers

```typescript
/**
 * Standard API success response wrapper
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string; // Optional success message
}

/**
 * API error response
 */
export interface ApiErrorResponse {
  success?: false;  // May be omitted on errors
  error: string;    // Error type/category
  message: string;  // Human-readable message
  details?: any;    // Optional validation errors or context
}

/**
 * Complete API response union
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Specific endpoint response types
export type OnboardResponse = ApiSuccessResponse<{
  url: string;
  expiresAt: number;
  accountId: string;
  isNewAccount: boolean;
}>;

export type StatusResponse = ApiSuccessResponse<StripeAccountStatusResponse & {
  accountId: string | null;
  isFullyOnboarded: boolean;
}>;

export type AccountDetailsResponse = ApiSuccessResponse<StripeAccountDetails | {
  hasAccount: false;
  message: string;
}>;

export type AccountUpdateResponse = ApiSuccessResponse<{
  id: string;
  businessProfile: StripeBusinessProfile | null;
  metadata: Record<string, string>;
}>;
```

### 1.4 Frontend State Types

```typescript
/**
 * Onboarding flow state
 */
export interface OnboardingState {
  status: 'idle' | 'loading' | 'onboarding' | 'completed' | 'error';
  accountId?: string;
  onboardingUrl?: string;
  expiresAt?: number;
  error?: string;
  isPolling: boolean;
}

/**
 * Account management state  
 */
export interface AccountManagementState {
  account: StripeAccountDetails | null;
  isLoading: boolean;
  isUpdating: boolean;
  error?: string;
  lastUpdated?: Date;
}

/**
 * UI status indicators
 */
export interface PayoutStatusIndicators {
  canReceivePayouts: boolean;
  statusColor: 'green' | 'yellow' | 'red' | 'gray';
  statusText: string;
  actionRequired: boolean;
  actionText?: string;
  nextSteps: string[];
}
```

---

## 2. Zod Validation Schemas

### 2.1 Request Validation

```typescript
// File: schemas/stripe-connect.schemas.ts
import { z } from 'zod';

/**
 * Onboard request schema
 */
export const onboardRequestSchema = z.object({
  returnUrl: z.string().url().optional(),
  refreshUrl: z.string().url().optional(),
});

/**
 * Account update schema  
 */
export const updateAccountSchema = z.object({
  businessProfile: z.object({
    name: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
    supportEmail: z.string().email().optional(), 
    supportPhone: z.string().optional(),
    productDescription: z.string().max(500).optional(),
  }).optional(),
  settings: z.object({
    payouts: z.object({
      schedule: z.object({
        interval: z.enum(['daily', 'weekly', 'monthly', 'manual']).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

/**
 * Frontend form validation schemas
 */
export const businessProfileFormSchema = z.object({
  name: z.string()
    .min(1, 'Business name is required')
    .max(255, 'Business name must be less than 255 characters'),
  url: z.string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  supportEmail: z.string()
    .email('Must be a valid email address')
    .optional()
    .or(z.literal('')),
  supportPhone: z.string()
    .optional(),
  productDescription: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .or(z.literal('')),
});

export const payoutSettingsSchema = z.object({
  schedule: z.object({
    interval: z.enum(['daily', 'weekly', 'monthly', 'manual'], {
      required_error: 'Please select a payout schedule',
    }),
  }),
});

// Type inference from schemas
export type OnboardRequestData = z.infer<typeof onboardRequestSchema>;
export type UpdateAccountData = z.infer<typeof updateAccountSchema>;
export type BusinessProfileFormData = z.infer<typeof businessProfileFormSchema>;
export type PayoutSettingsData = z.infer<typeof payoutSettingsSchema>;
```

### 2.2 Response Validation

```typescript
/**
 * Response validation schemas for runtime type checking
 */
export const stripeAccountStatusSchema = z.object({
  hasAccount: z.boolean(),
  onboardingStatus: z.enum(['pending', 'in_progress', 'pending_verification', 'completed', 'failed']),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(), 
  requiresAction: z.boolean(),
  currentlyDue: z.array(z.string()),
  errors: z.array(z.string()),
});

export const stripeAccountDetailsSchema = z.object({
  id: z.string(),
  type: z.literal('express'),
  country: z.string(),
  email: z.string().email(),
  businessProfile: z.object({
    name: z.string(),
    url: z.string().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    supportUrl: z.string().url().optional(),
    productDescription: z.string().optional(),
    mcc: z.string().optional(),
  }).nullable(),
  capabilities: z.array(z.object({
    name: z.string(),
    status: z.string(),
  })),
  externalAccounts: z.array(z.object({
    id: z.string(),
    object: z.literal('bank_account'),
    bankName: z.string(),
    last4: z.string(),
    currency: z.string(),
    country: z.string(),
    routingNumber: z.string(),
    default: z.boolean(),
  })),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
  requirements: z.object({
    currentlyDue: z.array(z.object({
      fieldName: z.string(),
      requirementType: z.string(),
      deadline: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorReason: z.string().nullable(),
      description: z.string(),
    })),
    eventuallyDue: z.array(z.object({
      fieldName: z.string(),
      requirementType: z.string(),
      deadline: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorReason: z.string().nullable(),
      description: z.string(),
    })),
    pastDue: z.array(z.object({
      fieldName: z.string(),
      requirementType: z.string(),
      deadline: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorReason: z.string().nullable(),
      description: z.string(),
    })),
    pendingVerification: z.array(z.object({
      fieldName: z.string(),
      requirementType: z.string(),
      deadline: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorReason: z.string().nullable(),
      description: z.string(),
    })),
  }),
  created: z.number(),
  metadata: z.record(z.string()),
});
```

---

## 3. Business Logic & Validation Rules

### 3.1 Account Status Logic

```typescript
/**
 * Determine payout eligibility based on account status
 */
export function determinePayoutEligibility(
  status: StripeAccountStatusResponse
): PayoutEligibilityResult {
  const eligible = status.hasAccount && 
                   status.onboardingStatus === 'completed' &&
                   status.payoutsEnabled && 
                   !status.requiresAction;

  const reasons: string[] = [];
  
  if (!status.hasAccount) {
    reasons.push('No Stripe account connected');
  }
  
  if (status.onboardingStatus !== 'completed') {
    reasons.push('Onboarding not completed');
  }
  
  if (!status.payoutsEnabled) {
    reasons.push('Payouts not enabled by Stripe');
  }
  
  if (status.requiresAction) {
    reasons.push('Account requires additional information');
  }

  return {
    eligible,
    reasons,
    canStartOnboarding: !status.hasAccount,
    canRefreshLink: status.hasAccount && status.onboardingStatus !== 'completed',
    needsVerification: status.requiresAction && status.currentlyDue.length > 0,
  };
}

export interface PayoutEligibilityResult {
  eligible: boolean;
  reasons: string[];
  canStartOnboarding: boolean;
  canRefreshLink: boolean; 
  needsVerification: boolean;
}
```

### 3.2 UI State Calculations

```typescript
/**
 * Calculate UI indicators from account status
 */
export function calculateStatusIndicators(
  status: StripeAccountStatusResponse & { accountId: string | null }
): PayoutStatusIndicators {
  
  if (!status.hasAccount) {
    return {
      canReceivePayouts: false,
      statusColor: 'gray',
      statusText: 'Not Connected',
      actionRequired: true,
      actionText: 'Connect Stripe Account',
      nextSteps: ['Connect your Stripe account to receive payouts'],
    };
  }

  if (status.onboardingStatus === 'failed') {
    return {
      canReceivePayouts: false,
      statusColor: 'red',
      statusText: 'Verification Failed',
      actionRequired: true,
      actionText: 'Fix Account Issues',
      nextSteps: status.errors.length > 0 ? status.errors : ['Contact support for assistance'],
    };
  }

  if (status.onboardingStatus === 'completed' && status.payoutsEnabled && !status.requiresAction) {
    return {
      canReceivePayouts: true,
      statusColor: 'green', 
      statusText: 'Ready for Payouts',
      actionRequired: false,
      nextSteps: [],
    };
  }

  if (status.requiresAction && status.currentlyDue.length > 0) {
    return {
      canReceivePayouts: false,
      statusColor: 'yellow',
      statusText: 'Action Required',
      actionRequired: true,
      actionText: 'Complete Verification',
      nextSteps: status.currentlyDue.map(field => `Provide: ${field}`),
    };
  }

  if (status.onboardingStatus === 'pending_verification') {
    return {
      canReceivePayouts: false,
      statusColor: 'yellow',
      statusText: 'Under Review',
      actionRequired: false,
      nextSteps: ['Stripe is reviewing your account. This usually takes 1-3 business days.'],
    };
  }

  // In progress or pending
  return {
    canReceivePayouts: false,
    statusColor: 'yellow',
    statusText: 'Onboarding Incomplete',
    actionRequired: true,
    actionText: 'Continue Setup',
    nextSteps: ['Complete your Stripe account setup'],
  };
}
```

### 3.3 Form Validation Rules

```typescript
/**
 * Business profile validation rules
 */
export const BUSINESS_PROFILE_RULES = {
  name: {
    required: true,
    maxLength: 255,
    pattern: /^[a-zA-Z0-9\s\-.,&']+$/, // Alphanumeric, spaces, basic punctuation
    errorMessage: 'Business name can only contain letters, numbers, and basic punctuation',
  },
  url: {
    required: false,
    pattern: /^https?:\/\/.+\..+/, // Basic URL validation
    errorMessage: 'Must be a valid website URL starting with http:// or https://',
  },
  supportEmail: {
    required: false,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Basic email validation
    errorMessage: 'Must be a valid email address',
  },
  supportPhone: {
    required: false,
    pattern: /^\+?[\d\s\-\(\)]+$/, // Phone number with optional + and formatting
    errorMessage: 'Must be a valid phone number',
  },
  productDescription: {
    required: false,
    maxLength: 500,
    errorMessage: 'Description must be less than 500 characters',
  },
} as const;

/**
 * Validate business profile data
 */
export function validateBusinessProfile(
  data: Partial<StripeBusinessProfileUpdate>
): ValidationResult {
  const errors: Record<string, string> = {};
  
  if (data.name !== undefined) {
    if (!data.name.trim()) {
      errors.name = 'Business name is required';
    } else if (data.name.length > BUSINESS_PROFILE_RULES.name.maxLength) {
      errors.name = `Name must be less than ${BUSINESS_PROFILE_RULES.name.maxLength} characters`;
    } else if (!BUSINESS_PROFILE_RULES.name.pattern.test(data.name)) {
      errors.name = BUSINESS_PROFILE_RULES.name.errorMessage;
    }
  }

  if (data.url && data.url.trim()) {
    if (!BUSINESS_PROFILE_RULES.url.pattern.test(data.url)) {
      errors.url = BUSINESS_PROFILE_RULES.url.errorMessage;
    }
  }

  if (data.supportEmail && data.supportEmail.trim()) {
    if (!BUSINESS_PROFILE_RULES.supportEmail.pattern.test(data.supportEmail)) {
      errors.supportEmail = BUSINESS_PROFILE_RULES.supportEmail.errorMessage;
    }
  }

  if (data.supportPhone && data.supportPhone.trim()) {
    if (!BUSINESS_PROFILE_RULES.supportPhone.pattern.test(data.supportPhone)) {
      errors.supportPhone = BUSINESS_PROFILE_RULES.supportPhone.errorMessage;
    }
  }

  if (data.productDescription && data.productDescription.length > BUSINESS_PROFILE_RULES.productDescription.maxLength) {
    errors.productDescription = BUSINESS_PROFILE_RULES.productDescription.errorMessage;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
```

### 3.4 State Machine Transitions

```typescript
/**
 * Onboarding status state machine
 */
export const ONBOARDING_STATE_MACHINE = {
  pending: {
    canTransitionTo: ['in_progress'],
    actions: ['startOnboarding'],
    userMessage: 'Ready to start connecting your payout account',
  },
  in_progress: {
    canTransitionTo: ['pending_verification', 'completed', 'failed'],
    actions: ['continueOnboarding', 'refreshLink'],
    userMessage: 'Complete your account setup with Stripe',
  },
  pending_verification: {
    canTransitionTo: ['completed', 'failed', 'in_progress'],
    actions: ['waitForVerification'],
    userMessage: 'Stripe is reviewing your information',
  },
  completed: {
    canTransitionTo: [],
    actions: ['updateAccount', 'viewDetails'],
    userMessage: 'Your payout account is ready',
  },
  failed: {
    canTransitionTo: ['in_progress'],
    actions: ['fixIssues', 'contactSupport'],
    userMessage: 'Account verification failed - please fix the issues',
  },
} as const;

/**
 * Get available actions for current status
 */
export function getAvailableActions(status: OnboardingStatus): string[] {
  return ONBOARDING_STATE_MACHINE[status]?.actions || [];
}

/**
 * Check if status transition is valid
 */
export function canTransitionTo(
  currentStatus: OnboardingStatus,
  newStatus: OnboardingStatus
): boolean {
  const allowedTransitions = ONBOARDING_STATE_MACHINE[currentStatus]?.canTransitionTo || [];
  return allowedTransitions.includes(newStatus);
}
```

---

## 4. Calculations & Derived Values

### 4.1 Link Expiration Handling

```typescript
/**
 * Check if onboarding link has expired
 */
export function isLinkExpired(expiresAt: number): boolean {
  return Date.now() / 1000 > expiresAt;
}

/**
 * Get time remaining until link expires
 */
export function getLinkTimeRemaining(expiresAt: number): {
  expired: boolean;
  minutesRemaining: number;
  displayText: string;
} {
  const now = Date.now() / 1000;
  const secondsRemaining = expiresAt - now;
  
  if (secondsRemaining <= 0) {
    return {
      expired: true,
      minutesRemaining: 0,
      displayText: 'Link expired',
    };
  }

  const minutesRemaining = Math.floor(secondsRemaining / 60);
  
  return {
    expired: false,
    minutesRemaining,
    displayText: minutesRemaining > 1 
      ? `${minutesRemaining} minutes remaining`
      : 'Less than 1 minute remaining',
  };
}
```

### 4.2 Requirements Processing

```typescript
/**
 * Process and categorize requirements for display
 */
export function processRequirements(
  requirements: StripeRequirements
): ProcessedRequirements {
  const allRequirements = [
    ...requirements.currentlyDue,
    ...requirements.eventuallyDue,
    ...requirements.pastDue,
    ...requirements.pendingVerification,
  ];

  const fieldNameMappings: Record<string, string> = {
    'individual.ssn_last_4': 'Social Security Number (last 4 digits)',
    'individual.id_number': 'Government ID number',
    'individual.verification.document': 'Identity verification document',
    'individual.verification.additional_document': 'Additional verification document',
    'business_profile.url': 'Business website',
    'business_profile.support_phone': 'Support phone number',
    'external_account': 'Bank account information',
    'tos_acceptance.date': 'Terms of service acceptance',
  };

  const processedRequirements = allRequirements.map(req => ({
    ...req,
    displayName: fieldNameMappings[req.fieldName] || req.fieldName,
    isUrgent: req.requirementType === 'currently_due' || req.requirementType === 'past_due',
    hasError: req.errorCode !== null,
    deadlineFormatted: req.deadline ? new Date(req.deadline).toLocaleDateString() : null,
  }));

  return {
    all: processedRequirements,
    urgent: processedRequirements.filter(req => req.isUrgent),
    withErrors: processedRequirements.filter(req => req.hasError),
    count: {
      total: allRequirements.length,
      currentlyDue: requirements.currentlyDue.length,
      pastDue: requirements.pastDue.length,
      pendingVerification: requirements.pendingVerification.length,
    },
  };
}

export interface ProcessedRequirements {
  all: (StripeAccountRequirement & {
    displayName: string;
    isUrgent: boolean;
    hasError: boolean;
    deadlineFormatted: string | null;
  })[];
  urgent: (StripeAccountRequirement & {
    displayName: string;
    isUrgent: boolean;
    hasError: boolean;
    deadlineFormatted: string | null;
  })[];
  withErrors: (StripeAccountRequirement & {
    displayName: string;
    isUrgent: boolean;
    hasError: boolean;
    deadlineFormatted: string | null;
  })[];
  count: {
    total: number;
    currentlyDue: number;
    pastDue: number;
    pendingVerification: number;
  };
}
```

---

## Next: Part 3 - Implementation & Error Handling

Continue to [Part 3: Implementation & Error Handling](./STRIPE_CONNECT_INTEGRATION_GUIDE_PART_3_IMPLEMENTATION.md) for complete React components, API client implementation, error handling strategies, and testing approaches.
