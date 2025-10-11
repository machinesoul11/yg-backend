/**
 * Permission-Based Select Filtering
 * 
 * Controls which fields users can see based on their role and relationship
 * to the data. Prevents sensitive field exposure through API queries.
 */

import type { QueryContext, PermissionLevel, FieldPermissions } from './types';

/**
 * Field visibility configurations for each model
 */
export const FIELD_PERMISSIONS = {
  creator: {
    // Public fields (visible to everyone)
    id: 'PUBLIC' as PermissionLevel,
    stageName: 'PUBLIC' as PermissionLevel,
    bio: 'PUBLIC' as PermissionLevel,
    portfolioUrl: 'PUBLIC' as PermissionLevel,
    specialties: 'PUBLIC' as PermissionLevel,
    avatarUrl: 'PUBLIC' as PermissionLevel,
    socialLinks: 'PUBLIC' as PermissionLevel,
    
    // Authenticated fields (visible to logged-in users)
    verificationStatus: 'AUTHENTICATED' as PermissionLevel,
    onboardingStatus: 'AUTHENTICATED' as PermissionLevel,
    
    // Owner fields (visible only to the creator themselves)
    email: 'OWNER' as PermissionLevel,
    userId: 'OWNER' as PermissionLevel,
    stripeAccountId: 'OWNER' as PermissionLevel,
    performanceMetrics: 'OWNER' as PermissionLevel,
    lifetimeEarnings: 'OWNER' as PermissionLevel,
    
    // Admin fields
    verificationNotes: 'ADMIN' as PermissionLevel,
    internalNotes: 'ADMIN' as PermissionLevel,
    deletedAt: 'ADMIN' as PermissionLevel,
  },
  
  brand: {
    // Public fields
    id: 'PUBLIC' as PermissionLevel,
    companyName: 'PUBLIC' as PermissionLevel,
    industry: 'PUBLIC' as PermissionLevel,
    logo: 'PUBLIC' as PermissionLevel,
    website: 'PUBLIC' as PermissionLevel,
    description: 'PUBLIC' as PermissionLevel,
    
    // Authenticated fields
    verificationStatus: 'AUTHENTICATED' as PermissionLevel,
    companySize: 'AUTHENTICATED' as PermissionLevel,
    targetAudience: 'AUTHENTICATED' as PermissionLevel,
    
    // Owner fields
    userId: 'OWNER' as PermissionLevel,
    contactInfo: 'OWNER' as PermissionLevel,
    billingInfo: 'OWNER' as PermissionLevel,
    teamMembers: 'OWNER' as PermissionLevel,
    totalSpent: 'OWNER' as PermissionLevel,
    
    // Admin fields
    verificationNotes: 'ADMIN' as PermissionLevel,
    deletedAt: 'ADMIN' as PermissionLevel,
  },
  
  ipAsset: {
    // Public fields (for published assets)
    id: 'PUBLIC' as PermissionLevel,
    title: 'PUBLIC' as PermissionLevel,
    description: 'PUBLIC' as PermissionLevel,
    type: 'PUBLIC' as PermissionLevel,
    thumbnailUrl: 'PUBLIC' as PermissionLevel,
    tags: 'PUBLIC' as PermissionLevel,
    
    // Owner/Creator fields
    fileUrl: 'OWNER' as PermissionLevel,
    metadata: 'OWNER' as PermissionLevel,
    status: 'OWNER' as PermissionLevel,
    licensingTerms: 'OWNER' as PermissionLevel,
    baseFeeCents: 'OWNER' as PermissionLevel,
    
    // Collaborator fields (brands with licenses)
    previewUrl: 'COLLABORATOR' as PermissionLevel,
    
    // Admin fields
    internalNotes: 'ADMIN' as PermissionLevel,
    deletedAt: 'ADMIN' as PermissionLevel,
  },
  
  royaltyStatement: {
    // All fields are owner-only for royalty statements
    id: 'OWNER' as PermissionLevel,
    creatorId: 'OWNER' as PermissionLevel,
    periodStart: 'OWNER' as PermissionLevel,
    periodEnd: 'OWNER' as PermissionLevel,
    totalEarningsCents: 'OWNER' as PermissionLevel,
    platformFeeCents: 'OWNER' as PermissionLevel,
    netPayableCents: 'OWNER' as PermissionLevel,
    status: 'OWNER' as PermissionLevel,
    pdfUrl: 'OWNER' as PermissionLevel,
    
    // Admin can see everything
    internalNotes: 'ADMIN' as PermissionLevel,
  },
  
  payout: {
    // All fields are owner-only for payouts
    id: 'OWNER' as PermissionLevel,
    creatorId: 'OWNER' as PermissionLevel,
    amountCents: 'OWNER' as PermissionLevel,
    status: 'OWNER' as PermissionLevel,
    stripeTransferId: 'OWNER' as PermissionLevel,
    processedAt: 'OWNER' as PermissionLevel,
    
    // Admin fields
    failureReason: 'ADMIN' as PermissionLevel,
    retryCount: 'ADMIN' as PermissionLevel,
  },
  
  license: {
    // Public fields (basic info)
    id: 'PUBLIC' as PermissionLevel,
    licenseType: 'PUBLIC' as PermissionLevel,
    status: 'PUBLIC' as PermissionLevel,
    
    // Collaborator fields (brand and asset owner)
    brandId: 'COLLABORATOR' as PermissionLevel,
    ipAssetId: 'COLLABORATOR' as PermissionLevel,
    feeCents: 'COLLABORATOR' as PermissionLevel,
    revShareBps: 'COLLABORATOR' as PermissionLevel,
    startDate: 'COLLABORATOR' as PermissionLevel,
    endDate: 'COLLABORATOR' as PermissionLevel,
    scope: 'COLLABORATOR' as PermissionLevel,
    
    // Admin fields
    internalNotes: 'ADMIN' as PermissionLevel,
    deletedAt: 'ADMIN' as PermissionLevel,
  },
  
  project: {
    // Public fields
    id: 'PUBLIC' as PermissionLevel,
    name: 'PUBLIC' as PermissionLevel,
    description: 'PUBLIC' as PermissionLevel,
    status: 'PUBLIC' as PermissionLevel,
    projectType: 'PUBLIC' as PermissionLevel,
    
    // Owner/Collaborator fields
    brandId: 'COLLABORATOR' as PermissionLevel,
    budgetCents: 'COLLABORATOR' as PermissionLevel,
    startDate: 'COLLABORATOR' as PermissionLevel,
    endDate: 'COLLABORATOR' as PermissionLevel,
    
    // Admin fields
    internalNotes: 'ADMIN' as PermissionLevel,
    deletedAt: 'ADMIN' as PermissionLevel,
  },
} as const;

/**
 * Check if user can see a field
 */
export function canSeeField(
  context: QueryContext,
  permissionLevel: PermissionLevel,
  resourceOwnerId?: string,
  resourceBrandId?: string
): boolean {
  // Admin can see everything
  if (context.role === 'ADMIN') {
    return true;
  }

  switch (permissionLevel) {
    case 'PUBLIC':
      return true;

    case 'AUTHENTICATED':
      return !!context.userId;

    case 'OWNER':
      // Check if user is the owner
      if (resourceOwnerId) {
        return context.userId === resourceOwnerId || 
               context.creatorId === resourceOwnerId;
      }
      if (resourceBrandId) {
        return context.brandId === resourceBrandId;
      }
      return false;

    case 'COLLABORATOR':
      // Check if user has collaborative access
      if (resourceOwnerId && context.creatorId === resourceOwnerId) {
        return true;
      }
      if (resourceBrandId && context.brandId === resourceBrandId) {
        return true;
      }
      return false;

    case 'ADMIN':
      return false;

    default:
      return false;
  }
}

/**
 * Get allowed select fields for a model
 */
export function getAllowedSelectFields<M extends keyof typeof FIELD_PERMISSIONS>(
  context: QueryContext,
  modelName: M,
  resourceOwnerId?: string,
  resourceBrandId?: string
): Record<string, boolean> {
  const permissions = FIELD_PERMISSIONS[modelName];
  const allowedFields: Record<string, boolean> = {};

  for (const [field, permissionLevel] of Object.entries(permissions)) {
    if (canSeeField(context, permissionLevel, resourceOwnerId, resourceBrandId)) {
      allowedFields[field] = true;
    }
  }

  return allowedFields;
}

/**
 * Filter select fields based on permissions
 * Intersects requested fields with allowed fields
 */
export function filterSelectFields<M extends keyof typeof FIELD_PERMISSIONS>(
  context: QueryContext,
  modelName: M,
  requestedSelect: Record<string, any> | undefined,
  resourceOwnerId?: string,
  resourceBrandId?: string
): Record<string, any> {
  // If no select specified, return all allowed fields
  if (!requestedSelect) {
    return getAllowedSelectFields(context, modelName, resourceOwnerId, resourceBrandId);
  }

  const allowedFields = getAllowedSelectFields(context, modelName, resourceOwnerId, resourceBrandId);
  const filteredSelect: Record<string, any> = {};

  // Only include fields that are both requested and allowed
  for (const [field, value] of Object.entries(requestedSelect)) {
    if (allowedFields[field]) {
      // Handle nested selects for relations
      if (typeof value === 'object' && value !== null && 'select' in value) {
        filteredSelect[field] = value; // Keep relation select as-is
      } else {
        filteredSelect[field] = value;
      }
    }
  }

  return filteredSelect;
}

/**
 * Get default public select for a model
 * Useful for list views where you want minimal data
 */
export function getPublicSelect<M extends keyof typeof FIELD_PERMISSIONS>(
  modelName: M
): Record<string, boolean> {
  const permissions = FIELD_PERMISSIONS[modelName];
  const publicFields: Record<string, boolean> = {};

  for (const [field, permissionLevel] of Object.entries(permissions)) {
    if (permissionLevel === 'PUBLIC') {
      publicFields[field] = true;
    }
  }

  return publicFields;
}

/**
 * Redact sensitive fields from query results
 * Use as a last resort if select filtering wasn't applied
 */
export function redactSensitiveFields<T extends Record<string, any>, M extends keyof typeof FIELD_PERMISSIONS>(
  context: QueryContext,
  modelName: M,
  data: T,
  resourceOwnerId?: string,
  resourceBrandId?: string
): Partial<T> {
  const allowedFields = getAllowedSelectFields(context, modelName, resourceOwnerId, resourceBrandId);
  const redacted: Partial<T> = {};

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields[key]) {
      redacted[key as keyof T] = value;
    }
  }

  return redacted;
}

/**
 * Redact sensitive fields from array of results
 */
export function redactSensitiveFieldsArray<T extends Record<string, any>, M extends keyof typeof FIELD_PERMISSIONS>(
  context: QueryContext,
  modelName: M,
  data: T[],
  getResourceOwnerId?: (item: T) => string | undefined,
  getResourceBrandId?: (item: T) => string | undefined
): Partial<T>[] {
  return data.map(item => 
    redactSensitiveFields(
      context,
      modelName,
      item,
      getResourceOwnerId?.(item),
      getResourceBrandId?.(item)
    )
  );
}

/**
 * Validate that a select clause only requests allowed fields
 * Throws error if forbidden fields are requested
 */
export function validateSelectPermissions<M extends keyof typeof FIELD_PERMISSIONS>(
  context: QueryContext,
  modelName: M,
  requestedSelect: Record<string, any>,
  resourceOwnerId?: string,
  resourceBrandId?: string
): void {
  const allowedFields = getAllowedSelectFields(context, modelName, resourceOwnerId, resourceBrandId);
  const requestedFields = Object.keys(requestedSelect);

  const forbiddenFields = requestedFields.filter(field => !allowedFields[field]);

  if (forbiddenFields.length > 0) {
    throw new Error(
      `Access denied to fields: ${forbiddenFields.join(', ')}. ` +
      `User does not have permission to view these fields.`
    );
  }
}
