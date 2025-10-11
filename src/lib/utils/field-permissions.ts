/**
 * Field-Level Permission Utilities
 * 
 * Provides fine-grained access control at the field level
 * Determines which fields users can view or modify based on their permissions
 */

import { Permission, PERMISSIONS } from '@/lib/constants/permissions';

/**
 * Field permission requirement
 */
export interface FieldPermissionConfig {
  read?: Permission[];  // Permissions required to read the field
  write?: Permission[]; // Permissions required to write the field
  mask?: boolean;       // Whether to mask the value if permission is denied
  maskValue?: any;      // Value to show when masked (default: null)
}

/**
 * Resource field permissions configuration
 */
export type ResourceFieldPermissions = Record<string, FieldPermissionConfig>;

/**
 * Field permission definitions for each resource type
 */
export const FIELD_PERMISSIONS: Record<string, ResourceFieldPermissions> = {
  user: {
    email: {
      read: [PERMISSIONS.USERS_VIEW_OWN, PERMISSIONS.USERS_VIEW_ALL, PERMISSIONS.USERS_VIEW_SENSITIVE],
      write: [PERMISSIONS.USERS_EDIT_OWN, PERMISSIONS.USERS_EDIT],
    },
    role: {
      read: [PERMISSIONS.USERS_VIEW_OWN, PERMISSIONS.USERS_VIEW_ALL],
      write: [PERMISSIONS.USERS_CHANGE_ROLE],
    },
    password_hash: {
      read: [], // Never readable
      write: [PERMISSIONS.USERS_EDIT_OWN, PERMISSIONS.USERS_EDIT],
    },
  },

  creator: {
    stageName: {
      read: [PERMISSIONS.CREATORS_VIEW_OWN, PERMISSIONS.CREATORS_VIEW_ALL, PERMISSIONS.CREATORS_VIEW_PUBLIC],
      write: [PERMISSIONS.CREATORS_EDIT_OWN, PERMISSIONS.CREATORS_EDIT_ALL],
    },
    stripeAccountId: {
      read: [PERMISSIONS.CREATORS_VIEW_SENSITIVE, PERMISSIONS.CREATORS_VIEW_OWN],
      write: [PERMISSIONS.CREATORS_EDIT_OWN],
      mask: true,
      maskValue: '***',
    },
    totalEarnings: {
      read: [PERMISSIONS.CREATORS_VIEW_FINANCIAL, PERMISSIONS.CREATORS_VIEW_OWN],
      write: [], // Computed field
      mask: true,
      maskValue: null,
    },
  },

  brand: {
    companyName: {
      read: [PERMISSIONS.BRANDS_VIEW_OWN, PERMISSIONS.BRANDS_VIEW_ALL, PERMISSIONS.BRANDS_VIEW_PUBLIC],
      write: [PERMISSIONS.BRANDS_EDIT_OWN, PERMISSIONS.BRANDS_EDIT_ALL],
    },
    billingInfo: {
      read: [PERMISSIONS.BRANDS_VIEW_SENSITIVE, PERMISSIONS.BRANDS_VIEW_OWN],
      write: [PERMISSIONS.BRANDS_EDIT_OWN, PERMISSIONS.BRANDS_EDIT_ALL],
      mask: true,
      maskValue: null,
    },
    teamMembers: {
      read: [PERMISSIONS.BRANDS_VIEW_SENSITIVE, PERMISSIONS.BRANDS_VIEW_OWN],
      write: [PERMISSIONS.BRANDS_EDIT_OWN, PERMISSIONS.BRANDS_EDIT_ALL],
      mask: true,
      maskValue: [],
    },
    verificationStatus: {
      read: [PERMISSIONS.BRANDS_VIEW_OWN, PERMISSIONS.BRANDS_VIEW_ALL],
      write: [PERMISSIONS.BRANDS_VERIFY, PERMISSIONS.BRANDS_REJECT],
    },
  },

  license: {
    feeCents: {
      read: [PERMISSIONS.LICENSES_VIEW_FINANCIAL, PERMISSIONS.LICENSES_VIEW_OWN],
      write: [PERMISSIONS.LICENSES_EDIT_OWN, PERMISSIONS.LICENSES_EDIT_ALL],
      mask: true,
      maskValue: null,
    },
    revShareBps: {
      read: [PERMISSIONS.LICENSES_VIEW_FINANCIAL, PERMISSIONS.LICENSES_VIEW_OWN],
      write: [PERMISSIONS.LICENSES_EDIT_OWN, PERMISSIONS.LICENSES_EDIT_ALL],
      mask: true,
      maskValue: null,
    },
    status: {
      read: [PERMISSIONS.LICENSES_VIEW_OWN, PERMISSIONS.LICENSES_VIEW_ALL],
      write: [PERMISSIONS.LICENSES_EDIT_OWN, PERMISSIONS.LICENSES_EDIT_ALL, PERMISSIONS.LICENSES_APPROVE],
    },
  },

  royalty: {
    totalRevenueCents: {
      read: [PERMISSIONS.ROYALTIES_VIEW_OWN, PERMISSIONS.ROYALTIES_VIEW_ALL],
      write: [PERMISSIONS.ROYALTIES_EDIT],
      mask: true,
      maskValue: null,
    },
    totalRoyaltiesCents: {
      read: [PERMISSIONS.ROYALTIES_VIEW_OWN, PERMISSIONS.ROYALTIES_VIEW_ALL],
      write: [PERMISSIONS.ROYALTIES_EDIT],
      mask: true,
      maskValue: null,
    },
  },

  payout: {
    amountCents: {
      read: [PERMISSIONS.PAYOUTS_VIEW_OWN, PERMISSIONS.PAYOUTS_VIEW_ALL],
      write: [PERMISSIONS.PAYOUTS_PROCESS],
      mask: true,
      maskValue: null,
    },
    stripeTransferId: {
      read: [PERMISSIONS.PAYOUTS_VIEW_OWN, PERMISSIONS.PAYOUTS_VIEW_ALL],
      write: [], // System-managed
      mask: true,
      maskValue: '***',
    },
  },
};

/**
 * Filter object fields based on user permissions
 * Removes or masks fields the user doesn't have permission to view
 * 
 * @param obj - Object to filter
 * @param resourceType - Type of resource
 * @param userPermissions - User's permissions
 * @returns Filtered object with only permitted fields
 */
export function filterFieldsByPermissions<T extends Record<string, any>>(
  obj: T,
  resourceType: string,
  userPermissions: Permission[]
): Partial<T> {
  const fieldPermissions = FIELD_PERMISSIONS[resourceType];
  if (!fieldPermissions) return obj;

  const filtered: Partial<T> = { ...obj };

  Object.entries(fieldPermissions).forEach(([field, config]) => {
    const { read, mask, maskValue } = config;

    // Check if user has permission to read this field
    const canRead = !read || read.length === 0 || read.some(p => userPermissions.includes(p));

    if (!canRead) {
      if (mask) {
        // Mask the value instead of removing it
        (filtered as any)[field] = maskValue ?? null;
      } else {
        // Remove the field entirely
        delete (filtered as any)[field];
      }
    }
  });

  return filtered;
}

/**
 * Check if user can read a specific field
 * 
 * @param resourceType - Type of resource
 * @param fieldName - Name of the field
 * @param userPermissions - User's permissions
 * @returns true if user can read the field
 */
export function canReadField(
  resourceType: string,
  fieldName: string,
  userPermissions: Permission[]
): boolean {
  const fieldPermissions = FIELD_PERMISSIONS[resourceType];
  if (!fieldPermissions || !fieldPermissions[fieldName]) {
    return true; // Default to allowing if no restrictions defined
  }

  const { read } = fieldPermissions[fieldName];
  
  // If no read permissions defined, allow
  if (!read || read.length === 0) return true;
  
  // Check if user has any of the required permissions
  return read.some(p => userPermissions.includes(p));
}

/**
 * Check if user can write a specific field
 * 
 * @param resourceType - Type of resource
 * @param fieldName - Name of the field
 * @param userPermissions - User's permissions
 * @returns true if user can write the field
 */
export function canWriteField(
  resourceType: string,
  fieldName: string,
  userPermissions: Permission[]
): boolean {
  const fieldPermissions = FIELD_PERMISSIONS[resourceType];
  if (!fieldPermissions || !fieldPermissions[fieldName]) {
    return true; // Default to allowing if no restrictions defined
  }

  const { write } = fieldPermissions[fieldName];
  
  // If no write permissions defined, deny
  if (!write || write.length === 0) return false;
  
  // Check if user has any of the required permissions
  return write.some(p => userPermissions.includes(p));
}

/**
 * Validate that user can modify the specified fields
 * Throws error with list of fields user cannot modify
 * 
 * @param resourceType - Type of resource
 * @param fieldsToUpdate - Object containing fields to update
 * @param userPermissions - User's permissions
 * @returns Array of field names user cannot modify (empty if all allowed)
 */
export function validateFieldWrites(
  resourceType: string,
  fieldsToUpdate: Record<string, any>,
  userPermissions: Permission[]
): string[] {
  const unwritableFields: string[] = [];

  Object.keys(fieldsToUpdate).forEach(field => {
    if (!canWriteField(resourceType, field, userPermissions)) {
      unwritableFields.push(field);
    }
  });

  return unwritableFields;
}

/**
 * Get field metadata for a resource type
 * Returns which fields require which permissions
 * Useful for client-side UI to show/hide fields dynamically
 * 
 * @param resourceType - Type of resource
 * @param userPermissions - User's permissions
 * @returns Object mapping field names to their accessibility
 */
export function getFieldMetadata(
  resourceType: string,
  userPermissions: Permission[]
): Record<string, { readable: boolean; writable: boolean; masked: boolean }> {
  const fieldPermissions = FIELD_PERMISSIONS[resourceType];
  if (!fieldPermissions) return {};

  const metadata: Record<string, { readable: boolean; writable: boolean; masked: boolean }> = {};

  Object.entries(fieldPermissions).forEach(([field, config]) => {
    metadata[field] = {
      readable: canReadField(resourceType, field, userPermissions),
      writable: canWriteField(resourceType, field, userPermissions),
      masked: (config.mask || false) && !canReadField(resourceType, field, userPermissions),
    };
  });

  return metadata;
}
