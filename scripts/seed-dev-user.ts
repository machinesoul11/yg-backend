/**
 * Seed Development Staff User
 * Creates internal staff user for development purposes
 */

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedDevUser() {
  console.log('🌱 Seeding development staff user...');

  const email = 'rfinnegan@yesgoddess.agency';
  const password = 'Marketing2025!';
  const name = 'R. Finnegan';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(`✅ User ${email} already exists with ID: ${existingUser.id}`);
      
      // Update password if needed
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { email },
        data: {
          password_hash: passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
          email_verified: new Date(),
          deleted_at: null,
        },
      });
      console.log(`✅ Updated user ${email} with ADMIN role and new credentials`);
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password_hash: passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        email_verified: new Date(),
      },
    });

    console.log(`✅ Created staff user: ${email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Password: ${password}`);

  } catch (error) {
    console.error('❌ Error seeding dev user:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDevUser()
  .then(() => {
    console.log('✅ Development user seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Development user seed failed:', error);
    process.exit(1);
  });
