/**
 * Example: Integrating Audit Logging into License Service
 * 
 * This file demonstrates how to properly integrate audit logging
 * into the License Service following best practices.
 */

import { prisma } from '@/lib/db';
import { auditService, AUDIT_ACTIONS } from '@/lib/services/audit.service';
import type { License } from '@prisma/client';

/**
 * Example 1: Logging License Creation
 */
export async function createLicenseWithAudit(
  data: {
    ipAssetId: string;
    brandId: string;
    startDate: Date;
    endDate: Date;
    feeCents: number;
    // ... other license fields
  },
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): Promise<License> {
  // Create the license
  const license = await prisma.license.create({
    data: {
      ...data,
      status: 'DRAFT',
      createdAt: new Date(),
    },
  });

  // Audit the creation
  await auditService.log({
    action: AUDIT_ACTIONS.LICENSE_CREATED,
    entityType: 'license',
    entityId: license.id,
    userId,
    ipAddress,
    userAgent,
    requestId,
    // No 'before' state since it's a new entity
    after: auditService.sanitizeForAudit(license),
  });

  return license;
}

/**
 * Example 2: Logging License Update with Before/After
 */
export async function updateLicenseWithAudit(
  licenseId: string,
  updates: {
    feeCents?: number;
    revShareBps?: number;
    endDate?: Date;
    // ... other updatable fields
  },
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): Promise<License> {
  // Capture current state BEFORE update
  const before = await prisma.license.findUnique({
    where: { id: licenseId },
  });

  if (!before) {
    throw new Error('License not found');
  }

  // Perform the update
  const after = await prisma.license.update({
    where: { id: licenseId },
    data: updates,
  });

  // Audit with both states for comparison
  await auditService.log({
    action: AUDIT_ACTIONS.LICENSE_UPDATED,
    entityType: 'license',
    entityId: licenseId,
    userId,
    ipAddress,
    userAgent,
    requestId,
    before: auditService.sanitizeForAudit(before),
    after: auditService.sanitizeForAudit(after),
  });

  return after;
}

/**
 * Example 3: Logging License Status Change (Critical Operation)
 */
export async function terminateLicenseWithAudit(
  licenseId: string,
  reason: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): Promise<License> {
  const before = await prisma.license.findUnique({
    where: { id: licenseId },
  });

  if (!before) {
    throw new Error('License not found');
  }

  // Terminate the license
  const after = await prisma.license.update({
    where: { id: licenseId },
    data: {
      status: 'TERMINATED',
      terminatedAt: new Date(),
      terminationReason: reason,
    },
  });

  // Audit this critical operation
  await auditService.log({
    action: AUDIT_ACTIONS.LICENSE_TERMINATED,
    entityType: 'license',
    entityId: licenseId,
    userId,
    ipAddress,
    userAgent,
    requestId,
    before: auditService.sanitizeForAudit(before),
    after: {
      ...auditService.sanitizeForAudit(after),
      terminationReason: reason, // Include context
    },
  });

  return after;
}

/**
 * Example 4: Integration with tRPC Context
 * 
 * In your tRPC router, extract context metadata and pass to service
 */
export const licenseRouter = {
  create: protectedProcedure
    .input(createLicenseSchema)
    .mutation(async ({ input, ctx }) => {
      // Extract audit context from tRPC request
      const auditContext = {
        userId: ctx.user.id,
        ipAddress: ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
        requestId: ctx.req?.id,
      };

      // Call service with audit context
      return createLicenseWithAudit(
        input,
        auditContext.userId,
        auditContext.ipAddress,
        auditContext.userAgent,
        auditContext.requestId
      );
    }),

  update: protectedProcedure
    .input(updateLicenseSchema)
    .mutation(async ({ input, ctx }) => {
      const auditContext = {
        userId: ctx.user.id,
        ipAddress: ctx.req?.ip,
        userAgent: ctx.req?.headers['user-agent'],
        requestId: ctx.req?.id,
      };

      return updateLicenseWithAudit(
        input.id,
        input.updates,
        auditContext.userId,
        auditContext.ipAddress,
        auditContext.userAgent,
        auditContext.requestId
      );
    }),
};

/**
 * Example 5: Batch Operation Auditing
 * 
 * When processing multiple items, log each one
 */
export async function bulkActivateLicensesWithAudit(
  licenseIds: string[],
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): Promise<void> {
  for (const licenseId of licenseIds) {
    const before = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    const after = await prisma.license.update({
      where: { id: licenseId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    // Audit each license activation
    await auditService.log({
      action: AUDIT_ACTIONS.LICENSE_ACTIVATED,
      entityType: 'license',
      entityId: licenseId,
      userId,
      ipAddress,
      userAgent,
      requestId, // Same requestId ties them together
      before: auditService.sanitizeForAudit(before),
      after: auditService.sanitizeForAudit(after),
    });
  }
}

/**
 * Example 6: Viewing Sensitive Data (Should be audited)
 */
export async function viewLicenseWithAudit(
  licenseId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string
): Promise<License> {
  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    include: {
      ipAsset: true,
      brand: true,
    },
  });

  if (!license) {
    throw new Error('License not found');
  }

  // Audit viewing of sensitive financial data
  await auditService.log({
    action: AUDIT_ACTIONS.LICENSE_VIEWED,
    entityType: 'license',
    entityId: licenseId,
    userId,
    ipAddress,
    userAgent,
    requestId,
    // For view actions, only 'after' (what was viewed)
    after: {
      licenseId: license.id,
      viewedAt: new Date().toISOString(),
      feeCents: license.feeCents, // Track what financial data was accessed
    },
  });

  return license;
}

/**
 * Best Practices Summary:
 * 
 * 1. Always capture 'before' state for updates/deletes
 * 2. Use sanitizeForAudit() to remove sensitive fields
 * 3. Pass request context (IP, user agent, request ID) when available
 * 4. Use appropriate AUDIT_ACTIONS constants
 * 5. Audit all CRITICAL operations:
 *    - Financial transactions
 *    - Status changes
 *    - Deletions
 *    - Permission changes
 * 6. Optionally audit SENSITIVE operations:
 *    - Viewing financial data
 *    - Accessing PII
 * 7. Never await audit calls in a way that breaks business logic
 *    (audit service already handles errors gracefully)
 */
