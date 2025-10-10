import * as React from 'react';
import WelcomeEmail from '../../../../emails/templates/WelcomeEmail';
import EmailVerification from '../../../../emails/templates/EmailVerification';
import PasswordReset from '../../../../emails/templates/PasswordReset';
import RoyaltyStatement from '../../../../emails/templates/RoyaltyStatement';
import LicenseExpiry from '../../../../emails/templates/LicenseExpiry';
import PayoutConfirmation from '../../../../emails/templates/PayoutConfirmation';

export type TemplateVariables = Record<string, any>;

export const EMAIL_TEMPLATES = {
  'welcome': WelcomeEmail,
  'email-verification': EmailVerification,
  'password-reset': PasswordReset,
  'royalty-statement': RoyaltyStatement,
  'license-expiry': LicenseExpiry,
  'payout-confirmation': PayoutConfirmation,
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
    'email-verification': 'system',
    'password-reset': 'system',
  };
  return mapping[template] || 'other';
}
