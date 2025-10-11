/**
 * Database Backup Configuration and Management
 * 
 * Provides utilities for database backup verification and monitoring.
 * Note: Actual backups are handled by Supabase automated backup system.
 */

import { prisma } from './index';

export interface BackupStatus {
  enabled: boolean;
  lastBackup: Date | null;
  schedule: string;
  retentionDays: number;
  location: string;
}

export interface BackupMetadata {
  timestamp: Date;
  size: number;
  tables: string[];
  rowCounts: Record<string, number>;
}

/**
 * Backup configuration for Supabase
 * 
 * Supabase handles automated backups based on plan:
 * - Free: Daily backups, 7 days retention
 * - Pro: Daily backups, 7 days retention
 * - Team/Enterprise: Daily backups, 30+ days retention, PITR available
 */
export const BACKUP_CONFIG = {
  enabled: true,
  schedule: process.env.BACKUP_SCHEDULE || 'daily',
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10),
  location: process.env.BACKUP_LOCATION || 'supabase-managed',
  alertOnFailure: process.env.BACKUP_ALERT_EMAIL || 'admin@yesgoddess.com',
} as const;

/**
 * Verify backup configuration
 */
export function verifyBackupConfig(): BackupStatus {
  console.log('Database Backup Configuration:');
  console.log('  Provider: Supabase Automated Backups');
  console.log(`  Schedule: ${BACKUP_CONFIG.schedule}`);
  console.log(`  Retention: ${BACKUP_CONFIG.retentionDays} days`);
  console.log(`  Location: ${BACKUP_CONFIG.location}`);
  console.log(`  Alert Email: ${BACKUP_CONFIG.alertOnFailure}`);

  return {
    enabled: BACKUP_CONFIG.enabled,
    lastBackup: null, // Managed by Supabase
    schedule: BACKUP_CONFIG.schedule,
    retentionDays: BACKUP_CONFIG.retentionDays,
    location: BACKUP_CONFIG.location,
  };
}

/**
 * Get current database snapshot metadata
 * Useful for manual backup verification
 */
export async function getDatabaseSnapshot(): Promise<BackupMetadata> {
  const tables = [
    'users',
    'accounts',
    'sessions',
    'talents',
    'brands',
    'intellectual_properties',
    'ip_files',
    'licenses',
    'royalties',
    'payments',
    'analytics_events',
  ];

  const rowCounts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe<any[]>(
        `SELECT count(*) as count FROM ${table}`
      );
      rowCounts[table] = parseInt(result[0]?.count || '0');
    } catch (error) {
      console.error(`Failed to count rows in ${table}:`, error);
      rowCounts[table] = 0;
    }
  }

  // Get approximate database size
  const sizeResult = await prisma.$queryRaw<any[]>`
    SELECT pg_database_size(current_database()) as size
  `;
  const size = parseInt(sizeResult[0]?.size || '0');

  return {
    timestamp: new Date(),
    size,
    tables,
    rowCounts,
  };
}

/**
 * Test database restore capability
 * Verifies critical tables exist and are accessible
 */
export async function testRestoreReadiness(): Promise<{
  success: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    // Test critical table access
    await prisma.user.findFirst();
    await prisma.talent.findFirst();
    await prisma.brand.findFirst();
    await prisma.license.findFirst();
  } catch (error) {
    issues.push(`Critical table access failed: ${error}`);
  }

  // Check for foreign key constraints
  try {
    const constraints = await prisma.$queryRaw<any[]>`
      SELECT 
        tc.table_name, 
        tc.constraint_name,
        tc.constraint_type
      FROM information_schema.table_constraints tc
      WHERE tc.constraint_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
    `;

    if (constraints.length === 0) {
      issues.push('No foreign key constraints found - data integrity may be compromised');
    }
  } catch (error) {
    issues.push(`Failed to verify constraints: ${error}`);
  }

  // Check for required indexes
  try {
    const indexes = await prisma.$queryRaw<any[]>`
      SELECT 
        schemaname,
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;

    if (indexes.length === 0) {
      issues.push('No indexes found - database performance will be degraded');
    }
  } catch (error) {
    issues.push(`Failed to verify indexes: ${error}`);
  }

  return {
    success: issues.length === 0,
    issues,
  };
}

/**
 * Generate backup verification report
 */
export async function generateBackupReport(): Promise<string> {
  const backupStatus = verifyBackupConfig();
  const snapshot = await getDatabaseSnapshot();
  const restoreTest = await testRestoreReadiness();

  const report = `
Database Backup Report
Generated: ${new Date().toISOString()}

=== Backup Configuration ===
Enabled: ${backupStatus.enabled}
Schedule: ${backupStatus.schedule}
Retention: ${backupStatus.retentionDays} days
Location: ${backupStatus.location}

=== Current Database State ===
Timestamp: ${snapshot.timestamp.toISOString()}
Size: ${(snapshot.size / 1024 / 1024).toFixed(2)} MB
Tables: ${snapshot.tables.length}

Row Counts:
${Object.entries(snapshot.rowCounts)
  .map(([table, count]) => `  ${table}: ${count.toLocaleString()}`)
  .join('\n')}

=== Restore Readiness ===
Status: ${restoreTest.success ? '✓ PASS' : '✗ FAIL'}
${restoreTest.issues.length > 0 ? `Issues:\n${  restoreTest.issues.map(i => `  - ${i}`).join('\n')}` : 'No issues found'}

=== Recommendations ===
1. Verify automated backups are running in Supabase dashboard
2. Test restore procedure quarterly
3. Store critical backup metadata externally
4. Monitor backup storage usage
5. Configure Point-in-Time Recovery (PITR) for production

For Supabase backup management:
https://app.supabase.com/project/_/settings/database
  `.trim();

  return report;
}
