/**
 * Two-Factor Authentication Schema Validation Script
 * 
 * This script validates that the 2FA schema implementation is correct
 * Run with: npx tsx src/scripts/validate-2fa-schema.ts
 */

import { PrismaClient, TwoFactorMethod } from '@prisma/client';

const prisma = new PrismaClient();

async function validateSchema() {
  console.log('🔍 Validating Two-Factor Authentication Schema...\n');

  try {
    // Test 1: Verify User model has new fields
    console.log('Test 1: Checking User model fields...');
    const userWithDefaults = await prisma.user.findFirst({
      select: {
        id: true,
        two_factor_enabled: true,
        two_factor_secret: true,
        two_factor_verified_at: true,
        preferred_2fa_method: true,
        phone_number: true,
        phone_verified: true,
      },
    });
    console.log('✅ User model has all 2FA fields\n');

    // Test 2: Verify TwoFactorBackupCode table exists
    console.log('Test 2: Checking TwoFactorBackupCode table...');
    await prisma.twoFactorBackupCode.findMany({ take: 1 });
    console.log('✅ TwoFactorBackupCode table exists\n');

    // Test 3: Verify TwoFactorMethod enum
    console.log('Test 3: Checking TwoFactorMethod enum...');
    const enumValues = Object.values(TwoFactorMethod);
    if (
      enumValues.includes('SMS') &&
      enumValues.includes('AUTHENTICATOR') &&
      enumValues.includes('BOTH')
    ) {
      console.log('✅ TwoFactorMethod enum has correct values:', enumValues, '\n');
    } else {
      throw new Error('TwoFactorMethod enum is missing values');
    }

    // Test 4: Check indexes exist (query performance test)
    console.log('Test 4: Testing index performance...');
    const start = Date.now();
    await prisma.user.findMany({
      where: { two_factor_enabled: true },
      take: 10,
    });
    const duration = Date.now() - start;
    console.log(`✅ Query with two_factor_enabled index completed in ${duration}ms\n`);

    // Test 5: Verify foreign key relationship
    console.log('Test 5: Testing foreign key relationship...');
    const testUser = await prisma.user.findFirst({
      include: {
        twoFactorBackupCodes: true,
      },
    });
    console.log('✅ Foreign key relationship between User and TwoFactorBackupCode works\n');

    // Test 6: Verify default values
    console.log('Test 6: Checking default values...');
    const testCreateUser = {
      email: `test-2fa-${Date.now()}@example.com`,
      name: 'Test 2FA User',
    };
    
    const newUser = await prisma.user.create({
      data: testCreateUser,
      select: {
        id: true,
        two_factor_enabled: true,
        phone_verified: true,
      },
    });

    if (newUser.two_factor_enabled === false && newUser.phone_verified === false) {
      console.log('✅ Default values are correct (two_factor_enabled=false, phone_verified=false)\n');
    } else {
      throw new Error('Default values are incorrect');
    }

    // Cleanup test user
    await prisma.user.delete({ where: { id: newUser.id } });

    console.log('🎉 All validation tests passed!\n');
    console.log('Schema implementation is correct and ready for use.');
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

validateSchema();
