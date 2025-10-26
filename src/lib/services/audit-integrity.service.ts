/**
 * Audit Log Integrity Service
 * 
 * Implements cryptographic hash chain for tamper detection in audit logs.
 * Each audit entry contains a hash of its content plus the previous entry's hash,
 * creating a blockchain-like chain of integrity.
 * 
 * Features:
 * - SHA-256 hash generation for each entry
 * - Chain verification to detect tampering
 * - Batch verification for performance
 * - Integrity reports for compliance
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

export interface AuditEntryForHashing {
  id: string;
  timestamp: Date;
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  metadata?: any;
}

export interface IntegrityCheckResult {
  isValid: boolean;
  totalChecked: number;
  firstInvalidEntry?: {
    id: string;
    timestamp: Date;
    expectedHash: string;
    actualHash: string;
  };
  verifiedAt: Date;
}

/**
 * Generate SHA-256 hash for an audit entry
 * Includes previous entry's hash to create chain
 */
export function generateEntryHash(entry: AuditEntryForHashing, previousHash: string | null): string {
  // Create deterministic hash input
  const hashInput = {
    id: entry.id,
    timestamp: entry.timestamp.toISOString(),
    userId: entry.userId || null,
    action: entry.action,
    resourceType: entry.resourceType || null,
    resourceId: entry.resourceId || null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    ipAddress: entry.ipAddress || null,
    // Include metadata hash if present (not full metadata to keep hash stable)
    metadataHash: entry.metadata ? crypto.createHash('sha256').update(JSON.stringify(entry.metadata)).digest('hex') : null,
    previousHash,
  };
  
  const hashString = JSON.stringify(hashInput);
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

/**
 * Verify integrity of a single audit entry
 */
export async function verifyEntryIntegrity(
  prisma: PrismaClient,
  entryId: string
): Promise<boolean> {
  const entry = await prisma.auditEvent.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      timestamp: true,
      userId: true,
      action: true,
      resourceType: true,
      resourceId: true,
      entityType: true,
      entityId: true,
      ipAddress: true,
      metadata: true,
      entryHash: true,
      previousLogHash: true,
    },
  });
  
  if (!entry) {
    throw new Error(`Audit entry ${entryId} not found`);
  }
  
  if (!entry.entryHash) {
    // Entry created before hash implementation
    return true;
  }
  
  const calculatedHash = generateEntryHash(entry, entry.previousLogHash);
  return calculatedHash === entry.entryHash;
}

/**
 * Verify integrity of the entire audit log chain
 * Checks all entries in chronological order
 */
export async function verifyAuditChainIntegrity(
  prisma: PrismaClient,
  options: {
    startDate?: Date;
    endDate?: Date;
    batchSize?: number;
  } = {}
): Promise<IntegrityCheckResult> {
  const { startDate, endDate, batchSize = 1000 } = options;
  
  let totalChecked = 0;
  let cursor: string | undefined;
  let previousEntry: AuditEntryForHashing & { entryHash: string | null } | null = null;
  
  const whereClause: any = {};
  if (startDate || endDate) {
    whereClause.timestamp = {};
    if (startDate) whereClause.timestamp.gte = startDate;
    if (endDate) whereClause.timestamp.lte = endDate;
  }
  
  while (true) {
    const entries = await prisma.auditEvent.findMany({
      where: whereClause,
      select: {
        id: true,
        timestamp: true,
        userId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        metadata: true,
        entryHash: true,
        previousLogHash: true,
      },
      orderBy: { timestamp: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    
    if (entries.length === 0) {
      break;
    }
    
    for (const entry of entries) {
      // Skip entries without hash (created before implementation)
      if (!entry.entryHash) {
        totalChecked++;
        previousEntry = entry;
        continue;
      }
      
      // Verify previousLogHash matches previous entry's hash
      if (previousEntry && previousEntry.entryHash) {
        if (entry.previousLogHash !== previousEntry.entryHash) {
          return {
            isValid: false,
            totalChecked,
            firstInvalidEntry: {
              id: entry.id,
              timestamp: entry.timestamp,
              expectedHash: previousEntry.entryHash,
              actualHash: entry.previousLogHash || 'null',
            },
            verifiedAt: new Date(),
          };
        }
      }
      
      // Verify entry's own hash
      const calculatedHash = generateEntryHash(entry, entry.previousLogHash);
      if (calculatedHash !== entry.entryHash) {
        return {
          isValid: false,
          totalChecked,
          firstInvalidEntry: {
            id: entry.id,
            timestamp: entry.timestamp,
            expectedHash: calculatedHash,
            actualHash: entry.entryHash,
          },
          verifiedAt: new Date(),
        };
      }
      
      totalChecked++;
      previousEntry = entry;
    }
    
    cursor = entries[entries.length - 1].id;
    
    // If we got fewer entries than batch size, we're done
    if (entries.length < batchSize) {
      break;
    }
  }
  
  return {
    isValid: true,
    totalChecked,
    verifiedAt: new Date(),
  };
}

/**
 * Get integrity statistics for audit logs
 */
export async function getIntegrityStatistics(prisma: PrismaClient): Promise<{
  totalEntries: number;
  entriesWithHash: number;
  entriesWithoutHash: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  hashCoverage: number; // Percentage of entries with hash
}> {
  const [total, withHash, oldest, newest] = await Promise.all([
    prisma.auditEvent.count(),
    prisma.auditEvent.count({ where: { entryHash: { not: null } } }),
    prisma.auditEvent.findFirst({ orderBy: { timestamp: 'asc' }, select: { timestamp: true } }),
    prisma.auditEvent.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } }),
  ]);
  
  return {
    totalEntries: total,
    entriesWithHash: withHash,
    entriesWithoutHash: total - withHash,
    oldestEntry: oldest?.timestamp || null,
    newestEntry: newest?.timestamp || null,
    hashCoverage: total > 0 ? (withHash / total) * 100 : 0,
  };
}

/**
 * Regenerate hashes for entries that don't have them
 * Only for backfilling - new entries should have hashes from creation
 */
export async function backfillEntryHashes(
  prisma: PrismaClient,
  options: {
    batchSize?: number;
    dryRun?: boolean;
  } = {}
): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const { batchSize = 100, dryRun = false } = options;
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let cursor: string | undefined;
  let previousHash: string | null = null;
  
  // Get the first entry to establish the chain
  const firstEntry = await prisma.auditEvent.findFirst({
    where: { entryHash: null },
    orderBy: { timestamp: 'asc' },
    select: { id: true },
  });
  
  if (!firstEntry) {
    return { processed: 0, updated: 0, errors: 0 };
  }
  
  // Find the entry immediately before the first entry without hash
  const previousEntry = await prisma.auditEvent.findFirst({
    where: {
      timestamp: { lt: (await prisma.auditEvent.findUnique({ where: { id: firstEntry.id }, select: { timestamp: true } }))!.timestamp },
    },
    orderBy: { timestamp: 'desc' },
    select: { entryHash: true },
  });
  
  previousHash = previousEntry?.entryHash || null;
  
  while (true) {
    const entries = await prisma.auditEvent.findMany({
      where: { entryHash: null },
      select: {
        id: true,
        timestamp: true,
        userId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        metadata: true,
      },
      orderBy: { timestamp: 'asc' },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    
    if (entries.length === 0) {
      break;
    }
    
    for (const entry of entries) {
      try {
        const hash = generateEntryHash(entry, previousHash);
        
        if (!dryRun) {
          await prisma.auditEvent.update({
            where: { id: entry.id },
            data: {
              entryHash: hash,
              previousLogHash: previousHash,
            },
          });
        }
        
        previousHash = hash;
        updated++;
      } catch (error) {
        console.error(`Failed to generate hash for entry ${entry.id}`, error);
        errors++;
      }
      
      processed++;
    }
    
    cursor = entries[entries.length - 1].id;
    
    if (entries.length < batchSize) {
      break;
    }
  }
  
  return { processed, updated, errors };
}
