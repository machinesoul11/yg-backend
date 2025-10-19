/**
 * TOTP (Time-based One-Time Password) Service
 * Handles TOTP secret generation, validation, QR code generation, and backup codes
 */

import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from './encryption';

// TOTP Configuration
const TOTP_CONFIG = {
  issuer: 'YesGoddess',
  algorithm: 'sha1',
  digits: 6,
  step: 30, // 30-second time window
  window: 1, // ±1 window tolerance (±30 seconds)
};

// Backup codes configuration
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const BCRYPT_ROUNDS = 12;

/**
 * Configure otplib with our settings
 */
authenticator.options = {
  digits: TOTP_CONFIG.digits,
  step: TOTP_CONFIG.step,
  window: TOTP_CONFIG.window,
};

export interface TotpSecret {
  secret: string; // base32-encoded secret
  encryptedSecret: string; // encrypted for storage
  qrCodeDataUrl: string; // QR code as data URL
  manualEntryKey: string; // formatted for manual entry
}

export interface BackupCode {
  code: string; // plain text code to show user once
  hashedCode: string; // hashed code for storage
}

export class TotpService {
  /**
   * Generate a new TOTP secret
   * Returns both encrypted (for storage) and plain (for QR code generation)
   */
  static generateSecret(): { secret: string; encryptedSecret: string } {
    // Generate cryptographically secure random secret (minimum 20 bytes / 160 bits)
    const secret = authenticator.generateSecret(32); // 32 bytes for extra security
    
    // Encrypt the secret for database storage
    const encryptedSecret = encrypt(secret);
    
    return {
      secret,
      encryptedSecret,
    };
  }

  /**
   * Generate QR code for authenticator app setup
   * Returns complete setup data including QR code
   */
  static async generateSetupData(
    userEmail: string,
    userName?: string
  ): Promise<TotpSecret> {
    const { secret, encryptedSecret } = this.generateSecret();
    
    // Create otpauth URI
    const accountName = userName || userEmail;
    const otpauthUrl = authenticator.keyuri(
      accountName,
      TOTP_CONFIG.issuer,
      secret
    );
    
    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 300,
    });
    
    // Format secret for manual entry (groups of 4 characters)
    const manualEntryKey = this.formatSecretForManualEntry(secret);
    
    return {
      secret,
      encryptedSecret,
      qrCodeDataUrl,
      manualEntryKey,
    };
  }

  /**
   * Format secret for manual entry
   * Groups characters in sets of 4 for readability
   * Example: ABCD EFGH IJKL MNOP
   */
  private static formatSecretForManualEntry(secret: string): string {
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }

  /**
   * Validate a TOTP code against stored secret
   * Supports time drift with ±1 window tolerance
   */
  static validateCode(encryptedSecret: string, code: string): boolean {
    try {
      // Decrypt the stored secret
      const secret = decrypt(encryptedSecret);
      
      // Remove any whitespace from user input
      const cleanCode = code.replace(/\s/g, '');
      
      // Verify the code (automatically handles ±1 window)
      const isValid = authenticator.verify({
        token: cleanCode,
        secret,
      });
      
      return isValid;
    } catch (error) {
      console.error('TOTP validation error:', error);
      return false;
    }
  }

  /**
   * Check if code is valid for a specific time window
   * Used for debugging and monitoring
   */
  static validateCodeWithDetails(
    encryptedSecret: string,
    code: string
  ): {
    valid: boolean;
    window?: number; // -1, 0, or 1 indicating which window matched
    serverTime?: number;
  } {
    try {
      const secret = decrypt(encryptedSecret);
      const cleanCode = code.replace(/\s/g, '');
      
      // Get current timestamp
      const serverTime = Date.now();
      
      // Check current window
      if (authenticator.check(cleanCode, secret)) {
        return { valid: true, window: 0, serverTime };
      }
      
      // Check previous window (-30 seconds)
      const prevTime = Math.floor((serverTime - 30000) / 1000);
      if (authenticator.check(cleanCode, secret)) {
        return { valid: true, window: -1, serverTime };
      }
      
      // Check next window (+30 seconds)
      const nextTime = Math.floor((serverTime + 30000) / 1000);
      if (authenticator.check(cleanCode, secret)) {
        return { valid: true, window: 1, serverTime };
      }
      
      return { valid: false, serverTime };
    } catch (error) {
      console.error('TOTP validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Generate backup codes for account recovery
   * Returns both plain text codes (to show user) and hashed codes (for storage)
   */
  static async generateBackupCodes(count: number = BACKUP_CODE_COUNT): Promise<BackupCode[]> {
    const codes: BackupCode[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate random alphanumeric code
      const code = this.generateBackupCode();
      
      // Hash the code for storage (like passwords)
      const hashedCode = await bcrypt.hash(code, BCRYPT_ROUNDS);
      
      codes.push({
        code,
        hashedCode,
      });
    }
    
    return codes;
  }

  /**
   * Generate a single backup code
   * Format: XXXX-XXXX (8 alphanumeric characters with dash)
   */
  private static generateBackupCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      code += chars[randomIndex];
      
      // Add dash in the middle
      if (i === 3) {
        code += '-';
      }
    }
    
    return code;
  }

  /**
   * Verify a backup code against stored hash
   */
  static async verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
    try {
      // Remove any whitespace and convert to uppercase
      const cleanCode = code.replace(/\s/g, '').toUpperCase();
      return await bcrypt.compare(cleanCode, hashedCode);
    } catch (error) {
      console.error('Backup code verification error:', error);
      return false;
    }
  }

  /**
   * Get remaining time in current TOTP window
   * Useful for UI to show countdown
   */
  static getRemainingTime(): number {
    const now = Date.now();
    const step = TOTP_CONFIG.step * 1000; // Convert to milliseconds
    const remaining = step - (now % step);
    return Math.floor(remaining / 1000); // Return seconds
  }

  /**
   * Generate the current TOTP code for a secret
   * Primarily for testing, should not be exposed in production API
   */
  static generateCode(encryptedSecret: string): string {
    const secret = decrypt(encryptedSecret);
    return authenticator.generate(secret);
  }

  /**
   * Validate TOTP configuration
   */
  static validateConfig(): {
    configured: boolean;
    details: {
      issuer: string;
      algorithm: string;
      digits: number;
      step: number;
      window: number;
    };
  } {
    return {
      configured: true,
      details: {
        issuer: TOTP_CONFIG.issuer,
        algorithm: TOTP_CONFIG.algorithm,
        digits: TOTP_CONFIG.digits,
        step: TOTP_CONFIG.step,
        window: TOTP_CONFIG.window,
      },
    };
  }
}
