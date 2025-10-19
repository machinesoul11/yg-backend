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
import PayoutFailed from '../../../../emails/templates/PayoutFailed';
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
import LicenseRenewalOffer from '../../../../emails/templates/LicenseRenewalOffer';
import LicenseRenewalReminder from '../../../../emails/templates/LicenseRenewalReminder';
import LicenseRenewalComplete from '../../../../emails/templates/LicenseRenewalComplete';
import LicenseExpiry90DayNotice from '../../../../emails/templates/LicenseExpiry90DayNotice';
import LicenseExpiry60DayNotice from '../../../../emails/templates/LicenseExpiry60DayNotice';
import LicenseExpiry30DayNotice from '../../../../emails/templates/LicenseExpiry30DayNotice';
import ScheduledReportDelivery from '../../../../emails/templates/ScheduledReportDelivery';
import CustomReportReady from '../../../../emails/templates/CustomReportReady';
import LowBackupCodesAlert from '../../../../emails/templates/LowBackupCodesAlert';
import AccountLocked from '../../../../emails/templates/AccountLocked';
import UnusualLoginAlert from '../../../../emails/templates/UnusualLoginAlert';
import TwoFactorEnabled from '../../../../emails/templates/TwoFactorEnabled';
import TwoFactorDisabled from '../../../../emails/templates/TwoFactorDisabled';
import NewDeviceLogin from '../../../../emails/templates/NewDeviceLogin';
import BackupCodesRegenerated from '../../../../emails/templates/BackupCodesRegenerated';
import TwoFactorAdminReset from '../../../../emails/templates/TwoFactorAdminReset';
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

export interface LowBackupCodesAlertProps {
  userName: string;
  remainingCodes: number;
  regenerateUrl: string;
}

export interface AccountLockedProps {
  userName: string;
  lockedUntil: string;
  lockoutMinutes: number;
  ipAddress: string;
  failedAttempts: number;
  unlockTime: string;
}

export interface UnusualLoginAlertProps {
  userName: string;
  ipAddress: string;
  location: string;
  device: string;
  timestamp: string;
  anomalyReasons: string;
}

export interface TwoFactorEnabledProps {
  userName: string;
  enabledAt: string;
  method: string;
  ipAddress: string;
  device: string;
  backupCodesCount: number;
  securityUrl: string;
}

export interface TwoFactorDisabledProps {
  userName: string;
  disabledAt: string;
  method: string;
  ipAddress: string;
  device: string;
  securityUrl: string;
}

export interface NewDeviceLoginProps {
  userName: string;
  loginTime: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  location: string;
  securityUrl: string;
}

export interface BackupCodesRegeneratedProps {
  userName: string;
  regeneratedAt: string;
  newCodesCount: number;
  ipAddress: string;
  device: string;
  securityUrl: string;
}

export interface TwoFactorAdminResetProps {
  userName: string;
  resetReason: string;
  resetDate: string;
  setupUrl: string;
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
  userName: string;
  amount: string;
  currency: string;
  period: string;
  transferId: string;
  estimatedArrival: string;
}

export interface PayoutFailedProps {
  userName: string;
  amount: number;
  currency: string;
  errorMessage: string;
  actionSteps: string;
  supportUrl: string;
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

export interface LicenseRenewalOfferProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  currentEndDate: string;
  proposedStartDate: string;
  proposedEndDate: string;
  originalFeeDollars: string;
  renewalFeeDollars: string;
  feeChange: string;
  revSharePercent: string;
  daysUntilExpiration: number;
  renewalUrl: string;
  adjustmentsSummary?: string[];
}

export interface LicenseRenewalReminderProps {
  brandName: string;
  contactName: string;
  licenseName: string;
  ipAssetTitle: string;
  expirationDate: string;
  daysRemaining: number;
  renewalFeeDollars: string;
  renewalUrl: string;
  urgencyLevel: 'final' | 'high' | 'medium';
}

export interface LicenseRenewalCompleteProps {
  recipientName: string;
  recipientType: 'brand' | 'creator';
  licenseName: string;
  ipAssetTitle: string;
  newStartDate: string;
  newEndDate: string;
  renewalFeeDollars: string;
  revSharePercent: string;
  confirmationNumber: string;
  licenseUrl: string;
  brandName?: string;
  creatorNames?: string[];
}

export interface LicenseExpiry90DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
}

export interface LicenseExpiry60DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
}

export interface LicenseExpiry30DayNoticeProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: string;
  renewalUrl?: string;
  licenseUrl: string;
  autoRenewEnabled?: boolean;
  recipientRole?: 'brand' | 'creator';
  gracePeriodActive?: boolean;
  expired?: boolean;
}

export interface ScheduledReportDeliveryProps {
  recipientName: string;
  reportName: string;
  reportType: string;
  reportPeriod: string;
  frequency: string;
  downloadUrl: string;
  expiresAt: string;
  nextScheduledDate: string;
  attachmentCount: number;
  fileFormats: string[];
  reportSummary?: {
    keyMetrics: Array<{
      label: string;
      value: string;
      trend?: 'up' | 'down' | 'stable';
    }>;
  };
}

export interface CustomReportReadyProps {
  recipientName: string;
  reportName: string;
  reportDescription?: string;
  reportCategory: string;
  dateRange: string;
  downloadUrl: string;
  expiresAt: string;
  fileFormat: string;
  fileSizeMB: string;
  generationTime: string;
  warnings?: string[];
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
  'payout-failed': {
    component: PayoutFailed,
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
  'license-renewal-offer': {
    component: LicenseRenewalOffer,
    category: 'licenseExpiry',
  },
  'license-renewal-reminder': {
    component: LicenseRenewalReminder,
    category: 'licenseExpiry',
  },
  'license-renewal-complete': {
    component: LicenseRenewalComplete,
    category: 'licenseExpiry',
  },
  'license-expiry-90-day': {
    component: LicenseExpiry90DayNotice,
    category: 'licenseExpiry',
  },
  'license-expiry-60-day': {
    component: LicenseExpiry60DayNotice,
    category: 'licenseExpiry',
  },
  'license-expiry-30-day': {
    component: LicenseExpiry30DayNotice,
    category: 'licenseExpiry',
  },
  'scheduled-report-delivery': {
    component: ScheduledReportDelivery,
    category: 'reports',
  },
  'custom-report-ready': {
    component: CustomReportReady,
    category: 'reports',
  },
  'low-backup-codes-alert': {
    component: LowBackupCodesAlert,
    category: 'system',
  },
  'account-locked': {
    component: AccountLocked,
    category: 'system',
  },
  'unusual-login-alert': {
    component: UnusualLoginAlert,
    category: 'system',
  },
  'two-factor-enabled': {
    component: TwoFactorEnabled,
    category: 'system',
  },
  'two-factor-disabled': {
    component: TwoFactorDisabled,
    category: 'system',
  },
  'new-device-login': {
    component: NewDeviceLogin,
    category: 'system',
  },
  'backup-codes-regenerated': {
    component: BackupCodesRegenerated,
    category: 'system',
  },
  '2fa-admin-reset': {
    component: TwoFactorAdminReset,
    category: 'system',
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
  'payout-failed': PayoutFailedProps;
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
  'license-renewal-offer': LicenseRenewalOfferProps;
  'license-renewal-reminder': LicenseRenewalReminderProps;
  'license-renewal-complete': LicenseRenewalCompleteProps;
  'license-expiry-90-day': LicenseExpiry90DayNoticeProps;
  'license-expiry-60-day': LicenseExpiry60DayNoticeProps;
  'license-expiry-30-day': LicenseExpiry30DayNoticeProps;
  'scheduled-report-delivery': ScheduledReportDeliveryProps;
  'custom-report-ready': CustomReportReadyProps;
  'low-backup-codes-alert': LowBackupCodesAlertProps;
  'account-locked': AccountLockedProps;
  'unusual-login-alert': UnusualLoginAlertProps;
  'two-factor-enabled': TwoFactorEnabledProps;
  'two-factor-disabled': TwoFactorDisabledProps;
  'new-device-login': NewDeviceLoginProps;
  'backup-codes-regenerated': BackupCodesRegeneratedProps;
  '2fa-admin-reset': TwoFactorAdminResetProps;
}

export type TemplateVariables<T extends TemplateKey = TemplateKey> = T extends keyof TemplateVariablesMap ? TemplateVariablesMap[T] : never;

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
    'payout-failed': ['userName', 'amount', 'currency', 'errorMessage', 'actionSteps', 'supportUrl'],
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
    'license-renewal-offer': ['brandName', 'contactName', 'licenseName', 'ipAssetTitle', 'currentEndDate', 'proposedStartDate', 'proposedEndDate', 'originalFeeDollars', 'renewalFeeDollars', 'feeChange', 'revSharePercent', 'daysUntilExpiration', 'renewalUrl'],
    'license-renewal-reminder': ['brandName', 'contactName', 'licenseName', 'ipAssetTitle', 'expirationDate', 'daysRemaining', 'renewalFeeDollars', 'renewalUrl', 'urgencyLevel'],
    'license-renewal-complete': ['recipientName', 'recipientType', 'licenseName', 'ipAssetTitle', 'newStartDate', 'newEndDate', 'renewalFeeDollars', 'revSharePercent', 'confirmationNumber', 'licenseUrl'],
    'license-expiry-90-day': ['userName', 'licenseName', 'brandName', 'expiryDate', 'daysRemaining', 'licenseUrl'],
    'license-expiry-60-day': ['userName', 'licenseName', 'brandName', 'expiryDate', 'daysRemaining', 'licenseUrl'],
    'license-expiry-30-day': ['userName', 'licenseName', 'brandName', 'expiryDate', 'daysRemaining', 'licenseUrl'],
    'scheduled-report-delivery': ['recipientName', 'reportName', 'reportType', 'reportPeriod', 'frequency', 'downloadUrl', 'expiresAt', 'nextScheduledDate', 'attachmentCount', 'fileFormats'],
    'custom-report-ready': ['recipientName', 'reportName', 'reportCategory', 'dateRange', 'downloadUrl', 'expiresAt', 'fileFormat', 'fileSizeMB', 'generationTime'],
    'low-backup-codes-alert': ['userName', 'remainingCodes', 'regenerateUrl'],
    'account-locked': ['userName', 'lockedUntil', 'lockoutMinutes', 'ipAddress', 'failedAttempts', 'unlockTime'],
    'unusual-login-alert': ['userName', 'ipAddress', 'location', 'device', 'timestamp', 'anomalyReasons'],
    'two-factor-enabled': ['userName', 'enabledAt', 'method', 'ipAddress', 'device', 'backupCodesCount', 'securityUrl'],
    'two-factor-disabled': ['userName', 'disabledAt', 'method', 'ipAddress', 'device', 'securityUrl'],
    'new-device-login': ['userName', 'loginTime', 'deviceName', 'deviceType', 'browser', 'operatingSystem', 'ipAddress', 'location', 'securityUrl'],
    'backup-codes-regenerated': ['userName', 'regeneratedAt', 'newCodesCount', 'ipAddress', 'device', 'securityUrl'],
    '2fa-admin-reset': ['userName', 'resetReason', 'resetDate', 'setupUrl'],
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
