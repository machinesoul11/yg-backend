/**
 * License Validation Service Tests
 * Tests for comprehensive license validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LicenseValidationService } from '../../../modules/licenses/services/licenseValidationService';
import type { LicenseValidationInput } from '../../../modules/licenses/services/licenseValidationService';
import type { LicenseScope } from '../../../modules/licenses/types';
import { prisma } from '@/lib/db';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    license: {
      findMany: vi.fn(),
    },
    brand: {
      findUnique: vi.fn(),
    },
    ipAsset: {
      findUnique: vi.fn(),
    },
  },
}));

describe('LicenseValidationService', () => {
  let service: LicenseValidationService;
  let mockScope: LicenseScope;
  let mockInput: LicenseValidationInput;

  beforeEach(() => {
    service = new LicenseValidationService();
    vi.clearAllMocks();

    mockScope = {
      media: {
        digital: true,
        print: false,
        broadcast: false,
        ooh: false,
      },
      placement: {
        social: true,
        website: false,
        email: false,
        paid_ads: false,
        packaging: false,
      },
      geographic: {
        territories: ['US'],
      },
    };

    mockInput = {
      ipAssetId: 'asset-1',
      brandId: 'brand-1',
      licenseType: 'NON_EXCLUSIVE',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      scope: mockScope,
      feeCents: 100000, // $1,000
      revShareBps: 500, // 5%
    };
  });

  describe('validateDateOverlap', () => {
    it('should pass validation when no overlapping licenses exist', async () => {
      vi.mocked(prisma.license.findMany).mockResolvedValue([]);

      const result = await service.validateDateOverlap(mockInput);

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when end date is before start date', async () => {
      const invalidInput = {
        ...mockInput,
        startDate: new Date('2025-12-31'),
        endDate: new Date('2025-01-01'),
      };

      const result = await service.validateDateOverlap(invalidInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('End date must be after start date');
    });

    it('should detect date overlap with exclusive licenses', async () => {
      const overlappingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'EXCLUSIVE',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: mockScope,
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([overlappingLicense as any]);

      const result = await service.validateDateOverlap(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.details?.conflicts).toBeDefined();
    });

    it('should allow non-exclusive licenses to overlap with warnings', async () => {
      const overlappingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'NON_EXCLUSIVE',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: mockScope,
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([overlappingLicense as any]);

      const result = await service.validateDateOverlap(mockInput);

      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateExclusivity', () => {
    it('should fail when trying to create exclusive license with existing active license', async () => {
      const existingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'NON_EXCLUSIVE',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: mockScope,
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([existingLicense as any]);

      const exclusiveInput = {
        ...mockInput,
        licenseType: 'EXCLUSIVE' as const,
      };

      const result = await service.validateExclusivity(exclusiveInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Exclusive license conflict')
      );
    });

    it('should fail when existing exclusive license blocks new license', async () => {
      const existingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'EXCLUSIVE',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: mockScope,
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([existingLicense as any]);

      const result = await service.validateExclusivity(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect territory exclusivity conflicts', async () => {
      const existingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'EXCLUSIVE_TERRITORY',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: {
          ...mockScope,
          geographic: { territories: ['US', 'CA'] },
        },
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([existingLicense as any]);

      const territoryInput = {
        ...mockInput,
        licenseType: 'EXCLUSIVE_TERRITORY' as const,
      };

      const result = await service.validateExclusivity(territoryInput);

      expect(result.passed).toBe(false);
      expect(result.details?.conflicts).toBeDefined();
    });
  });

  describe('validateScopeConflicts', () => {
    it('should fail when no media types are selected', async () => {
      const invalidInput = {
        ...mockInput,
        scope: {
          ...mockScope,
          media: {
            digital: false,
            print: false,
            broadcast: false,
            ooh: false,
          },
        },
      };

      const result = await service.validateScopeConflicts(invalidInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('At least one media type must be selected');
    });

    it('should fail when no placements are selected', async () => {
      const invalidInput = {
        ...mockInput,
        scope: {
          ...mockScope,
          placement: {
            social: false,
            website: false,
            email: false,
            paid_ads: false,
            packaging: false,
          },
        },
      };

      const result = await service.validateScopeConflicts(invalidInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('At least one placement must be selected');
    });

    it('should warn about scope overlaps with non-exclusive licenses', async () => {
      const overlappingLicense = {
        id: 'license-1',
        ipAssetId: 'asset-1',
        brandId: 'brand-2',
        licenseType: 'NON_EXCLUSIVE',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-12-31'),
        status: 'ACTIVE',
        scopeJson: mockScope,
        deletedAt: null,
        brand: {
          id: 'brand-2',
          companyName: 'Test Brand',
        },
      };

      vi.mocked(prisma.license.findMany).mockResolvedValue([overlappingLicense as any]);

      const result = await service.validateScopeConflicts(mockInput);

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateBudgetAvailability', () => {
    it('should pass for zero-fee licenses', async () => {
      const zeroFeeInput = {
        ...mockInput,
        feeCents: 0,
      };

      const result = await service.validateBudgetAvailability(zeroFeeInput);

      expect(result.passed).toBe(true);
      expect(result.warnings).toContain(
        'License fee is $0 - budget validation skipped'
      );
    });

    it('should fail for unverified brands exceeding budget limit', async () => {
      vi.mocked(prisma.brand.findUnique).mockResolvedValueOnce({
        id: 'brand-1',
        companyName: 'Test Brand',
        totalSpent: 0,
      } as any);

      vi.mocked(prisma.license.findMany).mockResolvedValue([]);

      vi.mocked(prisma.brand.findUnique).mockResolvedValueOnce({
        isVerified: false,
        totalSpent: 0,
      } as any);

      const highFeeInput = {
        ...mockInput,
        feeCents: 2000000, // $20,000 - over limit for unverified
      };

      const result = await service.validateBudgetAvailability(highFeeInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Budget limit exceeded'));
    });

    it('should warn for high-value licenses from verified brands', async () => {
      vi.mocked(prisma.brand.findUnique).mockResolvedValueOnce({
        id: 'brand-1',
        companyName: 'Test Brand',
        totalSpent: 0,
      } as any);

      vi.mocked(prisma.license.findMany).mockResolvedValue([]);

      vi.mocked(prisma.brand.findUnique).mockResolvedValueOnce({
        isVerified: true,
        totalSpent: 0,
      } as any);

      const highFeeInput = {
        ...mockInput,
        feeCents: 15000000, // $150,000
      };

      const result = await service.validateBudgetAvailability(highFeeInput);

      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateOwnership', () => {
    it('should fail when IP asset is not found', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue(null);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('IP asset not found');
    });

    it('should fail when IP asset is deleted', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        deletedAt: new Date(),
        ownerships: [],
      } as any);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain('Cannot license a deleted IP asset');
    });

    it('should fail when no ownership records exist', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        title: 'Test Asset',
        status: 'PUBLISHED',
        deletedAt: null,
        ownerships: [],
      } as any);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        'IP asset has no ownership records - cannot license'
      );
    });

    it('should fail when total ownership shares do not equal 100%', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        title: 'Test Asset',
        status: 'PUBLISHED',
        deletedAt: null,
        ownerships: [
          {
            creatorId: 'creator-1',
            shareBps: 5000, // Only 50%
            ownershipType: 'PRIMARY',
            disputed: false,
            creator: {
              user: {
                id: 'user-1',
                name: 'Creator 1',
                email: 'creator1@test.com',
                isActive: true,
                deleted_at: null,
              },
            },
          },
        ],
      } as any);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Total shares must equal 100%')
      );
    });

    it('should pass with valid ownership structure', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        title: 'Test Asset',
        status: 'PUBLISHED',
        deletedAt: null,
        ownerships: [
          {
            creatorId: 'creator-1',
            shareBps: 10000, // 100%
            ownershipType: 'PRIMARY',
            disputed: false,
            contractReference: 'CONTRACT-001',
            creator: {
              user: {
                id: 'user-1',
                name: 'Creator 1',
                email: 'creator1@test.com',
                isActive: true,
                deleted_at: null,
              },
            },
          },
        ],
      } as any);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when ownership is disputed', async () => {
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        title: 'Test Asset',
        status: 'PUBLISHED',
        deletedAt: null,
        ownerships: [
          {
            creatorId: 'creator-1',
            shareBps: 10000,
            ownershipType: 'PRIMARY',
            disputed: true,
            creator: {
              user: {
                id: 'user-1',
                name: 'Creator 1',
                email: 'creator1@test.com',
                isActive: true,
                deleted_at: null,
              },
            },
          },
        ],
      } as any);

      const result = await service.validateOwnership(mockInput);

      expect(result.passed).toBe(false);
      expect(result.errors).toContain(
        expect.stringContaining('Ownership is disputed')
      );
    });
  });

  describe('validateApprovalRequirements', () => {
    beforeEach(() => {
      vi.mocked(prisma.brand.findUnique).mockResolvedValue({
        id: 'brand-1',
        companyName: 'Test Brand',
        isVerified: true,
        verificationStatus: 'approved',
      } as any);

      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        ownerships: [
          {
            creator: {
              userId: 'user-1',
              user: {
                id: 'user-1',
                name: 'Creator 1',
                email: 'creator1@test.com',
              },
            },
          },
        ],
      } as any);
    });

    it('should require approval for high-value licenses', async () => {
      const highValueInput = {
        ...mockInput,
        feeCents: 1500000, // $15,000
      };

      const result = await service.validateApprovalRequirements(highValueInput);

      expect(result.passed).toBe(true);
      expect(result.details?.approvalRequired).toBe(true);
      expect(result.details?.reasons).toContain(
        expect.stringContaining('High-value license')
      );
    });

    it('should require approval for exclusive licenses', async () => {
      const exclusiveInput = {
        ...mockInput,
        licenseType: 'EXCLUSIVE' as const,
      };

      const result = await service.validateApprovalRequirements(exclusiveInput);

      expect(result.passed).toBe(true);
      expect(result.details?.approvalRequired).toBe(true);
      expect(result.details?.reasons).toContain(
        expect.stringContaining('Exclusive licenses require')
      );
    });

    it('should require approval for unverified brands', async () => {
      vi.mocked(prisma.brand.findUnique).mockResolvedValue({
        id: 'brand-1',
        companyName: 'Test Brand',
        isVerified: false,
        verificationStatus: 'pending',
      } as any);

      const result = await service.validateApprovalRequirements(mockInput);

      expect(result.passed).toBe(true);
      expect(result.details?.approvalRequired).toBe(true);
      expect(result.details?.reasons).toContain(
        expect.stringContaining('Unverified brands')
      );
    });

    it('should require creator approval for all licenses', async () => {
      const result = await service.validateApprovalRequirements(mockInput);

      expect(result.passed).toBe(true);
      expect(result.details?.approvalRequired).toBe(true);
      expect(result.details?.reasons).toContain('Creator approval required for all licenses');
    });
  });

  describe('validateLicense (comprehensive)', () => {
    beforeEach(() => {
      // Setup mocks for comprehensive validation
      vi.mocked(prisma.license.findMany).mockResolvedValue([]);
      vi.mocked(prisma.brand.findUnique).mockResolvedValue({
        id: 'brand-1',
        companyName: 'Test Brand',
        isVerified: true,
        verificationStatus: 'approved',
        totalSpent: 0,
      } as any);
      vi.mocked(prisma.ipAsset.findUnique).mockResolvedValue({
        id: 'asset-1',
        title: 'Test Asset',
        status: 'PUBLISHED',
        deletedAt: null,
        ownerships: [
          {
            creatorId: 'creator-1',
            shareBps: 10000,
            ownershipType: 'PRIMARY',
            disputed: false,
            contractReference: 'CONTRACT-001',
            creator: {
              userId: 'user-1',
              user: {
                id: 'user-1',
                name: 'Creator 1',
                email: 'creator1@test.com',
                isActive: true,
                deleted_at: null,
              },
            },
          },
        ],
      } as any);
    });

    it('should pass all validations for valid license', async () => {
      const result = await service.validateLicense(mockInput, { validateAll: true });

      expect(result.valid).toBe(true);
      expect(result.allErrors).toHaveLength(0);
      expect(result.checks.dateOverlap.passed).toBe(true);
      expect(result.checks.exclusivity.passed).toBe(true);
      expect(result.checks.scopeConflict.passed).toBe(true);
      expect(result.checks.budgetAvailability.passed).toBe(true);
      expect(result.checks.ownershipVerification.passed).toBe(true);
      expect(result.checks.approvalRequirements.passed).toBe(true);
    });

    it('should collect all errors when validateAll is true', async () => {
      const invalidInput = {
        ...mockInput,
        endDate: new Date('2024-01-01'), // Before start date
        scope: {
          ...mockScope,
          media: {
            digital: false,
            print: false,
            broadcast: false,
            ooh: false,
          },
        },
      };

      const result = await service.validateLicense(invalidInput, { validateAll: true });

      expect(result.valid).toBe(false);
      expect(result.allErrors.length).toBeGreaterThan(1); // Multiple errors
    });

    it('should stop at first error when validateAll is false', async () => {
      const invalidInput = {
        ...mockInput,
        endDate: new Date('2024-01-01'), // Before start date
      };

      const result = await service.validateLicense(invalidInput, { validateAll: false });

      expect(result.valid).toBe(false);
      expect(result.allErrors.length).toBe(1); // Only first error
    });
  });
});
