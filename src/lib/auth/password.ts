/**
 * Password Security Service
 * Comprehensive password validation, history tracking, and security utilities
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// Common weak passwords to reject
const COMMON_PASSWORDS = new Set([
  'password', 'password123', '123456', '12345678', 'qwerty', 'abc123',
  'monkey', '1234567', 'letmein', 'trustno1', 'dragon', 'baseball',
  'iloveyou', 'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
  'shadow', '123123', '654321', 'superman', 'qazwsx', 'michael',
  'football', 'welcome', 'jesus', 'ninja', 'mustang', 'password1',
  '123456789', '1234567890', 'admin', 'root', 'toor', 'pass', 'test',
  'guest', 'info', 'adm', 'mysql', 'user', 'administrator', 'oracle',
  'ftp', 'pi', 'puppet', 'ansible', 'ec2-user', 'vagrant', 'azureuser',
]);

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Check if a hash was created with current salt rounds
 * Useful for detecting when rehashing is needed
 */
export function needsRehash(hash: string): boolean {
  try {
    const rounds = bcrypt.getRounds(hash);
    return rounds < BCRYPT_ROUNDS;
  } catch {
    return true;
  }
}

/**
 * Comprehensive password validation
 * Returns array of error messages, empty array if valid
 */
export function validatePasswordStrength(
  password: string,
  userEmail?: string,
  userName?: string
): string[] {
  const errors: string[] = [];

  // Length check (already in Zod, but double-check)
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (password.length > 100) {
    errors.push('Password must be no more than 100 characters long');
  }

  // Character composition checks (already in Zod, but comprehensive)
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check against common weak passwords
  const lowerPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowerPassword)) {
    errors.push('Password is too common. Choose a more unique password');
  }

  // Check for sequential characters (123456, abcdef, etc.)
  if (hasSequentialCharacters(password)) {
    errors.push('Password cannot contain sequential characters');
  }

  // Check for repeated characters (aaaaaa, 111111, etc.)
  if (hasRepeatedCharacters(password)) {
    errors.push('Password cannot contain excessive repeated characters');
  }

  // Check similarity to email/name
  if (userEmail && isSimilarToUserInfo(password, userEmail)) {
    errors.push('Password cannot be similar to your email address');
  }

  if (userName && isSimilarToUserInfo(password, userName)) {
    errors.push('Password cannot be similar to your name');
  }

  return errors;
}

/**
 * Check for sequential characters (numbers or letters)
 */
function hasSequentialCharacters(password: string): boolean {
  const sequences = [
    '0123456789',
    'abcdefghijklmnopqrstuvwxyz',
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm',
  ];

  const lowerPassword = password.toLowerCase();

  for (const seq of sequences) {
    // Check for 4+ sequential characters
    for (let i = 0; i <= seq.length - 4; i++) {
      const subseq = seq.substring(i, i + 4);
      const reverseSubseq = subseq.split('').reverse().join('');

      if (lowerPassword.includes(subseq) || lowerPassword.includes(reverseSubseq)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check for repeated characters (4+ of the same character in a row)
 */
function hasRepeatedCharacters(password: string): boolean {
  return /(.)\1{3,}/.test(password);
}

/**
 * Check if password is too similar to user info
 */
function isSimilarToUserInfo(password: string, userInfo: string): boolean {
  const lowerPassword = password.toLowerCase();
  const lowerInfo = userInfo.toLowerCase();

  // Check if password contains significant portion of email/name
  const infoWords = lowerInfo.split(/[@._-]/);

  for (const word of infoWords) {
    if (word.length >= 4 && lowerPassword.includes(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a secure token for password reset or remember-me
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a token using SHA-256 for storage
 * Never store plain tokens in the database
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
