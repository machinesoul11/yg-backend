/**
 * One-time script to clear all sessions
 * Run this after updating NEXTAUTH_SECRET or cookie configuration
 * 
 * Usage: npx tsx src/scripts/clear-sessions.ts
 */

import { prisma } from '@/lib/db';

async function clearAllSessions() {
  console.log('🔄 Clearing all sessions...');
  
  try {
    const result = await prisma.session.deleteMany({});
    
    console.log(`✅ Deleted ${result.count} sessions`);
    console.log('ℹ️  All users will need to log in again');
    console.log('✨ Session cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error clearing sessions:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearAllSessions()
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
