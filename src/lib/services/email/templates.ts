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

export type TemplateVariables = Record<string, any>;

export const EMAIL_TEMPLATES = {
  'welcome': WelcomeEmail,
  'welcome-email': WelcomeEmail,
  'email-verification': EmailVerification,
  'password-reset': PasswordReset,
  'password-changed': PasswordChanged,
  'royalty-statement': RoyaltyStatement,
  'license-expiry': LicenseExpiry,
  'payout-confirmation': PayoutConfirmation,
  'brand-verification-request': BrandVerificationRequest,
  'brand-welcome': BrandWelcome,
  'brand-verification-complete': BrandVerificationComplete,
  'brand-verification-rejected': BrandVerificationRejectedEmail,
  'brand-team-invitation': BrandTeamInvitation,
} as const;

export type TemplateKey = keyof typeof EMAIL_TEMPLATES;

export function renderTemplate(
  templateName: TemplateKey,
  variables: TemplateVariables
): React.ReactElement {
  const Template = EMAIL_TEMPLATES[templateName];
  
  if (!Template) {
    throw new Error(`Template not found: ${templateName}`);
  }
  
  return React.createElement(Template as any, variables);
}

// Map template names to email preference categories
export function getCategoryFromTemplate(template: string): string {
  const mapping: Record<string, string> = {
    'royalty-statement': 'royaltyStatements',
    'license-expiry': 'licenseExpiry',
    'payout-confirmation': 'payouts',
    'welcome': 'system',
    'welcome-email': 'system',
    'email-verification': 'system',
    'password-reset': 'system',
    'password-changed': 'system',
    'brand-verification-request': 'system',
    'brand-welcome': 'system',
    'brand-verification-complete': 'system',
    'brand-verification-rejected': 'system',
    'brand-team-invitation': 'system',
  };
  return mapping[template] || 'other';
}