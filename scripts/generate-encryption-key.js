#!/usr/bin/env node
/**
 * Generate Encryption Key for TOTP Secrets
 * 
 * This script generates a cryptographically secure 256-bit (32-byte) encryption key
 * for use in encrypting TOTP secrets and other sensitive data.
 * 
 * Usage:
 *   node scripts/generate-encryption-key.js
 * 
 * The generated key should be added to your .env file as:
 *   ENCRYPTION_KEY=<generated_key>
 */

const crypto = require('crypto');

function generateEncryptionKey() {
  const key = crypto.randomBytes(32).toString('hex');
  return key;
}

function main() {
  console.log('='.repeat(70));
  console.log('TOTP Encryption Key Generator');
  console.log('='.repeat(70));
  console.log('');
  
  const key = generateEncryptionKey();
  
  console.log('Generated 256-bit encryption key:');
  console.log('');
  console.log(key);
  console.log('');
  console.log('='.repeat(70));
  console.log('IMPORTANT: Add this to your .env file:');
  console.log('='.repeat(70));
  console.log('');
  console.log(`ENCRYPTION_KEY=${key}`);
  console.log('');
  console.log('='.repeat(70));
  console.log('Security Notes:');
  console.log('='.repeat(70));
  console.log('');
  console.log('1. NEVER commit this key to version control');
  console.log('2. Store it securely in your environment variables');
  console.log('3. Use different keys for development and production');
  console.log('4. Back up this key securely - losing it means losing access');
  console.log('   to all encrypted TOTP secrets');
  console.log('5. Rotate this key periodically (requires re-encrypting data)');
  console.log('');
  console.log('='.repeat(70));
}

main();
