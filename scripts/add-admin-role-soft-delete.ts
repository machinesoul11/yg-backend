/**
 * Migration Script: Add Soft Delete Fields to AdminRole
 * Run this script to add the soft delete columns to the admin_roles table
 */

import { prisma } from '../src/lib/db';

async function runMigration() {
  console.log('[Migration] Adding soft delete fields to admin_roles table...');

  try {
    // Add deleted_at column
    await prisma.$executeRaw`
      ALTER TABLE admin_roles 
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(3)
    `;
    console.log('✓ Added deleted_at column');

    // Add deleted_by column
    await prisma.$executeRaw`
      ALTER TABLE admin_roles 
      ADD COLUMN IF NOT EXISTS deleted_by TEXT
    `;
    console.log('✓ Added deleted_by column');

    // Add deletion_reason column
    await prisma.$executeRaw`
      ALTER TABLE admin_roles 
      ADD COLUMN IF NOT EXISTS deletion_reason TEXT
    `;
    console.log('✓ Added deletion_reason column');

    // Add index on deleted_at
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS admin_roles_deleted_at_idx 
      ON admin_roles(deleted_at)
    `;
    console.log('✓ Added index on deleted_at');

    // Add composite index on user_id and deleted_at
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS admin_roles_user_id_deleted_at_idx 
      ON admin_roles(user_id, deleted_at)
    `;
    console.log('✓ Added composite index on user_id and deleted_at');

    console.log('\n✅ Migration completed successfully!');
    console.log('Admin roles table now supports soft delete functionality.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
