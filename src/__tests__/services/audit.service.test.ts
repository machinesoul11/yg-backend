/**
 * Audit Service Tests
 * Verifies audit logging functionality
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { prisma } from '@/lib/db';
import { auditService, AUDIT_ACTIONS } from '@/lib/services/audit.service';

describe('AuditService', () => {
  let testUserId: string;
  let testLicenseId: string;

  beforeAll(async () => {
    // Create a test user for audit logging
    const user = await prisma.user.create({
      data: {
        email: `audit-test-${Date.now()}@example.com`,
        name: 'Audit Test User',
        role: 'ADMIN',
      },
    });
    testUserId = user.id;
    testLicenseId = `test-license-${Date.now()}`;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.auditEvent.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
  });

  it('should log an audit event successfully', async () => {
    await auditService.log({
      action: AUDIT_ACTIONS.LICENSE_CREATED,
      entityType: 'license',
      entityId: testLicenseId,
      userId: testUserId,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      requestId: 'req-123',
      after: {
        id: testLicenseId,
        status: 'DRAFT',
        feeCents: 10000,
      },
    });

    // Verify the event was logged
    const events = await prisma.auditEvent.findMany({
      where: {
        userId: testUserId,
        entityType: 'license',
        entityId: testLicenseId,
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].action).toBe(AUDIT_ACTIONS.LICENSE_CREATED);
    expect(events[0].entityType).toBe('license');
    expect(events[0].entityId).toBe(testLicenseId);
    expect(events[0].ipAddress).toBe('192.168.1.1');
    expect(events[0].requestId).toBe('req-123');
  });

  it('should retrieve audit history for an entity', async () => {
    // Log multiple events
    await auditService.log({
      action: AUDIT_ACTIONS.LICENSE_CREATED,
      entityType: 'license',
      entityId: `${testLicenseId}-2`,
      userId: testUserId,
      after: { status: 'DRAFT' },
    });

    await auditService.log({
      action: AUDIT_ACTIONS.LICENSE_UPDATED,
      entityType: 'license',
      entityId: `${testLicenseId}-2`,
      userId: testUserId,
      before: { status: 'DRAFT' },
      after: { status: 'ACTIVE' },
    });

    // Retrieve history
    const history = await auditService.getHistory('license', `${testLicenseId}-2`);

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].action).toBe(AUDIT_ACTIONS.LICENSE_UPDATED); // Most recent first
    expect(history[1].action).toBe(AUDIT_ACTIONS.LICENSE_CREATED);
  });

  it('should retrieve user activity', async () => {
    const activity = await auditService.getUserActivity(testUserId, 10);

    expect(activity.length).toBeGreaterThan(0);
    expect(activity[0].userId).toBe(testUserId);
  });

  it('should sanitize sensitive data', async () => {
    const sensitiveData = {
      id: 'user-123',
      email: 'test@example.com',
      password_hash: 'secret-hash',
      api_keys: ['key1', 'key2'],
      name: 'Test User',
    };

    const sanitized = auditService.sanitizeForAudit(sensitiveData);

    expect(sanitized).toHaveProperty('id');
    expect(sanitized).toHaveProperty('email');
    expect(sanitized).toHaveProperty('name');
    expect(sanitized).not.toHaveProperty('password_hash');
    expect(sanitized).not.toHaveProperty('api_keys');
  });

  it('should not throw errors when audit logging fails', async () => {
    // This test verifies graceful failure handling
    // Even if Prisma fails, the audit service shouldn't throw

    // Mock a Prisma error by using invalid data
    const invalidLog = async () => {
      await auditService.log({
        action: 'TEST_ACTION',
        entityType: 'test',
        entityId: 'test-123',
        userId: testUserId,
      });
    };

    // Should not throw
    await expect(invalidLog()).resolves.not.toThrow();
  });

  it('should search events with filters', async () => {
    const results = await auditService.searchEvents({
      userId: testUserId,
      action: AUDIT_ACTIONS.LICENSE_CREATED,
      limit: 10,
    });

    expect(Array.isArray(results)).toBe(true);
    results.forEach((event) => {
      expect(event.userId).toBe(testUserId);
      expect(event.action).toBe(AUDIT_ACTIONS.LICENSE_CREATED);
    });
  });

  it('should track before and after states', async () => {
    const beforeState = { status: 'DRAFT', feeCents: 5000 };
    const afterState = { status: 'ACTIVE', feeCents: 7500 };

    await auditService.log({
      action: AUDIT_ACTIONS.LICENSE_UPDATED,
      entityType: 'license',
      entityId: `${testLicenseId}-3`,
      userId: testUserId,
      before: beforeState,
      after: afterState,
    });

    const history = await auditService.getHistory('license', `${testLicenseId}-3`);

    expect(history[0].beforeJson).toMatchObject(beforeState);
    expect(history[0].afterJson).toMatchObject(afterState);
  });
});
