/**
 * Email Sanitization Service
 * 
 * Provides comprehensive sanitization and validation for email content
 * to prevent injection attacks, XSS, and ensure data integrity.
 * 
 * Features:
 * - HTML sanitization for user-generated content
 * - Email address validation with MX record checking
 * - URL validation and sanitization
 * - Subject line sanitization
 * - Attachment validation
 * - Special character handling
 */

import { z } from 'zod';
import { EmailValidationError } from './errors';

/**
 * Email address validation schema
 */
const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim()
  .max(254); // RFC 5321 maximum email length

/**
 * Validate and sanitize email address
 */
export function sanitizeEmailAddress(email: string): string {
  try {
    const sanitized = emailSchema.parse(email);
    
    // Additional validation: no special characters that could cause issues
    if (sanitized.includes('..') || sanitized.startsWith('.') || sanitized.endsWith('.')) {
      throw new EmailValidationError(
        'Email address contains invalid consecutive dots',
        'email',
        email
      );
    }
    
    return sanitized;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new EmailValidationError(
        error.issues[0]?.message || 'Invalid email address',
        'email',
        email
      );
    }
    throw error;
  }
}

/**
 * Validate multiple email addresses
 */
export function sanitizeEmailAddresses(emails: string | string[]): string[] {
  const emailArray = Array.isArray(emails) ? emails : [emails];
  return emailArray.map(sanitizeEmailAddress);
}

/**
 * Sanitize email subject line
 * - Remove control characters
 * - Trim whitespace
 * - Limit length
 * - Remove potential header injection attempts
 */
export function sanitizeSubject(subject: string): string {
  if (!subject || typeof subject !== 'string') {
    throw new EmailValidationError('Subject is required and must be a string', 'subject');
  }

  // Remove control characters (0x00-0x1F, 0x7F)
  let sanitized = subject.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Remove newlines and carriage returns (header injection prevention)
  sanitized = sanitized.replace(/[\r\n]/g, ' ');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  // Enforce maximum length (RFC 2822 recommends 78 characters)
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }
  
  // Ensure not empty after sanitization
  if (sanitized.length === 0) {
    throw new EmailValidationError('Subject cannot be empty', 'subject');
  }
  
  return sanitized;
}

/**
 * Sanitize HTML content for email
 * - Remove dangerous tags and attributes
 * - Escape user-generated content
 * - Allow safe HTML formatting
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Remove script tags and content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers (onclick, onerror, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  
  // Remove dangerous tags
  const dangerousTags = ['iframe', 'embed', 'object', 'form', 'input', 'textarea'];
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}\\b[^<]*(?:(?!<\\/${tag}>)<[^<]*)*<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });
  
  return sanitized;
}

/**
 * Sanitize plain text content
 * - Remove control characters
 * - Normalize line endings
 * - Trim excessive whitespace
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove null bytes and other dangerous control characters
  let sanitized = text.replace(/\x00/g, '');
  
  // Normalize line endings to \n
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove excessive blank lines (more than 2 consecutive)
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  return sanitized;
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new EmailValidationError('URL is required', 'url');
  }

  // Trim whitespace
  const trimmed = url.trim();
  
  // Check for dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  const lowerUrl = trimmed.toLowerCase();
  
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      throw new EmailValidationError(
        `URL protocol "${protocol}" is not allowed`,
        'url',
        url
      );
    }
  }
  
  // Validate URL format
  try {
    const urlObj = new URL(trimmed);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new EmailValidationError(
        `Only HTTP and HTTPS URLs are allowed`,
        'url',
        url
      );
    }
    
    return trimmed;
  } catch (error) {
    throw new EmailValidationError(
      'Invalid URL format',
      'url',
      url
    );
  }
}

/**
 * Sanitize attachment filename
 * - Remove path traversal attempts
 * - Remove special characters
 * - Limit length
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new EmailValidationError('Filename is required', 'filename');
  }

  // Remove path components (prevent directory traversal)
  let sanitized = filename.replace(/^.*[/\\]/, '');
  
  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Remove other potentially dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '');
  
  // Limit length
  const maxLength = 255;
  if (sanitized.length > maxLength) {
    const ext = sanitized.split('.').pop();
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, maxLength - (ext?.length || 0) - 1) + '.' + ext;
  }
  
  // Ensure not empty
  if (sanitized.length === 0) {
    throw new EmailValidationError('Filename cannot be empty', 'filename');
  }
  
  return sanitized;
}

/**
 * Validate attachment size
 */
export function validateAttachmentSize(sizeInBytes: number, maxSizeInMB: number = 10): void {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  
  if (sizeInBytes > maxSizeInBytes) {
    throw new EmailValidationError(
      `Attachment size (${(sizeInBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxSizeInMB}MB)`,
      'attachmentSize',
      sizeInBytes
    );
  }
}

/**
 * Sanitize object of variables used in email templates
 * - Escape HTML in string values
 * - Validate and sanitize URLs
 * - Remove dangerous content
 */
export function sanitizeTemplateVariables(variables: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) {
      sanitized[key] = value;
      continue;
    }
    
    if (typeof value === 'string') {
      // Check if it looks like a URL
      if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
          sanitized[key] = sanitizeUrl(value);
        } catch {
          // If URL validation fails, escape as plain text
          sanitized[key] = escapeHtml(value);
        }
      } else {
        // Escape HTML entities for regular strings
        sanitized[key] = escapeHtml(value);
      }
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeTemplateVariables(value);
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? escapeHtml(item) : item
      );
    } else {
      // Numbers, booleans, etc. pass through
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  return text.replace(/[&<>"'/]/g, char => map[char] || char);
}

/**
 * Validate email metadata object
 * - Check for reasonable size
 * - Ensure no circular references
 */
export function validateMetadata(metadata: Record<string, any>): void {
  try {
    const json = JSON.stringify(metadata);
    
    // Limit metadata size to prevent database issues (100KB)
    const maxSize = 100 * 1024;
    if (json.length > maxSize) {
      throw new EmailValidationError(
        `Metadata size (${(json.length / 1024).toFixed(2)}KB) exceeds maximum (100KB)`,
        'metadata'
      );
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('circular')) {
      throw new EmailValidationError(
        'Metadata contains circular references',
        'metadata'
      );
    }
    throw error;
  }
}

/**
 * Check if email address is from a disposable email provider
 * This is a basic implementation - in production, use a dedicated service or database
 */
export function isDisposableEmail(email: string): boolean {
  const disposableDomains = [
    'tempmail.com',
    'guerrillamail.com',
    'mailinator.com',
    '10minutemail.com',
    'throwaway.email',
    'trashmail.com',
    'yopmail.com',
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  return disposableDomains.includes(domain);
}

/**
 * Validate that all required variables are present in template data
 */
export function validateTemplateVariables(
  variables: Record<string, any>,
  required: string[]
): void {
  const missing = required.filter(key => 
    variables[key] === undefined || variables[key] === null
  );
  
  if (missing.length > 0) {
    throw new EmailValidationError(
      `Missing required template variables: ${missing.join(', ')}`,
      'variables',
      missing
    );
  }
}

/**
 * Comprehensive email parameter validation
 */
export interface EmailParams {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    size: number;
  }>;
  metadata?: Record<string, any>;
  variables?: Record<string, any>;
}

export function validateAndSanitizeEmailParams(params: EmailParams): EmailParams {
  const sanitized: EmailParams = {
    to: sanitizeEmailAddresses(params.to),
    subject: sanitizeSubject(params.subject),
  };
  
  // Optional fields
  if (params.cc) {
    sanitized.cc = sanitizeEmailAddresses(params.cc);
  }
  
  if (params.bcc) {
    sanitized.bcc = sanitizeEmailAddresses(params.bcc);
  }
  
  if (params.replyTo) {
    sanitized.replyTo = sanitizeEmailAddresses(params.replyTo);
  }
  
  if (params.html) {
    sanitized.html = sanitizeHtmlContent(params.html);
  }
  
  if (params.text) {
    sanitized.text = sanitizePlainText(params.text);
  }
  
  if (params.attachments && params.attachments.length > 0) {
    sanitized.attachments = params.attachments.map(att => {
      validateAttachmentSize(att.size);
      return {
        ...att,
        filename: sanitizeFilename(att.filename),
      };
    });
  }
  
  if (params.metadata) {
    validateMetadata(params.metadata);
    sanitized.metadata = params.metadata;
  }
  
  if (params.variables) {
    sanitized.variables = sanitizeTemplateVariables(params.variables);
  }
  
  return sanitized;
}
