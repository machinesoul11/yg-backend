# License Validation - Frontend Integration Guide (Part 3: Implementation & Checklist)

**Classification:** ⚡ HYBRID  
*License validation happens on both website (brand ↔ creator) and admin backend. Core logic is shared, admin has additional management tools.*

---

## Table of Contents

**Part 1:** API Endpoints & TypeScript Types  
**Part 2:** Business Logic, Validation Rules & Error Handling  
**Part 3 (This Document):** Implementation Examples & Checklist

---

## Implementation Examples

### 1. React Query Setup

**API Client Layer:**

```typescript
// lib/api/licenses.ts
import { trpc } from '@/lib/trpc';
import type { 
  ConflictCheckInput, 
  CreateLicenseInput, 
  LicenseValidationResult 
} from '@/types/licenses';

export const licensesApi = {
  /**
   * Check for license conflicts (lightweight pre-validation)
   */
  checkConflicts: async (input: ConflictCheckInput) => {
    const result = await trpc.licenses.checkConflicts.query(input);
    return result.data;
  },

  /**
   * Create license with full validation
   */
  createLicense: async (input: CreateLicenseInput) => {
    const result = await trpc.licenses.create.mutate(input);
    return result.data;
  },
};
```

**React Query Hooks:**

```typescript
// hooks/useLicenseValidation.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { licensesApi } from '@/lib/api/licenses';
import type { ConflictCheckInput, CreateLicenseInput } from '@/types/licenses';

/**
 * Check for license conflicts in real-time
 * Debounced on the consumer side
 */
export function useConflictCheck(input: ConflictCheckInput | null, enabled = true) {
  return useQuery({
    queryKey: ['licenses', 'conflicts', input],
    queryFn: () => input ? licensesApi.checkConflicts(input) : null,
    enabled: enabled && !!input,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
  });
}

/**
 * Create a new license
 */
export function useCreateLicense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: licensesApi.createLicense,
    onSuccess: (data) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['licenses'] });
      queryClient.invalidateQueries({ queryKey: ['licenses', 'conflicts'] });
      
      // Show success notification
      toast.success('License created successfully! Awaiting approvals.');
    },
    onError: (error: any) => {
      // Handle validation errors
      if (error.code === 'BAD_REQUEST' || error.code === 'CONFLICT') {
        const validationErrors = error.data?.validationErrors || [error.message];
        toast.error(`Validation failed: ${validationErrors[0]}`);
      } else {
        toast.error('Failed to create license. Please try again.');
      }
    },
  });
}

/**
 * Combined validation hook - checks all six validation checks
 */
export function useLicenseValidation(input: CreateLicenseInput | null, enabled = true) {
  // This would call a dedicated validation endpoint if available
  // For now, we use conflict check + client-side validation
  
  return useQuery({
    queryKey: ['licenses', 'validate', input],
    queryFn: async () => {
      if (!input) return null;
      
      // Run conflict check
      const conflicts = await licensesApi.checkConflicts({
        ipAssetId: input.ipAssetId,
        startDate: input.startDate,
        endDate: input.endDate,
        licenseType: input.licenseType,
        scope: input.scope,
      });
      
      // Client-side validations
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validate scope
      if (!hasAtLeastOneMedia(input.scope)) {
        errors.push('At least one media type must be selected');
      }
      
      if (!hasAtLeastOnePlacement(input.scope)) {
        errors.push('At least one placement must be selected');
      }
      
      // Validate dates
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      
      if (end <= start) {
        errors.push('End date must be after start date');
      }
      
      if (start < new Date()) {
        warnings.push('License start date is in the past');
      }
      
      return {
        valid: errors.length === 0 && !conflicts.hasConflicts,
        errors,
        warnings,
        conflicts: conflicts.conflicts,
      };
    },
    enabled: enabled && !!input,
    staleTime: 10000, // Cache for 10 seconds
  });
}

// Helper functions
function hasAtLeastOneMedia(scope: LicenseScope): boolean {
  return scope.media.digital || scope.media.print || 
         scope.media.broadcast || scope.media.ooh;
}

function hasAtLeastOnePlacement(scope: LicenseScope): boolean {
  return scope.placement.social || scope.placement.website || 
         scope.placement.email || scope.placement.paid_ads || 
         scope.placement.packaging;
}
```

---

### 2. License Creation Form Component

```tsx
// components/licenses/CreateLicenseForm.tsx
import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDebounce } from '@/hooks/useDebounce';
import { useConflictCheck, useCreateLicense } from '@/hooks/useLicenseValidation';
import type { CreateLicenseInput, LicenseScope } from '@/types/licenses';

// Zod schema for form validation
const licenseFormSchema = z.object({
  ipAssetId: z.string().cuid('Invalid IP Asset ID'),
  brandId: z.string().cuid('Invalid Brand ID'),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  feeCents: z.number().int().min(0, 'Fee cannot be negative'),
  revShareBps: z.number().int().min(0).max(10000, 'Revenue share must be between 0-100%'),
  scope: z.object({
    media: z.object({
      digital: z.boolean(),
      print: z.boolean(),
      broadcast: z.boolean(),
      ooh: z.boolean(),
    }),
    placement: z.object({
      social: z.boolean(),
      website: z.boolean(),
      email: z.boolean(),
      paid_ads: z.boolean(),
      packaging: z.boolean(),
    }),
    geographic: z.object({
      territories: z.array(z.string()).min(1, 'Select at least one territory'),
    }).optional(),
    exclusivity: z.object({
      category: z.string().optional(),
      competitors: z.array(z.string().cuid()).optional(),
    }).optional(),
    cutdowns: z.object({
      allowEdits: z.boolean(),
      maxDuration: z.number().optional(),
      aspectRatios: z.array(z.string()).optional(),
    }).optional(),
    attribution: z.object({
      required: z.boolean(),
      format: z.string().optional(),
    }).optional(),
  }),
  autoRenew: z.boolean().default(false),
});

type LicenseFormData = z.infer<typeof licenseFormSchema>;

interface CreateLicenseFormProps {
  ipAssetId: string;
  brandId: string;
  onSuccess?: (license: any) => void;
  onCancel?: () => void;
}

export function CreateLicenseForm({ 
  ipAssetId, 
  brandId, 
  onSuccess, 
  onCancel 
}: CreateLicenseFormProps) {
  const [showApprovalWorkflow, setShowApprovalWorkflow] = useState(false);
  
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LicenseFormData>({
    resolver: zodResolver(licenseFormSchema),
    defaultValues: {
      ipAssetId,
      brandId,
      licenseType: 'NON_EXCLUSIVE',
      feeCents: 0,
      revShareBps: 0,
      scope: {
        media: {
          digital: true,
          print: false,
          broadcast: false,
          ooh: false,
        },
        placement: {
          social: true,
          website: false,
          email: false,
          paid_ads: false,
          packaging: false,
        },
      },
      autoRenew: false,
    },
  });

  // Watch form values for real-time validation
  const formValues = watch();
  
  // Debounce conflict check to avoid excessive API calls
  const debouncedFormValues = useDebounce(formValues, 500);
  
  // Prepare conflict check input
  const conflictCheckInput = useMemo(() => {
    if (!debouncedFormValues.startDate || !debouncedFormValues.endDate) {
      return null;
    }
    
    return {
      ipAssetId: debouncedFormValues.ipAssetId,
      startDate: debouncedFormValues.startDate,
      endDate: debouncedFormValues.endDate,
      licenseType: debouncedFormValues.licenseType,
      scope: debouncedFormValues.scope,
    };
  }, [debouncedFormValues]);
  
  // Real-time conflict checking
  const { data: conflictData, isLoading: isCheckingConflicts } = useConflictCheck(
    conflictCheckInput,
    !!conflictCheckInput
  );
  
  // Create license mutation
  const createLicense = useCreateLicense();

  // Handle form submission
  const onSubmit = async (data: LicenseFormData) => {
    try {
      const license = await createLicense.mutateAsync(data as CreateLicenseInput);
      
      if (onSuccess) {
        onSuccess(license);
      }
    } catch (error) {
      // Error handling is done in the mutation hook
      console.error('Failed to create license:', error);
    }
  };

  // Compute form validation state
  const hasConflicts = conflictData?.hasConflicts || false;
  const hasFormErrors = Object.keys(errors).length > 0;
  const canSubmit = !hasConflicts && !hasFormErrors && !createLicense.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold">Create License</h2>
        <p className="text-gray-600">
          Define the terms and scope of the license agreement
        </p>
      </div>

      {/* License Type */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">License Type</label>
        <select 
          {...register('licenseType')}
          className="w-full border rounded-md px-3 py-2"
        >
          <option value="NON_EXCLUSIVE">Non-Exclusive</option>
          <option value="EXCLUSIVE">Exclusive</option>
          <option value="EXCLUSIVE_TERRITORY">Exclusive Territory</option>
        </select>
        {errors.licenseType && (
          <p className="text-red-500 text-sm">{errors.licenseType.message}</p>
        )}
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Start Date</label>
          <input 
            type="datetime-local"
            {...register('startDate')}
            className="w-full border rounded-md px-3 py-2"
          />
          {errors.startDate && (
            <p className="text-red-500 text-sm">{errors.startDate.message}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">End Date</label>
          <input 
            type="datetime-local"
            {...register('endDate')}
            className="w-full border rounded-md px-3 py-2"
          />
          {errors.endDate && (
            <p className="text-red-500 text-sm">{errors.endDate.message}</p>
          )}
        </div>
      </div>

      {/* Conflict Indicator */}
      {isCheckingConflicts && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm">Checking for conflicts...</span>
        </div>
      )}
      
      {conflictData && conflictData.hasConflicts && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start gap-2">
            <AlertIcon className="text-red-500 mt-1" />
            <div className="flex-1">
              <h4 className="font-medium text-red-900">License Conflicts Detected</h4>
              <ul className="mt-2 space-y-1">
                {conflictData.conflicts.map((conflict, idx) => (
                  <li key={idx} className="text-sm text-red-700">
                    • {conflict.details}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Pricing */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">License Fee (USD)</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500">$</span>
            <input 
              type="number"
              step="0.01"
              {...register('feeCents', { 
                setValueAs: (v) => Math.round(parseFloat(v || '0') * 100)
              })}
              className="w-full border rounded-md px-8 py-2"
              placeholder="0.00"
            />
          </div>
          {errors.feeCents && (
            <p className="text-red-500 text-sm">{errors.feeCents.message}</p>
          )}
        </div>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">Revenue Share (%)</label>
          <div className="relative">
            <input 
              type="number"
              step="0.01"
              {...register('revShareBps', {
                setValueAs: (v) => Math.round(parseFloat(v || '0') * 100)
              })}
              className="w-full border rounded-md px-3 py-2"
              placeholder="0.00"
            />
            <span className="absolute right-3 top-2.5 text-gray-500">%</span>
          </div>
          {errors.revShareBps && (
            <p className="text-red-500 text-sm">{errors.revShareBps.message}</p>
          )}
        </div>
      </div>

      {/* Media Types */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Media Types *</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.media.digital')} />
            <span>Digital</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.media.print')} />
            <span>Print</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.media.broadcast')} />
            <span>Broadcast</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.media.ooh')} />
            <span>Out-of-Home</span>
          </label>
        </div>
        {!hasAtLeastOneMedia(formValues.scope) && (
          <p className="text-red-500 text-sm">Select at least one media type</p>
        )}
      </div>

      {/* Placements */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Placements *</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.placement.social')} />
            <span>Social Media</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.placement.website')} />
            <span>Website</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.placement.email')} />
            <span>Email Marketing</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.placement.paid_ads')} />
            <span>Paid Ads</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('scope.placement.packaging')} />
            <span>Packaging</span>
          </label>
        </div>
        {!hasAtLeastOnePlacement(formValues.scope) && (
          <p className="text-red-500 text-sm">Select at least one placement</p>
        )}
      </div>

      {/* Attribution */}
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('scope.attribution.required')} />
          <span className="font-medium">Require Attribution</span>
        </label>
        
        {formValues.scope.attribution?.required && (
          <div className="ml-6 space-y-2">
            <label className="block text-sm text-gray-600">Attribution Format</label>
            <input 
              type="text"
              {...register('scope.attribution.format')}
              placeholder='e.g., "Photo by @creator"'
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
        )}
      </div>

      {/* Auto-Renewal */}
      <div>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('autoRenew')} />
          <span className="font-medium">Enable Auto-Renewal</span>
        </label>
        <p className="text-sm text-gray-600 ml-6 mt-1">
          Automatically generate renewal offer 60 days before expiration
        </p>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {createLicense.isPending && <Spinner size="sm" />}
          {createLicense.isPending ? 'Creating...' : 'Create License'}
        </button>
      </div>
    </form>
  );
}

// Helper functions
function hasAtLeastOneMedia(scope: LicenseScope): boolean {
  return scope.media.digital || scope.media.print || 
         scope.media.broadcast || scope.media.ooh;
}

function hasAtLeastOnePlacement(scope: LicenseScope): boolean {
  return scope.placement.social || scope.placement.website || 
         scope.placement.email || scope.placement.paid_ads || 
         scope.placement.packaging;
}
```

---

### 3. Conflict Display Component

```tsx
// components/licenses/ConflictAlert.tsx
import type { Conflict } from '@/types/licenses';

interface ConflictAlertProps {
  conflicts: Conflict[];
}

export function ConflictAlert({ conflicts }: ConflictAlertProps) {
  if (conflicts.length === 0) return null;

  const getConflictIcon = (reason: Conflict['reason']) => {
    switch (reason) {
      case 'EXCLUSIVE_OVERLAP':
        return '🚫';
      case 'TERRITORY_OVERLAP':
        return '🌍';
      case 'COMPETITOR_BLOCKED':
        return '⛔';
      case 'DATE_OVERLAP':
        return '📅';
      default:
        return '⚠️';
    }
  };

  const getConflictColor = (reason: Conflict['reason']) => {
    switch (reason) {
      case 'EXCLUSIVE_OVERLAP':
      case 'COMPETITOR_BLOCKED':
        return 'bg-red-50 border-red-200 text-red-900';
      case 'TERRITORY_OVERLAP':
        return 'bg-orange-50 border-orange-200 text-orange-900';
      case 'DATE_OVERLAP':
        return 'bg-yellow-50 border-yellow-200 text-yellow-900';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-900';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-red-900 font-medium">
        <AlertTriangleIcon className="w-5 h-5" />
        <span>License Conflicts Detected</span>
      </div>
      
      <div className="space-y-2">
        {conflicts.map((conflict, idx) => (
          <div
            key={idx}
            className={`border rounded-md p-3 ${getConflictColor(conflict.reason)}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{getConflictIcon(conflict.reason)}</span>
              <div className="flex-1">
                <p className="font-medium capitalize">
                  {conflict.reason.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-sm mt-1">{conflict.details}</p>
                
                {conflict.conflictingLicense && (
                  <div className="mt-2 text-xs space-y-1">
                    <p>
                      <span className="font-medium">Conflicting License:</span>{' '}
                      {conflict.conflictingLicense.id}
                    </p>
                    <p>
                      <span className="font-medium">Period:</span>{' '}
                      {new Date(conflict.conflictingLicense.startDate).toLocaleDateString()} -{' '}
                      {new Date(conflict.conflictingLicense.endDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> Adjust your license dates, scope, or exclusivity settings to resolve conflicts.
        </p>
      </div>
    </div>
  );
}
```

---

### 4. Approval Workflow Display

```tsx
// components/licenses/ApprovalWorkflow.tsx
import type { ApprovalRequirement } from '@/types/licenses';

interface ApprovalWorkflowProps {
  approvalDetails: ApprovalRequirement;
}

export function ApprovalWorkflow({ approvalDetails }: ApprovalWorkflowProps) {
  if (!approvalDetails.required) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-md p-4">
        <div className="flex items-center gap-2 text-green-900">
          <CheckCircleIcon className="w-5 h-5" />
          <span className="font-medium">No additional approvals required</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h3 className="font-semibold text-lg">Approval Workflow</h3>
        <p className="text-sm text-gray-600">
          This license requires approval from the following parties
        </p>
      </div>

      {/* Approval Steps */}
      <div className="space-y-3">
        {approvalDetails.approvers.map((approver, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 border rounded-md bg-gray-50"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-medium">
              {idx + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">
                  {approver.type === 'creator' && '🎨 Creator'}
                  {approver.type === 'brand' && '🏢 Brand'}
                  {approver.type === 'admin' && '⚙️ Admin'}
                </span>
                {approver.name && (
                  <span className="text-sm text-gray-600">({approver.name})</span>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {getApproverDescription(approver.type)}
              </p>
            </div>
            <div className="flex-shrink-0">
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                Pending
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reasons */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="font-medium text-blue-900 mb-2">Why approvals are required:</h4>
        <ul className="space-y-1">
          {approvalDetails.reasons.map((reason, idx) => (
            <li key={idx} className="text-sm text-blue-800">
              • {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Timeline Estimate */}
      <div className="text-sm text-gray-600">
        <ClockIcon className="w-4 h-4 inline mr-1" />
        <span>Estimated approval time: 2-5 business days</span>
      </div>
    </div>
  );
}

function getApproverDescription(type: 'creator' | 'brand' | 'admin'): string {
  switch (type) {
    case 'creator':
      return 'IP asset owner approval required';
    case 'brand':
      return 'Brand representative approval required';
    case 'admin':
      return 'Platform admin review required';
    default:
      return 'Approval required';
  }
}
```

---

## Error Handling Strategy

### 1. Error Categories

```typescript
// lib/errors/licenseErrors.ts
export class LicenseValidationError extends Error {
  constructor(
    public code: string,
    public validationErrors: string[],
    public warnings: string[],
    public conflicts: Conflict[]
  ) {
    super('License validation failed');
    this.name = 'LicenseValidationError';
  }
}

export class LicenseConflictError extends Error {
  constructor(public conflicts: Conflict[]) {
    super('License conflicts detected');
    this.name = 'LicenseConflictError';
  }
}

export function parseLicenseError(error: any): {
  type: 'validation' | 'conflict' | 'permission' | 'unknown';
  message: string;
  errors: string[];
  warnings: string[];
  conflicts: Conflict[];
} {
  if (error.code === 'BAD_REQUEST') {
    return {
      type: 'validation',
      message: 'License validation failed',
      errors: error.data?.validationErrors || [error.message],
      warnings: error.data?.warnings || [],
      conflicts: [],
    };
  }

  if (error.code === 'CONFLICT') {
    return {
      type: 'conflict',
      message: 'License conflicts with existing agreements',
      errors: [],
      warnings: [],
      conflicts: error.cause || [],
    };
  }

  if (error.code === 'FORBIDDEN') {
    return {
      type: 'permission',
      message: error.message || 'You do not have permission to create this license',
      errors: [],
      warnings: [],
      conflicts: [],
    };
  }

  return {
    type: 'unknown',
    message: error.message || 'An unexpected error occurred',
    errors: [],
    warnings: [],
    conflicts: [],
  };
}
```

### 2. Error Display Component

```tsx
// components/licenses/LicenseErrorDisplay.tsx
import { parseLicenseError } from '@/lib/errors/licenseErrors';
import { ConflictAlert } from './ConflictAlert';

interface LicenseErrorDisplayProps {
  error: any;
  onRetry?: () => void;
}

export function LicenseErrorDisplay({ error, onRetry }: LicenseErrorDisplayProps) {
  const parsed = parseLicenseError(error);

  return (
    <div className="space-y-4">
      {/* Validation Errors */}
      {parsed.type === 'validation' && parsed.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start gap-2">
            <XCircleIcon className="text-red-500 w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-900">Validation Failed</h4>
              <ul className="mt-2 space-y-1">
                {parsed.errors.map((err, idx) => (
                  <li key={idx} className="text-sm text-red-700">
                    • {err}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {parsed.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="text-yellow-600 w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-yellow-900">Warnings</h4>
              <ul className="mt-2 space-y-1">
                {parsed.warnings.map((warning, idx) => (
                  <li key={idx} className="text-sm text-yellow-700">
                    • {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Conflicts */}
      {parsed.type === 'conflict' && parsed.conflicts.length > 0 && (
        <ConflictAlert conflicts={parsed.conflicts} />
      )}

      {/* Permission Errors */}
      {parsed.type === 'permission' && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start gap-2">
            <LockIcon className="text-red-500 w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-900">Permission Denied</h4>
              <p className="text-sm text-red-700 mt-1">{parsed.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Unknown Errors */}
      {parsed.type === 'unknown' && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <div className="flex items-start gap-2">
            <AlertCircleIcon className="text-gray-500 w-5 h-5 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">An Error Occurred</h4>
              <p className="text-sm text-gray-700 mt-1">{parsed.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Retry Button */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
```

---

## Testing Recommendations

### 1. Unit Tests (Jest + React Testing Library)

```typescript
// __tests__/components/CreateLicenseForm.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateLicenseForm } from '@/components/licenses/CreateLicenseForm';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('CreateLicenseForm', () => {
  it('validates date range - end date must be after start date', async () => {
    const user = userEvent.setup();
    
    render(
      <CreateLicenseForm 
        ipAssetId="c123" 
        brandId="cbrand123" 
      />, 
      { wrapper }
    );

    // Set end date before start date
    const startDateInput = screen.getByLabelText(/start date/i);
    const endDateInput = screen.getByLabelText(/end date/i);

    await user.type(startDateInput, '2025-12-31T00:00');
    await user.type(endDateInput, '2025-01-01T00:00');

    // Try to submit
    const submitButton = screen.getByRole('button', { name: /create license/i });
    await user.click(submitButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/end date must be after start date/i)).toBeInTheDocument();
    });
  });

  it('requires at least one media type', async () => {
    const user = userEvent.setup();
    
    render(
      <CreateLicenseForm 
        ipAssetId="c123" 
        brandId="cbrand123" 
      />, 
      { wrapper }
    );

    // Uncheck all media types
    const digitalCheckbox = screen.getByLabelText(/digital/i);
    await user.click(digitalCheckbox); // Uncheck default

    // Try to submit
    const submitButton = screen.getByRole('button', { name: /create license/i });
    await user.click(submitButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText(/select at least one media type/i)).toBeInTheDocument();
    });
  });

  it('shows conflict alert when conflicts are detected', async () => {
    // Mock conflict check to return conflicts
    const mockConflicts = {
      hasConflicts: true,
      conflicts: [
        {
          licenseId: 'clic123',
          reason: 'EXCLUSIVE_OVERLAP',
          details: 'Exclusive license conflict',
        },
      ],
    };

    // ... setup mock and render
    
    await waitFor(() => {
      expect(screen.getByText(/license conflicts detected/i)).toBeInTheDocument();
      expect(screen.getByText(/exclusive license conflict/i)).toBeInTheDocument();
    });
  });
});
```

### 2. Integration Tests

```typescript
// __tests__/integration/licenseValidation.test.ts
import { trpc } from '@/lib/trpc';

describe('License Validation Integration', () => {
  it('validates complete license creation flow', async () => {
    // 1. Check conflicts (should pass)
    const conflictResult = await trpc.licenses.checkConflicts.query({
      ipAssetId: 'test-asset-1',
      startDate: '2025-06-01T00:00:00Z',
      endDate: '2025-12-31T23:59:59Z',
      licenseType: 'NON_EXCLUSIVE',
      scope: {
        media: { digital: true, print: false, broadcast: false, ooh: false },
        placement: { social: true, website: true, email: false, paid_ads: false, packaging: false },
      },
    });

    expect(conflictResult.data.hasConflicts).toBe(false);

    // 2. Create license (should succeed)
    const license = await trpc.licenses.create.mutate({
      ipAssetId: 'test-asset-1',
      brandId: 'test-brand-1',
      licenseType: 'NON_EXCLUSIVE',
      startDate: '2025-06-01T00:00:00Z',
      endDate: '2025-12-31T23:59:59Z',
      feeCents: 500000,
      revShareBps: 0,
      scope: {
        media: { digital: true, print: false, broadcast: false, ooh: false },
        placement: { social: true, website: true, email: false, paid_ads: false, packaging: false },
      },
    });

    expect(license.data.status).toBe('PENDING_APPROVAL');
  });

  it('blocks creation when exclusive license exists', async () => {
    // Create exclusive license first
    await trpc.licenses.create.mutate({
      ipAssetId: 'test-asset-2',
      brandId: 'test-brand-1',
      licenseType: 'EXCLUSIVE',
      startDate: '2025-06-01T00:00:00Z',
      endDate: '2025-12-31T23:59:59Z',
      feeCents: 1000000,
      revShareBps: 0,
      scope: {
        media: { digital: true, print: true, broadcast: true, ooh: true },
        placement: { social: true, website: true, email: true, paid_ads: true, packaging: true },
      },
    });

    // Try to create overlapping license (should fail)
    await expect(
      trpc.licenses.create.mutate({
        ipAssetId: 'test-asset-2',
        brandId: 'test-brand-2',
        licenseType: 'NON_EXCLUSIVE',
        startDate: '2025-08-01T00:00:00Z',
        endDate: '2025-10-31T23:59:59Z',
        feeCents: 300000,
        revShareBps: 0,
        scope: {
          media: { digital: true, print: false, broadcast: false, ooh: false },
          placement: { social: true, website: false, email: false, paid_ads: false, packaging: false },
        },
      })
    ).rejects.toThrow(/exclusive license/i);
  });
});
```

---

## Frontend Implementation Checklist

### Phase 1: Setup & Basic Validation
- [ ] Install dependencies (`@tanstack/react-query`, `zod`, `@hookform/react-hook-form`)
- [ ] Copy TypeScript type definitions to frontend codebase
- [ ] Set up tRPC client with authentication
- [ ] Create API client layer (`lib/api/licenses.ts`)
- [ ] Implement basic form with Zod validation
- [ ] Add date picker components
- [ ] Implement media type & placement checkboxes

### Phase 2: Real-Time Conflict Checking
- [ ] Create `useConflictCheck` hook with React Query
- [ ] Add debounce utility for form inputs
- [ ] Implement conflict alert component
- [ ] Show loading state during conflict checks
- [ ] Cache conflict check results (30 seconds)
- [ ] Handle network errors gracefully

### Phase 3: Scope Builder
- [ ] Create interactive scope builder UI
- [ ] Validate minimum requirements (1 media, 1 placement)
- [ ] Show warnings for overlapping scopes
- [ ] Implement territory selector (ISO country codes)
- [ ] Add exclusivity options (category, competitors)
- [ ] Implement attribution settings
- [ ] Add cutdown/modification options

### Phase 4: Budget & Ownership Validation
- [ ] Display brand budget summary
- [ ] Show committed vs. available budget
- [ ] Warn unverified brands about $10k limit
- [ ] Display IP asset ownership structure
- [ ] Show ownership percentage breakdown
- [ ] Highlight disputed ownership
- [ ] Flag inactive creators

### Phase 5: Approval Workflow
- [ ] Create approval workflow component
- [ ] Display required approvers
- [ ] Show approval reasons
- [ ] Estimate approval timeline
- [ ] Add "Submit for Approval" button
- [ ] Show post-submission status

### Phase 6: Error Handling
- [ ] Implement error parsing utility
- [ ] Create error display components
- [ ] Show field-level validation errors
- [ ] Display server-side validation errors
- [ ] Handle permission errors
- [ ] Add retry mechanism for failed requests

### Phase 7: UX Enhancements
- [ ] Add form autosave to localStorage
- [ ] Implement progress indicator
- [ ] Show tooltips for complex fields
- [ ] Add keyboard shortcuts
- [ ] Implement responsive design
- [ ] Add accessibility (ARIA labels, keyboard nav)

### Phase 8: Testing
- [ ] Write unit tests for form validation
- [ ] Test conflict detection logic
- [ ] Test error handling scenarios
- [ ] Integration tests with backend
- [ ] E2E tests for complete workflow
- [ ] Test accessibility compliance

### Phase 9: Performance Optimization
- [ ] Optimize React Query cache strategy
- [ ] Add request debouncing (500ms)
- [ ] Lazy load heavy components
- [ ] Minimize re-renders with `useMemo`
- [ ] Profile and optimize bundle size

### Phase 10: Documentation
- [ ] Document component props with JSDoc
- [ ] Create Storybook stories
- [ ] Write integration guide for other devs
- [ ] Document error codes
- [ ] Add inline code comments

---

## Edge Cases to Handle

### 1. Network Issues
```typescript
// Handle offline/timeout scenarios
const { data, error, isLoading } = useConflictCheck(input, {
  retry: 2,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  onError: (error) => {
    if (error.code === 'NETWORK_ERROR') {
      toast.error('Network error. Please check your connection and try again.');
    }
  },
});
```

### 2. Stale Data
```typescript
// Invalidate queries after certain actions
const createLicense = useMutation({
  mutationFn: licensesApi.createLicense,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['licenses'] });
    queryClient.invalidateQueries({ queryKey: ['conflicts'] });
  },
});
```

### 3. Form State Management
```typescript
// Save form state to prevent data loss
useEffect(() => {
  const formData = watch();
  localStorage.setItem('draft-license', JSON.stringify(formData));
}, [watch()]);

// Restore on mount
useEffect(() => {
  const saved = localStorage.getItem('draft-license');
  if (saved) {
    const parsed = JSON.parse(saved);
    reset(parsed);
  }
}, []);
```

### 4. Multiple Simultaneous Requests
```typescript
// Cancel in-flight requests when input changes
const { data } = useQuery({
  queryKey: ['conflicts', input],
  queryFn: ({ signal }) => licensesApi.checkConflicts(input, { signal }),
  enabled: !!input,
});
```

---

## UX Considerations

### 1. Progressive Disclosure
- Show basic fields first (type, dates, pricing)
- Expand advanced options (territories, exclusivity) on demand
- Hide approval workflow until form is valid

### 2. Immediate Feedback
- Real-time validation as user types (debounced)
- Green checkmarks for valid fields
- Red errors for invalid fields
- Yellow warnings for non-blocking issues

### 3. Clear Error Messages
- Use plain language (avoid technical jargon)
- Provide actionable suggestions
- Link to help docs where appropriate

### 4. Smart Defaults
- Pre-select common options (digital + social)
- Default to non-exclusive licenses
- Set start date to tomorrow
- Set end date to 6 months from start

### 5. Guided Flow
- Number steps clearly
- Show progress indicator
- Allow going back to edit
- Auto-save drafts

---

## Security Considerations

### 1. Client-Side Validation
**Never trust client-side validation alone.** Always re-validate on the server.

```typescript
// Client-side is for UX only
const isValid = validateForm(formData);
if (!isValid) {
  showErrors();
  return; // Don't submit
}

// Server validates again
await createLicense(formData); // Server will reject if invalid
```

### 2. Sensitive Data
**Do not expose:**
- Internal brand IDs in URLs
- Creator email addresses
- Financial details to unauthorized users

### 3. Rate Limiting
**Implement client-side throttling:**
```typescript
const checkConflicts = debounce(conflictCheckFn, 500);
```

---

## Summary

The License Validation module provides comprehensive validation across six critical checks. Frontend implementation should:

1. ✅ Use React Query for server state management
2. ✅ Debounce real-time conflict checks
3. ✅ Display clear, actionable errors
4. ✅ Handle all six validation checks gracefully
5. ✅ Show approval workflow transparently
6. ✅ Cache validation results to reduce API calls
7. ✅ Test thoroughly (unit, integration, E2E)

**Next Steps:**
- Review Part 1 for API endpoints and types
- Review Part 2 for business logic and validation rules
- Implement form with real-time validation
- Add comprehensive error handling
- Test all edge cases

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-14  
**Classification:** ⚡ HYBRID
