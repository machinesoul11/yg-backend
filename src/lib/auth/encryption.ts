/**
 * Encryption Utility Service
 * Provides AES-256-GCM encryption for sensitive data like TOTP secrets and phone numbers
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment
 * Throws if not configured properly
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  
  if (key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
      'Current length: ' + key.length
    );
  }
  
  return key;
}

/**
 * Derive encryption key from master key using PBKDF2
 */
function deriveKey(masterKey: Buffer, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt a string value
 * Returns encrypted data in format: salt:iv:authTag:encryptedData (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  const masterKey = Buffer.from(getEncryptionKey(), 'hex');
  
  // Generate random salt for key derivation
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  // Derive encryption key from master key
  const key = deriveKey(masterKey, salt);
  
  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine all parts: salt:iv:authTag:encryptedData
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
}

/**
 * Decrypt an encrypted string value
 * Expects format: salt:iv:authTag:encryptedData (all hex-encoded)
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty value');
  }

  const masterKey = Buffer.from(getEncryptionKey(), 'hex');
  
  // Split encrypted data into components
  const parts = encryptedData.split(':');
  
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [saltHex, ivHex, authTagHex, encrypted] = parts;
  
  // Convert from hex
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Derive the same key used for encryption
  const key = deriveKey(masterKey, salt);
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Safely check if a value can be decrypted
 * Returns true if decryption succeeds, false otherwise
 */
export function canDecrypt(encryptedData: string): boolean {
  try {
    decrypt(encryptedData);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random encryption key
 * This should be called once and stored as ENCRYPTION_KEY env var
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate that encryption is properly configured
 */
export function validateEncryptionConfig(): {
  configured: boolean;
  keyLength: number;
  errors: string[];
} {
  const errors: string[] = [];
  
  try {
    const key = getEncryptionKey();
    const keyLength = key.length;
    
    if (keyLength !== 64) {
      errors.push(`Key length is ${keyLength}, expected 64`);
    }
    
    // Test encryption/decryption
    const testData = 'test-encryption-' + Date.now();
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    
    if (decrypted !== testData) {
      errors.push('Encryption test failed: data mismatch');
    }
    
    return {
      configured: errors.length === 0,
      keyLength,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      configured: false,
      keyLength: 0,
      errors,
    };
  }
}
