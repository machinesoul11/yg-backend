# 🔒 Admin 2FA Security & Audit Logs - Frontend Integration Guide

**Classification:** 🔒 ADMIN ONLY  
**Version:** 1.0  
**Last Updated:** October 20, 2025

---

## Overview

This document covers the security dashboard, audit logs, security events, and alert system for 2FA administration. These endpoints provide real-time monitoring, historical analysis, and proactive security alerting.

### Module Capabilities

- View comprehensive security dashboard with metrics
- Query security events with filtering
- Monitor security alerts (active and historical)
- Acknowledge and resolve alerts
- Export security logs
- Track compliance metrics

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

### 1.1 Get 2FA Security Dashboard

Get comprehensive dashboard data including adoption metrics, authentication stats, security metrics, and active alerts.

**Endpoint:** `GET /api/admin/2fa/dashboard`

**Query Parameters:** None

**Example Request:**

```typescript
const response = await fetch('/api/admin/2fa/dashboard', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface SecurityDashboardResponse {
  adoption: AdoptionMetrics;
  authentication: AuthenticationStats;
  security: SecurityMetrics;
  alerts: AlertsSummary;
  actionItems: ActionItem[];
}

interface AdoptionMetrics {
  current: number; // Overall adoption rate percentage
  total: number; // Total users
  enabled: number; // Users with 2FA enabled
  byRole: {
    [role: string]: {
      total: number;
      enabled: number;
      rate: number;
    };
  };
}

interface AuthenticationStats {
  last24h: {
    total: number;
    successful: number;
    failed: number;
    failureRate: number;
    failureRateChange: number; // Percentage change from previous period
  };
  byMethod: {
    totp: number;
    sms: number;
    backupCode: number;
  };
}

interface SecurityMetrics {
  last24h: {
    accountLockouts: number;
    suspiciousActivities: number;
    emergencyCodesGenerated: number;
    adminResets: number;
    backupCodesRegenerated: number;
    usersWithLowBackupCodes: number;
  };
  usersNeedingBackupCodes: number;
}

interface AlertsSummary {
  total: number; // Total active alerts
  critical: number; // Critical/urgent alerts
  recent: SecurityAlert[]; // Most recent 5 alerts
}

interface ActionItem {
  type: 'critical_alert' | 'low_backup_codes' | 'high_failure_rate';
  message: string;
  count?: number;
  users?: Array<{ id: string; email: string; remainingCodes: number }>;
  failureRate?: number;
}
```

**Example Response:**

```json
{
  "adoption": {
    "current": 68.5,
    "total": 150,
    "enabled": 103,
    "byRole": {
      "ADMIN": {
        "total": 5,
        "enabled": 5,
        "rate": 100
      },
      "CREATOR": {
        "total": 80,
        "enabled": 55,
        "rate": 68.75
      },
      "BRAND": {
        "total": 65,
        "enabled": 43,
        "rate": 66.15
      }
    }
  },
  "authentication": {
    "last24h": {
      "total": 450,
      "successful": 425,
      "failed": 25,
      "failureRate": 5.56,
      "failureRateChange": -2.3
    },
    "byMethod": {
      "totp": 380,
      "sms": 45,
      "backupCode": 0
    }
  },
  "security": {
    "last24h": {
      "accountLockouts": 2,
      "suspiciousActivities": 0,
      "emergencyCodesGenerated": 1,
      "adminResets": 0,
      "backupCodesRegenerated": 8,
      "usersWithLowBackupCodes": 5
    },
    "usersNeedingBackupCodes": 5
  },
  "alerts": {
    "total": 2,
    "critical": 0,
    "recent": [
      {
        "id": "alert_123",
        "alertType": "spike_failures",
        "severity": "warning",
        "title": "2FA Failure Rate Spike Detected",
        "description": "Failed 2FA attempts increased by 45% in last hour",
        "status": "active",
        "createdAt": "2025-10-20T10:30:00.000Z"
      }
    ]
  },
  "actionItems": [
    {
      "type": "low_backup_codes",
      "message": "5 user(s) have fewer than 3 backup codes",
      "count": 5,
      "users": [
        {
          "id": "user_123",
          "email": "creator@example.com",
          "remainingCodes": 1
        }
      ]
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

**Cache Headers:**

```
Cache-Control: no-store, max-age=0
```

Dashboard data should not be cached - it's real-time security information.

---

### 1.2 Get Security Events

Query detailed security events with filtering options.

**Endpoint:** `GET /api/admin/2fa/security/events`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | No | Filter by specific user ID |
| `eventType` | string | No | Filter by event type (see Event Types below) |
| `eventCategory` | string | No | Filter by category: authentication, setup, admin_action |
| `anomalousOnly` | boolean | No | Return only anomalous events |
| `startDate` | ISO 8601 | No | Filter events after this date |
| `endDate` | ISO 8601 | No | Filter events before this date |
| `limit` | number | No | Max results (default: 100, max: 1000) |

**Event Types:**

- `2fa_enabled` - User enabled 2FA
- `2fa_disabled` - User disabled 2FA
- `2fa_verify_success` - Successful 2FA verification
- `2fa_verify_failed` - Failed 2FA verification
- `backup_code_used` - Backup code used
- `backup_codes_regenerated` - User regenerated backup codes
- `emergency_code_used` - Emergency code used
- `admin_2fa_reset` - Admin reset user 2FA
- `failed_attempt` - Failed authentication attempt

**Example Request:**

```typescript
// Get recent failed attempts for a user
const response = await fetch(
  '/api/admin/2fa/security/events?userId=user_123&eventType=2fa_verify_failed&limit=50',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);

// Get anomalous events in last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const now = new Date().toISOString();
const response2 = await fetch(
  `/api/admin/2fa/security/events?anomalousOnly=true&startDate=${yesterday}&endDate=${now}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);
```

**Response Schema:**

```typescript
interface SecurityEventsResponse {
  events: SecurityEvent[];
  summary?: FailedAttemptsSummary; // Only when eventType=failed_attempt with date range
}

interface SecurityEvent {
  id: string;
  userId: string | null;
  eventType: string;
  eventCategory: string;
  eventData: Record<string, any>;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  locationRegion: string | null;
  isAnomalous: boolean;
  anomalyScore: number | null;
  anomalyReasons: string[];
  timestamp: Date;
}

interface FailedAttemptsSummary {
  totalAttempts: number;
  uniqueUsers: number;
  uniqueIPs: number;
  topFailureReasons: Array<{
    reason: string;
    count: number;
  }>;
  topTargetedUsers: Array<{
    userId: string;
    email: string;
    attemptCount: number;
  }>;
  topSourceIPs: Array<{
    ipAddress: string;
    attemptCount: number;
    location: string | null;
  }>;
}
```

**Example Response:**

```json
{
  "events": [
    {
      "id": "event_123",
      "userId": "user_123",
      "eventType": "2fa_verify_failed",
      "eventCategory": "authentication",
      "eventData": {
        "method": "totp",
        "reason": "Invalid code"
      },
      "success": false,
      "failureReason": "Invalid TOTP code",
      "ipAddress": "203.0.113.42",
      "userAgent": "Mozilla/5.0...",
      "locationCity": "San Francisco",
      "locationCountry": "US",
      "locationRegion": "California",
      "isAnomalous": false,
      "anomalyScore": 0.3,
      "anomalyReasons": [],
      "timestamp": "2025-10-20T14:30:00.000Z"
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

---

### 1.3 Get Security Alerts

Get active and historical security alerts.

**Endpoint:** `GET /api/admin/2fa/security/alerts`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status: active, acknowledged, resolved (default: active) |
| `severity` | string | No | Filter by severity: info, warning, critical, urgent |
| `startDate` | ISO 8601 | No | For historical alerts |
| `endDate` | ISO 8601 | No | For historical alerts |
| `limit` | number | No | Max results (default: 50, max: 200) |

**Alert Types:**

- `spike_failures` - Sudden increase in failure rate
- `velocity_attack` - High frequency of attempts from single source
- `geographic_anomaly` - Unusual geographic patterns
- `sustained_attack` - Prolonged elevated failure rate
- `low_backup_codes` - Users with insufficient backup codes

**Example Request:**

```typescript
// Get active critical alerts
const response = await fetch(
  '/api/admin/2fa/security/alerts?status=active&severity=critical',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);
```

**Response Schema:**

```typescript
interface SecurityAlertsResponse {
  alerts: SecurityAlert[];
}

interface SecurityAlert {
  id: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  status: 'active' | 'acknowledged' | 'resolved';
  title: string;
  description: string;
  recommendation: string | null;
  metric: string;
  currentValue: number;
  threshold: number;
  baselineValue: number | null;
  periodStart: Date;
  periodEnd: Date;
  affectedUserCount: number | null;
  affectedUsers: string[];
  affectedIpAddresses: string[];
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
}
```

**Example Response:**

```json
{
  "alerts": [
    {
      "id": "alert_123",
      "alertType": "spike_failures",
      "severity": "warning",
      "status": "active",
      "title": "2FA Failure Rate Spike Detected",
      "description": "Failed 2FA attempts have increased by 55.2% in the last hour. Current failure rate: 12.5%, Baseline: 8.1%",
      "recommendation": "Review recent failed attempts for patterns. Check if specific users or IP addresses are being targeted. Consider implementing additional rate limiting.",
      "metric": "failure_rate",
      "currentValue": 12.5,
      "threshold": 50,
      "baselineValue": 8.1,
      "periodStart": "2025-10-20T13:30:00.000Z",
      "periodEnd": "2025-10-20T14:30:00.000Z",
      "affectedUserCount": 8,
      "affectedUsers": ["user_123", "user_456"],
      "affectedIpAddresses": ["203.0.113.42", "198.51.100.23"],
      "acknowledgedBy": null,
      "acknowledgedAt": null,
      "resolvedBy": null,
      "resolvedAt": null,
      "resolutionNotes": null,
      "createdAt": "2025-10-20T14:30:00.000Z"
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

---

### 1.4 Acknowledge Security Alert

Mark an alert as acknowledged by an admin.

**Endpoint:** `PATCH /api/admin/2fa/security/alerts/{alertId}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `alertId` | string | Yes | Alert ID |

**Request Body:**

```typescript
interface AcknowledgeAlertRequest {
  action: 'acknowledge' | 'resolve';
  notes?: string; // Required for resolve
}
```

**Example Request:**

```typescript
// Acknowledge alert
const response = await fetch(`/api/admin/2fa/security/alerts/${alertId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'acknowledge',
  }),
});

// Resolve alert with notes
const response2 = await fetch(`/api/admin/2fa/security/alerts/${alertId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'resolve',
    notes: 'Implemented additional rate limiting. Monitored for 2 hours, no further spikes detected.',
  }),
});
```

**Response Schema:**

```typescript
interface AcknowledgeAlertResponse {
  success: boolean;
  message: string;
  alert: SecurityAlert;
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (missing notes for resolve)
- `401` - Unauthorized
- `404` - Alert not found
- `500` - Internal server error

**Validation Rules:**

- `action` must be 'acknowledge' or 'resolve'
- `notes` required when action is 'resolve'
- Cannot acknowledge/resolve already resolved alerts

---

### 1.5 Get Compliance Metrics

Get detailed compliance metrics for a specific time period.

**Endpoint:** `GET /api/admin/2fa/compliance/metrics`

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | ISO 8601 | Yes | Period start date |
| `endDate` | ISO 8601 | Yes | Period end date |

**Example Request:**

```typescript
const startDate = new Date('2025-10-01').toISOString();
const endDate = new Date('2025-10-31').toISOString();

const response = await fetch(
  `/api/admin/2fa/compliance/metrics?startDate=${startDate}&endDate=${endDate}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }
);
```

**Response Schema:**

```typescript
interface ComplianceMetricsResponse {
  adoption: AdoptionMetrics;
  authentication: AuthenticationMetrics;
  security: SecurityMetrics;
  periodStart: Date;
  periodEnd: Date;
}

interface AuthenticationMetrics {
  totalAttempts: number;
  successful: number;
  failed: number;
  failureRate: number;
  byMethod: {
    totp: number;
    sms: number;
    backupCode: number;
  };
}

interface SecurityMetrics {
  accountLockouts: number;
  suspiciousActivities: number;
  emergencyCodesGenerated: number;
  adminResets: number;
  backupCodesRegenerated: number;
  usersWithLowBackupCodes: number;
}
```

**Example Response:**

```json
{
  "adoption": {
    "totalUsers": 150,
    "usersWithTwoFactor": 103,
    "adoptionRate": 68.67,
    "byRole": {
      "ADMIN": { "total": 5, "enabled": 5, "rate": 100 },
      "CREATOR": { "total": 80, "enabled": 55, "rate": 68.75 }
    }
  },
  "authentication": {
    "totalAttempts": 12450,
    "successful": 11890,
    "failed": 560,
    "failureRate": 4.5,
    "byMethod": {
      "totp": 10200,
      "sms": 1690,
      "backupCode": 0
    }
  },
  "security": {
    "accountLockouts": 15,
    "suspiciousActivities": 3,
    "emergencyCodesGenerated": 5,
    "adminResets": 2,
    "backupCodesRegenerated": 87,
    "usersWithLowBackupCodes": 12
  },
  "periodStart": "2025-10-01T00:00:00.000Z",
  "periodEnd": "2025-10-31T23:59:59.999Z"
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (invalid date range)
- `401` - Unauthorized
- `500` - Internal server error

---

## 2. TypeScript Type Definitions

```typescript
/**
 * Security & Audit Types
 */

// Dashboard
export interface SecurityDashboardResponse {
  adoption: AdoptionMetrics;
  authentication: AuthenticationStats;
  security: SecurityMetrics;
  alerts: AlertsSummary;
  actionItems: ActionItem[];
}

export interface AdoptionMetrics {
  current: number;
  total: number;
  enabled: number;
  byRole: {
    [role: string]: {
      total: number;
      enabled: number;
      rate: number;
    };
  };
}

export interface AuthenticationStats {
  last24h: {
    total: number;
    successful: number;
    failed: number;
    failureRate: number;
    failureRateChange: number;
  };
  byMethod: {
    totp: number;
    sms: number;
    backupCode: number;
  };
}

export interface SecurityMetrics {
  last24h?: {
    accountLockouts: number;
    suspiciousActivities: number;
    emergencyCodesGenerated: number;
    adminResets: number;
    backupCodesRegenerated: number;
    usersWithLowBackupCodes: number;
  };
  usersNeedingBackupCodes?: number;
  accountLockouts?: number;
  suspiciousActivities?: number;
  emergencyCodesGenerated?: number;
  adminResets?: number;
  backupCodesRegenerated?: number;
  usersWithLowBackupCodes?: number;
}

export interface AlertsSummary {
  total: number;
  critical: number;
  recent: SecurityAlert[];
}

export type ActionItemType = 'critical_alert' | 'low_backup_codes' | 'high_failure_rate';

export interface ActionItem {
  type: ActionItemType;
  message: string;
  count?: number;
  users?: Array<{ id: string; email: string; remainingCodes: number }>;
  failureRate?: number;
}

// Security Events
export type EventType =
  | '2fa_enabled'
  | '2fa_disabled'
  | '2fa_verify_success'
  | '2fa_verify_failed'
  | 'backup_code_used'
  | 'backup_codes_regenerated'
  | 'emergency_code_used'
  | 'admin_2fa_reset'
  | 'failed_attempt';

export type EventCategory = 'authentication' | 'setup' | 'admin_action';

export interface SecurityEvent {
  id: string;
  userId: string | null;
  eventType: EventType;
  eventCategory: EventCategory;
  eventData: Record<string, any>;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  locationRegion: string | null;
  isAnomalous: boolean;
  anomalyScore: number | null;
  anomalyReasons: string[];
  timestamp: Date;
}

export interface SecurityEventsResponse {
  events: SecurityEvent[];
  summary?: FailedAttemptsSummary;
}

export interface FailedAttemptsSummary {
  totalAttempts: number;
  uniqueUsers: number;
  uniqueIPs: number;
  topFailureReasons: Array<{
    reason: string;
    count: number;
  }>;
  topTargetedUsers: Array<{
    userId: string;
    email: string;
    attemptCount: number;
  }>;
  topSourceIPs: Array<{
    ipAddress: string;
    attemptCount: number;
    location: string | null;
  }>;
}

// Security Alerts
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'urgent';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'spike_failures'
  | 'velocity_attack'
  | 'geographic_anomaly'
  | 'sustained_attack'
  | 'low_backup_codes';

export interface SecurityAlert {
  id: string;
  alertType: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  recommendation: string | null;
  metric: string;
  currentValue: number;
  threshold: number;
  baselineValue: number | null;
  periodStart: Date;
  periodEnd: Date;
  affectedUserCount: number | null;
  affectedUsers: string[];
  affectedIpAddresses: string[];
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
}

export interface SecurityAlertsResponse {
  alerts: SecurityAlert[];
}

export interface AcknowledgeAlertRequest {
  action: 'acknowledge' | 'resolve';
  notes?: string;
}

export interface AcknowledgeAlertResponse {
  success: boolean;
  message: string;
  alert: SecurityAlert;
}

// Compliance Metrics
export interface ComplianceMetricsResponse {
  adoption: AdoptionMetrics;
  authentication: AuthenticationMetrics;
  security: SecurityMetrics;
  periodStart: Date;
  periodEnd: Date;
}

export interface AuthenticationMetrics {
  totalAttempts: number;
  successful: number;
  failed: number;
  failureRate: number;
  byMethod: {
    totp: number;
    sms: number;
    backupCode: number;
  };
}

// Query Options
export interface SecurityEventsQuery {
  userId?: string;
  eventType?: EventType;
  eventCategory?: EventCategory;
  anomalousOnly?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface SecurityAlertsQuery {
  status?: AlertStatus;
  severity?: AlertSeverity;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
```

---

## 3. Business Logic & Validation

### 3.1 Alert Severity Levels

```typescript
function getAlertSeverityConfig(severity: AlertSeverity): {
  color: string;
  icon: string;
  priority: number;
  requiresImmediate Action: boolean;
} {
  switch (severity) {
    case 'critical':
      return {
        color: 'red',
        icon: 'alert-circle',
        priority: 4,
        requiresImmediateAction: true,
      };
    case 'urgent':
      return {
        color: 'orange',
        icon: 'alert-triangle',
        priority: 3,
        requiresImmediateAction: true,
      };
    case 'warning':
      return {
        color: 'yellow',
        icon: 'alert',
        priority: 2,
        requiresImmediateAction: false,
      };
    case 'info':
      return {
        color: 'blue',
        icon: 'info',
        priority: 1,
        requiresImmediateAction: false,
      };
  }
}
```

### 3.2 Anomaly Score Interpretation

```typescript
function interpretAnomalyScore(score: number | null): {
  level: 'normal' | 'suspicious' | 'anomalous';
  description: string;
} {
  if (score === null) {
    return { level: 'normal', description: 'No anomaly detected' };
  }

  if (score >= 0.7) {
    return {
      level: 'anomalous',
      description: 'High confidence anomaly - requires investigation',
    };
  }

  if (score >= 0.4) {
    return {
      level: 'suspicious',
      description: 'Potentially suspicious - monitor closely',
    };
  }

  return {
    level: 'normal',
    description: 'Normal activity',
  };
}
```

### 3.3 Failure Rate Thresholds

```typescript
const FAILURE_RATE_THRESHOLDS = {
  normal: 5, // < 5% is normal
  elevated: 10, // 5-10% is elevated
  high: 15, // 10-15% is high
  critical: 20, // > 20% is critical
};

function getFailureRateStatus(rate: number): {
  status: 'normal' | 'elevated' | 'high' | 'critical';
  message: string;
  action: string;
} {
  if (rate >= FAILURE_RATE_THRESHOLDS.critical) {
    return {
      status: 'critical',
      message: 'Critical failure rate',
      action: 'Immediate investigation required',
    };
  }

  if (rate >= FAILURE_RATE_THRESHOLDS.high) {
    return {
      status: 'high',
      message: 'High failure rate',
      action: 'Review failed attempts and patterns',
    };
  }

  if (rate >= FAILURE_RATE_THRESHOLDS.elevated) {
    return {
      status: 'elevated',
      message: 'Elevated failure rate',
      action: 'Monitor for continued increases',
    };
  }

  return {
    status: 'normal',
    message: 'Normal failure rate',
    action: 'No action required',
  };
}
```

---

## 4. Error Handling

Same error handling patterns as main Admin 2FA guide:

- `200` - Success
- `400` - Bad request
- `401` - Unauthorized
- `404` - Not found
- `500` - Internal server error

---

## 5. Frontend Implementation Checklist

### 5.1 Pages to Build

- [ ] **Security Dashboard** (`/admin/security/2fa/dashboard`)
  - [ ] Adoption metrics cards
  - [ ] Authentication stats chart (24h)
  - [ ] Active alerts panel
  - [ ] Action items list
  - [ ] Quick links to detailed views

- [ ] **Security Events Log** (`/admin/security/2fa/events`)
  - [ ] Filterable events table
  - [ ] Date range picker
  - [ ] Event type filter
  - [ ] Anomaly indicator
  - [ ] Export to CSV button

- [ ] **Security Alerts** (`/admin/security/2fa/alerts`)
  - [ ] Active alerts list (priority sorted)
  - [ ] Alert details modal
  - [ ] Acknowledge/resolve actions
  - [ ] Historical alerts view
  - [ ] Severity filters

- [ ] **Compliance Reports** (`/admin/security/2fa/compliance`)
  - [ ] Period selector
  - [ ] Metrics overview
  - [ ] Trend charts
  - [ ] Export functionality

### 5.2 Components to Build

#### Dashboard
- [ ] `AdoptionMetricsCard` - Show adoption rate with role breakdown
- [ ] `AuthenticationStatsCard` - Show 24h auth stats
- [ ] `SecurityMetricsCard` - Show security metrics
- [ ] `ActiveAlertsPanel` - List active alerts
- [ ] `ActionItemsList` - Show action items requiring attention

#### Security Events
- [ ] `SecurityEventsTable` - Filterable events table
- [ ] `EventDetailsModal` - Show detailed event information
- [ ] `AnomalyIndicator` - Visual indicator for anomalous events
- [ ] `EventTypeFilter` - Filter dropdown
- [ ] `DateRangePicker` - Select date range

#### Alerts
- [ ] `SecurityAlertCard` - Display individual alert
- [ ] `AlertSeverityBadge` - Show severity with color coding
- [ ] `AlertStatusBadge` - Show status (active/acknowledged/resolved)
- [ ] `AlertDetailsModal` - Show full alert details
- [ ] `AcknowledgeAlertForm` - Form to acknowledge/resolve alerts
- [ ] `AlertTimelineView` - Show alert lifecycle

### 5.3 API Client Methods

```typescript
// lib/api/admin-2fa-security.ts
export class Admin2FASecurityClient {
  private baseUrl = '/api/admin/2fa';

  async getDashboard(): Promise<SecurityDashboardResponse> {
    const response = await makeAdminRequest(`${this.baseUrl}/dashboard`);
    return response.json();
  }

  async getSecurityEvents(query: SecurityEventsQuery): Promise<SecurityEventsResponse> {
    const params = new URLSearchParams();
    if (query.userId) params.append('userId', query.userId);
    if (query.eventType) params.append('eventType', query.eventType);
    if (query.eventCategory) params.append('eventCategory', query.eventCategory);
    if (query.anomalousOnly) params.append('anomalousOnly', 'true');
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.limit) params.append('limit', query.limit.toString());

    const response = await makeAdminRequest(
      `${this.baseUrl}/security/events?${params.toString()}`
    );
    return response.json();
  }

  async getSecurityAlerts(query: SecurityAlertsQuery): Promise<SecurityAlertsResponse> {
    const params = new URLSearchParams();
    if (query.status) params.append('status', query.status);
    if (query.severity) params.append('severity', query.severity);
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.limit) params.append('limit', query.limit.toString());

    const response = await makeAdminRequest(
      `${this.baseUrl}/security/alerts?${params.toString()}`
    );
    return response.json();
  }

  async acknowledgeAlert(
    alertId: string,
    request: AcknowledgeAlertRequest
  ): Promise<AcknowledgeAlertResponse> {
    const response = await makeAdminRequest(
      `${this.baseUrl}/security/alerts/${alertId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    return response.json();
  }

  async getComplianceMetrics(
    startDate: string,
    endDate: string
  ): Promise<ComplianceMetricsResponse> {
    const params = new URLSearchParams({ startDate, endDate });
    const response = await makeAdminRequest(
      `${this.baseUrl}/compliance/metrics?${params.toString()}`
    );
    return response.json();
  }
}

export const admin2FASecurityClient = new Admin2FASecurityClient();
```

### 5.4 React Query Hooks

```typescript
// hooks/useAdmin2FASecurity.ts
export function useSecurityDashboard() {
  return useQuery({
    queryKey: ['admin-2fa-dashboard'],
    queryFn: () => admin2FASecurityClient.getDashboard(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Auto-refresh every minute
  });
}

export function useSecurityEvents(query: SecurityEventsQuery) {
  return useQuery({
    queryKey: ['admin-2fa-events', query],
    queryFn: () => admin2FASecurityClient.getSecurityEvents(query),
    staleTime: 30000,
  });
}

export function useSecurityAlerts(query: SecurityAlertsQuery) {
  return useQuery({
    queryKey: ['admin-2fa-alerts', query],
    queryFn: () => admin2FASecurityClient.getSecurityAlerts(query),
    staleTime: 30000,
    refetchInterval: 60000, // Auto-refresh for active alerts
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      alertId,
      request,
    }: {
      alertId: string;
      request: AcknowledgeAlertRequest;
    }) => admin2FASecurityClient.acknowledgeAlert(alertId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-dashboard'] });
    },
  });
}

export function useComplianceMetrics(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['admin-2fa-compliance', startDate, endDate],
    queryFn: () => admin2FASecurityClient.getComplianceMetrics(startDate, endDate),
    enabled: !!startDate && !!endDate,
    staleTime: 300000, // 5 minutes
  });
}
```

---

## 6. UX Considerations

### 6.1 Dashboard Auto-Refresh

- Auto-refresh dashboard every 60 seconds
- Show "Last updated" timestamp
- Provide manual refresh button
- Pause auto-refresh when user is viewing details

### 6.2 Alert Prioritization

Display alerts in this order:
1. Critical/Urgent alerts (top)
2. Warning alerts
3. Info alerts
4. Within each severity, sort by newest first

### 6.3 Visual Indicators

- 🔴 Critical: Red background, pulsing animation
- 🟠 Urgent: Orange background, subtle animation
- 🟡 Warning: Yellow background
- 🔵 Info: Blue background

### 6.4 Notification Strategy

- Show browser notification for critical/urgent alerts
- Play sound for critical alerts (optional, user preference)
- Badge count on admin menu for unacknowledged critical alerts

---

## 7. Related Documentation

- [Admin 2FA Management Integration Guide](./ADMIN_2FA_MANAGEMENT_FRONTEND_INTEGRATION.md) - Main admin 2FA features
- [Reports & Compliance Integration Guide](./ADMIN_2FA_REPORTS_FRONTEND_INTEGRATION.md) - Compliance reports and exports

---

**Document Version:** 1.0  
**Last Updated:** October 20, 2025  
**Maintained By:** Backend Team
