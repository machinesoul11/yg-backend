#!/usr/bin/env node
/**
 * Script to manually apply the AdminRole migration
 * Run this if prisma migrate fails
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Applying AdminRole migration...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../prisma/migrations/20251025000000_add_admin_role_system/migration.sql'),
      'utf8'
    );

    // Execute the migration SQL
    await prisma.$executeRawUnsafe(migrationSQL);

    console.log('✓ AdminRole migration applied successfully');
  } catch (error) {
    console.error('Error applying migration:', error.message);
    
    // Check if table already exists
    try {
      const result = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'admin_roles'
        );
      `;
      
      if (result[0].exists) {
        console.log('✓ admin_roles table already exists');
      }
    } catch (checkError) {
      console.error('Error checking table existence:', checkError.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
