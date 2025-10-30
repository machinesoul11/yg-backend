/**
 * Emergency Super Admin Grant Script
 * Run this with: npx tsx scripts/grant-super-admin.ts <user-email>
 */

import { PrismaClient } from '@prisma/client';
import { cuid } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

async function grantSuperAdmin(email: string) {
  try {
    console.log(`🔍 Looking up user: ${email}`);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user:`, user);

    // Check if already has SUPER_ADMIN role
    const existingRole = await prisma.adminRole.findFirst({
      where: {
        userId: user.id,
        department: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    if (existingRole) {
      console.log(`ℹ️  User already has SUPER_ADMIN role:`, existingRole.id);
      return;
    }

    // Update user role to ADMIN if not already
    if (user.role !== 'ADMIN') {
      console.log(`🔄 Updating user role from ${user.role} to ADMIN`);
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' },
      });
    }

    // Create SUPER_ADMIN role
    console.log(`🎁 Granting SUPER_ADMIN role...`);
    const adminRole = await prisma.adminRole.create({
      data: {
        id: cuid(),
        userId: user.id,
        department: 'SUPER_ADMIN',
        seniority: 'SENIOR',
        permissions: ['*:*'], // Wildcard = full access
        isActive: true,
        createdBy: user.id, // Self-assigned
      },
    });

    console.log(`✅ SUPER_ADMIN role created:`, adminRole.id);
    console.log(`🎉 ${user.email} is now a Super Admin!`);
    console.log(`\nPermissions granted: *:* (all permissions)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/grant-super-admin.ts <user-email>');
  process.exit(1);
}

grantSuperAdmin(email);
