/**
 * Audit Router
 * Exposes audit history to admins and users (filtered by permissions)
 * 
 * Access Control:
 * - Admins: Can view all audit history
 * - Users: Can only view their own activity
 * 
 * Enhanced with:
 * - Resource type tracking
 * - Permission logging
 * - Session tracking
 * - Tamper detection info
 */

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { auditService } from '@/lib/services/audit.service';
import { verifyAuditChainIntegrity, getIntegrityStatistics } from '@/lib/services/audit-integrity.service';
import { prisma } from '@/lib/db';
import { getArchivalStatistics, runArchivalNow } from '@/jobs/audit-log-archival.job';
import { runIntegrityCheckNow } from '@/jobs/audit-log-integrity.job';
import { safeDecryptAuditMetadata } from '@/lib/services/audit-encryption.service';

export const auditRouter = createTRPCRouter({
  /**
   * Get audit history for specific entity (admin only)
   */
  getHistory: adminProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.getHistory(
        input.entityType,
        input.entityId
      );

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          permission: event.permission,
          
          // Resource info (enhanced)
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          
          // Legacy fields for backward compatibility
          entityType: event.entityType,
          entityId: event.entityId,
          
          // Actor info
          userId: event.userId,
          userName: event.user?.name ?? null,
          userEmail: event.user?.email ?? null,
          
          // State tracking
          before: event.beforeState ?? event.beforeJson,
          after: event.afterState ?? event.afterJson,
          
          // Context
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          sessionId: event.sessionId,
          requestId: event.requestId,
          metadata: event.metadata,
          
          // Tamper detection
          previousLogHash: event.previousLogHash,
        })),
      };
    }),

  /**
   * Get current user's activity (own data only)
   */
  getMyActivity: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      // TODO: Uncomment when auth is implemented
      // const userId = ctx.session.user.id;
      const userId = 'mock-user-id'; // Temporary until auth is ready

      const events = await auditService.getUserActivity(userId, input.limit);

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          permission: event.permission,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          entityType: event.entityType,
          entityId: event.entityId,
          sessionId: event.sessionId,
        })),
      };
    }),

  /**
   * Get changes to entity within date range (admin only)
   */
  getChanges: adminProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.getChanges(
        input.entityType,
        input.entityId,
        new Date(input.startDate),
        new Date(input.endDate)
      );

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          before: event.beforeJson,
          after: event.afterJson,
        })),
      };
    }),

  /**
   * Search audit events with filters (admin only)
   */
  search: adminProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        email: z.string().optional(),
        action: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        requestId: z.string().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const events = await auditService.searchEvents({
        userId: input.userId,
        email: input.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
      });

      return {
        data: events.map((event) => ({
          id: event.id,
          timestamp: event.timestamp.toISOString(),
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          email: event.email,
          userName: event.user?.name ?? null,
          before: event.beforeJson,
          after: event.afterJson,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          requestId: event.requestId,
        })),
        total: events.length,
      };
    }),

  /**
   * Verify audit log integrity (admin only)
   * Checks the hash chain for tampering
   */
  verifyIntegrity: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        batchSize: z.number().min(100).max(10000).default(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await verifyAuditChainIntegrity(prisma, {
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        batchSize: input.batchSize,
      });

      return {
        isValid: result.isValid,
        totalChecked: result.totalChecked,
        verifiedAt: result.verifiedAt.toISOString(),
        firstInvalidEntry: result.firstInvalidEntry
          ? {
              id: result.firstInvalidEntry.id,
              timestamp: result.firstInvalidEntry.timestamp.toISOString(),
              expectedHash: result.firstInvalidEntry.expectedHash,
              actualHash: result.firstInvalidEntry.actualHash,
            }
          : null,
      };
    }),

  /**
   * Get integrity statistics (admin only)
   */
  getIntegrityStats: adminProcedure.query(async () => {
    const stats = await getIntegrityStatistics(prisma);

    return {
      totalEntries: stats.totalEntries,
      entriesWithHash: stats.entriesWithHash,
      entriesWithoutHash: stats.entriesWithoutHash,
      hashCoverage: stats.hashCoverage,
      oldestEntry: stats.oldestEntry?.toISOString() || null,
      newestEntry: stats.newestEntry?.toISOString() || null,
    };
  }),

  /**
   * Get archival statistics (admin only)
   */
  getArchivalStats: adminProcedure.query(async () => {
    const stats = await getArchivalStatistics();

    return {
      totalAuditLogs: stats.totalAuditLogs,
      archivedInMainTable: stats.archivedInMainTable,
      inArchiveTable: stats.inArchiveTable,
      eligibleForArchival: stats.eligibleForArchival,
      oldestUnarchived: stats.oldestUnarchived?.toISOString() || null,
      newestArchived: stats.newestArchived?.toISOString() || null,
      lastArchivedAt: stats.lastArchivedAt?.toISOString() || null,
    };
  }),

  /**
   * Trigger manual archival (admin only)
   */
  triggerArchival: adminProcedure
    .input(
      z.object({
        olderThanDays: z.number().min(30).max(3650).default(365),
        batchSize: z.number().min(100).max(10000).default(1000),
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      await runArchivalNow({
        olderThanDays: input.olderThanDays,
        batchSize: input.batchSize,
        dryRun: input.dryRun,
      });

      return {
        success: true,
        message: input.dryRun
          ? 'Dry run archival queued'
          : 'Archival job queued for processing',
      };
    }),

  /**
   * Trigger manual integrity check (admin only)
   */
  triggerIntegrityCheck: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        batchSize: z.number().min(100).max(10000).default(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await runIntegrityCheckNow({
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        batchSize: input.batchSize,
      });

      return {
        success: true,
        message: 'Integrity check queued for processing',
      };
    }),

  /**
   * Get audit entry with decrypted sensitive data (admin only)
   * Only for authorized administrators with specific permission
   */
  getEntryWithSensitiveData: adminProcedure
    .input(
      z.object({
        entryId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      // TODO: Add additional permission check for sensitive data access
      // This should require elevated permissions beyond standard admin

      const entry = await prisma.auditEvent.findUnique({
        where: { id: input.entryId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Audit entry not found',
        });
      }

      // Decrypt sensitive metadata if present
      const decryptedSensitiveData = entry.encryptedMetadata
        ? safeDecryptAuditMetadata(entry.encryptedMetadata)
        : null;

      return {
        id: entry.id,
        timestamp: entry.timestamp.toISOString(),
        action: entry.action,
        permission: entry.permission,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        userId: entry.userId,
        user: entry.user,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        sessionId: entry.sessionId,
        requestId: entry.requestId,
        metadata: entry.metadata,
        sensitiveMetadata: decryptedSensitiveData,
        previousLogHash: entry.previousLogHash,
        entryHash: entry.entryHash,
        archived: entry.archived,
        archivedAt: entry.archivedAt?.toISOString() || null,
      };
    }),
});
