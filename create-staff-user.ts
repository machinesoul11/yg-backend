import { prisma } from './src/lib/db/index.js';
import bcrypt from 'bcryptjs';

async function createUser() {
  const email = 'rfinnegan@yesgoddess.agency';
  const password = 'Marketing2025!';
  const name = 'RJ Finnegan';

  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('✅ User already exists:', email);
      console.log('   ID:', existing.id);
      console.log('   Role:', existing.role);
      console.log('   Has password:', !!existing.password_hash);
      return;
    }

    // Hash the password
    const password_hash = await bcrypt.hash(password, 10);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password_hash,
        name,
        role: 'ADMIN', // Staff user
        email_verified: new Date(), // Pre-verify for staff
      }
    });

    console.log('✅ User created successfully!');
    console.log('   Email:', user.email);
    console.log('   ID:', user.id);
    console.log('   Role:', user.role);
  } catch (error) {
    console.error('❌ Error creating user:', error instanceof Error ? error.message : String(error));
  } finally {
    await prisma.$disconnect();
  }
}

createUser();
