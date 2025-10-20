# 🔐 Frontend Integration Guide: TOTP Two-Factor Authentication (Part 1)

**Classification:** 🌐 SHARED - Used by both public-facing website and admin backend  
**Module:** TOTP (Time-based One-Time Password) Authentication  
**Backend Deployment:** ops.yesgoddess.agency  
**Last Updated:** October 19, 2025

---

## 📋 Table of Contents

### Part 1 (This Document)
1. [Overview](#overview)
2. [API Endpoints](#api-endpoints)
3. [TypeScript Type Definitions](#typescript-type-definitions)
4. [Business Logic & Validation Rules](#business-logic--validation-rules)

### Part 2 (See FRONTEND_INTEGRATION_TOTP_PART_2.md)
5. Error Handling
6. Authorization & Permissions
7. Rate Limiting & Quotas
8. Frontend Implementation Guide
9. UX Best Practices
10. Testing Checklist

---

## 1. Overview

### What is TOTP?

TOTP (Time-based One-Time Password) is a two-factor authentication method that generates 6-digit codes that change every 30 seconds. Users scan a QR code with authenticator apps like Google Authenticator, Microsoft Authenticator, or Authy to set up 2FA.

### Key Features Implemented

✅ **TOTP Setup Flow**
- QR code generation for easy setup
- Manual entry key for devices without cameras
- Code verification before enabling

✅ **Backup Codes**
- 10 single-use backup codes generated automatically
- Used when user doesn't have access to authenticator app
- Regeneration available with password verification

✅ **Security Features**
- AES-256-GCM encryption for stored secrets
- ±30 second time drift tolerance (3 valid windows)
- Cryptographically secure random secret generation
- Rate limiting on verification attempts

✅ **Account Management**
- Enable/disable 2FA with password confirmation
- View 2FA status and remaining backup codes
- Regenerate backup codes

---

## 2. API Endpoints

> **Note:** All endpoints use tRPC. The base URL is `https://ops.yesgoddess.agency/api/trpc`

### 2.1 Initiate TOTP Setup

**Endpoint:** `auth.totpSetup`  
**Method:** `mutation`  
**Authentication:** Required (Protected)

**Description:** Initiates TOTP setup for the authenticated user. Returns QR code and manual entry key for authenticator app setup. Does NOT enable 2FA yet - user must verify a code first.

**Request Body:**
```typescript
// No input required - uses authenticated user from session
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    qrCodeDataUrl: string,      // Data URL for QR code image (base64)
    manualEntryKey: string,     // Formatted secret for manual entry (e.g., "ABCD EFGH IJKL")
    message: string             // User-friendly message
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "qrCodeDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "manualEntryKey": "JBSW Y3DP EHPK 3PXP",
    "message": "Scan QR code with your authenticator app or enter the key manually"
  }
}
```

**When to Call:**
- User clicks "Enable Two-Factor Authentication" button
- User is on 2FA settings page and wants to set up TOTP

**Important Notes:**
- Can only be called if 2FA is NOT already enabled
- Stores encrypted secret temporarily (not activated yet)
- Secret expires if setup not completed within reasonable timeframe
- QR code contains: `otpauth://totp/YesGoddess:user@example.com?secret=...&issuer=YesGoddess`

---

### 2.2 Confirm TOTP Setup

**Endpoint:** `auth.totpConfirm`  
**Method:** `mutation`  
**Authentication:** Required (Protected)

**Description:** Verifies a TOTP code and completes setup. Enables 2FA for the user and returns backup codes (ONLY TIME user will see them).

**Request Body:**
```typescript
{
  code: string  // 6-digit TOTP code from authenticator app
}
```

**Example Request:**
```json
{
  "code": "123456"
}
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    backupCodes: string[],      // Array of 10 backup codes (ONLY SHOWN ONCE)
    message: string             // User-friendly message
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "ABCD-EFGH",
      "IJKL-MNOP",
      "QRST-UVWX",
      "YZAB-CDEF",
      "GHIJ-KLMN",
      "OPQR-STUV",
      "WXYZ-ABCD",
      "EFGH-IJKL",
      "MNOP-QRST",
      "UVWX-YZAB"
    ],
    "message": "Two-factor authentication enabled successfully. Save your backup codes in a secure location."
  }
}
```

**When to Call:**
- After user scans QR code and enters the 6-digit code from their app
- User clicks "Verify and Enable" button

**Important Notes:**
- Backup codes are shown ONLY ONCE - user must save them
- After this call, 2FA is fully enabled
- User will need 2FA code for future logins
- Sets `preferred_2fa_method` to 'AUTHENTICATOR'
- Triggers email notification about 2FA being enabled

---

### 2.3 Verify TOTP Code During Login

**Endpoint:** `auth.totpVerify`  
**Method:** `mutation`  
**Authentication:** Required (Protected - partial session)

**Description:** Verifies TOTP code during login after password authentication succeeds. This is NOT used for the multi-step login flow - see Part 2 for that.

**Request Body:**
```typescript
{
  code: string  // 6-digit TOTP code
}
```

**Example Request:**
```json
{
  "code": "654321"
}
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    message: string
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "message": "Two-factor authentication verified"
  }
}
```

**When to Call:**
- After successful password login when user has 2FA enabled
- User enters 6-digit code from authenticator app

---

### 2.4 Verify Backup Code During Login

**Endpoint:** `auth.backupCodeVerify`  
**Method:** `mutation`  
**Authentication:** Required (Protected - partial session)

**Description:** Verifies a backup code during login. Used when user doesn't have access to authenticator app.

**Request Body:**
```typescript
{
  code: string  // 8-character backup code (e.g., "ABCD-EFGH")
}
```

**Example Request:**
```json
{
  "code": "ABCD-EFGH"
}
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    message: string
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "message": "Backup code verified"
  }
}
```

**When to Call:**
- User clicks "Use backup code instead" during 2FA login prompt
- User has lost access to authenticator app

**Important Notes:**
- Each backup code can only be used ONCE
- Backup code is marked as used after successful verification
- If user has <3 backup codes remaining, they receive an alert email
- Code format: XXXX-XXXX (8 alphanumeric characters with dash)

---

### 2.5 Disable TOTP

**Endpoint:** `auth.totpDisable`  
**Method:** `mutation`  
**Authentication:** Required (Protected)

**Description:** Disables TOTP 2FA for the authenticated user. Requires password confirmation for security.

**Request Body:**
```typescript
{
  password: string,      // User's current password (required)
  code?: string         // Optional TOTP code for extra verification
}
```

**Example Request:**
```json
{
  "password": "MySecurePassword123!",
  "code": "123456"
}
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    message: string
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "message": "Two-factor authentication disabled"
  }
}
```

**When to Call:**
- User clicks "Disable Two-Factor Authentication" in settings
- User confirms they want to disable 2FA

**Important Notes:**
- Removes encrypted TOTP secret from database
- Deletes ALL backup codes
- Triggers email notification about 2FA being disabled
- User should re-confirm this action in UI (show warning)

---

### 2.6 Regenerate Backup Codes

**Endpoint:** `auth.backupCodesRegenerate`  
**Method:** `mutation`  
**Authentication:** Required (Protected)

**Description:** Generates new backup codes, invalidating all previous unused codes. Requires password confirmation.

**Request Body:**
```typescript
{
  password: string  // User's current password (required)
}
```

**Example Request:**
```json
{
  "password": "MySecurePassword123!"
}
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    backupCodes: string[],      // Array of 10 new backup codes
    message: string
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "WXYZ-ABCD",
      "EFGH-IJKL",
      "MNOP-QRST",
      "STUV-WXYZ",
      "ABCD-EFGH",
      "IJKL-MNOP",
      "QRST-UVWX",
      "YZAB-CDEF",
      "GHIJ-KLMN",
      "OPQR-STUV"
    ],
    "message": "New backup codes generated. Save them in a secure location."
  }
}
```

**When to Call:**
- User has used most/all backup codes
- User suspects backup codes may be compromised
- User clicks "Generate New Backup Codes" button

**Important Notes:**
- All old backup codes (used or unused) are invalidated
- New codes are shown ONLY ONCE
- Triggers email notification
- User should save codes immediately

---

### 2.7 Get TOTP Status

**Endpoint:** `auth.totpStatus`  
**Method:** `query`  
**Authentication:** Required (Protected)

**Description:** Returns current 2FA status for the authenticated user.

**Request Body:**
```typescript
// No input required - uses authenticated user from session
```

**Success Response (200 OK):**
```typescript
{
  success: true,
  data: {
    enabled: boolean,                 // Is 2FA currently enabled?
    verifiedAt: Date | null,         // When 2FA was first enabled
    backupCodesRemaining: number     // Number of unused backup codes
  }
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "verifiedAt": "2025-10-15T14:30:00.000Z",
    "backupCodesRemaining": 7
  }
}
```

**When to Call:**
- On settings page load to show current 2FA status
- To determine if user should see "Enable 2FA" or "Disable 2FA" button
- To display backup code count

**Important Notes:**
- Call this on every settings page render
- Use `backupCodesRemaining` to show warnings if low (<3)

---

## 3. TypeScript Type Definitions

### 3.1 Core Types

```typescript
/**
 * TOTP Setup Response
 * Returned when initiating TOTP setup
 */
export interface TotpSetupData {
  qrCodeDataUrl: string;      // Base64-encoded QR code image (data:image/png;base64,...)
  manualEntryKey: string;     // Secret formatted for manual entry (e.g., "ABCD EFGH IJKL")
  message: string;            // User-friendly instructions
}

/**
 * TOTP Confirmation Response
 * Returned after successful TOTP setup
 */
export interface TotpConfirmResponse {
  backupCodes: string[];      // Array of 10 backup codes (XXXX-XXXX format)
  message: string;            // Success message
}

/**
 * TOTP Status Response
 * Current 2FA status for user
 */
export interface TotpStatus {
  enabled: boolean;                // Is TOTP/2FA enabled?
  verifiedAt: Date | null;        // ISO timestamp when 2FA was enabled
  backupCodesRemaining: number;   // Count of unused backup codes
}

/**
 * Backup Code Regeneration Response
 */
export interface BackupCodesRegenerateResponse {
  backupCodes: string[];      // Array of 10 new backup codes
  message: string;            // Success message
}

/**
 * Generic Success Response
 */
export interface SuccessResponse {
  message: string;
}
```

### 3.2 Request Input Types

```typescript
/**
 * TOTP Code Verification Input
 * Used for confirming setup and verifying during login
 */
export interface VerifyTotpInput {
  code: string;  // 6-digit code, whitespace is stripped automatically
}

/**
 * TOTP Setup Confirmation Input
 */
export interface ConfirmTotpSetupInput {
  code: string;  // 6-digit code from authenticator app
}

/**
 * TOTP Disable Input
 */
export interface DisableTotpInput {
  password: string;    // User's current password (required)
  code?: string;       // Optional TOTP code for extra verification
}

/**
 * Backup Code Verification Input
 */
export interface VerifyBackupCodeInput {
  code: string;  // 8-character backup code (XXXX-XXXX), automatically uppercased
}

/**
 * Backup Code Regeneration Input
 */
export interface BackupCodesRegenerateInput {
  password: string;  // User's current password (required)
}
```

### 3.3 Zod Validation Schemas (for frontend validation)

```typescript
import { z } from 'zod';

/**
 * TOTP Code Schema
 * Validates 6-digit codes from authenticator apps
 */
export const totpCodeSchema = z
  .string()
  .min(6, 'TOTP code must be 6 digits')
  .max(10, 'TOTP code is too long')  // Allow spaces
  .regex(/^[0-9\s]+$/, 'TOTP code must contain only digits')
  .transform((code) => code.replace(/\s/g, ''))  // Strip whitespace
  .refine((code) => code.length === 6, {
    message: 'TOTP code must be exactly 6 digits',
  });

/**
 * Backup Code Schema
 * Validates backup codes (XXXX-XXXX format)
 */
export const backupCodeSchema = z
  .string()
  .min(8, 'Backup code must be at least 8 characters')
  .max(20, 'Backup code is too long')
  .transform((code) => code.replace(/\s/g, '').toUpperCase())  // Strip spaces, uppercase
  .refine((code) => /^[A-Z0-9-]+$/.test(code), {
    message: 'Backup code contains invalid characters',
  });

/**
 * Password Schema (for disable/regenerate operations)
 */
export const passwordRequiredSchema = z
  .string()
  .min(1, 'Password is required');

/**
 * Complete Validation Schemas
 */
export const verifyTotpSchema = z.object({
  code: totpCodeSchema,
});

export const confirmTotpSetupSchema = z.object({
  code: totpCodeSchema,
});

export const disableTotpSchema = z.object({
  password: passwordRequiredSchema,
  code: totpCodeSchema.optional(),
});

export const verifyBackupCodeSchema = z.object({
  code: backupCodeSchema,
});

export const backupCodesRegenerateSchema = z.object({
  password: passwordRequiredSchema,
});
```

---

## 4. Business Logic & Validation Rules

### 4.1 TOTP Code Requirements

| Property | Requirement | Notes |
|----------|-------------|-------|
| **Format** | 6 numeric digits | Whitespace is automatically stripped |
| **Time Window** | 30 seconds | Code changes every 30 seconds |
| **Valid Windows** | Current ± 1 window | Accepts codes from 30s before to 30s after current time |
| **Algorithm** | TOTP (RFC 6238) | SHA-1, 6 digits, 30s step |
| **Case Sensitivity** | N/A | Only numbers allowed |

**Frontend Validation:**
```typescript
function validateTotpCode(code: string): string | null {
  // Remove whitespace
  const clean = code.replace(/\s/g, '');
  
  // Check length
  if (clean.length !== 6) {
    return 'Code must be exactly 6 digits';
  }
  
  // Check if numeric
  if (!/^\d+$/.test(clean)) {
    return 'Code must contain only numbers';
  }
  
  return null; // Valid
}
```

### 4.2 Backup Code Requirements

| Property | Requirement | Notes |
|----------|-------------|-------|
| **Format** | XXXX-XXXX | 8 alphanumeric characters with dash |
| **Character Set** | A-Z, 0-9, dash | Automatically uppercased |
| **Quantity** | 10 codes per user | Generated during setup or regeneration |
| **Single Use** | Each code can only be used once | Marked as used after verification |
| **Whitespace** | Automatically stripped | User can enter with or without spaces |

**Frontend Validation:**
```typescript
function validateBackupCode(code: string): string | null {
  // Remove whitespace and uppercase
  const clean = code.replace(/\s/g, '').toUpperCase();
  
  // Check length
  if (clean.length < 8) {
    return 'Backup code is too short';
  }
  
  if (clean.length > 9) { // 8 chars + 1 dash
    return 'Backup code is too long';
  }
  
  // Check format (alphanumeric and dash only)
  if (!/^[A-Z0-9-]+$/.test(clean)) {
    return 'Backup code contains invalid characters';
  }
  
  return null; // Valid
}
```

### 4.3 Setup Flow State Machine

```
┌─────────────────┐
│  2FA Disabled   │ ← Initial State
└────────┬────────┘
         │
         │ User clicks "Enable 2FA"
         ↓
┌─────────────────┐
│  Setup Started  │ ← totpSetup() called
└────────┬────────┘   QR code + manual key displayed
         │
         │ User scans QR code
         │ User enters code from app
         ↓
┌─────────────────┐
│  Verifying Code │ ← totpConfirm() called
└────────┬────────┘
         │
         ├─ Success ──┐
         │            ↓
         │     ┌──────────────────┐
         │     │   2FA Enabled    │ ← Backup codes shown (ONCE)
         │     └──────────────────┘
         │
         └─ Failure ──┐
                      ↓
              ┌──────────────┐
              │ Show Error   │ ← User tries again
              └──────┬───────┘
                     │
                     └─── Back to "Verifying Code"
```

**State Persistence:**
- Setup state stored in database: `two_factor_secret` field is populated but `two_factor_enabled = false`
- If user abandons setup, secret remains in DB (not activated)
- User can restart setup flow which overwrites previous secret

### 4.4 Login Flow with 2FA

```
┌────────────────┐
│  Enter Email   │
│  & Password    │
└───────┬────────┘
        │
        │ Submit credentials
        ↓
┌────────────────┐
│   Verify       │
│   Password     │
└───────┬────────┘
        │
        ├─ 2FA Disabled ──┐
        │                 ↓
        │          ┌──────────────┐
        │          │ Login Success│
        │          └──────────────┘
        │
        └─ 2FA Enabled ───┐
                          ↓
                   ┌──────────────────┐
                   │ Prompt for TOTP  │
                   │                  │
                   │ "Lost access?"   │
                   │ link available   │
                   └────────┬─────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         User enters TOTP        User clicks "Use backup code"
                │                       │
                ↓                       ↓
         ┌─────────────┐         ┌─────────────┐
         │ totpVerify()│         │backupCode   │
         │             │         │Verify()     │
         └──────┬──────┘         └──────┬──────┘
                │                       │
                └───────┬───────────────┘
                        │
                   Success/Failure
                        │
                        ↓
                 ┌──────────────┐
                 │Login Complete│
                 │      or      │
                 │ Show Error   │
                 └──────────────┘
```

### 4.5 Business Rules

#### Setup Rules
1. **Cannot enable if already enabled**: Check `totpStatus` before showing setup UI
2. **Must verify code to enable**: Setup doesn't activate 2FA until `totpConfirm` succeeds
3. **Backup codes shown once**: Store in secure modal, require user acknowledgment
4. **Secret encryption**: Backend encrypts secrets with AES-256-GCM (transparent to frontend)

#### Verification Rules
1. **3 valid time windows**: Code from previous, current, or next 30s window accepted
2. **No rate limiting on verification**: Backend handles this (see Part 2)
3. **Failed attempts logged**: For security monitoring (transparent to frontend)

#### Backup Code Rules
1. **Single use only**: After successful verification, code cannot be reused
2. **Low code warning**: Show warning if `backupCodesRemaining < 3`
3. **Race condition protected**: Backend uses atomic updates to prevent double-use

#### Disable Rules
1. **Password required**: Always require current password to disable
2. **Optional TOTP verification**: Can optionally require current TOTP code for extra security
3. **All data deleted**: Removes secret and ALL backup codes (used and unused)

---

**Continue to Part 2** for Error Handling, Rate Limiting, Implementation Guide, and Testing Checklist.
