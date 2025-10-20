# 🔒 Admin 2FA Reports & Compliance - Frontend Integration Guide

**Classification:** 🔒 ADMIN ONLY  
**Version:** 1.0  
**Last Updated:** October 20, 2025

---

## Overview

This document covers 2FA compliance reporting, including report generation, scheduling, retrieval, and export functionality. Admins can generate comprehensive security reports and export data in multiple formats.

### Module Capabilities

- Generate monthly security reports
- Schedule recurring reports
- List all reports with filtering
- Download reports in JSON/CSV format
- Track report generation status
- View report summaries

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

### 1.1 List Reports

Get list of all generated reports with optional filtering.

**Endpoint:** `GET /api/admin/2fa/reports`

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `reportType` | string | No | - | Filter by report type (monthly_security, custom) |
| `limit` | number | No | 50 | Max results (max: 200) |

**Example Request:**

```typescript
const response = await fetch('/api/admin/2fa/reports?reportType=monthly_security&limit=20', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema:**

```typescript
interface ListReportsResponse {
  reports: ComplianceReport[];
}

interface ComplianceReport {
  id: string;
  reportType: 'monthly_security' | 'custom';
  format: 'json' | 'csv' | 'pdf';
  periodStart: Date;
  periodEnd: Date;
  generatedBy: string | null;
  generatedAt: Date;
  generationStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  downloadCount: number;
  summary: string | null;
}
```

**Example Response:**

```json
{
  "reports": [
    {
      "id": "report_123",
      "reportType": "monthly_security",
      "format": "json",
      "periodStart": "2025-10-01T00:00:00.000Z",
      "periodEnd": "2025-10-31T23:59:59.999Z",
      "generatedBy": "admin_456",
      "generatedAt": "2025-11-01T08:00:00.000Z",
      "generationStatus": "completed",
      "errorMessage": null,
      "downloadCount": 3,
      "summary": "Monthly security report for October 2025. Adoption rate: 68.5%, Failure rate: 4.2%"
    }
  ]
}
```

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `500` - Internal server error

---

### 1.2 Generate Monthly Security Report

Generate a new monthly security report for a specific month/year.

**Endpoint:** `POST /api/admin/2fa/reports`

**Request Body:**

```typescript
interface GenerateMonthlyReportRequest {
  reportType: 'monthly_security';
  year: number;
  month: number; // 1-12
}
```

**Example Request:**

```typescript
const response = await fetch('/api/admin/2fa/reports', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    reportType: 'monthly_security',
    year: 2025,
    month: 10,
  }),
});
```

**Response Schema:**

```typescript
interface GenerateReportResponse {
  success: boolean;
  reportId: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "reportId": "report_123"
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (missing year/month)
- `401` - Unauthorized
- `500` - Internal server error

**Validation Rules:**

- `year` must be a valid 4-digit year
- `month` must be 1-12
- Report period must not be in the future

---

### 1.3 Schedule Recurring Report

Schedule a report to be generated automatically on a recurring basis.

**Endpoint:** `POST /api/admin/2fa/reports`

**Request Body:**

```typescript
interface ScheduleRecurringReportRequest {
  reportType?: 'monthly_security';
  schedule: {
    frequency: 'monthly' | 'weekly' | 'quarterly';
    emailTo?: string[];
  };
}
```

**Example Request:**

```typescript
const response = await fetch('/api/admin/2fa/reports', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    reportType: 'monthly_security',
    schedule: {
      frequency: 'monthly',
      emailTo: ['security-team@yesgoddess.agency', 'admin@yesgoddess.agency'],
    },
  }),
});
```

**Response Schema:**

```typescript
interface ScheduleReportResponse {
  success: boolean;
  reportId: string;
  message: string;
}
```

**Example Response:**

```json
{
  "success": true,
  "reportId": "schedule_123",
  "message": "Report scheduled successfully"
}
```

**Status Codes:**

- `200` - Success
- `400` - Bad request (invalid frequency)
- `401` - Unauthorized
- `500` - Internal server error

**Business Rules:**

- `frequency` must be 'monthly', 'weekly', or 'quarterly'
- If `emailTo` not provided, uses admin's email
- Scheduled reports are generated automatically based on frequency

---

### 1.4 Get Specific Report

Retrieve a specific report with full data.

**Endpoint:** `GET /api/admin/2fa/reports/{reportId}`

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportId` | string | Yes | Report ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `format` | string | No | json | Response format: json or csv |

**Example Request:**

```typescript
// Get report as JSON
const response = await fetch(`/api/admin/2fa/reports/${reportId}`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});

// Download report as CSV
const response2 = await fetch(`/api/admin/2fa/reports/${reportId}?format=csv`, {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Response Schema (JSON):**

```typescript
interface GetReportResponse {
  report: ComplianceReport & {
    reportData: MonthlySecurityReportData;
  };
}

interface MonthlySecurityReportData {
  reportPeriod: {
    start: Date;
    end: Date;
    month: string;
  };
  executiveSummary: {
    adoptionRate: number;
    adoptionChange: number;
    totalUsers: number;
    usersWithTwoFactor: number;
    totalAuthAttempts: number;
    failureRate: number;
    securityIncidents: number;
  };
  adoptionMetrics: {
    overall: { total: number; enabled: number; rate: number };
    byRole: Record<string, { total: number; enabled: number; rate: number }>;
    trend: Array<{ date: string; rate: number }>;
  };
  authenticationMetrics: {
    totalAttempts: number;
    successfulAuths: number;
    failedAuths: number;
    failureRate: number;
    byMethod: { totp: number; sms: number; backupCode: number };
    failureTrend: Array<{ date: string; failureRate: number }>;
  };
  securityEvents: {
    totalIncidents: number;
    accountLockouts: number;
    suspiciousActivities: number;
    adminResets: number;
    emergencyCodesGenerated: number;
    byType: Record<string, number>;
  };
  backupCodeMetrics: {
    regenerated: number;
    used: number;
    usersWithLowCodes: number;
    averageCodesPerUser: number;
  };
  alerts: {
    totalAlerts: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    resolvedAlerts: number;
    averageResolutionTime: number; // milliseconds
  };
  topIncidents: Array<{
    type: string;
    description: string;
    timestamp: Date;
    severity: string;
  }>;
  recommendations: string[];
}
```

**Example Response (JSON):**

```json
{
  "report": {
    "id": "report_123",
    "reportType": "monthly_security",
    "format": "json",
    "periodStart": "2025-10-01T00:00:00.000Z",
    "periodEnd": "2025-10-31T23:59:59.999Z",
    "generatedBy": "admin_456",
    "generatedAt": "2025-11-01T08:00:00.000Z",
    "generationStatus": "completed",
    "downloadCount": 4,
    "reportData": {
      "reportPeriod": {
        "start": "2025-10-01T00:00:00.000Z",
        "end": "2025-10-31T23:59:59.999Z",
        "month": "October 2025"
      },
      "executiveSummary": {
        "adoptionRate": 68.5,
        "adoptionChange": 5.2,
        "totalUsers": 150,
        "usersWithTwoFactor": 103,
        "totalAuthAttempts": 12450,
        "failureRate": 4.5,
        "securityIncidents": 3
      },
      "adoptionMetrics": {
        "overall": { "total": 150, "enabled": 103, "rate": 68.67 },
        "byRole": {
          "ADMIN": { "total": 5, "enabled": 5, "rate": 100 },
          "CREATOR": { "total": 80, "enabled": 55, "rate": 68.75 },
          "BRAND": { "total": 65, "enabled": 43, "rate": 66.15 }
        },
        "trend": [
          { "date": "2025-10-01", "rate": 63.3 },
          { "date": "2025-10-08", "rate": 65.1 },
          { "date": "2025-10-15", "rate": 66.8 },
          { "date": "2025-10-22", "rate": 67.9 },
          { "date": "2025-10-29", "rate": 68.5 }
        ]
      },
      "authenticationMetrics": {
        "totalAttempts": 12450,
        "successfulAuths": 11890,
        "failedAuths": 560,
        "failureRate": 4.5,
        "byMethod": {
          "totp": 10200,
          "sms": 1690,
          "backupCode": 0
        },
        "failureTrend": [
          { "date": "2025-10-01", "failureRate": 5.2 },
          { "date": "2025-10-08", "failureRate": 4.8 },
          { "date": "2025-10-15", "failureRate": 4.3 },
          { "date": "2025-10-22", "failureRate": 4.1 },
          { "date": "2025-10-29", "failureRate": 4.0 }
        ]
      },
      "securityEvents": {
        "totalIncidents": 3,
        "accountLockouts": 15,
        "suspiciousActivities": 3,
        "adminResets": 2,
        "emergencyCodesGenerated": 5,
        "byType": {
          "failed_login": 560,
          "account_lockout": 15,
          "suspicious_activity": 3
        }
      },
      "backupCodeMetrics": {
        "regenerated": 87,
        "used": 12,
        "usersWithLowCodes": 8,
        "averageCodesPerUser": 7.2
      },
      "alerts": {
        "totalAlerts": 5,
        "bySeverity": {
          "warning": 3,
          "critical": 1,
          "info": 1
        },
        "byType": {
          "spike_failures": 2,
          "low_backup_codes": 2,
          "geographic_anomaly": 1
        },
        "resolvedAlerts": 4,
        "averageResolutionTime": 7200000
      },
      "topIncidents": [
        {
          "type": "spike_failures",
          "description": "Failed 2FA attempts increased by 55% in last hour",
          "timestamp": "2025-10-15T14:30:00.000Z",
          "severity": "warning"
        }
      ],
      "recommendations": [
        "Continue monitoring adoption trends - showing healthy growth",
        "Review users with low backup codes and encourage regeneration",
        "Failure rate is within acceptable range but trending down - good",
        "Consider expanding 2FA to additional user roles"
      ]
    }
  }
}
```

**Response (CSV Format):**

When `format=csv`, the response is a CSV file with headers:

```csv
Content-Type: text/csv
Content-Disposition: attachment; filename="2fa-report-{reportId}.csv"
```

The CSV includes:
- Executive Summary section
- Adoption metrics by role
- Authentication statistics
- Security events summary
- Alert summary
- Top incidents

**Status Codes:**

- `200` - Success
- `401` - Unauthorized
- `404` - Report not found
- `500` - Internal server error

**Business Rules:**

- Download count is incremented each time report is accessed
- CSV format is best for importing into spreadsheets
- JSON format is best for programmatic processing

---

## 2. TypeScript Type Definitions

```typescript
/**
 * Compliance Reports Types
 */

export type ReportType = 'monthly_security' | 'custom';
export type ReportFormat = 'json' | 'csv' | 'pdf';
export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ReportFrequency = 'monthly' | 'weekly' | 'quarterly';

// Report List
export interface ComplianceReport {
  id: string;
  reportType: ReportType;
  format: ReportFormat;
  periodStart: Date;
  periodEnd: Date;
  generatedBy: string | null;
  generatedAt: Date;
  generationStatus: ReportStatus;
  errorMessage: string | null;
  downloadCount: number;
  summary: string | null;
}

export interface ListReportsResponse {
  reports: ComplianceReport[];
}

// Report Generation
export interface GenerateMonthlyReportRequest {
  reportType: 'monthly_security';
  year: number;
  month: number;
}

export interface ScheduleRecurringReportRequest {
  reportType?: 'monthly_security';
  schedule: {
    frequency: ReportFrequency;
    emailTo?: string[];
  };
}

export interface GenerateReportResponse {
  success: boolean;
  reportId: string;
}

export interface ScheduleReportResponse {
  success: boolean;
  reportId: string;
  message: string;
}

// Report Data
export interface MonthlySecurityReportData {
  reportPeriod: {
    start: Date;
    end: Date;
    month: string;
  };
  executiveSummary: ExecutiveSummary;
  adoptionMetrics: AdoptionMetrics;
  authenticationMetrics: AuthenticationMetrics;
  securityEvents: SecurityEventsMetrics;
  backupCodeMetrics: BackupCodeMetrics;
  alerts: AlertsMetrics;
  topIncidents: Incident[];
  recommendations: string[];
}

export interface ExecutiveSummary {
  adoptionRate: number;
  adoptionChange: number;
  totalUsers: number;
  usersWithTwoFactor: number;
  totalAuthAttempts: number;
  failureRate: number;
  securityIncidents: number;
}

export interface AdoptionMetrics {
  overall: {
    total: number;
    enabled: number;
    rate: number;
  };
  byRole: Record<string, {
    total: number;
    enabled: number;
    rate: number;
  }>;
  trend: Array<{
    date: string;
    rate: number;
  }>;
}

export interface AuthenticationMetrics {
  totalAttempts: number;
  successfulAuths: number;
  failedAuths: number;
  failureRate: number;
  byMethod: {
    totp: number;
    sms: number;
    backupCode: number;
  };
  failureTrend: Array<{
    date: string;
    failureRate: number;
  }>;
}

export interface SecurityEventsMetrics {
  totalIncidents: number;
  accountLockouts: number;
  suspiciousActivities: number;
  adminResets: number;
  emergencyCodesGenerated: number;
  byType: Record<string, number>;
}

export interface BackupCodeMetrics {
  regenerated: number;
  used: number;
  usersWithLowCodes: number;
  averageCodesPerUser: number;
}

export interface AlertsMetrics {
  totalAlerts: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  resolvedAlerts: number;
  averageResolutionTime: number;
}

export interface Incident {
  type: string;
  description: string;
  timestamp: Date;
  severity: string;
}

export interface GetReportResponse {
  report: ComplianceReport & {
    reportData: MonthlySecurityReportData;
  };
}
```

---

## 3. Business Logic & Validation

### 3.1 Report Generation Validation

```typescript
function validateReportRequest(
  year: number,
  month: number
): { valid: boolean; error?: string } {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  // Validate year
  if (year < 2020 || year > currentYear) {
    return {
      valid: false,
      error: `Year must be between 2020 and ${currentYear}`,
    };
  }

  // Validate month
  if (month < 1 || month > 12) {
    return {
      valid: false,
      error: 'Month must be between 1 and 12',
    };
  }

  // Don't allow future dates
  if (year === currentYear && month > currentMonth) {
    return {
      valid: false,
      error: 'Cannot generate report for future months',
    };
  }

  // Don't allow current month until it's complete
  if (year === currentYear && month === currentMonth) {
    return {
      valid: false,
      error: 'Current month report can only be generated after month ends',
    };
  }

  return { valid: true };
}
```

### 3.2 Report Period Display

```typescript
function formatReportPeriod(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return formatter.format(start);
}

// Example: "October 2025"
```

### 3.3 Report Status Badge

```typescript
function getReportStatusConfig(status: ReportStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        color: 'green',
        icon: 'check-circle',
      };
    case 'processing':
      return {
        label: 'Processing',
        color: 'blue',
        icon: 'loader',
      };
    case 'pending':
      return {
        label: 'Pending',
        color: 'yellow',
        icon: 'clock',
      };
    case 'failed':
      return {
        label: 'Failed',
        color: 'red',
        icon: 'x-circle',
      };
  }
}
```

### 3.4 Trend Analysis

```typescript
function analyzeTrend(trend: Array<{ date: string; rate: number }>): {
  direction: 'up' | 'down' | 'stable';
  change: number;
  message: string;
} {
  if (trend.length < 2) {
    return { direction: 'stable', change: 0, message: 'Insufficient data' };
  }

  const first = trend[0].rate;
  const last = trend[trend.length - 1].rate;
  const change = last - first;
  const percentChange = (change / first) * 100;

  if (Math.abs(percentChange) < 2) {
    return {
      direction: 'stable',
      change: percentChange,
      message: 'Adoption rate is stable',
    };
  }

  if (percentChange > 0) {
    return {
      direction: 'up',
      change: percentChange,
      message: `Adoption increased by ${percentChange.toFixed(1)}%`,
    };
  }

  return {
    direction: 'down',
    change: percentChange,
    message: `Adoption decreased by ${Math.abs(percentChange).toFixed(1)}%`,
  };
}
```

---

## 4. Error Handling

Same error patterns as other admin endpoints:

| Status Code | Meaning | Handling |
|-------------|---------|----------|
| `200` | Success | Process response |
| `400` | Bad request | Show validation error |
| `401` | Unauthorized | Redirect to login |
| `404` | Not found | Show "Report not found" |
| `500` | Server error | Show generic error |

---

## 5. Frontend Implementation Checklist

### 5.1 Pages to Build

- [ ] **Reports List** (`/admin/security/2fa/reports`)
  - [ ] Table of all reports
  - [ ] Filter by report type
  - [ ] Sort by date
  - [ ] Download actions
  - [ ] Generate new report button

- [ ] **Report Details** (`/admin/security/2fa/reports/{reportId}`)
  - [ ] Executive summary cards
  - [ ] Adoption trends chart
  - [ ] Authentication metrics
  - [ ] Security events breakdown
  - [ ] Recommendations list
  - [ ] Export buttons (JSON/CSV)

- [ ] **Generate Report** (`/admin/security/2fa/reports/generate`)
  - [ ] Month/year selector
  - [ ] Report type selector
  - [ ] Schedule options
  - [ ] Email recipients (for scheduled)

### 5.2 Components to Build

#### Reports List
- [ ] `ReportsList` - Table of reports
- [ ] `ReportStatusBadge` - Status indicator
- [ ] `ReportActions` - Download/view buttons
- [ ] `GenerateReportButton` - Open generation modal

#### Report Details
- [ ] `ExecutiveSummaryCards` - KPI cards
- [ ] `AdoptionTrendChart` - Line chart
- [ ] `AuthMethodBreakdown` - Pie/bar chart
- [ ] `SecurityEventsTimeline` - Timeline view
- [ ] `RecommendationsList` - Bulleted list
- [ ] `ExportButton` - Download in different formats

#### Report Generation
- [ ] `GenerateReportModal` - Generation form
- [ ] `MonthYearPicker` - Date selector
- [ ] `ScheduleReportForm` - Scheduling options
- [ ] `ReportTypeSelector` - Report type dropdown

### 5.3 API Client

```typescript
// lib/api/admin-2fa-reports.ts
export class Admin2FAReportsClient {
  private baseUrl = '/api/admin/2fa/reports';

  async listReports(options?: { reportType?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.reportType) params.append('reportType', options.reportType);
    if (options?.limit) params.append('limit', options.limit.toString());

    const response = await makeAdminRequest(
      `${this.baseUrl}?${params.toString()}`
    );
    return response.json();
  }

  async generateMonthlyReport(
    year: number,
    month: number
  ): Promise<GenerateReportResponse> {
    const response = await makeAdminRequest(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'monthly_security',
        year,
        month,
      }),
    });
    return response.json();
  }

  async scheduleRecurringReport(
    frequency: ReportFrequency,
    emailTo?: string[]
  ): Promise<ScheduleReportResponse> {
    const response = await makeAdminRequest(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reportType: 'monthly_security',
        schedule: {
          frequency,
          emailTo,
        },
      }),
    });
    return response.json();
  }

  async getReport(reportId: string): Promise<GetReportResponse> {
    const response = await makeAdminRequest(`${this.baseUrl}/${reportId}`);
    return response.json();
  }

  async downloadReportCSV(reportId: string): Promise<Blob> {
    const response = await makeAdminRequest(
      `${this.baseUrl}/${reportId}?format=csv`
    );
    return response.blob();
  }
}

export const admin2FAReportsClient = new Admin2FAReportsClient();
```

### 5.4 React Query Hooks

```typescript
// hooks/useAdmin2FAReports.ts
export function useReportsList(options?: { reportType?: string; limit?: number }) {
  return useQuery({
    queryKey: ['admin-2fa-reports', options],
    queryFn: () => admin2FAReportsClient.listReports(options),
    staleTime: 60000, // 1 minute
  });
}

export function useReport(reportId: string) {
  return useQuery({
    queryKey: ['admin-2fa-report', reportId],
    queryFn: () => admin2FAReportsClient.getReport(reportId),
    enabled: !!reportId,
    staleTime: 300000, // 5 minutes - reports don't change
  });
}

export function useGenerateMonthlyReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ year, month }: { year: number; month: number }) =>
      admin2FAReportsClient.generateMonthlyReport(year, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-2fa-reports'] });
    },
  });
}

export function useScheduleRecurringReport() {
  return useMutation({
    mutationFn: ({
      frequency,
      emailTo,
    }: {
      frequency: ReportFrequency;
      emailTo?: string[];
    }) => admin2FAReportsClient.scheduleRecurringReport(frequency, emailTo),
  });
}

export function useDownloadReportCSV() {
  return useMutation({
    mutationFn: (reportId: string) =>
      admin2FAReportsClient.downloadReportCSV(reportId),
    onSuccess: (blob, reportId) => {
      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `2fa-report-${reportId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
  });
}
```

### 5.5 Chart Implementation Examples

#### Adoption Trend Chart

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

function AdoptionTrendChart({ trend }: { trend: Array<{ date: string; rate: number }> }) {
  return (
    <LineChart width={600} height={300} data={trend}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis label={{ value: 'Adoption Rate (%)', angle: -90, position: 'insideLeft' }} />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="rate" stroke="#8884d8" name="Adoption Rate" />
    </LineChart>
  );
}
```

#### Authentication Method Breakdown

```typescript
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

function AuthMethodChart({
  byMethod,
}: {
  byMethod: { totp: number; sms: number; backupCode: number };
}) {
  const data = [
    { name: 'Authenticator', value: byMethod.totp },
    { name: 'SMS', value: byMethod.sms },
    { name: 'Backup Code', value: byMethod.backupCode },
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

  return (
    <PieChart width={400} height={300}>
      <Pie
        data={data}
        cx={200}
        cy={150}
        labelLine={false}
        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
        outerRadius={80}
        fill="#8884d8"
        dataKey="value"
      >
        {data.map((entry, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  );
}
```

---

## 6. UX Considerations

### 6.1 Report Generation Feedback

- Show loading spinner during generation
- Display estimated completion time
- Allow user to navigate away (generation continues in background)
- Show notification when complete

### 6.2 Report Download Options

Provide multiple format options:
- **JSON** - For developers and programmatic access
- **CSV** - For Excel/Sheets import and data analysis
- **PDF** - For formal reports and presentations (if available)

### 6.3 Report Visualization

- Use charts for trends (adoption, failure rate)
- Use cards for key metrics (adoption rate, total users)
- Use tables for detailed breakdowns (by role, by method)
- Use color coding for status (good/warning/critical)

### 6.4 Scheduled Reports

- Show next scheduled generation date
- Allow canceling/pausing schedules
- Show history of scheduled reports
- Email preview before sending

---

## 7. Related Documentation

- [Admin 2FA Management Integration Guide](./ADMIN_2FA_MANAGEMENT_FRONTEND_INTEGRATION.md) - Main admin 2FA features
- [Security & Audit Logs Integration Guide](./ADMIN_2FA_SECURITY_LOGS_FRONTEND_INTEGRATION.md) - Security dashboard and logs

---

## 8. Summary

This completes the Admin 2FA Management module documentation. The three guides cover:

1. **Main Admin 2FA Guide** - User management, resets, policies
2. **Security & Logs Guide** - Dashboard, events, alerts
3. **Reports & Compliance Guide** - Report generation and exports

All endpoints are REST-based, return JSON by default, and require admin authentication. The frontend should implement proper error handling, loading states, and user feedback for all operations.

---

**Document Version:** 1.0  
**Last Updated:** October 20, 2025  
**Maintained By:** Backend Team
