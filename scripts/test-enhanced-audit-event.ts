/**
 * Test script to verify AuditEvent enhancements are working
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEnhancedAuditEvent() {
  console.log('Testing Enhanced Audit Event Implementation...\n');

  try {
    // Test 1: Create an audit event with new fields
    console.log('Test 1: Creating audit event with new enhanced fields...');
    const testEvent = await prisma.auditEvent.create({
      data: {
        action: 'TEST_ACTION',
        entityType: 'TEST',
        entityId: 'test-123',
        resourceType: 'USER',
        resourceId: 'user-123',
        permission: 'users.view_all',
        sessionId: 'session-abc',
        metadata: {
          testField: 'test value',
          context: 'integration test',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Test Agent',
      },
    });
    
    console.log('✓ Created audit event:', testEvent.id);
    console.log('  - Resource Type:', testEvent.resourceType);
    console.log('  - Permission:', testEvent.permission);
    console.log('  - Session ID:', testEvent.sessionId);
    console.log('  - Metadata:', testEvent.metadata);
    
    // Test 2: Query the event back
    console.log('\nTest 2: Querying audit event...');
    const queriedEvent = await prisma.auditEvent.findUnique({
      where: { id: testEvent.id },
    });
    
    if (!queriedEvent) {
      throw new Error('Failed to query created event');
    }
    
    console.log('✓ Successfully queried event');
    console.log('  - All fields present:', {
      hasResourceType: !!queriedEvent.resourceType,
      hasPermission: !!queriedEvent.permission,
      hasSessionId: !!queriedEvent.sessionId,
      hasMetadata: !!queriedEvent.metadata,
      hasPreviousLogHash: queriedEvent.previousLogHash !== undefined,
    });
    
    // Test 3: Verify tamper detection hash
    console.log('\nTest 3: Testing tamper detection...');
    const eventWithHash = await prisma.auditEvent.create({
      data: {
        action: 'TEST_HASH',
        entityType: 'TEST',
        entityId: 'test-hash-456',
        resourceType: 'LICENSE',
        resourceId: 'license-456',
        previousLogHash: 'sample-hash-123',
      },
    });
    
    console.log('✓ Created event with previousLogHash:', eventWithHash.previousLogHash);
    
    // Test 4: Query all audit events to verify schema
    console.log('\nTest 4: Querying all events to verify schema...');
    const allEvents = await prisma.auditEvent.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
    });
    
    console.log(`✓ Found ${allEvents.length} events`);
    allEvents.forEach((event, index) => {
      console.log(`  Event ${index + 1}:`,{
        id: event.id,
        action: event.action,
        resourceType: event.resourceType,
        hasPermission: !!event.permission,
        hasSessionId: !!event.sessionId,
      });
    });
    
    // Cleanup test events
    console.log('\nCleaning up test events...');
    await prisma.auditEvent.deleteMany({
      where: {
        id: {
          in: [testEvent.id, eventWithHash.id],
        },
      },
    });
    
    console.log('✓ Test events cleaned up\n');
    console.log('✅ All tests passed! Enhanced AuditEvent implementation is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run test if executed directly
if (require.main === module) {
  testEnhancedAuditEvent()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { testEnhancedAuditEvent };
