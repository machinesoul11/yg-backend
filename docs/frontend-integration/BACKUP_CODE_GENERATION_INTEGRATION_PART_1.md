# 🔒 Backup Code Generation - Frontend Integration Guide (Part 1 of 3)

**Module Classification:** 🌐 SHARED - Used by both public-facing website and admin backend

**Last Updated:** October 19, 2025  
**Backend Version:** v1.0  
**Status:** ✅ Production Ready

---

## Table of Contents

### Part 1 (This Document)
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)

### Part 2
4. Business Logic & Validation Rules
5. Error Handling
6. Authorization & Permissions

### Part 3
7. Frontend Implementation Checklist
8. UX Considerations & Best Practices
9. Security Guidelines

---

## Overview

The Backup Code Generation module provides users with recovery codes to access their account when their primary two-factor authentication method (authenticator app or SMS) is unavailable. This is a critical security feature that prevents account lockout.

### Key Features
- ✅ Generate 10 unique backup codes per user
- ✅ Use crypto-secure random (8 characters, alphanumeric)
- ✅ Hash backup codes before storage (bcrypt)
- ✅ Display codes only once during generation
- ✅ Allow regeneration (invalidates old codes)
- ✅ Track backup code usage
- ✅ Alert user when <3 backup codes remain
- ✅ Automatic email notifications for low codes

### User Flow
1. User enables TOTP/2FA → 10 backup codes automatically generated
2. User saves codes securely (one-time display)
3. User loses access to authenticator → Uses backup code to login
4. After backup code used → System tracks remaining codes
5. When < 3 codes remain → Email alert sent (max once per 24 hours)
6. User regenerates codes → All old codes invalidated, 10 new codes created

---

## API Endpoints

### 1. Get 2FA Status (Including Backup Code Count)

Check the user's current 2FA status and backup code availability.

**Endpoint:** `GET /api/auth/2fa/status`

**Authentication:** Required (JWT/Session)

**Request:**
```typescript
// No body required - reads from authenticated session
```

**Response:**
```typescript
{
  success: true,
  data: {
    enabled: boolean;              // Any 2FA method enabled
    bothMethodsEnabled: boolean;   // Both TOTP and SMS enabled
    verifiedAt: string | null;     // ISO timestamp
    preferredMethod: 'AUTHENTICATOR' | 'SMS' | null;
    
    availableMethods: {
      totp: {
        enabled: boolean;
        configured: boolean;
        description: string;
      };
      sms: {
        enabled: boolean;
        configured: boolean;
        maskedPhone: string | null;  // "***1234"
        description: string;
      };
    };
    
    backupCodes: {
      available: boolean;           // Has any unused codes
      remaining: number;            // Count of unused codes (0-10)
    };
    
    capabilities: {
      canSetPreference: boolean;
      canRemoveMethod: boolean;
      canSwitchDuringLogin: boolean;
    };
    
    recommendations: {
      enableTotp: string | null;
      enableSms: string | null;
      regenerateBackupCodes: string | null;  // Warning if < 3
      setPreference: string | null;
      enableAny: string | null;
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "bothMethodsEnabled": false,
    "verifiedAt": "2025-10-15T10:30:00Z",
    "preferredMethod": "AUTHENTICATOR",
    "availableMethods": {
      "totp": {
        "enabled": true,
        "configured": true,
        "description": "Authenticator app (Google Authenticator, Authy, etc.)"
      },
      "sms": {
        "enabled": false,
        "configured": false,
        "maskedPhone": null,
        "description": "SMS verification code sent to your phone"
      }
    },
    "backupCodes": {
      "available": true,
      "remaining": 2
    },
    "capabilities": {
      "canSetPreference": false,
      "canRemoveMethod": false,
      "canSwitchDuringLogin": false
    },
    "recommendations": {
      "enableTotp": null,
      "enableSms": "Add a phone number for SMS-based two-factor authentication as a backup method",
      "regenerateBackupCodes": "You have less than 3 backup codes remaining. Consider regenerating them.",
      "setPreference": null,
      "enableAny": null
    }
  }
}
```

**Use Cases:**
- Display 2FA settings dashboard
- Show backup code status indicator
- Display warning when codes running low
- Conditionally show "Regenerate Codes" button

---

### 2. Regenerate Backup Codes

Generate 10 new backup codes and invalidate all existing unused codes.

**Endpoint:** `POST /api/auth/2fa/totp/backup-codes/regenerate`

**Authentication:** Required (JWT/Session)

**Request:**
```typescript
{
  password: string;  // Current password required for security verification
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    backupCodes: string[];  // Array of 10 plain-text codes (e.g., ["ABCD-1234", ...])
    message: string;
    warning: string;        // Critical warning about one-time display
    info: {
      count: number;                        // Always 10
      previousCodesInvalidated: true;       // Always true
      oneTimeUse: true;                     // Always true
      format: string;                       // "Each code can only be used once"
      usage: string;                        // Usage instructions
    };
  };
}
```

**Example Request:**
```json
{
  "password": "MySecurePassword123!"
}
```

**Example Response:**
```json
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

**Important Notes:**
- ⚠️ Codes are displayed ONLY ONCE - cannot be retrieved later
- All previous unused codes are invalidated immediately
- Requires password verification for security
- User receives email notification after regeneration
- Redis flag cleared (allows new low-code alerts after 24 hours)

**Rate Limiting:** 
- Standard authentication endpoint rate limit applies
- Recommended: 3 attempts per 15 minutes per user

---

### 3. Verify Backup Code During Login

Use a backup code to complete 2FA authentication when primary method unavailable.

**Endpoint:** `POST /api/auth/2fa/verify-backup-code`

**Authentication:** Requires temporary authentication token from Step 1 login

**Request:**
```typescript
{
  temporaryToken: string;    // From initial login response
  code: string;              // Backup code (e.g., "ABCD-1234")
  trustDevice?: boolean;     // Optional: remember this device (default: false)
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
      emailVerified: boolean;
      twoFactorEnabled: boolean;
    };
    session: {
      token: string;           // JWT token for authenticated requests
      expiresAt: string;       // ISO timestamp
    };
    trustedDevice?: {
      token: string;           // Only if trustDevice was true
      expiresAt: string;
    };
    message: string;
    warning?: string;          // Shown if remaining codes < 3
  };
}
```

**Example Request:**
```json
{
  "temporaryToken": "temp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "code": "ABCD-1234",
  "trustDevice": false
}
```

**Example Response (Success - Low Codes Warning):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_abc123",
      "email": "creator@example.com",
      "name": "Jane Doe",
      "role": "CREATOR",
      "emailVerified": true,
      "twoFactorEnabled": true
    },
    "session": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expiresAt": "2025-10-20T12:00:00Z"
    },
    "message": "Authentication successful",
    "warning": "⚠️ You have 2 backup codes remaining. Please regenerate them soon."
  }
}
```

**Important Notes:**
- Code is marked as `used` immediately upon successful verification
- Race condition protection: concurrent requests with same code will fail
- If remaining codes < 3, email alert sent (max once per 24 hours)
- Temporary token consumed and invalidated after successful verification
- Code format is case-insensitive and whitespace is stripped

---

## TypeScript Type Definitions

### Core Interfaces

```typescript
/**
 * 2FA Status Response
 * Used for GET /api/auth/2fa/status
 */
export interface TwoFactorStatusResponse {
  success: true;
  data: {
    enabled: boolean;
    bothMethodsEnabled: boolean;
    verifiedAt: string | null;
    preferredMethod: 'AUTHENTICATOR' | 'SMS' | null;
    availableMethods: {
      totp: TwoFactorMethodInfo;
      sms: TwoFactorMethodInfo;
    };
    backupCodes: BackupCodeStatus;
    capabilities: TwoFactorCapabilities;
    recommendations: TwoFactorRecommendations;
  };
}

export interface TwoFactorMethodInfo {
  enabled: boolean;
  configured: boolean;
  maskedPhone?: string | null;
  description: string;
}

export interface BackupCodeStatus {
  available: boolean;
  remaining: number;  // 0-10
}

export interface TwoFactorCapabilities {
  canSetPreference: boolean;
  canRemoveMethod: boolean;
  canSwitchDuringLogin: boolean;
}

export interface TwoFactorRecommendations {
  enableTotp: string | null;
  enableSms: string | null;
  regenerateBackupCodes: string | null;
  setPreference: string | null;
  enableAny: string | null;
}

/**
 * Regenerate Backup Codes Request
 */
export interface RegenerateBackupCodesRequest {
  password: string;
}

/**
 * Regenerate Backup Codes Response
 */
export interface RegenerateBackupCodesResponse {
  success: true;
  data: {
    backupCodes: string[];  // Always length 10
    message: string;
    warning: string;
    info: BackupCodeInfo;
  };
}

export interface BackupCodeInfo {
  count: number;
  previousCodesInvalidated: boolean;
  oneTimeUse: boolean;
  format: string;
  usage: string;
}

/**
 * Verify Backup Code Request
 */
export interface VerifyBackupCodeRequest {
  temporaryToken: string;
  code: string;
  trustDevice?: boolean;
}

/**
 * Verify Backup Code Response
 */
export interface VerifyBackupCodeResponse {
  success: true;
  data: {
    user: AuthenticatedUser;
    session: SessionData;
    trustedDevice?: TrustedDeviceData;
    message: string;
    warning?: string;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'CREATOR' | 'BRAND' | 'VIEWER';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface SessionData {
  token: string;
  expiresAt: string;  // ISO 8601 timestamp
}

export interface TrustedDeviceData {
  token: string;
  expiresAt: string;  // ISO 8601 timestamp
}
```

### Validation Schemas (Zod)

```typescript
import { z } from 'zod';

/**
 * Password validation for regeneration
 */
export const regenerateBackupCodesSchema = z.object({
  password: z.string().min(1, 'Password is required for security confirmation'),
});

export type RegenerateBackupCodesInput = z.infer<typeof regenerateBackupCodesSchema>;

/**
 * Backup code verification during login
 */
export const verifyBackupCodeSchema = z.object({
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
});

export type VerifyBackupCodeInput = z.infer<typeof verifyBackupCodeSchema>;

/**
 * Complete login verification with backup code
 */
export const verifyBackupCodeLoginSchema = z.object({
  temporaryToken: z.string().min(32, 'Invalid temporary token'),
  code: z
    .string()
    .min(8, 'Backup code must be at least 8 characters')
    .max(20, 'Backup code is too long')
    .transform((code) => code.replace(/\s/g, '').toUpperCase()),
  trustDevice: z.boolean().optional().default(false),
});

export type VerifyBackupCodeLoginInput = z.infer<typeof verifyBackupCodeLoginSchema>;
```

### Error Response Type

```typescript
/**
 * Standard error response for all endpoints
 */
export interface BackupCodeErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode?: number;
    details?: unknown;
  };
}

/**
 * Union type for all possible responses
 */
export type BackupCodeApiResponse<T> = T | BackupCodeErrorResponse;
```

### Enums and Constants

```typescript
/**
 * Backup code constants
 */
export const BACKUP_CODE_CONSTANTS = {
  COUNT: 10,
  LENGTH: 8,  // Without dash
  FORMAT: 'XXXX-XXXX',
  LOW_THRESHOLD: 3,
  ALERT_COOLDOWN_HOURS: 24,
} as const;

/**
 * 2FA Method Types
 */
export enum TwoFactorMethod {
  AUTHENTICATOR = 'AUTHENTICATOR',
  SMS = 'SMS',
  BACKUP_CODE = 'BACKUP_CODE',
}

/**
 * User roles
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}
```

---

## Next Steps

Continue to **Part 2** for:
- Business logic and validation rules
- Comprehensive error handling
- Authorization and permissions
- Rate limiting details

