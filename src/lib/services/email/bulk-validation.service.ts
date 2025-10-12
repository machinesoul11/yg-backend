/**
 * Bulk Email Validation Service
 * 
 * Provides utilities for validating multiple email addresses efficiently:
 * - Batch validation with detailed error reporting
 * - MX record checking for domain validation
 * - Disposable email detection
 * - Common typo correction suggestions
 * - Parallel processing for large lists
 */

import dns from 'dns/promises';
import { sanitizeEmailAddress } from './sanitization.service';
import { EmailValidationError } from './errors';

export interface EmailValidationResult {
  email: string;
  isValid: boolean;
  normalizedEmail?: string;
  error?: string;
  warnings?: string[];
  suggestions?: string[];
}

export interface BulkValidationResult {
  totalEmails: number;
  validEmails: number;
  invalidEmails: number;
  results: EmailValidationResult[];
  validEmailList: string[];
  invalidEmailList: string[];
}

/**
 * Common email domain typos and their corrections
 */
const COMMON_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'iclod.com': 'icloud.com',
  'iclould.com': 'icloud.com',
};

/**
 * Known disposable email domains
 */
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'throwaway.email',
  'temp-mail.org',
  'getnada.com',
  'maildrop.cc',
  'trashmail.com',
  'yopmail.com',
]);

/**
 * Validate a single email address with detailed checks
 */
export async function validateEmail(
  email: string,
  options: {
    checkMx?: boolean;
    checkDisposable?: boolean;
    checkTypos?: boolean;
  } = {}
): Promise<EmailValidationResult> {
  const {
    checkMx = true,
    checkDisposable = true,
    checkTypos = true,
  } = options;

  const result: EmailValidationResult = {
    email,
    isValid: false,
    warnings: [],
    suggestions: [],
  };

  try {
    // Step 1: Basic format validation and sanitization
    const normalized = sanitizeEmailAddress(email);
    result.normalizedEmail = normalized;

    // Step 2: Check for typos in domain
    if (checkTypos) {
      const [localPart, domain] = normalized.split('@');
      if (domain && COMMON_TYPOS[domain]) {
        result.warnings?.push(`Possible typo in domain: ${domain}`);
        result.suggestions?.push(`${localPart}@${COMMON_TYPOS[domain]}`);
      }
    }

    // Step 3: Check for disposable email
    if (checkDisposable) {
      const domain = normalized.split('@')[1];
      if (domain && DISPOSABLE_DOMAINS.has(domain)) {
        result.warnings?.push('Disposable email address detected');
      }
    }

    // Step 4: Check MX records
    if (checkMx) {
      const domain = normalized.split('@')[1];
      if (domain) {
        try {
          const mxRecords = await dns.resolveMx(domain);
          if (!mxRecords || mxRecords.length === 0) {
            result.isValid = false;
            result.error = 'Domain has no MX records';
            return result;
          }
        } catch (error: any) {
          // DNS lookup failed
          if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
            result.isValid = false;
            result.error = 'Domain does not exist';
            return result;
          }
          // Other DNS errors - don't fail validation, just warn
          result.warnings?.push('Could not verify domain MX records');
        }
      }
    }

    // All checks passed
    result.isValid = true;
  } catch (error) {
    if (error instanceof EmailValidationError) {
      result.error = error.message;
    } else {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return result;
}

/**
 * Validate multiple email addresses in bulk
 */
export async function validateEmailsBulk(
  emails: string[],
  options: {
    checkMx?: boolean;
    checkDisposable?: boolean;
    checkTypos?: boolean;
    parallel?: boolean;
    batchSize?: number;
  } = {}
): Promise<BulkValidationResult> {
  const {
    parallel = true,
    batchSize = 50,
    ...validationOptions
  } = options;

  // Remove duplicates
  const uniqueEmails = Array.from(new Set(emails));

  let results: EmailValidationResult[];

  if (parallel) {
    // Process in batches to avoid overwhelming DNS
    results = [];
    for (let i = 0; i < uniqueEmails.length; i += batchSize) {
      const batch = uniqueEmails.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(email => validateEmail(email, validationOptions))
      );
      results.push(...batchResults);
    }
  } else {
    // Sequential processing
    results = [];
    for (const email of uniqueEmails) {
      const result = await validateEmail(email, validationOptions);
      results.push(result);
    }
  }

  // Compile summary
  const validResults = results.filter(r => r.isValid);
  const invalidResults = results.filter(r => !r.isValid);

  return {
    totalEmails: uniqueEmails.length,
    validEmails: validResults.length,
    invalidEmails: invalidResults.length,
    results,
    validEmailList: validResults.map(r => r.normalizedEmail || r.email),
    invalidEmailList: invalidResults.map(r => r.email),
  };
}

/**
 * Quick validation for a list of emails (format only, no MX checks)
 */
export function validateEmailsQuick(emails: string[]): BulkValidationResult {
  const uniqueEmails = Array.from(new Set(emails));
  
  const results = uniqueEmails.map(email => {
    const result: EmailValidationResult = {
      email,
      isValid: false,
    };

    try {
      const normalized = sanitizeEmailAddress(email);
      result.normalizedEmail = normalized;
      result.isValid = true;
    } catch (error) {
      if (error instanceof EmailValidationError) {
        result.error = error.message;
      } else {
        result.error = 'Invalid email format';
      }
    }

    return result;
  });

  const validResults = results.filter(r => r.isValid);
  const invalidResults = results.filter(r => !r.isValid);

  return {
    totalEmails: uniqueEmails.length,
    validEmails: validResults.length,
    invalidEmails: invalidResults.length,
    results,
    validEmailList: validResults.map(r => r.normalizedEmail || r.email),
    invalidEmailList: invalidResults.map(r => r.email),
  };
}

/**
 * Deduplicate email list and normalize
 */
export function deduplicateEmails(emails: string[]): string[] {
  const normalized = new Set<string>();
  
  for (const email of emails) {
    try {
      const clean = sanitizeEmailAddress(email);
      normalized.add(clean);
    } catch {
      // Skip invalid emails
    }
  }
  
  return Array.from(normalized);
}

/**
 * Split emails into valid and invalid groups
 */
export async function partitionEmails(
  emails: string[],
  options?: {
    checkMx?: boolean;
    checkDisposable?: boolean;
  }
): Promise<{
  valid: string[];
  invalid: string[];
  warnings: Array<{ email: string; warning: string }>;
}> {
  const validation = await validateEmailsBulk(emails, options);
  
  const warnings = validation.results
    .filter(r => r.warnings && r.warnings.length > 0)
    .flatMap(r => 
      r.warnings!.map(warning => ({
        email: r.email,
        warning,
      }))
    );

  return {
    valid: validation.validEmailList,
    invalid: validation.invalidEmailList,
    warnings,
  };
}

/**
 * Get email domain from address
 */
export function getEmailDomain(email: string): string | null {
  try {
    const normalized = sanitizeEmailAddress(email);
    const parts = normalized.split('@');
    return parts[1] || null;
  } catch {
    return null;
  }
}

/**
 * Group emails by domain
 */
export function groupEmailsByDomain(emails: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  for (const email of emails) {
    const domain = getEmailDomain(email);
    if (domain) {
      const existing = groups.get(domain) || [];
      existing.push(email);
      groups.set(domain, existing);
    }
  }
  
  return groups;
}
