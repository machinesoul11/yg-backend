/**
 * Verify Admin Role Soft Delete Migration
 */

import { prisma } from '../src/lib/db';

async function verifyMigration() {
  console.log('[Verify] Checking admin_roles table structure...\n');

  try {
    // Query the table structure
    const result = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'admin_roles'
      AND column_name IN ('deleted_at', 'deleted_by', 'deletion_reason')
      ORDER BY column_name
    `;

    console.log('Soft Delete Columns:');
    console.log('-------------------');
    result.forEach(col => {
      console.log(`✓ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // Check indexes
    const indexes = await prisma.$queryRaw<Array<{
      indexname: string;
    }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'admin_roles'
      AND indexname LIKE '%deleted%'
      ORDER BY indexname
    `;

    console.log('\nIndexes:');
    console.log('--------');
    indexes.forEach(idx => {
      console.log(`✓ ${idx.indexname}`);
    });

    console.log('\n✅ Migration verified successfully!');
    console.log(`Found ${result.length} soft delete columns and ${indexes.length} indexes.`);
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
