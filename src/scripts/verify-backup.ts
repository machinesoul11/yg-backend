#!/usr/bin/env tsx
/**
 * Database Backup Verification Script
 * 
 * Generates a comprehensive backup report and verifies restore readiness.
 * Run with: npm run db:backup:verify
 */

import { generateBackupReport, verifyBackupConfig } from '../lib/db/backup';

async function main() {
  console.log('🔐 YesGoddess Database Backup Verification\n');
  console.log('='.repeat(60));

  // Verify backup configuration
  console.log('\nVerifying backup configuration...\n');
  const config = verifyBackupConfig();

  // Generate comprehensive report
  console.log('\nGenerating backup report...\n');
  const report = await generateBackupReport();

  console.log(report);

  console.log(`\n${  '='.repeat(60)}`);
  console.log('✓ Backup verification completed');
  console.log(`${'='.repeat(60)  }\n`);

  // Check for issues
  if (report.includes('✗ FAIL')) {
    console.error('⚠️  WARNING: Backup verification found issues!');
    console.error('Please review the report above and address any problems.\n');
    process.exit(1);
  }

  console.log('✓ All backup checks passed\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('\n✗ Backup verification failed:', error);
  process.exit(1);
});
