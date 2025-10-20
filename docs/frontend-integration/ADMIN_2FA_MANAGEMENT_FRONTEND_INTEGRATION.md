# 🔒 Admin 2FA Management - Frontend Integration Guide

**Classification:** 🔒 ADMIN ONLY  
**Version:** 1.0  
**Last Updated:** October 20, 2025

---

## Overview

This document provides comprehensive integration details for the Admin 2FA Management module. Admin staff can view, manage, and enforce two-factor authentication across the platform.

### Module Capabilities

- View all users' 2FA status with filtering and pagination
- View detailed 2FA information for individual users
- Force reset user 2FA (with admin approval/reason)
- Generate emergency access codes for locked-out users
- Manage 2FA policies (optional vs mandatory by role)
- View non-compliant users
- Security audit logging

---

## 1. API Endpoints

### Base URL

```
Production: https://ops.yesgoddess.agency/api/admin
Development: http://localhost:3000/api/admin
```

All endpoints require:
- **Authentication:** Valid JWT token in `Authorization: Bearer {token}` header
- **Role:** `ADMIN` role required
- **Content-Type:** `application/json`

---

### 1.1 Get All Users 2FA Status

List all users with their 2FA status, with filtering and pagination.

**Endpoint:** `GET /api/admin/users/2fa`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (1-indexed) |
| `limit` | number | No | 50 | Results per page (max 100) |
| `role` | UserRole | No | - | Filter by user role |
| `twoFactorEnabled` | boolean | No | - | Filter by 2FA enabled status |
| `twoFactorRequired` | boolean | No | - | Filter by 2FA required status |
| `search` | string | No | - | Search by email or name (case-insensitive) |

**Example Request:**

```typescript
// Using fetch
const response = await fetch(
  '/api/admin/users/2fa?page=1&limit=50&twoFactorEnabled=false&role=CREATOR',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);
```

**Response Schema:**

```typescript
interface GetAllUsers2FAResponse {
  users: User2FAStatus[];
  total: number;
  page: number;
  limit: number;
}

interface User2FAStatus {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  two_factor_enabled: boolean;
  two_factor_verified_at: Date | null;
  two_factor_required: boolean;
  two_factor_grace_period_ends: Date | null;
  preferred_2fa_method: TwoFactorMethod | null;
  phone_verified: boolean;
  backupCodesRemaining: number;
  lastLoginAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
}
```

**Example Response:**

```json
{
  "users": [
    {
      "id": "user_12345",
      "email": "creator@example.com",
      "name": "Jane Creator",
      "role": "CREATOR",
      "two_factor_enabled": false,
      "two_factor_verified_at": null,
      "two_factor_required": true,
      "two_factor_grace_period_ends": "2025-11-20T00:00:00.000Z",
      "preferred_2fa_method": null,
      "phone_verified": false,
      "backupCodesRemaining": 0,
      "lastLoginAt": "2025-10-19T14:30:00.000Z",
      "isLocked": false,
      "createdAt": "2025-09-01T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized (not authenticated or not admin)
- `500` - Internal server error

---

### 1.2 Get User 2FA Details

Get detailed 2FA information for a specific user, including security events and login attempts.

**Endpoint:** `GET /api/admin/users/2fa/{userId}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID (CUID) |

**Example Request:**

```typescript
const response = await fetch(`/api/admin/users/2fa/${userId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface User2FADetails extends User2FAStatus {
  two_factor_last_reset_at: Date | null;
  two_factor_last_reset_by: string | null;
  emergencyCodesActive: number;
  recentSecurityEvents: SecurityEvent[];
  loginAttempts: LoginAttempt[];
}

interface SecurityEvent {
  eventType: string;
  action: string;
  success: boolean;
  createdAt: Date;
  ipAddress: string | null;
}

interface LoginAttempt {
  success: boolean;
  ipAddress: string | null;
  timestamp: Date;
  failureReason: string | null;
}
```

**Example Response:**

```json
{
  "id": "user_12345",
  "email": "creator@example.com",
  "name": "Jane Creator",
  "role": "CREATOR",
  "two_factor_enabled": true,
  "two_factor_verified_at": "2025-10-01T10:00:00.000Z",
  "two_factor_required": true,
  "two_factor_grace_period_ends": null,
  "two_factor_last_reset_at": null,
  "two_factor_last_reset_by": null,
  "preferred_2fa_method": "AUTHENTICATOR",
  "phone_verified": false,
  "backupCodesRemaining": 8,
  "emergencyCodesActive": 0,
  "lastLoginAt": "2025-10-19T14:30:00.000Z",
  "isLocked": false,
  "createdAt": "2025-09-01T10:00:00.000Z",
  "recentSecurityEvents": [
    {
      "eventType": "2FA_VERIFY_SUCCESS",
      "action": "VERIFY_2FA",
      "success": true,
      "createdAt": "2025-10-19T14:30:00.000Z",
      "ipAddress": "203.0.113.42"
    }
  ],
  "loginAttempts": [
    {
      "success": true,
      "ipAddress": "203.0.113.42",
      "timestamp": "2025-10-19T14:30:00.000Z",
      "failureReason": null
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `404` - User not found
- `500` - Internal server error

---

### 1.3 Reset User 2FA

Force reset a user's 2FA configuration. This clears all 2FA settings, backup codes, and emergency codes.

**Endpoint:** `POST /api/admin/users/2fa/{userId}/reset`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID to reset |

**Request Body:**

```typescript
interface ResetUser2FARequest {
  reason: string; // Required, must not be empty
}
```

**Example Request:**

```typescript
const response = await fetch(`/api/admin/users/2fa/${userId}/reset`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    reason: 'User lost access to authenticator device and backup codes',
  }),
});
```

**Response Schema:**

```typescript
interface ResetUser2FAResponse {
  success: boolean;
  message: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "message": "User 2FA has been reset successfully"
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (missing or invalid reason)
- `401` - Unauthorized
- `403` - Forbidden (admin cannot reset their own 2FA)
- `404` - User not found
- `500` - Internal server error

**Business Rules:**

- ⚠️ Admins **cannot** reset their own 2FA (security protection)
- Reason is **required** and must not be empty
- User receives email notification about reset
- All existing 2FA methods, backup codes, and emergency codes are cleared
- Action is logged in audit trail and security logs

---

### 1.4 Generate Emergency Codes

Generate temporary emergency access codes for a locked-out user.

**Endpoint:** `POST /api/admin/users/2fa/{userId}/emergency-codes`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | User ID to generate codes for |

**Request Body:**

```typescript
interface GenerateEmergencyCodesRequest {
  reason: string; // Required
}
```

**Example Request:**

```typescript
const response = await fetch(`/api/admin/users/2fa/${userId}/emergency-codes`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    reason: 'User locked out and needs urgent access for client presentation',
  }),
});
```

**Response Schema:**

```typescript
interface GenerateEmergencyCodesResponse {
  success: boolean;
  data: {
    codes: string[]; // Array of 5 emergency codes
    expiresAt: Date; // 48 hours from generation
    warning: string;
  };
}
```

**Example Response:**

```json
{
  "success": true,
  "data": {
    "codes": [
      "A1B2C3D4E5F6G7H8",
      "I9J0K1L2M3N4O5P6",
      "Q7R8S9T0U1V2W3X4",
      "Y5Z6A7B8C9D0E1F2",
      "G3H4I5J6K7L8M9N0"
    ],
    "expiresAt": "2025-10-22T14:30:00.000Z",
    "warning": "These codes are shown only once. Provide them to the user securely."
  }
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (missing reason or user doesn't have 2FA enabled)
- `401` - Unauthorized
- `404` - User not found
- `500` - Internal server error

**Business Rules:**

- **5 codes** are generated per request
- Codes expire after **48 hours**
- Codes are shown **only once** (they are hashed before storage)
- Each code is single-use
- User must have 2FA enabled to generate emergency codes
- Action is logged in audit trail and security logs

**⚠️ Security Warning:**

Display these codes securely to the user. Consider:
- Showing them in a modal with copy button
- Requiring admin to acknowledge they've shared them
- Displaying expiration time prominently
- Logging when codes are viewed

---

### 1.5 Get 2FA Policies

Get all configured 2FA policies for different roles.

**Endpoint:** `GET /api/admin/users/2fa/policies`

**Example Request:**

```typescript
const response = await fetch('/api/admin/users/2fa/policies', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface GetPoliciesResponse {
  success: boolean;
  data: TwoFactorPolicyConfig[];
}

interface TwoFactorPolicyConfig {
  role: UserRole;
  enforcementType: TwoFactorEnforcementType;
  gracePeriodDays: number;
  enforcementStartDate?: Date;
  allowedMethods?: TwoFactorMethod[];
}
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "role": "ADMIN",
      "enforcementType": "MANDATORY",
      "gracePeriodDays": 7,
      "allowedMethods": ["AUTHENTICATOR", "SMS"]
    },
    {
      "role": "CREATOR",
      "enforcementType": "ROLE_BASED",
      "gracePeriodDays": 30,
      "enforcementStartDate": "2025-11-01T00:00:00.000Z",
      "allowedMethods": ["AUTHENTICATOR", "SMS"]
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

---

### 1.6 Get Policy by Role

Get 2FA policy for a specific role.

**Endpoint:** `GET /api/admin/users/2fa/policies/{role}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | UserRole | Yes | User role (ADMIN, CREATOR, BRAND, VIEWER) |

**Example Request:**

```typescript
const response = await fetch('/api/admin/users/2fa/policies/CREATOR', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface GetPolicyResponse {
  success: boolean;
  data: TwoFactorPolicyConfig | null;
  message?: string;
}
```

**Example Response (policy exists):**

```json
{
  "success": true,
  "data": {
    "role": "CREATOR",
    "enforcementType": "ROLE_BASED",
    "gracePeriodDays": 30,
    "enforcementStartDate": "2025-11-01T00:00:00.000Z",
    "allowedMethods": ["AUTHENTICATOR", "SMS"]
  }
}
```

**Example Response (no policy):**

```json
{
  "success": true,
  "data": null,
  "message": "No 2FA policy set for CREATOR role"
}
```

**Status Codes:**

- `200` - Success (policy may be null)
- `400` - Invalid role
- `401` - Unauthorized
- `500` - Internal server error

---

### 1.7 Create/Update 2FA Policy

Create or update a 2FA policy for a role.

**Endpoint:** `POST /api/admin/users/2fa/policies`

**Request Body:**

```typescript
interface SetPolicyRequest {
  role: UserRole;
  enforcementType: TwoFactorEnforcementType;
  gracePeriodDays: number;
  enforcementStartDate?: string; // ISO 8601 date
  allowedMethods?: TwoFactorMethod[];
}
```

**Example Request:**

```typescript
const response = await fetch('/api/admin/users/2fa/policies', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    role: 'CREATOR',
    enforcementType: 'MANDATORY',
    gracePeriodDays: 30,
    enforcementStartDate: '2025-11-01T00:00:00.000Z',
    allowedMethods: ['AUTHENTICATOR', 'SMS'],
  }),
});
```

**Response Schema:**

```typescript
interface SetPolicyResponse {
  success: boolean;
  message: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "message": "2FA policy for CREATOR role has been updated successfully"
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (validation errors)
- `401` - Unauthorized
- `500` - Internal server error

**Validation Rules:**

- `role` - Required, must be valid UserRole
- `enforcementType` - Required, must be OPTIONAL, MANDATORY, or ROLE_BASED
- `gracePeriodDays` - Required, must be >= 0
- `enforcementStartDate` - Optional, must be valid ISO 8601 date
- `allowedMethods` - Optional array of TwoFactorMethod values

**Business Rules:**

- When setting policy to `MANDATORY`, all users with that role who don't have 2FA enabled will have `two_factor_required` set to `true`
- Grace period is applied automatically to affected users
- Action is logged in audit trail

---

### 1.8 Get Non-Compliant Users

Get list of users who are required to enable 2FA but haven't done so yet.

**Endpoint:** `GET /api/admin/users/2fa/non-compliant`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `role` | UserRole | No | - | Filter by specific role |

**Example Request:**

```typescript
const response = await fetch('/api/admin/users/2fa/non-compliant?role=CREATOR', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface GetNonCompliantResponse {
  success: boolean;
  data: NonCompliantUser[];
  total: number;
}

interface NonCompliantUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  gracePeriodEnds: Date | null;
  daysRemaining: number;
}
```

**Example Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "user_12345",
      "email": "creator@example.com",
      "name": "Jane Creator",
      "role": "CREATOR",
      "gracePeriodEnds": "2025-11-20T00:00:00.000Z",
      "daysRemaining": 31
    },
    {
      "id": "user_67890",
      "email": "another@example.com",
      "name": "John Doe",
      "role": "CREATOR",
      "gracePeriodEnds": "2025-10-25T00:00:00.000Z",
      "daysRemaining": 5
    }
  ],
  "total": 2
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

**Business Rules:**

- Only returns users where `two_factor_required = true` AND `two_factor_enabled = false`
- `daysRemaining` is calculated from `gracePeriodEnds`
- If grace period has expired, `daysRemaining = 0`

---

## 2. TypeScript Type Definitions

### 2.1 Enums

```typescript
enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

enum TwoFactorMethod {
  SMS = 'SMS',
  AUTHENTICATOR = 'AUTHENTICATOR',
  BOTH = 'BOTH',
}

enum TwoFactorEnforcementType {
  OPTIONAL = 'OPTIONAL',
  MANDATORY = 'MANDATORY',
  ROLE_BASED = 'ROLE_BASED',
}
```

### 2.2 Core Types

```typescript
// User 2FA Status (List View)
interface User2FAStatus {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  two_factor_enabled: boolean;
  two_factor_verified_at: Date | null;
  two_factor_required: boolean;
  two_factor_grace_period_ends: Date | null;
  preferred_2fa_method: TwoFactorMethod | null;
  phone_verified: boolean;
  backupCodesRemaining: number;
  lastLoginAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
}

// User 2FA Details (Detail View)
interface User2FADetails extends User2FAStatus {
  two_factor_last_reset_at: Date | null;
  two_factor_last_reset_by: string | null;
  emergencyCodesActive: number;
  recentSecurityEvents: SecurityEvent[];
  loginAttempts: LoginAttempt[];
}

interface SecurityEvent {
  eventType: string;
  action: string;
  success: boolean;
  createdAt: Date;
  ipAddress: string | null;
}

interface LoginAttempt {
  success: boolean;
  ipAddress: string | null;
  timestamp: Date;
  failureReason: string | null;
}

// 2FA Policy Configuration
interface TwoFactorPolicyConfig {
  role: UserRole;
  enforcementType: TwoFactorEnforcementType;
  gracePeriodDays: number;
  enforcementStartDate?: Date;
  allowedMethods?: TwoFactorMethod[];
}

// Non-Compliant User
interface NonCompliantUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  gracePeriodEnds: Date | null;
  daysRemaining: number;
}

// Emergency Codes Result
interface EmergencyCodeResult {
  codes: string[];
  expiresAt: Date;
  warning: string;
}
```

### 2.3 API Request/Response Types

```typescript
// Paginated Response
interface PaginatedResponse<T> {
  users?: T[];
  data?: T[];
  total: number;
  page: number;
  limit: number;
}

// Standard Success Response
interface SuccessResponse {
  success: boolean;
  message?: string;
}

// Error Response
interface ErrorResponse {
  error: string;
  details?: string;
}

// Query Options for User List
interface GetUsers2FAOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  twoFactorEnabled?: boolean;
  twoFactorRequired?: boolean;
  search?: string;
}
```

### 2.4 Complete Type Export

Create a `types/admin-2fa.types.ts` file in your frontend:

```typescript
/**
 * Admin 2FA Management Types
 * Generated from YesGoddess Backend API
 */

export enum UserRole {
  ADMIN = 'ADMIN',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  VIEWER = 'VIEWER',
}

export enum TwoFactorMethod {
  SMS = 'SMS',
  AUTHENTICATOR = 'AUTHENTICATOR',
  BOTH = 'BOTH',
}

export enum TwoFactorEnforcementType {
  OPTIONAL = 'OPTIONAL',
  MANDATORY = 'MANDATORY',
  ROLE_BASED = 'ROLE_BASED',
}

export interface User2FAStatus {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  two_factor_enabled: boolean;
  two_factor_verified_at: Date | null;
  two_factor_required: boolean;
  two_factor_grace_period_ends: Date | null;
  preferred_2fa_method: TwoFactorMethod | null;
  phone_verified: boolean;
  backupCodesRemaining: number;
  lastLoginAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
}

export interface SecurityEvent {
  eventType: string;
  action: string;
  success: boolean;
  createdAt: Date;
  ipAddress: string | null;
}

export interface LoginAttempt {
  success: boolean;
  ipAddress: string | null;
  timestamp: Date;
  failureReason: string | null;
}

export interface User2FADetails extends User2FAStatus {
  two_factor_last_reset_at: Date | null;
  two_factor_last_reset_by: string | null;
  emergencyCodesActive: number;
  recentSecurityEvents: SecurityEvent[];
  loginAttempts: LoginAttempt[];
}

export interface TwoFactorPolicyConfig {
  role: UserRole;
  enforcementType: TwoFactorEnforcementType;
  gracePeriodDays: number;
  enforcementStartDate?: Date;
  allowedMethods?: TwoFactorMethod[];
}

export interface NonCompliantUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  gracePeriodEnds: Date | null;
  daysRemaining: number;
}

// API Response Types
export interface GetUsers2FAResponse {
  users: User2FAStatus[];
  total: number;
  page: number;
  limit: number;
}

export interface GetPoliciesResponse {
  success: boolean;
  data: TwoFactorPolicyConfig[];
}

export interface GetPolicyResponse {
  success: boolean;
  data: TwoFactorPolicyConfig | null;
  message?: string;
}

export interface GetNonCompliantResponse {
  success: boolean;
  data: NonCompliantUser[];
  total: number;
}

export interface EmergencyCodesResponse {
  success: boolean;
  data: {
    codes: string[];
    expiresAt: Date;
    warning: string;
  };
}

export interface ResetUser2FAResponse {
  success: boolean;
  message: string;
}

export interface SetPolicyResponse {
  success: boolean;
  message: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}

// Query Options
export interface GetUsers2FAOptions {
  page?: number;
  limit?: number;
  role?: UserRole;
  twoFactorEnabled?: boolean;
  twoFactorRequired?: boolean;
  search?: string;
}
```

---

## 3. Business Logic & Validation Rules

### 3.1 Field Validation

#### Reset 2FA Request
```typescript
const resetSchema = z.object({
  reason: z.string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});
```

#### Generate Emergency Codes Request
```typescript
const emergencyCodesSchema = z.object({
  reason: z.string()
    .min(1, 'Reason is required')
    .max(500, 'Reason must be less than 500 characters')
    .trim(),
});
```

#### Set Policy Request
```typescript
const setPolicySchema = z.object({
  role: z.nativeEnum(UserRole),
  enforcementType: z.nativeEnum(TwoFactorEnforcementType),
  gracePeriodDays: z.number()
    .int()
    .min(0, 'Grace period must be non-negative')
    .max(365, 'Grace period cannot exceed 365 days'),
  enforcementStartDate: z.string().datetime().optional(),
  allowedMethods: z.array(z.nativeEnum(TwoFactorMethod)).optional(),
});
```

### 3.2 Business Rules

#### User 2FA Status Rules

1. **Locked Status**
   - User is locked if `locked_until` is in the future
   - Display locked users with warning indicator

2. **Compliance Status**
   - User is compliant if: `two_factor_enabled = true` OR `two_factor_required = false`
   - User is non-compliant if: `two_factor_required = true` AND `two_factor_enabled = false`

3. **Grace Period**
   - Grace period is set when policy becomes mandatory
   - Calculate days remaining: `Math.ceil((gracePeriodEnds - now) / (24 * 60 * 60 * 1000))`
   - If negative or zero, grace period has expired

4. **Backup Codes Warning**
   - Warn if `backupCodesRemaining < 3`
   - Alert if `backupCodesRemaining = 0`

#### Admin Actions Rules

1. **2FA Reset**
   - ❌ Admins CANNOT reset their own 2FA
   - ✅ Reason is REQUIRED
   - ✅ User receives email notification
   - ✅ All 2FA methods cleared (TOTP, SMS, backup codes, emergency codes)

2. **Emergency Codes**
   - ❌ Can only be generated for users with 2FA enabled
   - ✅ Generates 5 codes
   - ✅ Codes expire in 48 hours
   - ✅ Each code is single-use
   - ⚠️ Codes shown only once (cannot be retrieved again)

3. **Policy Updates**
   - When changing to `MANDATORY`:
     - All users in that role get `two_factor_required = true`
     - Grace period is automatically applied
   - Policy changes are logged in audit trail

### 3.3 Calculated Values

#### Days Remaining
```typescript
function calculateDaysRemaining(gracePeriodEnds: Date | null): number | null {
  if (!gracePeriodEnds) return null;
  
  const now = new Date();
  const diffTime = gracePeriodEnds.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}
```

#### Compliance Status
```typescript
function getComplianceStatus(user: User2FAStatus): {
  status: 'compliant' | 'non-compliant' | 'grace-period' | 'expired';
  message: string;
  urgent: boolean;
} {
  // User has 2FA enabled - always compliant
  if (user.two_factor_enabled) {
    return {
      status: 'compliant',
      message: '2FA enabled',
      urgent: false,
    };
  }

  // 2FA not required - compliant
  if (!user.two_factor_required) {
    return {
      status: 'compliant',
      message: '2FA not required',
      urgent: false,
    };
  }

  // Required but not enabled - check grace period
  const daysRemaining = calculateDaysRemaining(user.two_factor_grace_period_ends);
  
  if (daysRemaining === null || daysRemaining <= 0) {
    return {
      status: 'expired',
      message: 'Grace period expired',
      urgent: true,
    };
  }

  if (daysRemaining <= 7) {
    return {
      status: 'grace-period',
      message: `${daysRemaining} days remaining`,
      urgent: true,
    };
  }

  return {
    status: 'grace-period',
    message: `${daysRemaining} days remaining`,
    urgent: false,
  };
}
```

#### 2FA Method Display
```typescript
function get2FAMethodDisplay(method: TwoFactorMethod | null): string {
  switch (method) {
    case 'AUTHENTICATOR':
      return 'Authenticator App';
    case 'SMS':
      return 'SMS';
    case 'BOTH':
      return 'Authenticator + SMS';
    default:
      return 'Not configured';
  }
}
```

---

## 4. Error Handling

### 4.1 HTTP Status Codes

| Status Code | Meaning | When It Occurs |
|-------------|---------|----------------|
| `200` | Success | Request completed successfully |
| `400` | Bad Request | Invalid input, missing required fields, or business rule violation |
| `401` | Unauthorized | Not authenticated or not an admin |
| `403` | Forbidden | Authenticated but action not allowed (e.g., admin resetting own 2FA) |
| `404` | Not Found | User not found |
| `500` | Internal Server Error | Unexpected server error |

### 4.2 Error Response Format

All errors follow this format:

```typescript
interface ErrorResponse {
  error: string;
  details?: string;
}
```

### 4.3 Common Error Scenarios

#### 1. Not Authenticated
```json
{
  "error": "Unauthorized"
}
```

**Frontend Handling:**
- Redirect to login page
- Clear auth tokens
- Show "Session expired" message

#### 2. Not Admin Role
```json
{
  "error": "Unauthorized"
}
```

**Frontend Handling:**
- Redirect to dashboard/home
- Show "Access denied" message
- Log security event

#### 3. User Not Found
```json
{
  "error": "User not found"
}
```

**Frontend Handling:**
- Show toast: "User not found"
- Return to user list
- Don't crash the page

#### 4. Admin Self-Reset Attempt
```json
{
  "error": "Admins cannot reset their own 2FA. Please contact another administrator."
}
```

**Frontend Handling:**
- Show specific error in modal/toast
- Explain security reason
- Suggest contacting another admin

#### 5. Missing Required Field
```json
{
  "error": "Reason is required for 2FA reset"
}
```

**Frontend Handling:**
- Highlight form field with error
- Show inline error message
- Focus on invalid field

#### 6. Invalid Emergency Code Request
```json
{
  "error": "User does not have 2FA enabled"
}
```

**Frontend Handling:**
- Show error: "This user doesn't have 2FA enabled. Emergency codes can only be generated for users with 2FA."
- Disable emergency codes button for users without 2FA

### 4.4 Error Handling Patterns

#### React Query Error Handler
```typescript
function handleApiError(error: unknown): string {
  if (error instanceof Response) {
    if (error.status === 401) {
      // Redirect to login
      window.location.href = '/login';
      return 'Session expired';
    }
    
    if (error.status === 403) {
      return 'You do not have permission to perform this action';
    }
    
    if (error.status === 404) {
      return 'Resource not found';
    }
    
    if (error.status === 500) {
      return 'An unexpected error occurred. Please try again.';
    }
  }
  
  return 'An error occurred. Please try again.';
}
```

#### Form Validation Error Display
```typescript
interface FormErrors {
  reason?: string;
}

function validateResetForm(data: { reason: string }): FormErrors {
  const errors: FormErrors = {};
  
  if (!data.reason || data.reason.trim().length === 0) {
    errors.reason = 'Reason is required';
  } else if (data.reason.length > 500) {
    errors.reason = 'Reason must be less than 500 characters';
  }
  
  return errors;
}
```

---

## 5. Authorization & Permissions

### 5.1 Role Requirements

**ALL endpoints require:**
- ✅ Authenticated user
- ✅ `ADMIN` role

### 5.2 Role Check Implementation

```typescript
// In your API client or interceptor
async function makeAdminRequest(url: string, options?: RequestInit) {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error('Not authenticated');
  }
  
  if (session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Authorization': `Bearer ${session.accessToken}`,
    },
  });
}
```

### 5.3 Special Permission Rules

#### Self-Action Prevention

```typescript
// Admins CANNOT reset their own 2FA
function canResetUser2FA(adminId: string, targetUserId: string): boolean {
  return adminId !== targetUserId;
}

// Check before allowing action
if (!canResetUser2FA(currentAdmin.id, user.id)) {
  throw new Error('You cannot reset your own 2FA');
}
```

### 5.4 UI Permission Checks

```typescript
interface PermissionChecks {
  canReset2FA: (userId: string) => boolean;
  canGenerateEmergencyCodes: (user: User2FAStatus) => boolean;
  canSetPolicy: () => boolean;
}

function useAdmin2FAPermissions(currentAdminId: string): PermissionChecks {
  return {
    canReset2FA: (userId: string) => userId !== currentAdminId,
    canGenerateEmergencyCodes: (user: User2FAStatus) => user.two_factor_enabled,
    canSetPolicy: () => true, // All admins can set policies
  };
}
```

---

## 6. Rate Limiting & Quotas

### 6.1 Rate Limits

The backend uses Redis-based rate limiting. There are no specific rate limit headers returned, but standard rate limiting applies:

- **General API Calls:** 100 requests per minute per IP
- **Admin Actions:** No specific limit (monitored via audit logs)

### 6.2 Best Practices

1. **Debounce Search Input**
   ```typescript
   const debouncedSearch = useDebouncedValue(searchQuery, 500);
   ```

2. **Cache List Responses**
   ```typescript
   // Use React Query with staleTime
   const { data } = useQuery({
     queryKey: ['admin-2fa-users', filters],
     queryFn: () => fetchUsers2FA(filters),
     staleTime: 30000, // 30 seconds
   });
   ```

3. **Paginate Results**
   - Default: 50 items per page
   - Max: 100 items per page
   - Use pagination controls

4. **Avoid Polling**
   - Don't auto-refresh frequently
   - Use manual refresh button instead
   - Consider WebSocket for real-time updates (if available)

---

## 7. Frontend Implementation Checklist

### 7.1 Pages to Build

- [ ] **User 2FA Status List Page** (`/admin/security/2fa/users`)
  - [ ] Data table with sorting and filtering
  - [ ] Role filter dropdown
  - [ ] 2FA enabled/required filters
  - [ ] Search by email/name
  - [ ] Pagination controls
  - [ ] Status badges (enabled, required, locked, compliant)
  - [ ] Quick actions (view details, reset, generate codes)

- [ ] **User 2FA Details Page** (`/admin/security/2fa/users/{userId}`)
  - [ ] User info card
  - [ ] 2FA status overview
  - [ ] Backup codes status
  - [ ] Emergency codes status
  - [ ] Recent security events timeline
  - [ ] Login attempts log
  - [ ] Action buttons (reset 2FA, generate emergency codes)

- [ ] **2FA Policies Page** (`/admin/security/2fa/policies`)
  - [ ] Policy list by role
  - [ ] Edit policy forms
  - [ ] Grace period configuration
  - [ ] Allowed methods selection
  - [ ] Enforcement date picker

- [ ] **Non-Compliant Users Page** (`/admin/security/2fa/non-compliant`)
  - [ ] List of users without 2FA
  - [ ] Filter by role
  - [ ] Days remaining display
  - [ ] Bulk action options (notify users)
  - [ ] Export to CSV

### 7.2 Components to Build

#### Data Display
- [ ] `User2FAStatusCard` - Display user 2FA status
- [ ] `User2FABadge` - Show status badges (enabled, required, etc.)
- [ ] `ComplianceStatusIndicator` - Show compliance status with color coding
- [ ] `BackupCodesWarning` - Warn about low backup codes
- [ ] `GracePeriodCountdown` - Display remaining grace period
- [ ] `SecurityEventTimeline` - Show recent security events
- [ ] `LoginAttemptsTable` - Display login history

#### Forms
- [ ] `ResetUser2FAModal` - Modal form to reset user 2FA
- [ ] `GenerateEmergencyCodesModal` - Modal to generate emergency codes
- [ ] `EmergencyCodesDisplay` - Show generated codes (one-time display)
- [ ] `PolicyConfigForm` - Form to configure 2FA policies
- [ ] `PolicyRoleSelector` - Dropdown to select role

#### Actions
- [ ] `ResetUser2FAButton` - Button with confirmation
- [ ] `GenerateEmergencyCodesButton` - Button with warning
- [ ] `ViewUserDetailsButton` - Navigate to details page

### 7.3 API Client Setup

```typescript
// lib/api/admin-2fa.ts
import { makeAdminRequest } from './client';
import type {
  User2FAStatus,
  User2FADetails,
  GetUsers2FAOptions,
  GetUsers2FAResponse,
  TwoFactorPolicyConfig,
  NonCompliantUser,
  EmergencyCodesResponse,
} from '@/types/admin-2fa.types';

export class Admin2FAClient {
  private baseUrl = '/api/admin';

  async getUsers2FAStatus(options: GetUsers2FAOptions = {}): Promise<GetUsers2FAResponse> {
    const params = new URLSearchParams();
    
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.role) params.append('role', options.role);
    if (options.twoFactorEnabled !== undefined) {
      params.append('twoFactorEnabled', options.twoFactorEnabled.toString());
    }
    if (options.twoFactorRequired !== undefined) {
      params.append('twoFactorRequired', options.twoFactorRequired.toString());
    }
    if (options.search) params.append('search', options.search);

    const response = await makeAdminRequest(
      `${this.baseUrl}/users/2fa?${params.toString()}`
    );
    
    return response.json();
  }

  async getUser2FADetails(userId: string): Promise<User2FADetails> {
    const response = await makeAdminRequest(
      `${this.baseUrl}/users/2fa/${userId}`
    );
    
    return response.json();
  }

  async resetUser2FA(userId: string, reason: string): Promise<void> {
    await makeAdminRequest(`${this.baseUrl}/users/2fa/${userId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  }

  async generateEmergencyCodes(
    userId: string,
    reason: string
  ): Promise<EmergencyCodesResponse> {
    const response = await makeAdminRequest(
      `${this.baseUrl}/users/2fa/${userId}/emergency-codes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      }
    );
    
    return response.json();
  }

  async get2FAPolicies(): Promise<TwoFactorPolicyConfig[]> {
    const response = await makeAdminRequest(`${this.baseUrl}/users/2fa/policies`);
    const data = await response.json();
    return data.data;
  }

  async get2FAPolicy(role: string): Promise<TwoFactorPolicyConfig | null> {
    const response = await makeAdminRequest(
      `${this.baseUrl}/users/2fa/policies/${role}`
    );
    const data = await response.json();
    return data.data;
  }

  async set2FAPolicy(policy: TwoFactorPolicyConfig): Promise<void> {
    await makeAdminRequest(`${this.baseUrl}/users/2fa/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(policy),
    });
  }

  async getNonCompliantUsers(role?: string): Promise<NonCompliantUser[]> {
    const params = role ? `?role=${role}` : '';
    const response = await makeAdminRequest(
      `${this.baseUrl}/users/2fa/non-compliant${params}`
    );
    const data = await response.json();
    return data.data;
  }
}

export const admin2FAClient = new Admin2FAClient();
```

### 7.4 React Query Hooks

```typescript
// hooks/useAdmin2FA.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { admin2FAClient } from '@/lib/api/admin-2fa';
import type { GetUsers2FAOptions } from '@/types/admin-2fa.types';

export function useUsers2FAStatus(options: GetUsers2FAOptions = {}) {
  return useQuery({
    queryKey: ['admin-2fa-users', options],
    queryFn: () => admin2FAClient.getUsers2FAStatus(options),
    staleTime: 30000, // 30 seconds
  });
}

export function useUser2FADetails(userId: string) {
  return useQuery({
    queryKey: ['admin-2fa-user', userId],
    queryFn: () => admin2FAClient.getUser2FADetails(userId),
    enabled: !!userId,
  });
}

export function useResetUser2FA() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      admin2FAClient.resetUser2FA(userId, reason),
    onSuccess: (_, { userId }) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-user', userId] });
    },
  });
}

export function useGenerateEmergencyCodes() {
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      admin2FAClient.generateEmergencyCodes(userId, reason),
  });
}

export function use2FAPolicies() {
  return useQuery({
    queryKey: ['admin-2fa-policies'],
    queryFn: () => admin2FAClient.get2FAPolicies(),
    staleTime: 60000, // 1 minute
  });
}

export function useSet2FAPolicy() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: admin2FAClient.set2FAPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-policies'] });
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-users'] });
    },
  });
}

export function useNonCompliantUsers(role?: string) {
  return useQuery({
    queryKey: ['admin-2fa-non-compliant', role],
    queryFn: () => admin2FAClient.getNonCompliantUsers(role),
    staleTime: 30000,
  });
}
```

### 7.5 Edge Cases to Handle

1. **Empty States**
   - No users found with current filters
   - User has no security events
   - No non-compliant users

2. **Loading States**
   - Show skeleton loaders for tables
   - Disable action buttons during API calls
   - Show progress indicators for long operations

3. **Error States**
   - Network errors (show retry button)
   - Permission errors (show helpful message)
   - Validation errors (highlight fields)

4. **Confirmation Dialogs**
   - Reset 2FA (require explicit confirmation + reason)
   - Generate emergency codes (warn about security implications)
   - Update policy (warn about affected users)

5. **Success Feedback**
   - Toast notifications for actions
   - Update UI optimistically where possible
   - Show success state before returning to list

6. **Security Considerations**
   - Emergency codes shown only once (no "back" button)
   - Require admin to acknowledge before showing codes
   - Log all sensitive actions
   - Auto-hide sensitive data after timeout

---

## 8. UX Considerations

### 8.1 Status Indicators

Use color coding for quick visual scanning:

- 🟢 **Green:** 2FA enabled and compliant
- 🟡 **Yellow:** Grace period active (< 7 days urgent)
- 🔴 **Red:** Non-compliant or grace period expired
- 🔒 **Gray:** Account locked
- ⚠️ **Orange:** Low backup codes (< 3)

### 8.2 User Workflows

#### Reset User 2FA
1. Admin views user details
2. Clicks "Reset 2FA" button
3. Modal opens with confirmation
4. Admin enters reason (required)
5. Confirms action
6. Success message shown
7. User receives email notification
8. Page refreshes with updated status

#### Generate Emergency Codes
1. Admin views user details
2. Clicks "Generate Emergency Codes"
3. Modal opens with warning
4. Admin enters reason
5. Confirms understanding that codes shown only once
6. Codes are displayed with expiry time
7. Admin provides codes to user securely
8. Admin acknowledges receipt
9. Modal closes (codes cannot be retrieved)

#### Update 2FA Policy
1. Admin goes to Policies page
2. Selects role to configure
3. Sets enforcement type
4. Sets grace period
5. (Optional) Sets enforcement start date
6. Selects allowed methods
7. Saves policy
8. Confirmation shows number of affected users
9. Policy takes effect immediately

### 8.3 Accessibility

- Use semantic HTML (tables, headings, forms)
- Provide ARIA labels for icons and actions
- Ensure keyboard navigation works
- Use focus indicators
- Provide screen reader announcements for dynamic content
- Ensure sufficient color contrast

### 8.4 Mobile Considerations

- Make data tables horizontally scrollable
- Stack form fields vertically
- Use bottom sheets for modals on mobile
- Ensure touch targets are at least 44x44px
- Consider separate mobile layouts for complex tables

---

## 9. Related Documentation

- [Security & Audit Logs Integration Guide](./ADMIN_2FA_SECURITY_LOGS_FRONTEND_INTEGRATION.md) - Security dashboard and audit trails
- [Reports & Compliance Integration Guide](./ADMIN_2FA_REPORTS_FRONTEND_INTEGRATION.md) - Compliance reports and exports
- [User 2FA Setup Integration Guide](./2FA_SETUP_MANAGEMENT_FRONTEND_INTEGRATION.md) - User-facing 2FA setup

---

## 10. Support & Questions

For backend implementation questions or API issues:
- Check existing implementation: `/src/lib/services/admin-2fa-management.service.ts`
- Review API routes: `/src/app/api/admin/users/2fa/`
- Contact backend team: #backend-support

---

**Document Version:** 1.0  
**Last Updated:** October 20, 2025  
**Maintained By:** Backend Team
