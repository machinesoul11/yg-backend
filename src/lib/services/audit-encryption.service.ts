/**
 * Audit Log Encryption Service
 * 
 * Provides field-level encryption for sensitive audit log metadata.
 * Uses AES-256-GCM encryption for sensitive PII, financial data, and confidential information.
 * 
 * Encrypted fields:
 * - Personal Identifiable Information (PII)
 * - Financial transaction details
 * - Authentication secrets
 * - Confidential business data
 */

import { encrypt, decrypt } from '@/lib/auth/encryption';

export interface SensitiveAuditMetadata {
  // PII
  ssn?: string;
  taxId?: string;
  bankAccount?: string;
  creditCard?: string;
  phoneNumber?: string;
  
  // Financial
  accountBalance?: number;
  transactionAmount?: number;
  stripeCustomerId?: string;
  paymentMethodDetails?: any;
  
  // Authentication
  twoFactorSecret?: string;
  recoveryCode?: string;
  
  // Business Confidential
  contractTerms?: any;
  pricingData?: any;
  proprietaryMetrics?: any;
  
  // Generic sensitive data
  [key: string]: any;
}

/**
 * Encrypt sensitive audit metadata
 * Returns encrypted string that can be stored in encryptedMetadata field
 */
export function encryptAuditMetadata(metadata: SensitiveAuditMetadata): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error('Cannot encrypt empty metadata');
  }
  
  const jsonString = JSON.stringify(metadata);
  return encrypt(jsonString);
}

/**
 * Decrypt sensitive audit metadata
 * Returns original metadata object from encrypted string
 */
export function decryptAuditMetadata(encryptedData: string): SensitiveAuditMetadata {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }
  
  const decrypted = decrypt(encryptedData);
  return JSON.parse(decrypted);
}

/**
 * Safely attempt to decrypt audit metadata
 * Returns null if decryption fails instead of throwing
 */
export function safeDecryptAuditMetadata(encryptedData: string | null | undefined): SensitiveAuditMetadata | null {
  if (!encryptedData) {
    return null;
  }
  
  try {
    return decryptAuditMetadata(encryptedData);
  } catch (error) {
    console.error('Failed to decrypt audit metadata', {
      error: error instanceof Error ? error.message : String(error),
      dataLength: encryptedData?.length,
    });
    return null;
  }
}

/**
 * Check if metadata contains sensitive fields that should be encrypted
 */
export function containsSensitiveData(metadata: any): boolean {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }
  
  const sensitiveKeys = [
    'ssn',
    'taxId',
    'tax_id',
    'bankAccount',
    'bank_account',
    'accountNumber',
    'account_number',
    'routingNumber',
    'routing_number',
    'creditCard',
    'credit_card',
    'cardNumber',
    'card_number',
    'cvv',
    'phoneNumber',
    'phone_number',
    'twoFactorSecret',
    'two_factor_secret',
    'totpSecret',
    'totp_secret',
    'recoveryCode',
    'recovery_code',
    'password',
    'passwordHash',
    'password_hash',
    'apiKey',
    'api_key',
    'secretKey',
    'secret_key',
    'privateKey',
    'private_key',
    'stripeCustomerId',
    'stripe_customer_id',
    'accountBalance',
    'account_balance',
    'transactionAmount',
    'transaction_amount',
  ];
  
  // Check if any sensitive key exists in the metadata
  for (const key of sensitiveKeys) {
    if (key in metadata) {
      return true;
    }
  }
  
  // Check nested objects
  for (const value of Object.values(metadata)) {
    if (value && typeof value === 'object') {
      if (containsSensitiveData(value)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Split metadata into sensitive and non-sensitive parts
 * Sensitive data goes to encryptedMetadata, rest stays in regular metadata
 */
export function splitMetadata(metadata: any): {
  publicMetadata: any;
  sensitiveMetadata: SensitiveAuditMetadata | null;
} {
  if (!metadata || typeof metadata !== 'object') {
    return { publicMetadata: metadata, sensitiveMetadata: null };
  }
  
  const sensitiveKeys = new Set([
    'ssn', 'taxId', 'tax_id', 'bankAccount', 'bank_account',
    'accountNumber', 'account_number', 'routingNumber', 'routing_number',
    'creditCard', 'credit_card', 'cardNumber', 'card_number', 'cvv',
    'phoneNumber', 'phone_number', 'twoFactorSecret', 'two_factor_secret',
    'totpSecret', 'totp_secret', 'recoveryCode', 'recovery_code',
    'password', 'passwordHash', 'password_hash', 'apiKey', 'api_key',
    'secretKey', 'secret_key', 'privateKey', 'private_key',
    'stripeCustomerId', 'stripe_customer_id', 'accountBalance', 'account_balance',
    'transactionAmount', 'transaction_amount', 'paymentMethodDetails', 'payment_method_details',
  ]);
  
  const publicMetadata: any = {};
  const sensitiveMetadata: any = {};
  let hasSensitiveData = false;
  
  for (const [key, value] of Object.entries(metadata)) {
    if (sensitiveKeys.has(key)) {
      sensitiveMetadata[key] = value;
      hasSensitiveData = true;
    } else {
      publicMetadata[key] = value;
    }
  }
  
  return {
    publicMetadata: Object.keys(publicMetadata).length > 0 ? publicMetadata : null,
    sensitiveMetadata: hasSensitiveData ? sensitiveMetadata : null,
  };
}
