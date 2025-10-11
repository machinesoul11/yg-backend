/**
 * Data Validation Script for Check Constraints
 * 
 * This script validates existing data before applying check constraints
 * to ensure no existing records will violate the new constraints.
 * 
 * Run with: npx tsx scripts/validate-constraint-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
  constraint: string;
  table: string;
  violations: number;
  details: any[];
}

async function validateData(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  console.log('🔍 Starting data validation for check constraints...\n');

  // 1. Validate fee_cents >= 0 in licenses table
  console.log('Checking licenses.fee_cents >= 0...');
  const negativeFees = await prisma.$queryRaw<any[]>`
    SELECT id, fee_cents, ip_asset_id, brand_id, status
    FROM licenses
    WHERE fee_cents < 0
    LIMIT 10
  `;
  results.push({
    constraint: 'fee_cents_non_negative',
    table: 'licenses',
    violations: negativeFees.length,
    details: negativeFees,
  });
  console.log(`  ✓ Found ${negativeFees.length} violations\n`);

  // 2. Validate amount_cents >= 0 in payouts table
  console.log('Checking payouts.amount_cents >= 0...');
  const negativePayouts = await prisma.$queryRaw<any[]>`
    SELECT id, amount_cents, creator_id, status
    FROM payouts
    WHERE amount_cents < 0
    LIMIT 10
  `;
  results.push({
    constraint: 'payout_amount_non_negative',
    table: 'payouts',
    violations: negativePayouts.length,
    details: negativePayouts,
  });
  console.log(`  ✓ Found ${negativePayouts.length} violations\n`);

  // 3. Validate revenue/royalty cents in royalty_runs
  console.log('Checking royalty_runs monetary fields >= 0...');
  const negativeRoyaltyRuns = await prisma.$queryRaw<any[]>`
    SELECT id, total_revenue_cents, total_royalties_cents, status
    FROM royalty_runs
    WHERE total_revenue_cents < 0 OR total_royalties_cents < 0
    LIMIT 10
  `;
  results.push({
    constraint: 'royalty_run_amounts_non_negative',
    table: 'royalty_runs',
    violations: negativeRoyaltyRuns.length,
    details: negativeRoyaltyRuns,
  });
  console.log(`  ✓ Found ${negativeRoyaltyRuns.length} violations\n`);

  // 4. Validate revenue_cents in royalty_lines
  console.log('Checking royalty_lines.revenue_cents >= 0...');
  const negativeRoyaltyLines = await prisma.$queryRaw<any[]>`
    SELECT id, revenue_cents, calculated_royalty_cents, license_id
    FROM royalty_lines
    WHERE revenue_cents < 0 OR calculated_royalty_cents < 0
    LIMIT 10
  `;
  results.push({
    constraint: 'royalty_line_amounts_non_negative',
    table: 'royalty_lines',
    violations: negativeRoyaltyLines.length,
    details: negativeRoyaltyLines,
  });
  console.log(`  ✓ Found ${negativeRoyaltyLines.length} violations\n`);

  // 5. Validate rev_share_bps BETWEEN 0 AND 10000 in licenses
  console.log('Checking licenses.rev_share_bps BETWEEN 0 AND 10000...');
  const invalidRevShare = await prisma.$queryRaw<any[]>`
    SELECT id, rev_share_bps, ip_asset_id, brand_id, status
    FROM licenses
    WHERE rev_share_bps < 0 OR rev_share_bps > 10000
    LIMIT 10
  `;
  results.push({
    constraint: 'rev_share_bps_valid_range',
    table: 'licenses',
    violations: invalidRevShare.length,
    details: invalidRevShare,
  });
  console.log(`  ✓ Found ${invalidRevShare.length} violations\n`);

  // 6. Validate share_bps BETWEEN 0 AND 10000 in ip_ownerships
  console.log('Checking ip_ownerships.share_bps BETWEEN 0 AND 10000...');
  const invalidOwnershipShare = await prisma.$queryRaw<any[]>`
    SELECT id, share_bps, ip_asset_id, creator_id, ownership_type
    FROM ip_ownerships
    WHERE share_bps < 0 OR share_bps > 10000
    LIMIT 10
  `;
  results.push({
    constraint: 'ownership_share_bps_valid_range',
    table: 'ip_ownerships',
    violations: invalidOwnershipShare.length,
    details: invalidOwnershipShare,
  });
  console.log(`  ✓ Found ${invalidOwnershipShare.length} violations\n`);

  // 7. Validate share_bps BETWEEN 0 AND 10000 in royalty_lines
  console.log('Checking royalty_lines.share_bps BETWEEN 0 AND 10000...');
  const invalidRoyaltyShare = await prisma.$queryRaw<any[]>`
    SELECT id, share_bps, license_id, ip_asset_id
    FROM royalty_lines
    WHERE share_bps < 0 OR share_bps > 10000
    LIMIT 10
  `;
  results.push({
    constraint: 'royalty_share_bps_valid_range',
    table: 'royalty_lines',
    violations: invalidRoyaltyShare.length,
    details: invalidRoyaltyShare,
  });
  console.log(`  ✓ Found ${invalidRoyaltyShare.length} violations\n`);

  // 8. Validate license end_date > start_date
  console.log('Checking licenses.end_date > start_date...');
  const invalidLicenseDates = await prisma.$queryRaw<any[]>`
    SELECT id, start_date, end_date, ip_asset_id, brand_id, status
    FROM licenses
    WHERE end_date <= start_date
    LIMIT 10
  `;
  results.push({
    constraint: 'license_end_after_start',
    table: 'licenses',
    violations: invalidLicenseDates.length,
    details: invalidLicenseDates,
  });
  console.log(`  ✓ Found ${invalidLicenseDates.length} violations\n`);

  // 9. Validate ip_ownerships end_date > start_date (when end_date is not null)
  console.log('Checking ip_ownerships date ranges...');
  const invalidOwnershipDates = await prisma.$queryRaw<any[]>`
    SELECT id, start_date, end_date, ip_asset_id, creator_id
    FROM ip_ownerships
    WHERE end_date IS NOT NULL AND end_date <= start_date
    LIMIT 10
  `;
  results.push({
    constraint: 'ownership_end_after_start',
    table: 'ip_ownerships',
    violations: invalidOwnershipDates.length,
    details: invalidOwnershipDates,
  });
  console.log(`  ✓ Found ${invalidOwnershipDates.length} violations\n`);

  // 10. Validate royalty_runs period_end > period_start
  console.log('Checking royalty_runs.period_end > period_start...');
  const invalidRoyaltyPeriods = await prisma.$queryRaw<any[]>`
    SELECT id, period_start, period_end, status
    FROM royalty_runs
    WHERE period_end <= period_start
    LIMIT 10
  `;
  results.push({
    constraint: 'royalty_period_valid_range',
    table: 'royalty_runs',
    violations: invalidRoyaltyPeriods.length,
    details: invalidRoyaltyPeriods,
  });
  console.log(`  ✓ Found ${invalidRoyaltyPeriods.length} violations\n`);

  // 11. Validate royalty_lines period dates
  console.log('Checking royalty_lines period dates...');
  const invalidRoyaltyLinePeriods = await prisma.$queryRaw<any[]>`
    SELECT id, period_start, period_end, license_id
    FROM royalty_lines
    WHERE period_end <= period_start
    LIMIT 10
  `;
  results.push({
    constraint: 'royalty_line_period_valid',
    table: 'royalty_lines',
    violations: invalidRoyaltyLinePeriods.length,
    details: invalidRoyaltyLinePeriods,
  });
  console.log(`  ✓ Found ${invalidRoyaltyLinePeriods.length} violations\n`);

  // 12. Validate project dates (when both are set)
  console.log('Checking projects date ranges...');
  const invalidProjectDates = await prisma.project.findMany({
    where: {
      AND: [
        { startDate: { not: null } },
        { endDate: { not: null } },
      ],
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      name: true,
      status: true,
    },
    take: 10,
  });
  
  const projectViolations = invalidProjectDates.filter(
    p => p.endDate && p.startDate && p.endDate <= p.startDate
  );
  
  results.push({
    constraint: 'project_end_after_start',
    table: 'projects',
    violations: projectViolations.length,
    details: projectViolations,
  });
  console.log(`  ✓ Found ${projectViolations.length} violations\n`);

  return results;
}

async function generateReport(results: ValidationResult[]): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════════════════\n');

  const totalViolations = results.reduce((sum, r) => sum + r.violations, 0);

  if (totalViolations === 0) {
    console.log('✅ No violations found! All data is valid for constraint application.\n');
  } else {
    console.log(`⚠️  Found ${totalViolations} total violations:\n`);

    for (const result of results) {
      if (result.violations > 0) {
        console.log(`❌ ${result.table}.${result.constraint}: ${result.violations} violations`);
        if (result.details.length > 0) {
          console.log('   Sample records:');
          result.details.slice(0, 3).forEach((record) => {
            console.log('   -', JSON.stringify(record, null, 2).replace(/\n/g, '\n     '));
          });
        }
        console.log('');
      } else {
        console.log(`✅ ${result.table}.${result.constraint}: No violations`);
      }
    }

    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('Data cleanup is needed before applying constraints.');
    console.log('Please review and fix the violations listed above.\n');
  }

  console.log('═══════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    const results = await validateData();
    await generateReport(results);

    const totalViolations = results.reduce((sum, r) => sum + r.violations, 0);
    process.exit(totalViolations > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error during validation:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
