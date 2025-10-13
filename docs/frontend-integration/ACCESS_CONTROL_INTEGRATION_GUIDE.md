# Access Control Middleware - Frontend Integration Guide

## Overview

The Access Control Middleware provides comprehensive authentication and authorization for the YesGoddess platform. This guide covers all endpoints, authentication methods, error handling, and implementation details needed to build the frontend UI.

**Backend Deployment:** `ops.yesgoddess.agency`  
**Authentication Method:** JWT tokens with session-based refresh  
**Authorization:** Role-based (RBAC) + Permission-based (PBAC)

---

## Table of Contents

1. [Authentication Methods](#1-authentication-methods)
2. [API Endpoints](#2-api-endpoints)
3. [TypeScript Type Definitions](#3-typescript-type-definitions)
4. [Request/Response Examples](#4-requestresponse-examples)
5. [Error Handling](#5-error-handling)
6. [Authorization & Permissions](#6-authorization--permissions)
7. [Rate Limiting](#7-rate-limiting)
8. [Row-Level Security (RLS)](#8-row-level-security-rls)
9. [Frontend Implementation Checklist](#9-frontend-implementation-checklist)
10. [Testing Scenarios](#10-testing-scenarios)

---

## 1. Authentication Methods

The backend supports **three authentication methods**:

### 1.1 Session-Based Authentication (Primary)

**Used for:** Web application users (Brands, Creators, Admins)  
**How it works:** Auth.js manages session cookies automatically

```typescript
// No explicit headers needed - cookies handled automatically
fetch('https://ops.yesgoddess.agency/api/projects', {
  credentials: 'include', // Important: Include cookies in requests
});
```

### 1.2 Bearer Token Authentication

**Used for:** Mobile apps, SPAs with token-based auth  
**Format:** `Authorization: Bearer <jwt_token>`

```typescript
fetch('https://ops.yesgoddess.agency/api/projects', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
  },
});
```

**Token Structure:**
```json
{
  "userId": "cm4xzy123...",
  "email": "creator@example.com",
  "role": "CREATOR",
  "creatorId": "cm4abc...",
  "emailVerified": true,
  "exp": 1699999999
}
```

### 1.3 API Key Authentication

**Used for:** Service integrations, third-party apps  
**Format:** `Authorization: ApiKey <key>` or `X-API-Key: <key>`

```typescript
// Option 1: Authorization header
fetch('https://ops.yesgoddess.agency/api/analytics', {
  headers: {
    'Authorization': `ApiKey yg_live_abc123...`,
  },
});

// Option 2: X-API-Key header
fetch('https://ops.yesgoddess.agency/api/analytics', {
  headers: {
    'X-API-Key': 'yg_live_abc123...',
  },
});
```

**API Key Format:**
- Live: `yg_live_<random_string>`
- Test: `yg_test_<random_string>`

---

## 2. API Endpoints

### 2.1 Authentication Endpoints

All authentication endpoints are handled by Auth.js at `/api/auth/*`:

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|----------------|
| `/api/auth/signin` | POST | Sign in with credentials | None |
| `/api/auth/signout` | POST | Sign out current user | Session |
| `/api/auth/session` | GET | Get current session | Session |
| `/api/auth/csrf` | GET | Get CSRF token | None |

**Note:** These are Auth.js endpoints. See [AUTH_IMPLEMENTATION.md](../AUTH_IMPLEMENTATION.md) for details.

### 2.2 Protected Resource Endpoints

All other API endpoints require authentication. The middleware automatically:
- Validates authentication
- Checks authorization (role/permissions)
- Verifies resource ownership
- Applies rate limiting
- Logs audit events

**Example Protected Endpoints:**

| Endpoint | Method | Required Auth | Required Role | Description |
|----------|--------|---------------|---------------|-------------|
| `/api/users/me` | GET | Session/Bearer | Any | Get current user profile |
| `/api/creators/me` | GET | Session/Bearer | CREATOR | Get creator profile |
| `/api/brands/me` | GET | Session/Bearer | BRAND | Get brand profile |
| `/api/admin/users` | GET | Session/Bearer | ADMIN | List all users |
| `/api/assets` | GET | Session/Bearer | Any | List accessible IP assets |
| `/api/assets/:id` | GET | Session/Bearer | Any | Get asset details |
| `/api/projects` | GET | Session/Bearer | BRAND, ADMIN | List projects |
| `/api/licenses` | GET | Session/Bearer | Any | List licenses |
| `/api/royalties/statements` | GET | Session/Bearer | CREATOR, ADMIN | List royalty statements |
| `/api/payouts` | GET | Session/Bearer | CREATOR, ADMIN | List payouts |

---

## 3. TypeScript Type Definitions

### 3.1 Authentication Types

```typescript
/**
 * User roles in the system
 */
export enum UserRole {
  VIEWER = 'VIEWER',
  CREATOR = 'CREATOR',
  BRAND = 'BRAND',
  ADMIN = 'ADMIN',
}

/**
 * Authenticated user context
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  name?: string | null;
  creatorId?: string;
  brandId?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: 
    | 'INVALID_TOKEN'
    | 'EXPIRED_TOKEN'
    | 'NO_CREDENTIALS'
    | 'USER_NOT_FOUND'
    | 'ACCOUNT_INACTIVE'
    | 'RATE_LIMITED';
}

/**
 * Session data from Auth.js
 */
export interface Session {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string;
    role: UserRole;
    emailVerified: boolean;
    creatorId?: string;
    brandId?: string;
    creatorVerified?: boolean;
    brandVerified?: boolean;
  };
  expires: string; // ISO date string
}
```

### 3.2 Authorization Types

```typescript
/**
 * Authorization result
 */
export interface AuthorizationResult {
  authorized: boolean;
  error?: string;
  errorCode?: 
    | 'FORBIDDEN'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'ROLE_REQUIRED';
}

/**
 * Permission system constants
 */
export const PERMISSIONS = {
  // User Management
  USERS_VIEW_ALL: 'users.view_all',
  USERS_VIEW_OWN: 'users.view_own',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_CHANGE_ROLE: 'users.change_role',
  
  // Creator Management
  CREATORS_VIEW_ALL: 'creators.view_all',
  CREATORS_VIEW_OWN: 'creators.view_own',
  CREATORS_APPROVE: 'creators.approve',
  CREATORS_EDIT_OWN: 'creators.edit_own',
  CREATORS_VIEW_FINANCIAL: 'creators.view_financial',
  
  // Brand Management
  BRANDS_VIEW_ALL: 'brands.view_all',
  BRANDS_VIEW_OWN: 'brands.view_own',
  BRANDS_VERIFY: 'brands.verify',
  BRANDS_EDIT_OWN: 'brands.edit_own',
  
  // IP Assets
  IP_ASSETS_VIEW_ALL: 'ip_assets.view_all',
  IP_ASSETS_VIEW_OWN: 'ip_assets.view_own',
  IP_ASSETS_CREATE: 'ip_assets.create',
  IP_ASSETS_EDIT_OWN: 'ip_assets.edit_own',
  IP_ASSETS_DELETE_OWN: 'ip_assets.delete_own',
  IP_ASSETS_TRANSFER_OWNERSHIP: 'ip_assets.transfer_ownership',
  IP_ASSETS_APPROVE: 'ip_assets.approve',
  
  // Projects
  PROJECTS_VIEW_ALL: 'projects.view_all',
  PROJECTS_VIEW_OWN: 'projects.view_own',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_EDIT_OWN: 'projects.edit_own',
  PROJECTS_DELETE_OWN: 'projects.delete_own',
  
  // Licenses
  LICENSES_VIEW_ALL: 'licenses.view_all',
  LICENSES_VIEW_OWN: 'licenses.view_own',
  LICENSES_CREATE: 'licenses.create',
  LICENSES_EDIT_OWN: 'licenses.edit_own',
  LICENSES_APPROVE: 'licenses.approve',
  LICENSES_VIEW_FINANCIAL: 'licenses.view_financial',
  
  // Royalties
  ROYALTIES_VIEW_ALL: 'royalties.view_all',
  ROYALTIES_VIEW_OWN: 'royalties.view_own',
  ROYALTIES_RUN: 'royalties.run',
  ROYALTIES_VIEW_STATEMENTS: 'royalties.view_statements',
  
  // Payouts
  PAYOUTS_VIEW_ALL: 'payouts.view_all',
  PAYOUTS_VIEW_OWN: 'payouts.view_own',
  PAYOUTS_PROCESS: 'payouts.process',
  PAYOUTS_APPROVE: 'payouts.approve',
  
  // Analytics
  ANALYTICS_VIEW_ALL: 'analytics.view_all',
  ANALYTICS_VIEW_OWN: 'analytics.view_own',
  
  // Audit Logs
  AUDIT_LOGS_VIEW: 'audit_logs.view',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
```

### 3.3 Resource Ownership Types

```typescript
/**
 * Resource types for ownership checks
 */
export type ResourceType =
  | 'ip_asset'
  | 'project'
  | 'license'
  | 'royalty_statement'
  | 'payout'
  | 'brand'
  | 'creator';

/**
 * Ownership check result
 */
export interface OwnershipResult {
  hasAccess: boolean;
  ownershipType?: 'owner' | 'collaborator' | 'assigned' | 'admin';
  error?: string;
}
```

### 3.4 Rate Limit Types

```typescript
/**
 * Rate limit response
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  limit: number;
}

/**
 * Rate limit headers (included in responses)
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
}
```

### 3.5 API Key Types

```typescript
/**
 * API Key scope (permissions)
 */
export type ApiKeyScope =
  | 'read:assets'
  | 'write:assets'
  | 'read:projects'
  | 'write:projects'
  | 'read:licenses'
  | 'write:licenses'
  | 'read:analytics'
  | 'webhooks:receive'
  | 'admin:all';

/**
 * API Key information
 */
export interface ApiKeyInfo {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  status: 'active' | 'revoked' | 'expired';
  createdAt: string; // ISO date
  expiresAt?: string; // ISO date
  lastUsedAt?: string; // ISO date
  usageCount: number;
}
```

---

## 4. Request/Response Examples

### 4.1 Authentication Examples

#### Sign In (Email/Password)

```bash
# Request
curl -X POST https://ops.yesgoddess.agency/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@example.com",
    "password": "SecurePass123!",
    "callbackUrl": "/dashboard"
  }'

# Success Response (302 Redirect to callbackUrl)
# Session cookie is set automatically
```

#### Get Current Session

```bash
# Request
curl https://ops.yesgoddess.agency/api/auth/session \
  -H "Cookie: next-auth.session-token=<session_token>"

# Success Response (200 OK)
{
  "user": {
    "id": "cm4xzy123abc",
    "email": "creator@example.com",
    "name": "Jane Doe",
    "role": "CREATOR",
    "emailVerified": true,
    "creatorId": "cm4abc789xyz",
    "creatorVerified": true,
    "image": null
  },
  "expires": "2024-11-15T10:30:00.000Z"
}

# Unauthenticated Response (200 OK)
null
```

#### Bearer Token Request

```bash
# Request
curl https://ops.yesgoddess.agency/api/users/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Success Response (200 OK)
{
  "id": "cm4xzy123abc",
  "email": "creator@example.com",
  "name": "Jane Doe",
  "role": "CREATOR",
  "emailVerified": true,
  "creatorId": "cm4abc789xyz",
  "createdAt": "2024-10-01T10:00:00.000Z"
}

# Error Response (401 Unauthorized)
{
  "error": "Invalid or expired token",
  "code": "INVALID_TOKEN"
}
```

### 4.2 Authorization Examples

#### Role-Based Access (Admin Only)

```bash
# Request (as ADMIN)
curl https://ops.yesgoddess.agency/api/admin/users \
  -H "Cookie: next-auth.session-token=<admin_session>"

# Success Response (200 OK)
{
  "users": [
    {
      "id": "cm4user1",
      "email": "user1@example.com",
      "role": "CREATOR",
      "createdAt": "2024-10-01T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}

# Error Response as non-admin (403 Forbidden)
{
  "error": "Admin access required",
  "code": "ROLE_REQUIRED"
}
```

#### Permission-Based Access

```bash
# Request (user needs IP_ASSETS_VIEW_ALL permission)
curl https://ops.yesgoddess.agency/api/assets/all \
  -H "Cookie: next-auth.session-token=<session_token>"

# Success Response (200 OK)
{
  "assets": [...],
  "total": 50
}

# Error Response (403 Forbidden)
{
  "error": "Insufficient permissions",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### 4.3 Resource Ownership Examples

#### Access Own Resource

```bash
# Request (creator accessing their own asset)
curl https://ops.yesgoddess.agency/api/assets/cm4asset123 \
  -H "Cookie: next-auth.session-token=<creator_session>"

# Success Response (200 OK)
{
  "id": "cm4asset123",
  "title": "Character Design - Luna",
  "ownerId": "cm4creator789",
  "createdBy": "cm4user123",
  "status": "published"
}

# Error Response (403 Forbidden)
{
  "error": "You do not have access to this resource",
  "code": "OWNERSHIP_REQUIRED"
}
```

### 4.4 Rate Limiting Examples

```bash
# Request exceeding rate limit
curl https://ops.yesgoddess.agency/api/assets \
  -H "Cookie: next-auth.session-token=<session_token>"

# Error Response (429 Too Many Requests)
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMITED",
  "retryAfter": 300
}

# Response Headers
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699999999
```

---

## 5. Error Handling

### 5.1 HTTP Status Codes

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| `200` | OK | Successful request |
| `201` | Created | Resource created successfully |
| `204` | No Content | Successful delete/update with no response body |
| `400` | Bad Request | Invalid request data/validation error |
| `401` | Unauthorized | Authentication required or failed |
| `403` | Forbidden | Authenticated but not authorized |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource conflict (e.g., duplicate) |
| `422` | Unprocessable Entity | Validation error with details |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server error |
| `503` | Service Unavailable | Temporary service disruption |

### 5.2 Error Response Format

All errors follow this consistent structure:

```typescript
interface ErrorResponse {
  error: string;          // Human-readable error message
  code: string;           // Machine-readable error code
  details?: any;          // Optional additional context
  timestamp?: string;     // ISO timestamp
  requestId?: string;     // For support/debugging
}
```

### 5.3 Authentication Error Codes

| Error Code | HTTP Status | Description | User Message |
|------------|-------------|-------------|--------------|
| `NO_CREDENTIALS` | 401 | No authentication provided | "Please sign in to continue" |
| `INVALID_TOKEN` | 401 | Token is invalid or malformed | "Your session is invalid. Please sign in again" |
| `EXPIRED_TOKEN` | 401 | Token has expired | "Your session has expired. Please sign in again" |
| `USER_NOT_FOUND` | 401 | User account doesn't exist | "Account not found" |
| `ACCOUNT_INACTIVE` | 401 | User account is inactive/deleted | "This account is inactive. Please contact support" |
| `EMAIL_NOT_VERIFIED` | 401 | Email verification required | "Please verify your email to continue" |
| `RATE_LIMITED` | 429 | Too many requests | "Too many requests. Please try again in {time}" |

### 5.4 Authorization Error Codes

| Error Code | HTTP Status | Description | User Message |
|------------|-------------|-------------|--------------|
| `ROLE_REQUIRED` | 403 | User doesn't have required role | "You don't have permission to access this resource" |
| `INSUFFICIENT_PERMISSIONS` | 403 | User doesn't have required permission | "You don't have permission to perform this action" |
| `OWNERSHIP_REQUIRED` | 403 | User doesn't own the resource | "You can only access your own resources" |
| `FORBIDDEN` | 403 | Generic authorization failure | "Access denied" |

### 5.5 Frontend Error Handling Strategy

```typescript
// API Client error handler
async function handleApiError(response: Response): Promise<never> {
  const error: ErrorResponse = await response.json();
  
  switch (response.status) {
    case 401:
      // Authentication error - redirect to sign in
      if (error.code === 'EXPIRED_TOKEN' || error.code === 'INVALID_TOKEN') {
        // Clear local session
        await signOut({ callbackUrl: '/auth/signin' });
      } else if (error.code === 'EMAIL_NOT_VERIFIED') {
        // Redirect to email verification page
        router.push('/auth/verify-email');
      }
      throw new AuthenticationError(error.error, error.code);
      
    case 403:
      // Authorization error - show error message
      if (error.code === 'ROLE_REQUIRED') {
        toast.error('You do not have permission to access this resource');
      }
      throw new AuthorizationError(error.error, error.code);
      
    case 429:
      // Rate limit - show retry message
      const retryAfter = response.headers.get('Retry-After');
      toast.error(`Too many requests. Please try again in ${retryAfter} seconds`);
      throw new RateLimitError(error.error, parseInt(retryAfter || '60'));
      
    case 404:
      throw new NotFoundError(error.error);
      
    case 500:
    case 503:
      // Server error - show generic message
      toast.error('Something went wrong. Please try again later');
      throw new ServerError(error.error, error.code);
      
    default:
      throw new ApiError(error.error, error.code, response.status);
  }
}

// Custom error classes
class AuthenticationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

class RateLimitError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}
```

### 5.6 When to Show Generic vs Specific Errors

**Show Specific Errors:**
- ✅ Authentication failures (expired session, email not verified)
- ✅ Authorization failures (role required, insufficient permissions)
- ✅ Validation errors (form field errors)
- ✅ Rate limiting (with retry time)

**Show Generic Errors:**
- ❌ Internal server errors (500)
- ❌ Database errors
- ❌ External service failures
- ❌ Unexpected errors

**User-Friendly Messages:**
```typescript
const USER_FRIENDLY_MESSAGES = {
  NO_CREDENTIALS: 'Please sign in to continue',
  INVALID_TOKEN: 'Your session has expired. Please sign in again',
  EXPIRED_TOKEN: 'Your session has expired. Please sign in again',
  EMAIL_NOT_VERIFIED: 'Please verify your email address to continue',
  ROLE_REQUIRED: 'You do not have permission to access this resource',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',
  OWNERSHIP_REQUIRED: 'You can only access your own resources',
  RATE_LIMITED: 'Too many requests. Please slow down and try again',
  SERVER_ERROR: 'Something went wrong. Please try again later',
};
```

---

## 6. Authorization & Permissions

### 6.1 Role Hierarchy

```
ADMIN (Full Access)
  ├── Can access ALL resources
  ├── Can view audit logs
  ├── Can manage users, roles, permissions
  └── Bypasses all ownership checks

BRAND (Business Access)
  ├── Can create and manage projects
  ├── Can license IP assets
  ├── Can view licensed assets
  ├── Can view project analytics
  └── Cannot access other brands' data

CREATOR (Creator Access)
  ├── Can create and manage IP assets
  ├── Can view their own assets
  ├── Can view royalty statements
  ├── Can view payouts
  └── Cannot access other creators' data

VIEWER (Read-Only)
  ├── Can view public content
  ├── Cannot create resources
  └── Limited access
```

### 6.2 Role-Based Access Matrix

| Resource | VIEWER | CREATOR | BRAND | ADMIN |
|----------|--------|---------|-------|-------|
| **IP Assets** |
| View Public | ✅ | ✅ | ✅ | ✅ |
| View Own | ❌ | ✅ | ❌ | ✅ |
| Create | ❌ | ✅ | ❌ | ✅ |
| Edit Own | ❌ | ✅ | ❌ | ✅ |
| Delete Own | ❌ | ✅ | ❌ | ✅ |
| View All | ❌ | ❌ | ❌ | ✅ |
| **Projects** |
| View Own | ❌ | ✅ (licensed) | ✅ | ✅ |
| Create | ❌ | ❌ | ✅ | ✅ |
| Edit Own | ❌ | ❌ | ✅ | ✅ |
| View All | ❌ | ❌ | ❌ | ✅ |
| **Licenses** |
| View Own | ❌ | ✅ | ✅ | ✅ |
| Create | ❌ | ❌ | ✅ | ✅ |
| Approve | ❌ | ❌ | ❌ | ✅ |
| View Financial | ❌ | ✅ (own) | ✅ (own) | ✅ |
| **Royalties** |
| View Statements | ❌ | ✅ (own) | ❌ | ✅ |
| Run Calculation | ❌ | ❌ | ❌ | ✅ |
| View All | ❌ | ❌ | ❌ | ✅ |
| **Payouts** |
| View Own | ❌ | ✅ | ❌ | ✅ |
| Process | ❌ | ❌ | ❌ | ✅ |
| Approve | ❌ | ❌ | ❌ | ✅ |
| **Users** |
| View Own | ✅ | ✅ | ✅ | ✅ |
| Edit Own | ✅ | ✅ | ✅ | ✅ |
| View All | ❌ | ❌ | ❌ | ✅ |
| Manage Roles | ❌ | ❌ | ❌ | ✅ |

### 6.3 Permission-Based Access Control

**Permission Naming Convention:** `RESOURCE_ACTION_SCOPE`

**Frontend Permission Checks:**

```typescript
// Check if user has permission
function hasPermission(user: AuthUser, permission: Permission): boolean {
  // Admin always has all permissions
  if (user.role === 'ADMIN') return true;
  
  // Check user's granted permissions
  return user.permissions?.includes(permission) ?? false;
}

// Check if user has any of the permissions
function hasAnyPermission(user: AuthUser, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(user, p));
}

// Check if user has all of the permissions
function hasAllPermissions(user: AuthUser, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(user, p));
}

// Usage in components
function AssetEditButton({ asset, user }: Props) {
  const canEdit = hasAnyPermission(user, [
    PERMISSIONS.IP_ASSETS_EDIT_OWN,
    PERMISSIONS.IP_ASSETS_EDIT_ALL,
  ]);
  
  if (!canEdit) return null;
  
  return <Button onClick={handleEdit}>Edit Asset</Button>;
}
```

### 6.4 Field-Level Permissions

Some endpoints return different fields based on permissions:

```typescript
// Example: Asset API response
interface Asset {
  id: string;
  title: string;
  description: string;
  status: string;
  // Public fields above
  
  // Requires IP_ASSETS_VIEW_METADATA permission
  metadata?: {
    uploadedBy: string;
    fileSize: number;
    dimensions: { width: number; height: number };
  };
  
  // Requires CREATORS_VIEW_FINANCIAL permission
  financial?: {
    totalRevenue: number;
    royaltyRate: number;
  };
}
```

**Frontend Handling:**

```typescript
function AssetDetailsCard({ asset, user }: Props) {
  const canViewMetadata = hasPermission(user, PERMISSIONS.IP_ASSETS_VIEW_METADATA);
  const canViewFinancial = hasPermission(user, PERMISSIONS.CREATORS_VIEW_FINANCIAL);
  
  return (
    <Card>
      <h2>{asset.title}</h2>
      <p>{asset.description}</p>
      
      {canViewMetadata && asset.metadata && (
        <MetadataSection data={asset.metadata} />
      )}
      
      {canViewFinancial && asset.financial && (
        <FinancialSection data={asset.financial} />
      )}
    </Card>
  );
}
```

---

## 7. Rate Limiting

### 7.1 Rate Limit Configuration

The backend implements sliding window rate limiting:

| Action | Limit | Window | Applies To |
|--------|-------|--------|------------|
| API requests | 100 requests | 15 minutes | Per user/IP |
| File uploads | 20 uploads | 15 minutes | Per user |
| Messages | 50 messages | 15 minutes | Per user |

### 7.2 Rate Limit Headers

Every response includes rate limit information:

```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string;      // Maximum requests allowed
  'X-RateLimit-Remaining': string;  // Requests remaining in window
  'X-RateLimit-Reset': string;      // Unix timestamp when limit resets
}

// Example response headers
{
  'X-RateLimit-Limit': '100',
  'X-RateLimit-Remaining': '87',
  'X-RateLimit-Reset': '1699999999'
}
```

### 7.3 Frontend Rate Limit Handling

```typescript
// Rate limit tracker hook
function useRateLimit() {
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null);
  
  const updateFromHeaders = (headers: Headers) => {
    setRateLimit({
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      resetAt: new Date(parseInt(headers.get('X-RateLimit-Reset') || '0') * 1000),
    });
  };
  
  const isNearLimit = () => {
    if (!rateLimit) return false;
    return rateLimit.remaining < rateLimit.limit * 0.1; // Less than 10% remaining
  };
  
  return { rateLimit, updateFromHeaders, isNearLimit };
}

// API client with rate limit handling
async function apiRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  
  // Update rate limit info
  updateFromHeaders(response.headers);
  
  // Handle rate limit exceeded
  if (response.status === 429) {
    const resetAt = new Date(
      parseInt(response.headers.get('X-RateLimit-Reset') || '0') * 1000
    );
    const retryAfter = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
    
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfter} seconds`,
      retryAfter
    );
  }
  
  return response;
}

// Display rate limit warning
function RateLimitWarning() {
  const { rateLimit, isNearLimit } = useRateLimit();
  
  if (!isNearLimit()) return null;
  
  return (
    <Alert variant="warning">
      You're approaching the rate limit. {rateLimit?.remaining} requests remaining.
    </Alert>
  );
}
```

### 7.4 Best Practices for Rate Limiting

**✅ DO:**
- Track rate limit headers in global state
- Show warnings when nearing limit
- Implement exponential backoff for retries
- Cache responses to reduce requests
- Use debouncing for search/filter inputs
- Batch multiple operations when possible

**❌ DON'T:**
- Ignore 429 responses and keep retrying
- Make unnecessary API calls (e.g., polling too frequently)
- Fetch the same data multiple times
- Make API calls on every keystroke

**Example: Debounced Search**

```typescript
function SearchInput() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 500); // Wait 500ms after typing stops
  
  const { data, isLoading } = useQuery(
    ['search', debouncedQuery],
    () => api.search(debouncedQuery),
    { enabled: debouncedQuery.length > 2 }
  );
  
  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search assets..."
    />
  );
}
```

---

## 8. Row-Level Security (RLS)

### 8.1 Overview

The backend automatically filters database queries based on user role and ownership. The frontend doesn't need to implement these filters - they're applied server-side.

**Key Rules:**
- **Creators** see only their own assets, royalties, and payouts
- **Brands** see only their own projects, licenses, and licensed assets
- **Admins** see everything
- Shared resources (licensed assets, collaborative projects) are accessible to relevant users

### 8.2 RLS in Action

#### Example: Fetching IP Assets

```typescript
// Frontend makes simple request
const response = await fetch('/api/assets', {
  credentials: 'include'
});

// Backend automatically filters based on role:

// CREATOR user receives:
{
  "assets": [
    // Only assets they own
    { "id": "asset1", "ownerId": "creator123", "title": "My Asset" }
  ]
}

// BRAND user receives:
{
  "assets": [
    // Only assets in their projects or licenses
    { "id": "asset2", "projectId": "project456", "title": "Licensed Asset" }
  ]
}

// ADMIN user receives:
{
  "assets": [
    // All assets in the system
    { "id": "asset1", "title": "Creator Asset" },
    { "id": "asset2", "title": "Brand Asset" },
    { "id": "asset3", "title": "Other Asset" }
  ]
}
```

### 8.3 Frontend Considerations

**What the frontend SHOULD do:**
- ✅ Handle empty results gracefully
- ✅ Show appropriate "No data" messages
- ✅ Hide UI elements users can't access
- ✅ Use role-based rendering

**What the frontend should NOT do:**
- ❌ Implement duplicate filtering logic
- ❌ Try to "secure" data client-side
- ❌ Assume all resources are accessible

### 8.4 Role-Based UI Rendering

```typescript
function Dashboard({ user }: Props) {
  return (
    <div>
      {/* Show for all roles */}
      <ProfileCard user={user} />
      
      {/* Creator-specific */}
      {user.role === 'CREATOR' && (
        <>
          <MyAssetsSection />
          <RoyaltyStatementsSection />
          <PayoutsSection />
        </>
      )}
      
      {/* Brand-specific */}
      {user.role === 'BRAND' && (
        <>
          <MyProjectsSection />
          <LicensesSection />
          <LicensedAssetsSection />
        </>
      )}
      
      {/* Admin-specific */}
      {user.role === 'ADMIN' && (
        <>
          <AllUsersSection />
          <AllAssetsSection />
          <AuditLogsSection />
        </>
      )}
    </div>
  );
}
```

---

## 9. Frontend Implementation Checklist

### 9.1 Authentication Setup

- [ ] **Install Auth.js (NextAuth)**
  ```bash
  npm install next-auth @auth/prisma-adapter
  ```

- [ ] **Configure SessionProvider**
  ```typescript
  // app/providers.tsx
  'use client';
  import { SessionProvider } from 'next-auth/react';
  
  export function Providers({ children }: { children: React.ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
  }
  ```

- [ ] **Create useAuth Hook**
  ```typescript
  // hooks/useAuth.ts
  import { useSession } from 'next-auth/react';
  
  export function useAuth() {
    const { data: session, status } = useSession();
    
    return {
      user: session?.user,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      role: session?.user?.role,
    };
  }
  ```

- [ ] **Implement Protected Routes**
  ```typescript
  // middleware.ts
  export { default } from 'next-auth/middleware';
  
  export const config = {
    matcher: ['/dashboard/:path*', '/admin/:path*', '/creator/:path*', '/brand/:path*'],
  };
  ```

### 9.2 API Client Setup

- [ ] **Create API Client**
  ```typescript
  // lib/api-client.ts
  class ApiClient {
    private baseUrl = process.env.NEXT_PUBLIC_API_URL;
    
    async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        credentials: 'include', // Important for cookies
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      
      if (!response.ok) {
        throw await this.handleError(response);
      }
      
      return response.json();
    }
    
    private async handleError(response: Response) {
      const error = await response.json();
      // Handle errors as shown in section 5.5
    }
  }
  
  export const api = new ApiClient();
  ```

- [ ] **Setup React Query**
  ```typescript
  // app/providers.tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry on auth errors
          if (error instanceof AuthenticationError) return false;
          return failureCount < 3;
        },
      },
    },
  });
  ```

### 9.3 Error Handling

- [ ] **Create Error Classes**
  ```typescript
  // lib/errors.ts
  export class AuthenticationError extends Error { /* ... */ }
  export class AuthorizationError extends Error { /* ... */ }
  export class RateLimitError extends Error { /* ... */ }
  ```

- [ ] **Implement Error Boundary**
  ```typescript
  // components/ErrorBoundary.tsx
  export class ErrorBoundary extends React.Component { /* ... */ }
  ```

- [ ] **Create Toast Notifications**
  ```typescript
  // Use sonner, react-hot-toast, or similar
  import { toast } from 'sonner';
  ```

### 9.4 Authorization UI

- [ ] **Create Permission Check Utilities**
  ```typescript
  // lib/permissions.ts
  export function hasPermission(user, permission) { /* ... */ }
  export function hasAnyPermission(user, permissions) { /* ... */ }
  ```

- [ ] **Create Conditional Render Components**
  ```typescript
  // components/auth/RequirePermission.tsx
  export function RequirePermission({ permission, children }) {
    const { user } = useAuth();
    if (!hasPermission(user, permission)) return null;
    return children;
  }
  ```

- [ ] **Create Role-Based Routes**
  ```typescript
  // components/auth/RequireRole.tsx
  export function RequireRole({ roles, children }) {
    const { user, isLoading } = useAuth();
    if (isLoading) return <Spinner />;
    if (!user || !roles.includes(user.role)) {
      return <Redirect to="/unauthorized" />;
    }
    return children;
  }
  ```

### 9.5 Rate Limiting UI

- [ ] **Create Rate Limit Hook**
  ```typescript
  // hooks/useRateLimit.ts
  export function useRateLimit() { /* ... */ }
  ```

- [ ] **Add Rate Limit Warning Component**
  ```typescript
  // components/RateLimitWarning.tsx
  export function RateLimitWarning() { /* ... */ }
  ```

### 9.6 Forms & Validation

- [ ] **Setup Form Library**
  ```bash
  npm install react-hook-form zod @hookform/resolvers
  ```

- [ ] **Create Form Validation Schemas**
  ```typescript
  // schemas/asset.schema.ts
  import { z } from 'zod';
  
  export const createAssetSchema = z.object({
    title: z.string().min(3).max(255),
    description: z.string().optional(),
  });
  ```

### 9.7 Testing

- [ ] **Test Authentication Flow**
  - Sign in / Sign out
  - Session persistence
  - Token expiration handling

- [ ] **Test Authorization**
  - Role-based access
  - Permission checks
  - Resource ownership

- [ ] **Test Error Handling**
  - 401 redirect to sign in
  - 403 show error message
  - 429 rate limit handling

---

## 10. Testing Scenarios

### 10.1 Authentication Tests

**Test Case 1: Successful Sign In**
```typescript
describe('Authentication', () => {
  it('should sign in with valid credentials', async () => {
    const response = await signIn('credentials', {
      email: 'creator@example.com',
      password: 'SecurePass123!',
      redirect: false,
    });
    
    expect(response.ok).toBe(true);
    expect(response.error).toBeNull();
  });
});
```

**Test Case 2: Invalid Credentials**
```typescript
it('should reject invalid credentials', async () => {
  const response = await signIn('credentials', {
    email: 'creator@example.com',
    password: 'WrongPassword',
    redirect: false,
  });
  
  expect(response.ok).toBe(false);
  expect(response.error).toBe('CredentialsSignin');
});
```

**Test Case 3: Session Expiration**
```typescript
it('should redirect to sign in on session expiration', async () => {
  // Mock expired session
  mockSession({ expires: new Date(Date.now() - 1000).toISOString() });
  
  const { result } = renderHook(() => useAuth());
  
  expect(result.current.isAuthenticated).toBe(false);
});
```

### 10.2 Authorization Tests

**Test Case 4: Role-Based Access**
```typescript
describe('Authorization', () => {
  it('should allow admin to access admin routes', async () => {
    const user = { role: 'ADMIN' };
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <MockSession user={user}>{children}</MockSession>
      ),
    });
    
    expect(result.current.user.role).toBe('ADMIN');
    
    const response = await fetch('/api/admin/users');
    expect(response.status).toBe(200);
  });
  
  it('should deny non-admin access to admin routes', async () => {
    const user = { role: 'CREATOR' };
    // ... similar test
    expect(response.status).toBe(403);
  });
});
```

**Test Case 5: Permission Checks**
```typescript
it('should show edit button only with permission', () => {
  const userWithPermission = {
    role: 'CREATOR',
    permissions: [PERMISSIONS.IP_ASSETS_EDIT_OWN],
  };
  
  const { getByText } = render(
    <AssetCard asset={mockAsset} user={userWithPermission} />
  );
  
  expect(getByText('Edit')).toBeInTheDocument();
});
```

### 10.3 Error Handling Tests

**Test Case 6: 401 Handling**
```typescript
it('should redirect to sign in on 401 error', async () => {
  const router = useRouter();
  
  await expect(api.get('/api/protected')).rejects.toThrow(AuthenticationError);
  
  expect(router.push).toHaveBeenCalledWith('/auth/signin');
});
```

**Test Case 7: Rate Limit Handling**
```typescript
it('should show rate limit error on 429', async () => {
  mockFetch({ status: 429, headers: { 'Retry-After': '60' } });
  
  await expect(api.get('/api/assets')).rejects.toThrow(RateLimitError);
  
  expect(toast.error).toHaveBeenCalledWith(
    expect.stringContaining('Too many requests')
  );
});
```

### 10.4 Integration Tests

**Test Case 8: Complete Authentication Flow**
```typescript
it('should complete full auth flow', async () => {
  // 1. Sign in
  await signIn('credentials', { email, password });
  
  // 2. Verify session
  const session = await getSession();
  expect(session?.user).toBeDefined();
  
  // 3. Make authenticated request
  const response = await api.get('/api/users/me');
  expect(response.id).toBe(session.user.id);
  
  // 4. Sign out
  await signOut();
  
  // 5. Verify session cleared
  const afterSignOut = await getSession();
  expect(afterSignOut).toBeNull();
});
```

### 10.5 Edge Cases to Test

- [ ] **Session Expiration During Request**
  - User makes request with expired token
  - Should refresh token or redirect to sign in

- [ ] **Concurrent Requests with Rate Limiting**
  - Make multiple requests simultaneously
  - Should handle rate limit correctly

- [ ] **Permission Changes**
  - User's permissions change while logged in
  - Should reflect on next session refresh

- [ ] **Network Failures**
  - Request fails due to network error
  - Should show appropriate error message

- [ ] **Resource Ownership Edge Cases**
  - User tries to access resource they just lost access to
  - Should return 403 Forbidden

---

## Quick Reference Card

### Common API Patterns

```typescript
// ✅ Authenticated GET request
const assets = await api.get('/api/assets');

// ✅ Authenticated POST request
const newAsset = await api.post('/api/assets', {
  title: 'New Asset',
  description: 'Description',
});

// ✅ Check if user has permission
const canEdit = hasPermission(user, PERMISSIONS.IP_ASSETS_EDIT_OWN);

// ✅ Check if user has role
const isAdmin = user.role === 'ADMIN';

// ✅ Handle auth errors
try {
  const data = await api.get('/api/protected');
} catch (error) {
  if (error instanceof AuthenticationError) {
    router.push('/auth/signin');
  } else if (error instanceof AuthorizationError) {
    toast.error('You do not have permission');
  }
}

// ✅ Check rate limit
const { rateLimit, isNearLimit } = useRateLimit();
if (isNearLimit()) {
  showWarning(`${rateLimit.remaining} requests remaining`);
}
```

### Environment Variables

```bash
# Frontend .env.local
NEXT_PUBLIC_API_URL=https://ops.yesgoddess.agency
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here
```

---

## Support & Feedback

For questions or clarifications about this integration guide:

1. Check backend documentation in `/docs/middleware/`
2. Review implementation examples in `/docs/frontend-integration/`
3. Contact backend team for API-specific questions

**Backend Developer:** Available for frontend integration support

---

**Document Version:** 1.0.0  
**Last Updated:** October 12, 2025  
**Maintained By:** YesGoddess Backend Team
