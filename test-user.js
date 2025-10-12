const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'rfinnegan@yesgoddess.agency' }
    });
    if (user) {
      console.log('✅ User found:', {
        id: user.id,
        email: user.email,
        role: user.role,
        hasPassword: !!user.password_hash,
        emailVerified: !!user.email_verified
      });
    } else {
      console.log('❌ User NOT found with email: rfinnegan@yesgoddess.agency');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();
