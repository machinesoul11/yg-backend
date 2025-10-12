/**
 * Create Staff User
 * Run with: npx tsx create-user.ts
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createUser() {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'rfinnegan@yesgoddess.agency' }
    });

    if (existingUser) {
      console.log('✅ User already exists!');
      console.log({
        id: existingUser.id,
        email: existingUser.email,
        role: existingUser.role,
        emailVerified: existingUser.email_verified ? 'Yes' : 'No'
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash('Marketing2025!', 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: 'rfinnegan@yesgoddess.agency',
        password_hash: passwordHash,
        name: 'RJ Finnegan',
        role: 'ADMIN',
        email_verified: new Date(),
      }
    });

    console.log('✅ User created successfully!');
    console.log({
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: 'Yes'
    });

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await prisma.$disconnect();
  }
}

createUser();
