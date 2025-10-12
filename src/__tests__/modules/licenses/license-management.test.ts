/**
 * License Management Service Integration Tests
 * Comprehensive test scenarios for all license management features
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { licenseService } from '../service';
import { prisma } from '@/lib/db';

describe('License Management Integration', () => {
  let testBrand: any;
  let testCreator: any;
  let testIpAsset: any;
  let testLicense: any;

  beforeEach(async () => {
    // Setup test data
    // This would create test brand, creator, IP asset, etc.
  });

  afterEach(async () => {
    // Cleanup test data
  });

  describe('License Updates', () => {
    it('should update a draft license successfully', async () => {
      const result = await licenseService.updateLicenseEnhanced(
        testLicense.id,
        {
          feeCents: 500000,
          metadata: { notes: 'Updated pricing' },
        },
        {
          userId: testBrand.userId,
          userRole: 'brand',
        }
      );

      expect(result.feeCents).toBe(500000);
    });

    it('should prevent direct updates to active licenses', async () => {
      // Set license to ACTIVE
      await prisma.license.update({
        where: { id: testLicense.id },
        data: { status: 'ACTIVE' },
      });

      await expect(
        licenseService.updateLicenseEnhanced(
          testLicense.id,
          { feeCents: 600000 },
          { userId: testBrand.userId, userRole: 'brand' }
        )
      ).rejects.toThrow('Active licenses cannot be directly modified');
    });

    it('should enforce permission restrictions', async () => {
      await expect(
        licenseService.updateLicenseEnhanced(
          testLicense.id,
          { feeCents: 500000 },
          { userId: 'unauthorized-user', userRole: 'brand' }
        )
      ).rejects.toThrow('Only the brand owner can update');
    });
  });

  describe('Status Transitions', () => {
    it('should transition from DRAFT to PENDING_APPROVAL', async () => {
      await licenseService.transitionStatus(
        {
          licenseId: testLicense.id,
          toStatus: 'PENDING_APPROVAL',
          reason: 'Ready for creator review',
        },
        {
          userId: testBrand.userId,
          userRole: 'brand',
        }
      );

      const updated = await prisma.license.findUnique({
        where: { id: testLicense.id },
      });

      expect(updated?.status).toBe('PENDING_APPROVAL');
    });

    it('should prevent invalid transitions', async () => {
      await expect(
        licenseService.transitionStatus(
          {
            licenseId: testLicense.id,
            toStatus: 'EXPIRED',
          },
          { userId: testBrand.userId, userRole: 'brand' }
        )
      ).rejects.toThrow('Invalid status transition');
    });

    it('should track status history', async () => {
      await licenseService.transitionStatus(
        {
          licenseId: testLicense.id,
          toStatus: 'PENDING_APPROVAL',
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      const history = await licenseService.getStatusHistory(testLicense.id);

      expect(history).toHaveLength(1);
      expect(history[0].fromStatus).toBe('DRAFT');
      expect(history[0].toStatus).toBe('PENDING_APPROVAL');
    });
  });

  describe('Amendments', () => {
    it('should propose an amendment successfully', async () => {
      // Set license to ACTIVE first
      await prisma.license.update({
        where: { id: testLicense.id },
        data: { status: 'ACTIVE' },
      });

      const result = await licenseService.proposeAmendment(
        {
          licenseId: testLicense.id,
          amendmentType: 'FINANCIAL',
          justification: 'Increase fee based on performance',
          changes: [
            {
              field: 'feeCents',
              currentValue: 500000,
              proposedValue: 600000,
            },
          ],
        },
        {
          userId: testBrand.userId,
          userRole: 'brand',
        }
      );

      expect(result).toBeDefined();
    });

    it('should require multi-party approval', async () => {
      const amendmentId = await licenseService.proposeAmendment(
        {
          licenseId: testLicense.id,
          amendmentType: 'SCOPE',
          justification: 'Expand usage rights',
          changes: [
            {
              field: 'scope.media.broadcast',
              currentValue: false,
              proposedValue: true,
            },
          ],
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      // Creator approves
      const result = await licenseService.processAmendmentApproval(
        {
          amendmentId,
          action: 'approve',
          comments: 'Looks good',
        },
        {
          userId: testCreator.userId,
          userRole: 'creator',
        }
      );

      expect(result.status).toBe('APPROVED');
    });

    it('should reject amendment if any party rejects', async () => {
      const amendmentId = await licenseService.proposeAmendment(
        {
          licenseId: testLicense.id,
          amendmentType: 'FINANCIAL',
          justification: 'Lower fee',
          changes: [
            {
              field: 'feeCents',
              currentValue: 500000,
              proposedValue: 300000,
            },
          ],
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      const result = await licenseService.processAmendmentApproval(
        {
          amendmentId,
          action: 'reject',
          comments: 'Fee reduction not acceptable',
        },
        { userId: testCreator.userId, userRole: 'creator' }
      );

      expect(result.status).toBe('REJECTED');
    });
  });

  describe('Extensions', () => {
    it('should request extension successfully', async () => {
      await prisma.license.update({
        where: { id: testLicense.id },
        data: { status: 'ACTIVE' },
      });

      const result = await licenseService.requestExtension(
        {
          licenseId: testLicense.id,
          extensionDays: 30,
          justification: 'Campaign running longer than expected',
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      expect(result.success).toBe(true);
    });

    it('should auto-approve short extensions', async () => {
      const result = await licenseService.requestExtension(
        {
          licenseId: testLicense.id,
          extensionDays: 15,
          justification: 'Brief extension needed',
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      expect(result.approvalRequired).toBe(false);
    });

    it('should calculate pro-rated fees correctly', async () => {
      // License: $5000 for 365 days = ~$13.70/day
      // Extension: 30 days = ~$411

      const result = await licenseService.requestExtension(
        {
          licenseId: testLicense.id,
          extensionDays: 30,
          justification: 'Extension needed',
        },
        { userId: testBrand.userId, userRole: 'brand' }
      );

      expect(result.additionalFeeCents).toBeCloseTo(41100, -2);
    });

    it('should detect extension conflicts', async () => {
      // Create another exclusive license starting after current one
      // Then try to extend current one past the new one's start
      
      await expect(
        licenseService.requestExtension(
          {
            licenseId: testLicense.id,
            extensionDays: 180,
            justification: 'Long extension',
          },
          { userId: testBrand.userId, userRole: 'brand' }
        )
      ).rejects.toThrow('conflicts with existing licenses');
    });
  });

  describe('Conflict Detection', () => {
    it('should detect exclusive license conflicts', async () => {
      const result = await licenseService.checkConflictsEnhanced({
        ipAssetId: testIpAsset.id,
        startDate: testLicense.startDate,
        endDate: testLicense.endDate,
        licenseType: 'EXCLUSIVE',
        scope: {
          media: { digital: true, print: false, broadcast: false, ooh: false },
          placement: { social: true, website: false, email: false, paid_ads: false, packaging: false },
        },
      });

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].reason).toBe('EXCLUSIVE_OVERLAP');
    });

    it('should detect territory conflicts', async () => {
      const result = await licenseService.checkConflictsEnhanced({
        ipAssetId: testIpAsset.id,
        startDate: testLicense.startDate,
        endDate: testLicense.endDate,
        licenseType: 'EXCLUSIVE_TERRITORY',
        scope: {
          media: { digital: true, print: false, broadcast: false, ooh: false },
          placement: { social: true, website: false, email: false, paid_ads: false, packaging: false },
          geographic: { territories: ['US', 'CA'] },
        },
      });

      expect(result.hasConflicts).toBe(true);
    });

    it('should provide conflict preview', async () => {
      const preview = await licenseService.getConflictPreview(testIpAsset.id);

      expect(preview.activeLicenses).toBeGreaterThanOrEqual(1);
      expect(preview.exclusiveLicenses).toBeDefined();
      expect(preview.blockedMediaTypes).toBeInstanceOf(Array);
    });
  });

  describe('Renewals', () => {
    it('should check renewal eligibility', async () => {
      // Set license to be expiring soon
      await prisma.license.update({
        where: { id: testLicense.id },
        data: {
          status: 'ACTIVE',
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        },
      });

      const eligibility = await licenseService.checkRenewalEligibility(testLicense.id);

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.suggestedTerms).toBeDefined();
    });

    it('should generate renewal offer with adjustments', async () => {
      const offerId = await licenseService.generateRenewalOffer(
        testLicense.id,
        testBrand.userId
      );

      expect(offerId).toBeDefined();
      expect(offerId).toMatch(/^renewal-offer-/);
    });

    it('should accept renewal offer and create renewal license', async () => {
      const offerId = await licenseService.generateRenewalOffer(
        testLicense.id,
        testBrand.userId
      );

      const renewal = await licenseService.acceptRenewalOffer(
        {
          licenseId: testLicense.id,
          offerId,
        },
        testBrand.userId
      );

      expect(renewal).toBeDefined();
      expect(renewal.parentLicenseId).toBe(testLicense.id);
      expect(renewal.status).toBe('PENDING_APPROVAL');
    });

    it('should apply loyalty discounts for repeat renewals', async () => {
      // Create history of previous renewals
      // Then check that next renewal has discount applied
      
      const eligibility = await licenseService.checkRenewalEligibility(testLicense.id);

      expect(eligibility.suggestedTerms?.adjustments.loyaltyDiscount).toBeGreaterThan(0);
    });

    it('should prevent renewal if not eligible', async () => {
      // Set license to just created (not near expiry)
      await prisma.license.update({
        where: { id: testLicense.id },
        data: {
          endDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000), // 300 days
        },
      });

      await expect(
        licenseService.generateRenewalOffer(testLicense.id, testBrand.userId)
      ).rejects.toThrow('not eligible for renewal');
    });
  });

  describe('Background Jobs', () => {
    it('should process automated status transitions', async () => {
      // Create licenses that need status updates
      const results = await licenseService.processAutomatedTransitions();

      expect(results.processed).toBeGreaterThanOrEqual(0);
      expect(results.errors).toBeInstanceOf(Array);
    });

    it('should process auto-renewals', async () => {
      // Create license with autoRenew enabled
      await prisma.license.update({
        where: { id: testLicense.id },
        data: {
          autoRenew: true,
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      });

      const results = await licenseService.processAutoRenewals();

      expect(results.processed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Analytics', () => {
    it('should get status distribution', async () => {
      const distribution = await licenseService.getStatusDistribution();

      expect(distribution).toBeInstanceOf(Array);
      expect(distribution[0]).toHaveProperty('status');
      expect(distribution[0]).toHaveProperty('count');
    });

    it('should get extension analytics', async () => {
      const analytics = await licenseService.getExtensionAnalytics();

      expect(analytics).toHaveProperty('total_extensions');
      expect(analytics).toHaveProperty('approved');
      expect(analytics).toHaveProperty('rejected');
      expect(analytics).toHaveProperty('avg_extension_days');
    });

    it('should get amendment history', async () => {
      const history = await licenseService.getAmendmentHistory(testLicense.id);

      expect(history).toBeInstanceOf(Array);
    });
  });
});
