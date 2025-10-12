/**
 * Email Template Registry
 * 
 * Provides type-safe template variable injection with compile-time validation.
 * Each template defines its own props interface, ensuring that all required
 * variables are provided when sending emails.
 */

import * as React from 'react';
import WelcomeEmail from '../../../../emails/templates/WelcomeEmail';
import EmailVerification from '../../../../emails/templates/EmailVerification';
import PasswordReset from '../../../../emails/templates/PasswordReset';
import PasswordChanged from '../../../../emails/templates/PasswordChanged';
import RoyaltyStatement from '../../../../emails/templates/RoyaltyStatement';
import LicenseExpiry from '../../../../emails/templates/LicenseExpiry';
import PayoutConfirmation from '../../../../emails/templates/PayoutConfirmation';
import BrandVerificationRequest from '../../../../emails/templates/BrandVerificationRequest';
import BrandWelcome from '../../../../emails/templates/BrandWelcome';
import BrandVerificationComplete from '../../../../emails/templates/BrandVerificationComplete';
import BrandVerificationRejectedEmail from '../../../../emails/templates/BrandVerificationRejectedEmail';
import BrandTeamInvitation from '../../../../emails/templates/BrandTeamInvitation';
import RoleChanged from '../../../../emails/templates/RoleChanged';
import MonthlyNewsletter from '../../../../emails/templates/MonthlyNewsletter';
import TransactionReceipt from '../../../../emails/templates/TransactionReceipt';
import ProjectInvitation from '../../../../emails/templates/ProjectInvitation';
import CreatorWelcome from '../../../../emails/templates/CreatorWelcome';
import CreatorVerificationApproved from '../../../../emails/templates/CreatorVerificationApproved';
import CreatorVerificationRejected from '../../../../emails/templates/CreatorVerificationRejected';
import NewMessage from '../../../../emails/templates/NewMessage';
import MessageDigest from '../../../../emails/templates/MessageDigest';
import { EmailTemplateError } from '@/lib/services/email/errors';

/**
 * Template variable types for each email template.
 * These interfaces define the required and optional props for each template.
 */
export interface WelcomeEmailProps {
  userName: string;
  loginUrl?: string;
}

export interface EmailVerificationProps {
  userName: string;
  verificationUrl: string;
  expiresInHours?: number;
}

export interface PasswordResetProps {
  userName: string;
  resetUrl: string;
  expiresInHours?: number;
}

export interface PasswordChangedProps {
  userName: string;
  changeTime?: Date;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface RoyaltyStatementProps {
  creatorName: string;
  periodStart: Date;
  periodEnd: Date;
  totalRoyalties: number;
  currency: string;
  statementUrl: string;
  lineItems?: Array<{
    assetName: string;
    amount: number;
    units: number;
  }>;
}

export interface LicenseExpiryProps {
  licenseName: string;
  assetName: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  renewalUrl?: string;
}

export interface PayoutConfirmationProps {
  creatorName: string;
  amount: number;
  currency: string;
  payoutMethod: string;
  estimatedArrival: Date;
  transactionId: string;
}

export interface BrandVerificationRequestProps {
  brandName: string;
  submittedBy: string;
  submittedAt: Date;
  reviewUrl: string;
}

export interface BrandWelcomeProps {
  brandName: string;
  primaryContactName: string;
  dashboardUrl: string;
}

export interface BrandVerificationCompleteProps {
  brandName: string;
  verifiedAt: Date;
  dashboardUrl: string;
}

export interface BrandVerificationRejectedProps {
  brandName: string;
  rejectionReason: string;
  resubmitUrl?: string;
}

export interface BrandTeamInvitationProps {
  inviterName: string;
  brandName: string;
  role: string;
  acceptUrl: string;
  expiresInDays?: number;
}

export interface RoleChangedProps {
  userName: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
  effectiveDate?: Date;
}

export interface MonthlyNewsletterProps {
  userName: string;
  month: string;
  year: number;
  highlights: Array<{
    title: string;
    description: string;
    url?: string;
  }>;
}

export interface TransactionReceiptProps {
  recipientName: string;
  transactionId: string;
  transactionDate: Date;
  amount: number;
  currency: string;
  description: string;
  receiptUrl?: string;
}

export interface ProjectInvitationProps {
  inviterName: string;
  projectName: string;
  projectDescription?: string;
  role: string;
  acceptUrl: string;
  declineUrl?: string;
}

export interface CreatorWelcomeProps {
  creatorName: string;
  dashboardUrl: string;
}

export interface CreatorVerificationApprovedProps {
  creatorName: string;
  approvedAt: Date;
  dashboardUrl: string;
}

export interface CreatorVerificationRejectedProps {
  creatorName: string;
  rejectionReason: string;
  resubmitUrl?: string;
}

export interface NewMessageProps {
  recipientName?: string;
  senderName: string;
  senderAvatar?: string;
  threadSubject?: string;
  messagePreview: string;
  threadUrl: string;
}

export interface MessageDigestProps {
  recipientName?: string;
  frequency: 'daily' | 'weekly';
  threads: Array<{
    threadId: string;
    threadSubject: string | null;
    messageCount: number;
    senders: string[];
    latestMessage: {
      senderName: string;
      body: string;
      createdAt: Date;
    };
  }>;
  totalUnreadCount: number;
  inboxUrl: string;
}

/**
 * Template registry mapping template keys to their components and props types
 */
export const TEMPLATE_REGISTRY = {
  'welcome': {
    component: WelcomeEmail,
    category: 'system',
  },
  'welcome-email': {
    component: WelcomeEmail,
    category: 'system',
  },
  'email-verification': {
    component: EmailVerification,
    category: 'system',
  },
  'password-reset': {
    component: PasswordReset,
    category: 'system',
  },
  'password-changed': {
    component: PasswordChanged,
    category: 'system',
  },
  'royalty-statement': {
    component: RoyaltyStatement,
    category: 'royaltyStatements',
  },
  'license-expiry': {
    component: LicenseExpiry,
    category: 'licenseExpiry',
  },
  'payout-confirmation': {
    component: PayoutConfirmation,
    category: 'payouts',
  },
  'brand-verification-request': {
    component: BrandVerificationRequest,
    category: 'system',
  },
  'brand-welcome': {
    component: BrandWelcome,
    category: 'system',
  },
  'brand-verification-complete': {
    component: BrandVerificationComplete,
    category: 'system',
  },
  'brand-verification-rejected': {
    component: BrandVerificationRejectedEmail,
    category: 'system',
  },
  'brand-team-invitation': {
    component: BrandTeamInvitation,
    category: 'system',
  },
  'role-changed': {
    component: RoleChanged,
    category: 'system',
  },
  'monthly-newsletter': {
    component: MonthlyNewsletter,
    category: 'newsletters',
  },
  'transaction-receipt': {
    component: TransactionReceipt,
    category: 'system',
  },
  'project-invitation': {
    component: ProjectInvitation,
    category: 'projectInvitations',
  },
  'creator-welcome': {
    component: CreatorWelcome,
    category: 'system',
  },
  'creator-verification-approved': {
    component: CreatorVerificationApproved,
    category: 'system',
  },
  'creator-verification-rejected': {
    component: CreatorVerificationRejected,
    category: 'system',
  },
  'new-message': {
    component: NewMessage,
    category: 'messages',
  },
  'message-digest': {
    component: MessageDigest,
    category: 'messages',
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATE_REGISTRY;

/**
 * Type mapping for template variables based on template key
 */
export interface TemplateVariablesMap {
  'welcome': WelcomeEmailProps;
  'welcome-email': WelcomeEmailProps;
  'email-verification': EmailVerificationProps;
  'password-reset': PasswordResetProps;
  'password-changed': PasswordChangedProps;
  'royalty-statement': RoyaltyStatementProps;
  'license-expiry': LicenseExpiryProps;
  'payout-confirmation': PayoutConfirmationProps;
  'brand-verification-request': BrandVerificationRequestProps;
  'brand-welcome': BrandWelcomeProps;
  'brand-verification-complete': BrandVerificationCompleteProps;
  'brand-verification-rejected': BrandVerificationRejectedProps;
  'brand-team-invitation': BrandTeamInvitationProps;
  'role-changed': RoleChangedProps;
  'monthly-newsletter': MonthlyNewsletterProps;
  'transaction-receipt': TransactionReceiptProps;
  'project-invitation': ProjectInvitationProps;
  'creator-welcome': CreatorWelcomeProps;
  'creator-verification-approved': CreatorVerificationApprovedProps;
  'creator-verification-rejected': CreatorVerificationRejectedProps;
  'new-message': NewMessageProps;
  'message-digest': MessageDigestProps;
}

export type TemplateVariables<T extends TemplateKey = TemplateKey> = TemplateVariablesMap[T];

/**
 * Render a template with type-safe variable injection
 */
export function renderTemplate<T extends TemplateKey>(
  templateKey: T,
  variables: TemplateVariables<T>
): React.ReactElement {
  const template = TEMPLATE_REGISTRY[templateKey];
  
  if (!template) {
    throw new EmailTemplateError(
      templateKey,
      'Template not found in registry'
    );
  }
  
  // Validate required variables are present
  validateTemplateVariables(templateKey, variables);
  
  return React.createElement(template.component as any, variables);
}

/**
 * Get the email category for a template (for preference checking)
 */
export function getCategoryFromTemplate(templateKey: string): string {
  const template = TEMPLATE_REGISTRY[templateKey as TemplateKey];
  return template?.category || 'other';
}

/**
 * Validate that all required variables are provided for a template
 */
function validateTemplateVariables<T extends TemplateKey>(
  templateKey: T,
  variables: any
): void {
  if (!variables || typeof variables !== 'object') {
    throw new EmailTemplateError(
      templateKey,
      'Template variables must be an object'
    );
  }

  // Template-specific validation
  const requiredFields = getRequiredFields(templateKey);
  const missingFields = requiredFields.filter(field => !(field in variables));

  if (missingFields.length > 0) {
    throw new EmailTemplateError(
      templateKey,
      `Missing required variables: ${missingFields.join(', ')}`,
      missingFields
    );
  }
}

/**
 * Get required fields for each template
 */
function getRequiredFields(templateKey: TemplateKey): string[] {
  const requiredFieldsMap: Record<TemplateKey, string[]> = {
    'welcome': ['userName'],
    'welcome-email': ['userName'],
    'email-verification': ['userName', 'verificationUrl'],
    'password-reset': ['userName', 'resetUrl'],
    'password-changed': ['userName'],
    'royalty-statement': ['creatorName', 'periodStart', 'periodEnd', 'totalRoyalties', 'currency', 'statementUrl'],
    'license-expiry': ['licenseName', 'assetName', 'expiryDate', 'daysUntilExpiry'],
    'payout-confirmation': ['creatorName', 'amount', 'currency', 'payoutMethod', 'estimatedArrival', 'transactionId'],
    'brand-verification-request': ['brandName', 'submittedBy', 'submittedAt', 'reviewUrl'],
    'brand-welcome': ['brandName', 'primaryContactName', 'dashboardUrl'],
    'brand-verification-complete': ['brandName', 'verifiedAt', 'dashboardUrl'],
    'brand-verification-rejected': ['brandName', 'rejectionReason'],
    'brand-team-invitation': ['inviterName', 'brandName', 'role', 'acceptUrl'],
    'role-changed': ['userName', 'oldRole', 'newRole', 'changedBy'],
    'monthly-newsletter': ['userName', 'month', 'year', 'highlights'],
    'transaction-receipt': ['recipientName', 'transactionId', 'transactionDate', 'amount', 'currency', 'description'],
    'project-invitation': ['inviterName', 'projectName', 'role', 'acceptUrl'],
    'creator-welcome': ['creatorName', 'dashboardUrl'],
    'creator-verification-approved': ['creatorName', 'approvedAt', 'dashboardUrl'],
    'creator-verification-rejected': ['creatorName', 'rejectionReason'],
    'new-message': ['senderName', 'messagePreview', 'threadUrl'],
    'message-digest': ['frequency', 'threads', 'totalUnreadCount', 'inboxUrl'],
  };

  return requiredFieldsMap[templateKey] || [];
}

/**
 * Get a list of all available templates
 */
export function getAllTemplateKeys(): TemplateKey[] {
  return Object.keys(TEMPLATE_REGISTRY) as TemplateKey[];
}

/**
 * Check if a template exists
 */
export function templateExists(templateKey: string): templateKey is TemplateKey {
  return templateKey in TEMPLATE_REGISTRY;
}
