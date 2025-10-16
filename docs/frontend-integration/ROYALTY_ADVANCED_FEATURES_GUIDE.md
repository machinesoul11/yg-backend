# Royalty Run Advanced Features - Frontend Integration Guide

**Classification:** 🔒 ADMIN ONLY  
All advanced features are restricted to admin users only.

## Overview

This guide covers the advanced royalty system features including validation reports, rollback capabilities, dispute resolution, and administrative tools for run management.

---

## 1. Advanced API Endpoints

### 1.1 Run Validation Report

#### Endpoint
- **URL:** `GET /api/royalties/runs/{id}/validation`
- **Auth:** Admin required
- **Purpose:** Generate comprehensive validation report before locking run

#### Response Schema
```typescript
interface RunValidationResponse {
  success: boolean;
  data: {
    runId: string;
    status: RoyaltyRunStatus;
    periodStart: string;
    periodEnd: string;
    isValid: boolean;
    warnings: string[];
    errors: string[];
    summary: {
      totalRevenueCents: number;
      totalRoyaltiesCents: number;
      statementCount: number;
      licenseCount: number;
      creatorCount: number;
      disputedStatements: number;
    };
    breakdown: {
      revenueByAsset: Array<{
        assetId: string;
        assetTitle: string;
        revenueCents: number;
      }>;
      earningsByCreator: Array<{
        creatorId: string;
        creatorName: string;
        earningsCents: number;
        status: RoyaltyStatementStatus;
      }>;
      outliers: Array<{
        type: 'HIGH_EARNINGS' | 'ZERO_EARNINGS' | 'UNUSUAL_SHARE' | 'PRORATED_LICENSE';
        message: string;
        details: Record<string, any>;
      }>;
    };
    validationChecks: Array<{
      check: string;
      passed: boolean;
      message?: string;
    }>;
  };
}
```

### 1.2 Review Run (Admin Approval)

#### Endpoint
- **URL:** `POST /api/royalties/runs/{id}/review`
- **Auth:** Admin required
- **Purpose:** Admin review and approval workflow

#### Request Schema
```typescript
interface ReviewRunRequest {
  approve: boolean;
  reviewNotes?: string;     // Max 1000 chars
  overrideWarnings?: boolean; // Allow approval despite warnings
}
```

#### Response Schema
```typescript
interface ReviewRunResponse {
  success: boolean;
  data: {
    id: string;
    status: 'LOCKED' | 'CALCULATED'; // LOCKED if approved, stays CALCULATED if rejected
    reviewedAt: string;
    reviewedBy: {
      id: string;
      name: string;
      email: string;
    };
    reviewNotes?: string;
  };
  message: string;
}
```

### 1.3 Rollback Run

#### Endpoint
- **URL:** `POST /api/royalties/runs/{id}/rollback`
- **Auth:** Admin required
- **Purpose:** Rollback calculated or locked run to DRAFT state

#### Request Schema
```typescript
interface RollbackRunRequest {
  reason: string;           // Min 20 chars, max 1000 chars
  archiveData?: boolean;    // Default: true - preserve original data
  forceRollback?: boolean;  // Override safety checks (dangerous)
}
```

#### Response Schema
```typescript
interface RollbackRunResponse {
  success: boolean;
  data: {
    id: string;
    status: 'DRAFT';
    rolledBackAt: string;
    rolledBackBy: {
      id: string;
      name: string;
    };
    rollbackReason: string;
    archivedData?: {
      originalStatus: string;
      statementsArchived: number;
      linesArchived: number;
      archiveId: string;
    };
  };
  message: string;
}
```

### 1.4 Dispute Resolution (Admin)

#### Endpoint
- **URL:** `POST /api/royalties/statements/{id}/resolve`
- **Auth:** Admin required
- **Purpose:** Resolve creator disputes with optional adjustments

#### Request Schema
```typescript
interface ResolveDisputeRequest {
  resolution: string;        // Min 20 chars, max 1000 chars
  adjustmentCents?: number;  // Optional monetary adjustment
  adjustmentReason?: string; // Required if adjustmentCents provided
  notifyCreator?: boolean;   // Default: true
}
```

#### Response Schema
```typescript
interface ResolveDisputeResponse {
  success: boolean;
  data: {
    id: string;
    status: 'RESOLVED';
    resolvedAt: string;
    resolvedBy: {
      id: string;
      name: string;
    };
    resolution: string;
    originalEarningsCents: number;
    adjustedEarningsCents?: number;
    adjustmentCents?: number;
  };
  message: string;
}
```

### 1.5 Manual Calculation Trigger

#### Endpoint
- **URL:** `POST /api/royalties/runs/{id}/calculate`
- **Auth:** Admin required
- **Purpose:** Manually trigger calculation for DRAFT run

#### Request Schema
```typescript
interface TriggerCalculationRequest {
  forceRecalculation?: boolean; // Recalculate even if already calculated
}
```

#### Response Schema
```typescript
interface TriggerCalculationResponse {
  success: boolean;
  data: {
    id: string;
    status: 'PROCESSING';
    calculationTriggeredAt: string;
    estimatedCompletionTime?: string; // Based on license count
  };
  message: string;
}
```

### 1.6 Bulk Statement Actions

#### Endpoint
- **URL:** `POST /api/royalties/runs/{id}/statements/bulk`
- **Auth:** Admin required
- **Purpose:** Perform bulk actions on statements

#### Request Schema
```typescript
interface BulkStatementActionRequest {
  statementIds: string[];
  action: 'MARK_REVIEWED' | 'GENERATE_PDFS' | 'SEND_NOTIFICATIONS';
  parameters?: {
    notificationTemplate?: string; // For SEND_NOTIFICATIONS
    regeneratePDFs?: boolean;     // For GENERATE_PDFS
  };
}
```

#### Response Schema
```typescript
interface BulkStatementActionResponse {
  success: boolean;
  data: {
    processedCount: number;
    failedCount: number;
    results: Array<{
      statementId: string;
      success: boolean;
      error?: string;
    }>;
  };
  message: string;
}
```

---

## 2. TypeScript Type Definitions

### 2.1 Advanced Feature Types

```typescript
// Validation report types
export interface ValidationCheck {
  check: string;
  passed: boolean;
  message?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

export interface OutlierDetection {
  type: 'HIGH_EARNINGS' | 'ZERO_EARNINGS' | 'UNUSUAL_SHARE' | 'PRORATED_LICENSE';
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  details: {
    entityId: string;
    entityType: 'statement' | 'line' | 'license';
    value: number;
    threshold: number;
    deviation: number;
  };
}

// Rollback audit trail
export interface RollbackAudit {
  timestamp: string;
  reason: string;
  performedBy: string;
  originalState: {
    status: RoyaltyRunStatus;
    lockedAt: string | null;
    processedAt: string | null;
    totalRevenueCents: number;
    totalRoyaltiesCents: number;
    statementCount: number;
    statements: Array<{
      id: string;
      creatorId: string;
      totalEarningsCents: number;
      status: RoyaltyStatementStatus;
      lineCount: number;
    }>;
  };
}

// Dispute tracking
export interface DisputeHistory {
  disputedAt: string;
  disputedBy: string;
  reason: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  adjustmentCents?: number;
  timeline: Array<{
    timestamp: string;
    action: 'DISPUTED' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
    actor: string;
    note?: string;
  }>;
}
```

### 2.2 Validation Schemas

```typescript
import { z } from 'zod';

// Review run schema
export const reviewRunSchema = z.object({
  approve: z.boolean(),
  reviewNotes: z.string().max(1000).optional(),
  overrideWarnings: z.boolean().optional().default(false),
});

// Rollback run schema
export const rollbackRunSchema = z.object({
  reason: z
    .string()
    .min(20, 'Rollback reason must be at least 20 characters')
    .max(1000, 'Rollback reason must be at most 1000 characters'),
  archiveData: z.boolean().optional().default(true),
  forceRollback: z.boolean().optional().default(false),
});

// Resolve dispute schema
export const resolveDisputeSchema = z.object({
  resolution: z
    .string()
    .min(20, 'Resolution must be at least 20 characters')
    .max(1000, 'Resolution must be at most 1000 characters'),
  adjustmentCents: z.number().int().optional(),
  adjustmentReason: z.string().max(500).optional(),
  notifyCreator: z.boolean().optional().default(true),
});

// Bulk actions schema
export const bulkStatementActionSchema = z.object({
  statementIds: z.array(z.string().cuid()).min(1).max(100),
  action: z.enum(['MARK_REVIEWED', 'GENERATE_PDFS', 'SEND_NOTIFICATIONS']),
  parameters: z.record(z.any()).optional(),
});

export type ReviewRunInput = z.infer<typeof reviewRunSchema>;
export type RollbackRunInput = z.infer<typeof rollbackRunSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
export type BulkStatementActionInput = z.infer<typeof bulkStatementActionSchema>;
```

---

## 3. Business Logic & Validation Rules

### 3.1 Validation Report Logic

#### Critical Validation Checks
1. **Mathematical Consistency:** Total royalties = sum of all statements
2. **Ownership Integrity:** Asset ownership percentages = 100%  
3. **Revenue Accuracy:** All license revenue properly attributed
4. **Threshold Logic:** Minimum payout rules correctly applied
5. **Carryover Accuracy:** Previous unpaid balances correctly included

#### Warning Conditions
1. **High Variance:** Individual earnings >3x average
2. **Zero Earnings:** Active creators with no earnings
3. **Unusual Shares:** Ownership splits outside normal ranges
4. **Prorated Licenses:** Significant number of partial-period licenses

```typescript
const interpretValidationReport = (report: RunValidationResponse['data']) => {
  const criticalIssues = report.errors.length;
  const warnings = report.warnings.length;
  
  return {
    canLock: criticalIssues === 0,
    requiresReview: warnings > 0 || criticalIssues > 0,
    riskLevel: criticalIssues > 0 ? 'HIGH' : 
               warnings > 5 ? 'MEDIUM' : 'LOW',
    recommendation: criticalIssues > 0 
      ? 'Fix errors before proceeding'
      : warnings > 0 
      ? 'Review warnings carefully'
      : 'Safe to proceed',
  };
};
```

### 3.2 Rollback Safety Rules

#### Prerequisites for Rollback
1. **No Payments Processed:** All statements must be unpaid
2. **Admin Permission:** Only admin users can rollback
3. **Valid Reason:** Minimum 20 character explanation required
4. **State Validation:** Run must be CALCULATED or LOCKED

#### Data Preservation
```typescript
const rollbackSafeguards = {
  // Archive original data before rollback
  archiveOriginalData: true,
  
  // Preserve audit trail
  maintainAuditLog: true,
  
  // Prevent rollback if payments made
  blockIfPaid: true,
  
  // Require explicit confirmation for force rollback
  forceRollbackConfirmation: true,
};
```

### 3.3 Dispute Resolution Workflow

#### Status Progression
```
PENDING/REVIEWED → DISPUTED → UNDER_REVIEW → RESOLVED → PAID
```

#### Admin Resolution Actions
1. **Accept Dispute:** Provide adjustment and explanation
2. **Reject Dispute:** Explain why original calculation was correct
3. **Partial Accept:** Compromise solution with partial adjustment
4. **Escalate:** Forward to senior review (future enhancement)

---

## 4. Error Handling

### 4.1 Advanced Error Scenarios

#### Rollback Errors

**Cannot Rollback Paid Run (412)**
```typescript
{
  "success": false,
  "error": "Precondition Failed",
  "message": "Cannot rollback run run_abc123 because 5 statements have been paid. Rollback is only allowed before payout.",
  "code": "ROLLBACK_BLOCKED_PAID_STATEMENTS",
  "details": {
    "paidStatements": 5,
    "totalStatements": 25
  }
}
```

**Insufficient Rollback Permissions (403)**
```typescript
{
  "success": false,
  "error": "Forbidden",
  "message": "User user_xyz789 does not have permission to rollback royalty runs. This operation requires ADMIN role.",
  "code": "INSUFFICIENT_ROLLBACK_PERMISSIONS"
}
```

#### Validation Report Errors

**Run Not Ready for Validation (422)**
```typescript
{
  "success": false,
  "error": "Unprocessable Entity",
  "message": "Run must be in CALCULATED status for validation, currently PROCESSING",
  "code": "INVALID_VALIDATION_STATE"
}
```

### 4.2 Progressive Error Recovery

```typescript
const handleAdvancedAPIError = (error: APIError) => {
  switch (error.details.code) {
    case 'ROLLBACK_BLOCKED_PAID_STATEMENTS':
      return {
        title: 'Cannot Rollback Run',
        message: 'Some statements have already been paid. Contact finance team to reverse payments first.',
        actions: ['Contact Support', 'View Paid Statements'],
      };
      
    case 'INSUFFICIENT_ROLLBACK_PERMISSIONS':
      return {
        title: 'Permission Denied',
        message: 'You need admin privileges to rollback runs. Request access from your administrator.',
        actions: ['Request Access', 'Contact Admin'],
      };
      
    case 'VALIDATION_FAILED':
      return {
        title: 'Validation Issues Found',
        message: 'Critical errors detected in run calculations. Review and fix before proceeding.',
        actions: ['View Validation Report', 'Rollback Run', 'Contact Support'],
      };
      
    default:
      return {
        title: 'Operation Failed',
        message: error.message,
        actions: ['Retry', 'Contact Support'],
      };
  }
};
```

---

## 5. Real-time Updates

### 5.1 Advanced WebSocket Events

```typescript
interface AdvancedRoyaltyEvents {
  // Validation events
  'royalty.validation.started': {
    runId: string;
    estimatedDuration: number;
  };
  
  'royalty.validation.completed': {
    runId: string;
    isValid: boolean;
    errorCount: number;
    warningCount: number;
  };
  
  // Rollback events
  'royalty.rollback.initiated': {
    runId: string;
    initiatedBy: string;
    reason: string;
  };
  
  'royalty.rollback.completed': {
    runId: string;
    archivedData: boolean;
    statementsRemoved: number;
  };
  
  // Dispute events
  'royalty.dispute.created': {
    statementId: string;
    creatorId: string;
    reason: string;
  };
  
  'royalty.dispute.resolved': {
    statementId: string;
    resolvedBy: string;
    adjustmentCents?: number;
  };
  
  // Bulk operation events
  'royalty.bulk.started': {
    operationId: string;
    action: string;
    itemCount: number;
  };
  
  'royalty.bulk.progress': {
    operationId: string;
    completed: number;
    total: number;
    errors: number;
  };
  
  'royalty.bulk.completed': {
    operationId: string;
    successCount: number;
    errorCount: number;
  };
}
```

---

## 6. Frontend Implementation Examples

### 6.1 Validation Report Component

```typescript
import { useQuery } from '@tanstack/react-query';
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface ValidationReportProps {
  runId: string;
  onValidationComplete: (canProceed: boolean) => void;
}

export const ValidationReport: React.FC<ValidationReportProps> = ({ runId, onValidationComplete }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['validation-report', runId],
    queryFn: () => royaltyAPI.getValidationReport(runId),
    refetchInterval: (data) => data?.data.isValid ? false : 5000, // Poll until complete
  });

  useEffect(() => {
    if (data?.data) {
      onValidationComplete(data.data.isValid && data.data.errors.length === 0);
    }
  }, [data, onValidationComplete]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3">Running validation checks...</span>
      </div>
    );
  }

  if (error || !data?.success) {
    return <div className="text-red-600">Failed to generate validation report</div>;
  }

  const report = data.data;
  const interpretation = interpretValidationReport(report);

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className={`p-4 rounded-lg ${
        interpretation.riskLevel === 'HIGH' ? 'bg-red-50 border-red-200' :
        interpretation.riskLevel === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' :
        'bg-green-50 border-green-200'
      } border`}>
        <div className="flex items-center">
          {interpretation.riskLevel === 'HIGH' ? (
            <XCircleIcon className="w-6 h-6 text-red-600" />
          ) : interpretation.riskLevel === 'MEDIUM' ? (
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
          ) : (
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
          )}
          
          <div className="ml-3">
            <h3 className="font-semibold">
              {report.isValid ? 'Validation Passed' : 'Validation Issues Found'}
            </h3>
            <p>{interpretation.recommendation}</p>
          </div>
        </div>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(report.summary.totalRoyaltiesCents)}
          </div>
          <div className="text-sm text-gray-600">Total Royalties</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold">{report.summary.creatorCount}</div>
          <div className="text-sm text-gray-600">Creators</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold">{report.summary.statementCount}</div>
          <div className="text-sm text-gray-600">Statements</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-red-600">{report.summary.disputedStatements}</div>
          <div className="text-sm text-gray-600">Disputes</div>
        </div>
      </div>

      {/* Validation Checks */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Validation Checks</h3>
        </div>
        
        <div className="p-4 space-y-3">
          {report.validationChecks.map((check, index) => (
            <div key={index} className="flex items-start">
              {check.passed ? (
                <CheckCircleIcon className="w-5 h-5 text-green-500 mt-0.5" />
              ) : (
                <XCircleIcon className="w-5 h-5 text-red-500 mt-0.5" />
              )}
              
              <div className="ml-3 flex-1">
                <div className="font-medium">{check.check}</div>
                {check.message && (
                  <div className="text-sm text-gray-600">{check.message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Errors and Warnings */}
      {(report.errors.length > 0 || report.warnings.length > 0) && (
        <div className="space-y-4">
          {report.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 mb-2">
                Critical Issues ({report.errors.length})
              </h4>
              <ul className="space-y-1">
                {report.errors.map((error, index) => (
                  <li key={index} className="text-red-700 text-sm">• {error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {report.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">
                Warnings ({report.warnings.length})
              </h4>
              <ul className="space-y-1">
                {report.warnings.map((warning, index) => (
                  <li key={index} className="text-yellow-700 text-sm">• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Outliers */}
      {report.breakdown.outliers.length > 0 && (
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Unusual Items Detected</h3>
          </div>
          
          <div className="p-4 space-y-3">
            {report.breakdown.outliers.map((outlier, index) => (
              <div key={index} className="flex items-start">
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div className="ml-3">
                  <div className="font-medium">{outlier.message}</div>
                  <div className="text-sm text-gray-600">
                    Type: {outlier.type.replace('_', ' ').toLowerCase()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
```

### 6.2 Rollback Confirmation Modal

```typescript
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface RollbackModalProps {
  runId: string;
  runData: {
    periodStart: string;
    periodEnd: string;
    status: RoyaltyRunStatus;
    totalRoyaltiesCents: number;
    statementCount: number;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RollbackModal: React.FC<RollbackModalProps> = ({
  runId,
  runData,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [archiveData, setArchiveData] = useState(true);
  const [forceRollback, setForceRollback] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  const queryClient = useQueryClient();
  
  const rollbackMutation = useMutation({
    mutationFn: (data: RollbackRunInput) => royaltyAPI.rollbackRun(runId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['royalty-runs'] });
      queryClient.invalidateQueries({ queryKey: ['royalty-run', runId] });
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = () => {
    if (reason.length < 20) return;
    if (forceRollback && confirmationText !== 'FORCE ROLLBACK') return;
    
    rollbackMutation.mutate({
      reason,
      archiveData,
      forceRollback,
    });
  };

  const isValid = reason.length >= 20 && 
    (!forceRollback || confirmationText === 'FORCE ROLLBACK');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-screen overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-red-600 mb-4">
            ⚠️ Rollback Royalty Run
          </h2>
          
          {/* Run Information */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="font-medium mb-2">Run Details</h3>
            <div className="text-sm space-y-1">
              <div>Period: {format(new Date(runData.periodStart), 'MMM d, yyyy')} - {format(new Date(runData.periodEnd), 'MMM d, yyyy')}</div>
              <div>Status: {runData.status}</div>
              <div>Total Royalties: {formatCurrency(runData.totalRoyaltiesCents)}</div>
              <div>Statements: {runData.statementCount}</div>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
            <h4 className="font-medium text-red-800 mb-2">⚠️ This action will:</h4>
            <ul className="text-red-700 text-sm space-y-1">
              <li>• Reset the run status to DRAFT</li>
              <li>• Delete all calculated statements and line items</li>
              <li>• Remove creator notifications</li>
              <li>• Require recalculation before payments can be made</li>
              {archiveData && <li>• Archive original data for audit purposes</li>}
            </ul>
          </div>

          {/* Rollback Reason */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Rollback Reason *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this rollback is necessary (minimum 20 characters)..."
              className="w-full p-3 border rounded-lg"
              rows={4}
              maxLength={1000}
            />
            <div className="text-xs text-gray-500 mt-1">
              {reason.length}/1000 characters (minimum 20)
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4 mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={archiveData}
                onChange={(e) => setArchiveData(e.target.checked)}
                className="mr-2"
              />
              Archive original data for audit trail (recommended)
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={forceRollback}
                onChange={(e) => setForceRollback(e.target.checked)}
                className="mr-2"
              />
              Force rollback (bypass safety checks)
            </label>
          </div>

          {/* Force confirmation */}
          {forceRollback && (
            <div className="bg-red-100 border border-red-300 p-4 rounded-lg mb-6">
              <h4 className="font-medium text-red-800 mb-2">
                🚨 Force Rollback Confirmation
              </h4>
              <p className="text-red-700 text-sm mb-3">
                Force rollback bypasses safety checks and may cause data inconsistencies.
                Type <code className="bg-red-200 px-1">FORCE ROLLBACK</code> to confirm:
              </p>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="Type FORCE ROLLBACK"
                className="w-full p-2 border rounded"
              />
            </div>
          )}

          {/* Error Display */}
          {rollbackMutation.error && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
              <div className="text-red-800 font-medium">Rollback Failed</div>
              <div className="text-red-600 text-sm">
                {rollbackMutation.error.message}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={rollbackMutation.isPending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSubmit}
              disabled={!isValid || rollbackMutation.isPending}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rollbackMutation.isPending ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Rolling back...
                </div>
              ) : (
                'Rollback Run'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### 6.3 Admin Dashboard Integration

```typescript
export const AdminRoyaltyDashboard: React.FC = () => {
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showRollback, setShowRollback] = useState(false);

  const { data: runs } = useRoyaltyRuns({});
  const { data: runDetails } = useRunDetails(selectedRun!);

  const handleRunAction = async (runId: string, action: string) => {
    setSelectedRun(runId);
    
    switch (action) {
      case 'validate':
        setShowValidation(true);
        break;
      case 'rollback':
        setShowRollback(true);
        break;
      case 'lock':
        // Direct API call for simple actions
        await royaltyAPI.lockRun(runId);
        break;
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Active Runs"
          value={runs?.data.filter(r => ['DRAFT', 'PROCESSING', 'CALCULATED'].includes(r.status)).length || 0}
          trend="+2 from last month"
        />
        <StatCard
          title="Pending Review"
          value={runs?.data.filter(r => r.status === 'CALCULATED').length || 0}
          trend="Requires attention"
        />
        <StatCard
          title="Total Royalties (YTD)"
          value={formatCurrency(runs?.data.reduce((sum, r) => sum + r.totalRoyaltiesCents, 0) || 0)}
          trend="+15% from last year"
        />
        <StatCard
          title="Disputed Statements"
          value={42} // Would come from separate API
          trend="2 resolved this week"
        />
      </div>

      {/* Runs Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Royalty Runs</h2>
          <RunsTable
            runs={runs?.data || []}
            onActionClick={handleRunAction}
          />
        </div>
      </div>

      {/* Modals */}
      {showValidation && selectedRun && (
        <ValidationModal
          runId={selectedRun}
          isOpen={showValidation}
          onClose={() => setShowValidation(false)}
        />
      )}
      
      {showRollback && selectedRun && runDetails && (
        <RollbackModal
          runId={selectedRun}
          runData={runDetails.data}
          isOpen={showRollback}
          onClose={() => setShowRollback(false)}
          onSuccess={() => {
            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['royalty-runs'] });
          }}
        />
      )}
    </div>
  );
};
```

---

## 7. Testing Guidelines

### 7.1 Unit Test Examples

```typescript
describe('Royalty Run Advanced Features', () => {
  describe('Validation Report', () => {
    it('should identify mathematical inconsistencies', async () => {
      const report = await generateValidationReport(mockRunWithInconsistentTotals);
      
      expect(report.isValid).toBe(false);
      expect(report.errors).toContain(
        expect.stringContaining('Mathematical inconsistency detected')
      );
    });

    it('should detect ownership split errors', async () => {
      const report = await generateValidationReport(mockRunWithInvalidOwnership);
      
      expect(report.validationChecks).toContainEqual({
        check: 'Ownership Integrity',
        passed: false,
        message: expect.stringContaining('ownership percentages do not sum to 100%')
      });
    });
  });

  describe('Rollback Operations', () => {
    it('should prevent rollback of paid runs', async () => {
      await expect(
        rollbackRun(mockPaidRunId, { reason: 'Test rollback' })
      ).rejects.toThrow('Cannot rollback run because payments have been processed');
    });

    it('should archive data during rollback', async () => {
      const result = await rollbackRun(mockRunId, {
        reason: 'Test rollback with archiving',
        archiveData: true
      });
      
      expect(result.archivedData).toBeDefined();
      expect(result.archivedData.statementsArchived).toBeGreaterThan(0);
    });
  });
});
```

### 7.2 Integration Test Scenarios

```typescript
describe('End-to-End Royalty Workflow', () => {
  it('should handle complete admin workflow', async () => {
    // Create run
    const run = await createRoyaltyRun({
      periodStart: '2025-01-01T00:00:00Z',
      periodEnd: '2025-01-31T23:59:59Z',
      notes: 'January 2025 test run'
    });

    // Wait for calculation
    await waitForCalculation(run.id);

    // Generate validation report
    const report = await getValidationReport(run.id);
    expect(report.isValid).toBe(true);

    // Review and approve
    await reviewRun(run.id, {
      approve: true,
      reviewNotes: 'Validation passed, proceeding with lock'
    });

    // Verify locked status
    const finalRun = await getRun(run.id);
    expect(finalRun.status).toBe('LOCKED');
  });
});
```

---

## 8. Performance Considerations

### 8.1 Optimization Strategies

#### Large Run Handling
- Paginate validation reports for runs with >1000 statements
- Stream calculation progress updates via WebSocket
- Implement background processing for validation checks
- Cache validation results for 15 minutes

#### Memory Management
```typescript
// Virtualized lists for large datasets
const VirtualizedStatementsList = () => {
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['statements', runId],
    queryFn: ({ pageParam = 0 }) => 
      statementsAPI.list({ page: pageParam, limit: 50 }),
    getNextPageParam: (lastPage) => 
      lastPage.pagination.hasNextPage ? lastPage.pagination.page + 1 : undefined,
  });

  return (
    <VirtualList
      items={data?.pages.flatMap(page => page.data) || []}
      itemHeight={80}
      onEndReached={() => hasNextPage && fetchNextPage()}
    />
  );
};
```

### 8.2 Caching Strategy

```typescript
const cacheConfig = {
  // Short-lived cache for active operations
  activeOperations: '30s',
  
  // Medium cache for calculation results
  calculationResults: '5m',
  
  // Long cache for historical data
  historicalRuns: '1h',
  
  // Validation reports (expensive to generate)
  validationReports: '15m',
  
  // Statement lists (frequently accessed)
  statementLists: '2m',
};
```

---

This completes the comprehensive Frontend Integration Guide for the Royalty Run Service module. The three documents cover:

1. **Core Run Management** - Basic CRUD operations, authentication, pagination
2. **Statement Management** - Creator/admin interfaces, PDF generation, disputes  
3. **Advanced Features** - Validation, rollback, dispute resolution, admin tools

Each document provides complete TypeScript definitions, API schemas, error handling patterns, and real-world implementation examples that the frontend team can use directly without requiring clarification.
