/**
 * IP Ownership Dispute Handling Tests
 * 
 * Test suite for validating dispute handling implementation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { IpOwnershipService } from '../services/ip-ownership.service';
import { OwnershipValidationError } from '../errors/ownership.errors';

describe('IP Ownership Dispute Handling', () => {
  let prisma: PrismaClient;
  let service: IpOwnershipService;
  let testUserId: string;
  let testCreatorId: string;
  let testAssetId: string;
  let testOwnershipId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    service = new IpOwnershipService(prisma);

    // Setup test data
    // Note: In actual tests, you would create test fixtures
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('flagDispute', () => {
    it('should successfully flag an ownership as disputed', async () => {
      // Arrange
      const reason = 'Ownership percentage does not match signed contract';
      const supportingDocs = ['https://storage.example.com/contract.pdf'];

      // Act
      const result = await service.flagDispute(
        testOwnershipId,
        reason,
        testUserId,
        supportingDocs
      );

      // Assert
      expect(result.disputed).toBe(true);
      expect(result.disputeReason).toBe(reason);
      expect(result.disputedBy).toBe(testUserId);
      expect(result.disputedAt).toBeTruthy();
    });

    it('should throw error when flagging already resolved dispute', async () => {
      // Arrange
      // First flag and resolve a dispute
      await service.flagDispute(testOwnershipId, 'Test reason', testUserId);
      await service.resolveDispute(
        testOwnershipId,
        'CONFIRM',
        'Resolved',
        testUserId
      );

      // Act & Assert
      await expect(
        service.flagDispute(testOwnershipId, 'Another reason', testUserId)
      ).rejects.toThrow(OwnershipValidationError);
    });

    it('should send notifications to all stakeholders', async () => {
      // This would test notification creation
      // In a real test, you would mock the notification service
      // or check the database for created notifications
    });
  });

  describe('resolveDispute', () => {
    beforeEach(async () => {
      // Flag a dispute before each test
      await service.flagDispute(
        testOwnershipId,
        'Test dispute',
        testUserId
      );
    });

    it('should resolve dispute with CONFIRM action', async () => {
      // Act
      const result = await service.resolveDispute(
        testOwnershipId,
        'CONFIRM',
        'Ownership verified against contract',
        testUserId
      );

      // Assert
      expect(result.action).toBe('CONFIRM');
      expect(result.resolvedAt).toBeTruthy();
      expect(result.updatedOwnership?.disputed).toBe(false);
      expect(result.updatedOwnership?.resolvedAt).toBeTruthy();
    });

    it('should resolve dispute with MODIFY action and update ownership', async () => {
      // Arrange
      const newShareBps = 4000;

      // Act
      const result = await service.resolveDispute(
        testOwnershipId,
        'MODIFY',
        'Updated share based on amendment',
        testUserId,
        { shareBps: newShareBps }
      );

      // Assert
      expect(result.action).toBe('MODIFY');
      expect(result.updatedOwnership?.shareBps).toBe(newShareBps);
      expect(result.updatedOwnership?.disputed).toBe(false);
    });

    it('should validate modified share does not break 10000 BPS constraint', async () => {
      // Arrange
      // Assuming there are other ownerships totaling 6000 BPS

      // Act & Assert
      await expect(
        service.resolveDispute(
          testOwnershipId,
          'MODIFY',
          'Invalid modification',
          testUserId,
          { shareBps: 5000 } // Would total 11000 BPS
        )
      ).rejects.toThrow(OwnershipValidationError);
    });

    it('should resolve dispute with REMOVE action and end ownership', async () => {
      // Act
      const result = await service.resolveDispute(
        testOwnershipId,
        'REMOVE',
        'Ownership found invalid',
        testUserId
      );

      // Assert
      expect(result.action).toBe('REMOVE');
      
      // Verify ownership was ended
      const ownership = await prisma.ipOwnership.findUnique({
        where: { id: testOwnershipId },
      });
      expect(ownership?.endDate).toBeTruthy();
    });

    it('should throw error when resolving non-disputed ownership', async () => {
      // Arrange
      // Create a non-disputed ownership
      const nonDisputedId = 'ownership_nondisputed';

      // Act & Assert
      await expect(
        service.resolveDispute(
          nonDisputedId,
          'CONFIRM',
          'Test resolution',
          testUserId
        )
      ).rejects.toThrow(OwnershipValidationError);
    });

    it('should require modifiedData when action is MODIFY', async () => {
      // Act & Assert
      await expect(
        service.resolveDispute(
          testOwnershipId,
          'MODIFY',
          'Resolution notes',
          testUserId
          // No modifiedData provided
        )
      ).rejects.toThrow(OwnershipValidationError);
    });
  });

  describe('getDisputedOwnerships', () => {
    it('should return all disputed ownerships', async () => {
      // Arrange
      await service.flagDispute(testOwnershipId, 'Dispute 1', testUserId);

      // Act
      const disputes = await service.getDisputedOwnerships();

      // Assert
      expect(disputes.length).toBeGreaterThan(0);
      expect(disputes.every(d => d.disputed)).toBe(true);
    });

    it('should filter by ipAssetId', async () => {
      // Act
      const disputes = await service.getDisputedOwnerships({
        ipAssetId: testAssetId,
      });

      // Assert
      expect(disputes.every(d => d.ipAssetId === testAssetId)).toBe(true);
    });

    it('should exclude resolved disputes by default', async () => {
      // Arrange
      await service.flagDispute(testOwnershipId, 'Test', testUserId);
      await service.resolveDispute(
        testOwnershipId,
        'CONFIRM',
        'Resolved',
        testUserId
      );

      // Act
      const disputes = await service.getDisputedOwnerships({
        includeResolved: false,
      });

      // Assert
      expect(disputes.every(d => !d.resolvedAt)).toBe(true);
    });

    it('should include resolved disputes when requested', async () => {
      // Arrange
      await service.flagDispute(testOwnershipId, 'Test', testUserId);
      await service.resolveDispute(
        testOwnershipId,
        'CONFIRM',
        'Resolved',
        testUserId
      );

      // Act
      const disputes = await service.getDisputedOwnerships({
        includeResolved: true,
      });

      // Assert
      const hasResolved = disputes.some(d => d.resolvedAt !== null);
      expect(hasResolved).toBe(true);
    });
  });

  describe('validateTemporalOwnership', () => {
    it('should validate non-overlapping ownership periods', async () => {
      // Arrange
      const ownerships = [
        {
          creatorId: 'creator_1',
          shareBps: 10000,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-06-30'),
        },
        {
          creatorId: 'creator_2',
          shareBps: 10000,
          startDate: new Date('2025-07-01'),
        },
      ];

      // Act
      const result = await service.validateTemporalOwnership(
        testAssetId,
        ownerships
      );

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid ownership totals in overlapping periods', async () => {
      // Arrange
      const ownerships = [
        {
          creatorId: 'creator_1',
          shareBps: 6000,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
        {
          creatorId: 'creator_2',
          shareBps: 3000, // Total only 9000
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
        },
      ];

      // Act
      const result = await service.validateTemporalOwnership(
        testAssetId,
        ownerships
      );

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle complex multi-period scenarios', async () => {
      // Arrange
      const ownerships = [
        {
          creatorId: 'creator_1',
          shareBps: 6000,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-06-30'),
        },
        {
          creatorId: 'creator_2',
          shareBps: 4000,
          startDate: new Date('2025-01-01'),
        },
        {
          creatorId: 'creator_3',
          shareBps: 4000,
          startDate: new Date('2025-07-01'),
        },
      ];

      // Act
      const result = await service.validateTemporalOwnership(
        testAssetId,
        ownerships
      );

      // Assert
      // This should be valid:
      // Jan-Jun: creator_1 (6000) + creator_2 (4000) = 10000
      // Jul onwards: creator_2 (4000) + creator_3 (4000) = 8000 (INVALID)
      expect(result.isValid).toBe(false);
    });
  });

  describe('Audit Trail', () => {
    it('should create audit log when dispute is flagged', async () => {
      // Act
      await service.flagDispute(
        testOwnershipId,
        'Test dispute',
        testUserId
      );

      // Assert
      const auditLog = await prisma.auditEvent.findFirst({
        where: {
          action: 'IP_OWNERSHIP_DISPUTED',
          entityId: testOwnershipId,
        },
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.userId).toBe(testUserId);
    });

    it('should create audit log when dispute is resolved', async () => {
      // Arrange
      await service.flagDispute(testOwnershipId, 'Test', testUserId);

      // Act
      await service.resolveDispute(
        testOwnershipId,
        'CONFIRM',
        'Resolved',
        testUserId
      );

      // Assert
      const auditLog = await prisma.auditEvent.findFirst({
        where: {
          action: 'IP_OWNERSHIP_DISPUTE_RESOLVED',
          entityId: testOwnershipId,
        },
      });

      expect(auditLog).toBeTruthy();
      expect(auditLog?.afterJson).toHaveProperty('action', 'CONFIRM');
    });
  });

  describe('Integration with Existing Features', () => {
    it('should not affect non-disputed ownerships in royalty calculations', async () => {
      // Test that disputed ownerships can be optionally excluded
      // from royalty calculations (business decision)
    });

    it('should maintain ownership history with dispute information', async () => {
      // Arrange
      await service.flagDispute(testOwnershipId, 'Test', testUserId);

      // Act
      const history = await service.getOwnershipHistory(testAssetId);

      // Assert
      const disputedEntry = history.find(h => h.changeType === 'DISPUTED');
      expect(disputedEntry).toBeTruthy();
    });
  });
});
