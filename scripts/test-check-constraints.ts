/**
 * Test Script for Check Constraints Migration
 * 
 * This script tests that the check constraints work as expected by attempting
 * to insert/update records that violate the constraints.
 * 
 * Run with: npx tsx scripts/test-check-constraints.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function testConstraint(
  testName: string,
  operation: () => Promise<any>,
  shouldFail: boolean = true
): Promise<void> {
  try {
    await operation();
    results.push({
      test: testName,
      passed: !shouldFail,
      error: shouldFail ? 'Expected constraint violation but operation succeeded' : undefined,
    });
  } catch (error: any) {
    const isConstraintError = error.code === 'P2002' || 
                             error.code === 'P2003' || 
                             error.message?.includes('violates check constraint') ||
                             error.message?.includes('CHECK constraint');
    
    results.push({
      test: testName,
      passed: shouldFail && isConstraintError,
      error: !shouldFail || !isConstraintError ? error.message : undefined,
    });
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 Starting Check Constraints Tests...\n');

  // Note: Since we're testing constraints that should prevent invalid data,
  // we'll use raw SQL for some tests to bypass Prisma validation
  
  // Test 1: Negative fee_cents
  console.log('Test 1: Attempting to insert license with negative fee...');
  await testConstraint(
    'licenses.fee_cents >= 0',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO licenses (
          id, ip_asset_id, brand_id, license_type, start_date, end_date, 
          fee_cents, rev_share_bps, scope_json, status, created_at, updated_at
        ) VALUES (
          'test_neg_fee', 
          (SELECT id FROM ip_assets LIMIT 1),
          (SELECT id FROM brands LIMIT 1),
          'NON_EXCLUSIVE',
          NOW(),
          NOW() + INTERVAL '1 year',
          -100,
          0,
          '{}',
          'DRAFT',
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 2: Invalid rev_share_bps (> 10000)
  console.log('Test 2: Attempting to insert license with rev_share_bps > 10000...');
  await testConstraint(
    'licenses.rev_share_bps BETWEEN 0 AND 10000',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO licenses (
          id, ip_asset_id, brand_id, license_type, start_date, end_date, 
          fee_cents, rev_share_bps, scope_json, status, created_at, updated_at
        ) VALUES (
          'test_high_bps', 
          (SELECT id FROM ip_assets LIMIT 1),
          (SELECT id FROM brands LIMIT 1),
          'NON_EXCLUSIVE',
          NOW(),
          NOW() + INTERVAL '1 year',
          0,
          15000,
          '{}',
          'DRAFT',
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 3: Invalid date range (end before start)
  console.log('Test 3: Attempting to insert license with end_date <= start_date...');
  await testConstraint(
    'licenses.end_date > start_date',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO licenses (
          id, ip_asset_id, brand_id, license_type, start_date, end_date, 
          fee_cents, rev_share_bps, scope_json, status, created_at, updated_at
        ) VALUES (
          'test_bad_dates', 
          (SELECT id FROM ip_assets LIMIT 1),
          (SELECT id FROM brands LIMIT 1),
          'NON_EXCLUSIVE',
          NOW(),
          NOW() - INTERVAL '1 day',
          0,
          0,
          '{}',
          'DRAFT',
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 4: Negative payout amount
  console.log('Test 4: Attempting to insert payout with negative amount...');
  await testConstraint(
    'payouts.amount_cents >= 0',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO payouts (
          id, creator_id, amount_cents, status, retry_count, created_at, updated_at
        ) VALUES (
          'test_neg_payout',
          (SELECT id FROM creators LIMIT 1),
          -500,
          'PENDING',
          0,
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 5: Invalid share_bps in ip_ownerships
  console.log('Test 5: Attempting to insert ownership with share_bps > 10000...');
  // Note: This will also fail the sum constraint, but we're testing the range constraint
  await testConstraint(
    'ip_ownerships.share_bps BETWEEN 0 AND 10000',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO ip_ownerships (
          id, ip_asset_id, creator_id, share_bps, ownership_type,
          start_date, created_by, updated_by, created_at, updated_at
        ) VALUES (
          'test_high_share',
          (SELECT id FROM ip_assets LIMIT 1),
          (SELECT id FROM creators LIMIT 1),
          15000,
          'PRIMARY',
          NOW(),
          (SELECT id FROM users LIMIT 1),
          (SELECT id FROM users LIMIT 1),
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 6: Negative file size
  console.log('Test 6: Attempting to insert IP asset with zero/negative file size...');
  await testConstraint(
    'ip_assets.file_size > 0',
    async () => {
      await prisma.$executeRaw`
        INSERT INTO ip_assets (
          id, title, type, storage_key, file_size, mime_type,
          status, scan_status, version, created_by, created_at, updated_at
        ) VALUES (
          'test_zero_size',
          'Test Asset',
          'IMAGE',
          'test/path',
          0,
          'image/jpeg',
          'DRAFT',
          'PENDING',
          1,
          (SELECT id FROM users LIMIT 1),
          NOW(),
          NOW()
        )
      `;
    }
  );

  // Test 7: Valid data should work
  console.log('Test 7: Inserting valid license (should succeed)...');
  await testConstraint(
    'Valid license insertion',
    async () => {
      const ipAsset = await prisma.ipAsset.findFirst();
      const brand = await prisma.brand.findFirst();
      
      if (!ipAsset || !brand) {
        throw new Error('No test data available');
      }

      const license = await prisma.license.create({
        data: {
          ipAssetId: ipAsset.id,
          brandId: brand.id,
          licenseType: 'NON_EXCLUSIVE',
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          feeCents: 50000,
          revShareBps: 2500,
          scopeJson: { media: ['digital'], placement: ['social'] },
          status: 'DRAFT',
        },
      });

      // Clean up
      await prisma.license.delete({ where: { id: license.id } });
    },
    false // Should NOT fail
  );

  console.log('\n');
}

async function printResults(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 CHECK CONSTRAINTS TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error.substring(0, 100)}...`);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Check constraints may not be working correctly.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! Check constraints are working correctly.');
    process.exit(0);
  }
}

async function main() {
  try {
    await runTests();
    await printResults();
  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
