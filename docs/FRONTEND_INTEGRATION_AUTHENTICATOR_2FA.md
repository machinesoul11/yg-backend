# Frontend Integration Guide: Authenticator 2FA Setup Flow

**🌐 SHARED** - Used by both public-facing website and admin backend  
**Module:** Authenticator 2FA Setup & Management  
**Backend API Base URL:** `https://ops.yesgoddess.agency`  
**Frontend Repository:** yesgoddess-web (Next.js 15 + App Router + TypeScript)  
**Last Updated:** October 19, 2025  
**API Version:** 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)
5. [Error Handling](#error-handling)
6. [Authorization & Permissions](#authorization--permissions)
7. [Rate Limiting & Security](#rate-limiting--security)
8. [User Experience Flow](#user-experience-flow)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

This module enables users to set up and manage Time-based One-Time Password (TOTP) authenticator apps as their two-factor authentication method. The implementation follows industry-standard TOTP protocols (RFC 6238) with QR code generation and backup code recovery.

### Key Features

- ✅ **TOTP Setup Flow** - Generate QR codes and manual entry keys
- ✅ **Initial Verification** - Verify setup before enabling
- ✅ **Backup Codes** - Generate 10 one-time recovery codes
- ✅ **Disable 2FA** - Remove authenticator with password verification
- ✅ **Regenerate Backup Codes** - Create new backup codes with password
- ✅ **Security Auditing** - All actions are logged and tracked
- ✅ **Email Notifications** - Users receive email alerts for security changes

### Authentication Requirements

All endpoints require an authenticated user session via JWT token in the `Authorization` header:

```typescript
headers: {
  'Authorization': `Bearer ${sessionToken}`,
  'Content-Type': 'application/json'
}
```

---

## API Endpoints

### Base URL Configuration

```typescript
// Environment configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ops.yesgoddess.agency';
const API_ENDPOINTS = {
  TOTP_ENABLE: `${API_BASE_URL}/api/auth/2fa/totp/enable`,
  TOTP_VERIFY: `${API_BASE_URL}/api/auth/2fa/totp/verify`,
  TOTP_DISABLE: `${API_BASE_URL}/api/auth/2fa/totp/disable`,
  BACKUP_CODES_REGENERATE: `${API_BASE_URL}/api/auth/2fa/totp/backup-codes/regenerate`,
};
```

---

### 1. Initiate TOTP Setup

**Purpose:** Generate QR code and manual entry key for authenticator app setup

**Endpoint:** `POST /api/auth/2fa/totp/enable`  
**Method:** POST  
**Authentication:** Required (JWT Bearer token)  
**Request Body:** None

#### Request Example

```typescript
const response = await fetch(`${API_BASE_URL}/api/auth/2fa/totp/enable`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  },
});
```

#### Success Response (200 OK)

```typescript
{
  "success": true,
  "data": {
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KG...",  // Base64 QR code image
    "manualEntryKey": "JBSW Y3DP EHPK 3PXP",                // Formatted for manual entry
    "issuer": "YesGoddess",                                  // App name shown in authenticator
    "accountName": "user@example.com",                       // User identifier
    "message": "Scan the QR code with your authenticator app or enter the key manually",
    "nextStep": "Verify the setup by providing a code from your authenticator app",
    "authenticatorApps": [
      {
        "name": "Google Authenticator",
        "ios": "https://apps.apple.com/app/google-authenticator/id388497605",
        "android": "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
        "description": "Simple and reliable, works offline"
      },
      {
        "name": "Microsoft Authenticator",
        "ios": "https://apps.apple.com/app/microsoft-authenticator/id983156458",
        "android": "https://play.google.com/store/apps/details?id=com.azure.authenticator",
        "description": "Cloud backup and multi-device sync available"
      },
      {
        "name": "Authy",
        "ios": "https://apps.apple.com/app/authy/id494168017",
        "android": "https://play.google.com/store/apps/details?id=com.authy.authy",
        "description": "Cloud backup, multi-device sync, and encrypted backups"
      },
      {
        "name": "FreeOTP",
        "ios": "https://apps.apple.com/app/freeotp-authenticator/id872559395",
        "android": "https://play.google.com/store/apps/details?id=org.fedorahosted.freeotp",
        "description": "Open-source and privacy-focused"
      }
    ]
  }
}
```

#### Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | `UNAUTHORIZED` | User not authenticated |
| 400 | `TOTP_ALREADY_ENABLED` | User already has 2FA enabled |
| 500 | `INTERNAL_SERVER_ERROR` | Server error during setup |

---

### 2. Verify TOTP Setup

**Purpose:** Verify authenticator code and complete setup, enabling 2FA and generating backup codes

**Endpoint:** `POST /api/auth/2fa/totp/verify`  
**Method:** POST  
**Authentication:** Required (JWT Bearer token)

#### Request Body

```typescript
{
  "code": "123456"  // 6-digit TOTP code from authenticator app
}
```

#### Request Example

```typescript
const response = await fetch(`${API_BASE_URL}/api/auth/2fa/totp/verify`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    code: '123456',
  }),
});
```

#### Success Response (200 OK)

```typescript
{
  "success": true,
  "data": {
    "enabled": true,
    "backupCodes": [
      "ABCD-1234",
      "EFGH-5678",
      "IJKL-9012",
      "MNOP-3456",
      "QRST-7890",
      "UVWX-1234",
      "YZAB-5678",
      "CDEF-9012",
      "GHIJ-3456",
      "KLMN-7890"
    ],
    "message": "Two-factor authentication has been successfully enabled for your account",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "backupCodesInfo": {
      "count": 10,
      "oneTimeUse": true,
      "format": "Each code can only be used once",
      "usage": "Use these codes if you lose access to your authenticator app"
    }
  }
}
```

#### Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | `UNAUTHORIZED` | User not authenticated |
| 400 | `VALIDATION_ERROR` | Invalid request data (code format) |
| 401 | `TOTP_INVALID` | Invalid or expired TOTP code |
| 400 | `TOTP_ALREADY_ENABLED` | 2FA already enabled |
| 400 | `TOTP_SETUP_REQUIRED` | Must call `/enable` first |
| 500 | `INTERNAL_SERVER_ERROR` | Server error during verification |

---

### 3. Disable TOTP

**Purpose:** Disable authenticator 2FA with password verification

**Endpoint:** `POST /api/auth/2fa/totp/disable`  
**Method:** POST  
**Authentication:** Required (JWT Bearer token)

#### Request Body

```typescript
{
  "password": "userPassword123",     // Required: Current password
  "code": "123456"                   // Optional: Current TOTP code for additional security
}
```

#### Request Example

```typescript
const response = await fetch(`${API_BASE_URL}/api/auth/2fa/totp/disable`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    password: userPassword,
    code: totpCode, // Optional but recommended
  }),
});
```

#### Success Response (200 OK)

```typescript
{
  "success": true,
  "data": {
    "enabled": false,
    "message": "Two-factor authentication has been disabled for your account",
    "warning": "Your account is now less secure. We recommend re-enabling two-factor authentication.",
    "securityNote": "A security alert has been sent to your email address."
  }
}
```

#### Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | `UNAUTHORIZED` | User not authenticated |
| 400 | `VALIDATION_ERROR` | Invalid request data |
| 401 | `INVALID_CURRENT_PASSWORD` | Password verification failed |
| 401 | `TOTP_INVALID` | TOTP code verification failed (if provided) |
| 400 | `TOTP_NOT_ENABLED` | 2FA not enabled for this user |
| 500 | `INTERNAL_SERVER_ERROR` | Server error during disable |

---

### 4. Regenerate Backup Codes

**Purpose:** Generate new backup codes and invalidate old ones

**Endpoint:** `POST /api/auth/2fa/totp/backup-codes/regenerate`  
**Method:** POST  
**Authentication:** Required (JWT Bearer token)

#### Request Body

```typescript
{
  "password": "userPassword123"  // Required: Current password for security verification
}
```

#### Request Example

```typescript
const response = await fetch(`${API_BASE_URL}/api/auth/2fa/totp/backup-codes/regenerate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    password: userPassword,
  }),
});
```

#### Success Response (200 OK)

```typescript
{
  "success": true,
  "data": {
    "backupCodes": [
      "ABCD-1234",
      "EFGH-5678",
      "IJKL-9012",
      "MNOP-3456",
      "QRST-7890",
      "UVWX-1234",
      "YZAB-5678",
      "CDEF-9012",
      "GHIJ-3456",
      "KLMN-7890"
    ],
    "message": "New backup codes have been generated successfully",
    "warning": "IMPORTANT: Save these backup codes in a secure location. You will not be able to view them again.",
    "info": {
      "count": 10,
      "previousCodesInvalidated": true,
      "oneTimeUse": true,
      "format": "Each code can only be used once",
      "usage": "Use these codes if you lose access to your authenticator app"
    }
  }
}
```

#### Error Responses

| Status Code | Error Code | Description |
|-------------|------------|-------------|
| 401 | `UNAUTHORIZED` | User not authenticated |
| 400 | `VALIDATION_ERROR` | Invalid request data |
| 401 | `INVALID_CURRENT_PASSWORD` | Password verification failed |
| 400 | `TOTP_NOT_ENABLED` | 2FA not enabled for this user |
| 500 | `INTERNAL_SERVER_ERROR` | Server error during regeneration |

---

## TypeScript Type Definitions

Copy these type definitions into your frontend codebase:

```typescript
// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
}

// ============================================================================
// Authenticator App Information
// ============================================================================

export interface AuthenticatorApp {
  name: string;
  ios: string;
  android: string;
  description: string;
}

// ============================================================================
// TOTP Setup Response Types
// ============================================================================

export interface TotpEnableResponse {
  qrCodeDataUrl: string;        // Data URL for QR code image (base64)
  manualEntryKey: string;        // Formatted secret key (e.g., "ABCD EFGH IJKL")
  issuer: string;                // App name (YesGoddess)
  accountName: string;           // User's email
  message: string;
  nextStep: string;
  authenticatorApps: AuthenticatorApp[];
}

export interface TotpVerifyResponse {
  enabled: boolean;
  backupCodes: string[];         // Array of 10 backup codes
  message: string;
  warning: string;
  backupCodesInfo: {
    count: number;
    oneTimeUse: boolean;
    format: string;
    usage: string;
  };
}

export interface TotpDisableResponse {
  enabled: boolean;
  message: string;
  warning: string;
  securityNote: string;
}

export interface BackupCodesRegenerateResponse {
  backupCodes: string[];
  message: string;
  warning: string;
  info: {
    count: number;
    previousCodesInvalidated: boolean;
    oneTimeUse: boolean;
    format: string;
    usage: string;
  };
}

// ============================================================================
// Request Types
// ============================================================================

export interface TotpVerifyRequest {
  code: string;  // 6-digit TOTP code
}

export interface TotpDisableRequest {
  password: string;
  code?: string; // Optional TOTP code for extra security
}

export interface BackupCodesRegenerateRequest {
  password: string;
}

// ============================================================================
// Validation Schemas (using Zod)
// ============================================================================

import { z } from 'zod';

/**
 * TOTP code validation
 * - Must be 6 digits
 * - Allows optional whitespace (removed automatically)
 */
export const totpCodeSchema = z
  .string()
  .min(6, 'TOTP code must be 6 digits')
  .max(10, 'TOTP code is too long')
  .regex(/^[0-9\s]+$/, 'TOTP code must contain only digits')
  .transform((code) => code.replace(/\s/g, ''))
  .refine((code) => code.length === 6, {
    message: 'TOTP code must be exactly 6 digits',
  });

/**
 * Password validation (for disable/regenerate)
 */
export const passwordSchema = z
  .string()
  .min(1, 'Password is required');

/**
 * TOTP verify request schema
 */
export const totpVerifySchema = z.object({
  code: totpCodeSchema,
});

/**
 * TOTP disable request schema
 */
export const totpDisableSchema = z.object({
  password: passwordSchema,
  code: totpCodeSchema.optional(),
});

/**
 * Backup codes regenerate schema
 */
export const backupCodesRegenerateSchema = z.object({
  password: passwordSchema,
});

// Type inference from Zod schemas
export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;
export type TotpDisableInput = z.infer<typeof totpDisableSchema>;
export type BackupCodesRegenerateInput = z.infer<typeof backupCodesRegenerateSchema>;

// ============================================================================
// Error Code Types
// ============================================================================

export type TotpErrorCode =
  | 'UNAUTHORIZED'
  | 'TOTP_ALREADY_ENABLED'
  | 'TOTP_NOT_ENABLED'
  | 'TOTP_SETUP_REQUIRED'
  | 'TOTP_INVALID'
  | 'INVALID_CURRENT_PASSWORD'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_SERVER_ERROR';

// ============================================================================
// Client-side State Types
// ============================================================================

export interface TotpSetupState {
  step: 'initial' | 'scanning' | 'verifying' | 'complete';
  qrCodeDataUrl?: string;
  manualEntryKey?: string;
  backupCodes?: string[];
  error?: string;
  isLoading: boolean;
}

export interface TotpManagementState {
  isEnabled: boolean;
  isLoading: boolean;
  error?: string;
}
```

---

## Business Logic & Validation Rules

### TOTP Code Validation

#### Format Requirements
- **Length:** Exactly 6 digits
- **Characters:** Only numeric digits (0-9)
- **Whitespace:** Allowed but stripped automatically
- **Time Window:** Valid for 30 seconds (±30s tolerance = 90s total window)

#### Code Validation Logic

```typescript
// Client-side validation before API call
export function validateTotpCode(code: string): { valid: boolean; error?: string } {
  // Remove whitespace
  const cleanCode = code.replace(/\s/g, '');
  
  // Check length
  if (cleanCode.length !== 6) {
    return { valid: false, error: 'Code must be exactly 6 digits' };
  }
  
  // Check numeric only
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false, error: 'Code must contain only numbers' };
  }
  
  return { valid: true };
}
```

### Backup Codes

#### Format & Rules
- **Count:** 10 codes generated
- **Format:** `XXXX-XXXX` (8 alphanumeric characters with dash)
- **Characters:** A-Z and 0-9 (uppercase)
- **One-Time Use:** Each code can only be used once
- **Regeneration:** Creating new codes invalidates all previous unused codes

#### Storage Recommendations

```typescript
/**
 * Backup codes should NEVER be stored in the database in plain text
 * Backend stores only bcrypt-hashed versions
 * 
 * Frontend should:
 * 1. Display codes immediately after generation
 * 2. Allow user to download/copy
 * 3. Show clear warning about one-time viewing
 * 4. Never persist codes after initial display
 */
export function downloadBackupCodes(codes: string[], filename: string = 'yesgoddess-backup-codes.txt') {
  const content = [
    'YesGoddess Backup Codes',
    '=======================',
    '',
    'IMPORTANT: Store these codes securely!',
    '- Each code can only be used once',
    '- Use these if you lose access to your authenticator app',
    '- Keep them in a safe place (password manager, encrypted file)',
    '',
    'Your Backup Codes:',
    '',
    ...codes.map((code, idx) => `${idx + 1}. ${code}`),
    '',
    `Generated: ${new Date().toLocaleString()}`,
  ].join('\n');
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

### Setup Flow State Machine

The TOTP setup follows a strict state progression:

```typescript
export enum TotpSetupStep {
  NOT_STARTED = 'not_started',   // User hasn't begun setup
  QR_DISPLAYED = 'qr_displayed',  // QR code shown, waiting for scan
  VERIFYING = 'verifying',        // User entered code, backend verifying
  COMPLETED = 'completed',        // Setup complete, backup codes shown
  ERROR = 'error',                // Error occurred
}

// Valid state transitions
const VALID_TRANSITIONS: Record<TotpSetupStep, TotpSetupStep[]> = {
  [TotpSetupStep.NOT_STARTED]: [TotpSetupStep.QR_DISPLAYED, TotpSetupStep.ERROR],
  [TotpSetupStep.QR_DISPLAYED]: [TotpSetupStep.VERIFYING, TotpSetupStep.ERROR],
  [TotpSetupStep.VERIFYING]: [TotpSetupStep.COMPLETED, TotpSetupStep.QR_DISPLAYED, TotpSetupStep.ERROR],
  [TotpSetupStep.COMPLETED]: [], // Terminal state
  [TotpSetupStep.ERROR]: [TotpSetupStep.NOT_STARTED, TotpSetupStep.QR_DISPLAYED],
};
```

### Password Requirements

When disabling 2FA or regenerating backup codes:

- **Required:** Current user password
- **Validation:** Backend verifies password matches stored hash
- **Security:** Prevents unauthorized 2FA changes
- **No Strength Check:** Only validation is correct password

### QR Code Generation

- **Format:** Data URL (base64-encoded PNG)
- **Size:** 300x300 pixels
- **Error Correction:** High level (30% recovery)
- **Content:** `otpauth://totp/YesGoddess:user@example.com?secret=SECRET&issuer=YesGoddess`

---

## Error Handling

### Error Response Structure

All errors follow this structure:

```typescript
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400,
    "details": { /* Optional additional context */ }
  }
}
```

### Complete Error Codes Reference

| Error Code | HTTP Status | Description | User-Friendly Message | When to Show |
|------------|-------------|-------------|----------------------|--------------|
| `UNAUTHORIZED` | 401 | User not authenticated | Please log in to continue | Always |
| `TOTP_ALREADY_ENABLED` | 400 | 2FA already enabled | Two-factor authentication is already enabled | Specific |
| `TOTP_NOT_ENABLED` | 400 | 2FA not enabled | Two-factor authentication is not enabled for your account | Specific |
| `TOTP_SETUP_REQUIRED` | 400 | Must call `/enable` first | Please start the setup process first | Generic |
| `TOTP_INVALID` | 401 | Invalid/expired code | Invalid authentication code. Please try again. | Specific |
| `INVALID_CURRENT_PASSWORD` | 401 | Password verification failed | Incorrect password | Specific |
| `VALIDATION_ERROR` | 400 | Request validation failed | Please check your input and try again | Show details |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Something went wrong. Please try again later. | Generic |

### Error Handling Strategy

```typescript
/**
 * Handle API errors with user-friendly messages
 */
export function handleTotpError(error: ApiError): string {
  const errorMessages: Record<string, string> = {
    UNAUTHORIZED: 'Your session has expired. Please log in again.',
    TOTP_ALREADY_ENABLED: 'Two-factor authentication is already enabled for your account.',
    TOTP_NOT_ENABLED: 'Two-factor authentication is not enabled. Please set it up first.',
    TOTP_SETUP_REQUIRED: 'Please complete the setup process first.',
    TOTP_INVALID: 'Invalid authentication code. Please check the code from your authenticator app and try again.',
    INVALID_CURRENT_PASSWORD: 'Incorrect password. Please try again.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    INTERNAL_SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
  };
  
  return errorMessages[error.code] || error.message || 'An unexpected error occurred.';
}

/**
 * Enhanced error handling with retry logic
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const data: ApiResponse<T> = await response.json();
      
      if (!response.ok) {
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(handleTotpError(data.error!));
        }
        throw new Error('Server error');
      }
      
      if (!data.success) {
        throw new Error(handleTotpError(data.error!));
      }
      
      return data.data as T;
    } catch (error) {
      lastError = error as Error;
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  throw lastError!;
}
```

### Validation Error Details

When `VALIDATION_ERROR` occurs, the error includes `details` field with specific issues:

```typescript
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "path": ["code"],
        "message": "TOTP code must be exactly 6 digits"
      }
    ]
  }
}
```

Handle validation errors:

```typescript
export function extractValidationErrors(error: ApiError): Record<string, string> {
  const errors: Record<string, string> = {};
  
  if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
    error.details.forEach((issue: any) => {
      const field = issue.path?.[0] || 'general';
      errors[field] = issue.message;
    });
  }
  
  return errors;
}
```

---

## Authorization & Permissions

### Access Control Summary

| Endpoint | Required Role | Resource Ownership | Additional Requirements |
|----------|---------------|-------------------|------------------------|
| `POST /api/auth/2fa/totp/enable` | Any authenticated user | Self only | Email verified recommended |
| `POST /api/auth/2fa/totp/verify` | Any authenticated user | Self only | Must call `/enable` first |
| `POST /api/auth/2fa/totp/disable` | Any authenticated user | Self only | Valid password + optional TOTP |
| `POST /api/auth/2fa/totp/backup-codes/regenerate` | Any authenticated user | Self only | Valid password + 2FA enabled |

### User Roles

```typescript
export enum UserRole {
  ADMIN = 'ADMIN',       // Admin staff
  CREATOR = 'CREATOR',   // IP creators/talent
  BRAND = 'BRAND',       // Brand users
  VIEWER = 'VIEWER',     // Read-only access
}

// All roles can manage their own 2FA
const CAN_MANAGE_OWN_2FA = [
  UserRole.ADMIN,
  UserRole.CREATOR,
  UserRole.BRAND,
  UserRole.VIEWER,
];
```

### Session Requirements

```typescript
/**
 * Check if user session is valid for 2FA operations
 */
export function canManage2FA(session: Session | null): boolean {
  if (!session || !session.user) {
    return false;
  }
  
  // User must be authenticated
  if (!session.user.id) {
    return false;
  }
  
  // All authenticated users can manage their own 2FA
  return true;
}

/**
 * Check if email verification is required
 * Note: Not enforced by backend but recommended for security
 */
export function shouldVerifyEmailFirst(user: User): boolean {
  return !user.emailVerified;
}
```

### CORS & Security Headers

The backend API includes appropriate CORS and security headers. Ensure your frontend sends:

```typescript
const headers = {
  'Authorization': `Bearer ${sessionToken}`,
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest', // Optional: CSRF protection
};
```

---

Continue to **[Part 2: Rate Limiting, UX Flow, and Implementation](./FRONTEND_INTEGRATION_AUTHENTICATOR_2FA_PART2.md)**
