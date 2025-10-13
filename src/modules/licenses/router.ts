/**
 * Licenses tRPC Router
 * API endpoints for license management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, adminProcedure } from '@/lib/trpc';
import { licenseService } from './service';
import type { LicenseResponse, LicenseScope } from './types';

// ===========================
// Validation Schemas
// ===========================

const LicenseScopeSchema = z.object({
  media: z.object({
    digital: z.boolean(),
    print: z.boolean(),
    broadcast: z.boolean(),
    ooh: z.boolean(),
  }),
  placement: z.object({
    social: z.boolean(),
    website: z.boolean(),
    email: z.boolean(),
    paid_ads: z.boolean(),
    packaging: z.boolean(),
  }),
  geographic: z.object({
    territories: z.array(z.string()),
  }).optional(),
  exclusivity: z.object({
    category: z.string().optional(),
    competitors: z.array(z.string()).optional(),
  }).optional(),
  cutdowns: z.object({
    allowEdits: z.boolean(),
    maxDuration: z.number().optional(),
    aspectRatios: z.array(z.string()).optional(),
  }).optional(),
  attribution: z.object({
    required: z.boolean(),
    format: z.string().optional(),
  }).optional(),
});

const CreateLicenseSchema = z.object({
  ipAssetId: z.string().cuid(),
  brandId: z.string().cuid(),
  projectId: z.string().cuid().optional(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  feeCents: z.number().int().min(0),
  revShareBps: z.number().int().min(0).max(10000),
  paymentTerms: z.string().optional(),
  billingFrequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  scope: LicenseScopeSchema,
  autoRenew: z.boolean().default(false),
  metadata: z.record(z.string(), z.any()).optional(),
});

const UpdateLicenseSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'SUSPENDED']).optional(),
  endDate: z.string().datetime().optional(),
  feeCents: z.number().int().min(0).optional(),
  revShareBps: z.number().int().min(0).max(10000).optional(),
  paymentTerms: z.string().optional(),
  billingFrequency: z.enum(['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional(),
  scope: LicenseScopeSchema.optional(),
  autoRenew: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const LicenseFiltersSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'SUSPENDED']).optional(),
  ipAssetId: z.string().cuid().optional(),
  brandId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']).optional(),
  expiringBefore: z.string().datetime().optional(),
  creatorId: z.string().cuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const ConflictCheckSchema = z.object({
  ipAssetId: z.string().cuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'EXCLUSIVE_TERRITORY']),
  scope: LicenseScopeSchema,
  excludeLicenseId: z.string().cuid().optional(),
});

const GenerateRenewalSchema = z.object({
  licenseId: z.string().cuid(),
  durationDays: z.number().int().min(1).optional(),
  feeAdjustmentPercent: z.number().optional(),
  revShareAdjustmentBps: z.number().int().optional(),
});

const TerminateLicenseSchema = z.object({
  id: z.string().cuid(),
  reason: z.string().min(10).max(500),
  effectiveDate: z.string().datetime().optional(),
});

// ===========================
// Helper Functions
// ===========================

/**
 * Transform database model to API response
 */
function transformLicenseForAPI(license: any): LicenseResponse {
  return {
    id: license.id,
    ipAssetId: license.ipAssetId || license.ipId,
    brandId: license.brandId,
    projectId: license.projectId,
    licenseType: license.licenseType || 'NON_EXCLUSIVE',
    status: license.status,
    startDate: license.startDate.toISOString(),
    endDate: license.endDate.toISOString(),
    signedAt: license.signedAt?.toISOString() || null,
    feeCents: license.feeCents || 0,
    feeDollars: (license.feeCents || 0) / 100,
    revShareBps: license.revShareBps || 0,
    revSharePercent: (license.revShareBps || 0) / 100,
    paymentTerms: license.paymentTerms || null,
    billingFrequency: license.billingFrequency || null,
    scope: (license.scopeJson || {}) as LicenseScope,
    autoRenew: license.autoRenew || false,
    renewalNotifiedAt: license.renewalNotifiedAt?.toISOString() || null,
    parentLicenseId: license.parentLicenseId || null,
    signatureProof: license.signatureProof || null,
    metadata: (license.metadata as any) || null,
    createdAt: license.createdAt.toISOString(),
    updatedAt: license.updatedAt.toISOString(),
    ...(license.ipAsset && { ipAsset: license.ipAsset }),
    ...(license.brand && { brand: license.brand }),
    ...(license.project && { project: license.project }),
    ...(license.parentLicense && { parentLicense: transformLicenseForAPI(license.parentLicense) }),
    ...(license.renewals && { renewals: license.renewals.map(transformLicenseForAPI) }),
  };
}

/**
 * Check if user can access a license
 */
function canAccessLicense(user: any, license: any): boolean {
  // Admins can access all licenses
  if (user.role === 'ADMIN') return true;

  // Brands can access their own licenses
  if (user.role === 'BRAND' && user.brandId === license.brandId) return true;

  // Creators can access licenses for their assets
  if (user.role === 'CREATOR' && license.ipAsset?.ownerships) {
    return license.ipAsset.ownerships.some(
      (o: any) => o.creator?.userId === user.id
    );
  }

  return false;
}

// ===========================
// Router Definition
// ===========================

export const licensesRouter = createTRPCRouter({
  /**
   * CREATE: Brand proposes a license
   */
  create: protectedProcedure
    .input(CreateLicenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify user is brand owner or admin
        if (ctx.session.user.role !== 'ADMIN') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== input.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Cannot create license for another brand',
            });
          }
        }

        const license = await licenseService.createLicense(input, ctx.session.user.id);
        return { data: transformLicenseForAPI(license) };
      } catch (error: any) {
        if (error.name === 'LicenseConflictError') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'License conflicts with existing agreements',
            cause: error.conflicts,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create license',
        });
      }
    }),

  /**
   * GET: List licenses (filtered by role)
   */
  list: protectedProcedure
    .input(LicenseFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        let userBrandId: string | undefined;
        let userCreatorId: string | undefined;

        // Get user's brand ID if they're a brand
        if (ctx.session.user.role === 'BRAND') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });
          userBrandId = userBrand?.id;
        }

        // Get user's creator ID if they're a creator
        if (ctx.session.user.role === 'CREATOR') {
          const userCreator = await ctx.db.creator.findUnique({
            where: { userId: ctx.session.user.id },
          });
          userCreatorId = userCreator?.id;
        }

        const result = await licenseService.listLicenses(
          input,
          ctx.session.user.role,
          userBrandId,
          userCreatorId
        );

        return {
          data: result.licenses.map(transformLicenseForAPI),
          meta: {
            pagination: {
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
              totalPages: result.totalPages,
            },
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to list licenses',
        });
      }
    }),

  /**
   * GET: Single license details
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const license = await licenseService.getLicenseById(input.id);

        if (!license) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify access
        if (!canAccessLicense(ctx.session.user, license)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to view this license',
          });
        }

        return { data: transformLicenseForAPI(license) };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get license',
        });
      }
    }),

  /**
   * UPDATE: Update license details
   */
  update: protectedProcedure
    .input(UpdateLicenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...updateData } = input;

        const existingLicense = await licenseService.getLicenseById(id, false);
        if (!existingLicense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify permissions
        if (ctx.session.user.role !== 'ADMIN') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== existingLicense.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to update this license',
            });
          }
        }

        const updated = await licenseService.updateLicense(
          id,
          updateData,
          ctx.session.user.id
        );

        return { data: transformLicenseForAPI(updated) };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update license',
        });
      }
    }),

  /**
   * UPDATE: Approve pending license (creator only)
   */
  approve: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const license = await licenseService.approveLicense(input.id, ctx.session.user.id);
        return { data: transformLicenseForAPI(license) };
      } catch (error: any) {
        if (error.name === 'LicensePermissionError') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: error.message,
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to approve license',
        });
      }
    }),

  /**
   * UPDATE: Terminate active license
   */
  terminate: protectedProcedure
    .input(TerminateLicenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { id, ...terminateData } = input;

        const existingLicense = await licenseService.getLicenseById(id, false);
        if (!existingLicense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify permissions (admin or brand owner)
        if (ctx.session.user.role !== 'ADMIN') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== existingLicense.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to terminate this license',
            });
          }
        }

        const license = await licenseService.terminateLicense(
          { licenseId: id, ...terminateData },
          ctx.session.user.id
        );

        return { data: transformLicenseForAPI(license) };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to terminate license',
        });
      }
    }),

  /**
   * QUERY: Check for conflicts before creating license
   */
  checkConflicts: protectedProcedure
    .input(ConflictCheckSchema)
    .query(async ({ ctx, input }) => {
      try {
        const conflicts = await licenseService.checkConflicts(input);
        return { data: conflicts };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to check conflicts',
        });
      }
    }),

  /**
   * MUTATION: Generate renewal for expiring license
   */
  generateRenewal: protectedProcedure
    .input(GenerateRenewalSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { licenseId, ...renewalData } = input;

        const existingLicense = await licenseService.getLicenseById(licenseId, false);
        if (!existingLicense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify permissions
        if (ctx.session.user.role !== 'ADMIN') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== existingLicense.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to renew this license',
            });
          }
        }

        const renewal = await licenseService.generateRenewal(
          { licenseId, ...renewalData },
          ctx.session.user.id
        );

        return { data: transformLicenseForAPI(renewal) };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to generate renewal',
        });
      }
    }),

  /**
   * QUERY: Get license statistics
   */
  stats: protectedProcedure
    .input(z.object({ brandId: z.string().cuid().optional() }))
    .query(async ({ ctx, input }) => {
      try {
        let brandId = input.brandId;

        // If user is brand, force their brand ID
        if (ctx.session.user.role === 'BRAND') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });
          brandId = userBrand?.id;
        }

        const stats = await licenseService.getLicenseStats(brandId);
        return { data: stats };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get license statistics',
        });
      }
    }),

  /**
   * DELETE: Soft delete a license
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const existingLicense = await licenseService.getLicenseById(input.id, false);
        if (!existingLicense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Only admins can delete licenses
        if (ctx.session.user.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only administrators can delete licenses',
          });
        }

        const deleted = await licenseService.deleteLicense(input.id, ctx.session.user.id);
        return { data: transformLicenseForAPI(deleted) };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete license',
        });
      }
    }),

  /**
   * ADMIN: List all licenses with full details
   */
  adminList: adminProcedure
    .input(LicenseFiltersSchema)
    .query(async ({ ctx, input }) => {
      try {
        const result = await licenseService.listLicenses(input);

        return {
          data: result.licenses.map(transformLicenseForAPI),
          meta: {
            pagination: {
              page: result.page,
              pageSize: result.pageSize,
              total: result.total,
              totalPages: result.totalPages,
            },
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to list licenses',
        });
      }
    }),

  /**
   * POST: Sign a license (digital signing)
   */
  sign: protectedProcedure
    .input(z.object({
      id: z.string().cuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const existingLicense = await licenseService.getLicenseById(input.id, false);
        if (!existingLicense) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify license is in signable status
        if (!['DRAFT', 'PENDING_APPROVAL'].includes(existingLicense.status)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'License is not in a signable state',
          });
        }

        // Determine user role for signing
        let userRole: 'creator' | 'brand' = 'brand';
        
        if (ctx.session.user.role === 'CREATOR') {
          // Verify creator owns the asset
          const fullLicense = await ctx.db.license.findUnique({
            where: { id: input.id },
            include: {
              ipAsset: {
                include: {
                  ownerships: {
                    include: { creator: true },
                  },
                },
              },
            },
          });

          const isOwner = fullLicense?.ipAsset.ownerships.some(
            (o) => o.creator.userId === ctx.session.user.id
          );

          if (!isOwner) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not own this IP asset',
            });
          }
          userRole = 'creator';
        } else if (ctx.session.user.role === 'BRAND') {
          // Verify brand owns the license
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== existingLicense.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not own this license',
            });
          }
        } else if (ctx.session.user.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only creators, brands, or admins can sign licenses',
          });
        }

        // Get IP address and user agent from request
        const ipAddress = ctx.req.headers.get('x-forwarded-for') || 
                          ctx.req.headers.get('x-real-ip') || 
                          'unknown';
        const userAgent = ctx.req.headers.get('user-agent') || 'unknown';

        const result = await licenseService.signLicense(
          input.id,
          ctx.session.user.id,
          userRole,
          {
            ipAddress,
            userAgent,
          }
        );

        return { 
          data: transformLicenseForAPI(result.license),
          meta: {
            signatureProof: result.signatureProof,
            allPartiesSigned: result.allPartiesSigned,
            executedAt: result.executedAt?.toISOString(),
            message: result.message,
          }
        };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to sign license',
        });
      }
    }),

  /**
   * GET: Get license revenue tracking
   */
  getRevenue: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const license = await licenseService.getLicenseById(input.id, false);

        if (!license) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Verify access
        if (!canAccessLicense(ctx.session.user, license)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to view this license revenue',
          });
        }

        const revenueData = await licenseService.getLicenseRevenue(input.id);
        return { data: revenueData };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get license revenue',
        });
      }
    }),

  /**
   * GET: Check renewal eligibility
   */
  checkRenewalEligibility: protectedProcedure
    .input(z.object({ licenseId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const { renewalEligibilityService } = await import('./services/renewal-eligibility.service');
        
        const eligibility = await renewalEligibilityService.checkEligibility(input.licenseId);
        
        return { data: eligibility };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to check renewal eligibility',
        });
      }
    }),

  /**
   * POST: Generate renewal offer
   */
  generateRenewalOffer: protectedProcedure
    .input(
      z.object({
        licenseId: z.string().cuid(),
        pricingStrategy: z.enum(['FLAT_RENEWAL', 'USAGE_BASED', 'MARKET_RATE', 'PERFORMANCE_BASED', 'NEGOTIATED', 'AUTOMATIC']).optional(),
        customAdjustmentPercent: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { enhancedLicenseRenewalService } = await import('./services/enhancedLicenseRenewalService');
        const { renewalPricingService } = await import('./services/renewal-pricing.service');

        // Calculate pricing
        const pricing = await renewalPricingService.calculateRenewalPricing({
          licenseId: input.licenseId,
          strategy: input.pricingStrategy || 'AUTOMATIC',
          customAdjustmentPercent: input.customAdjustmentPercent,
        });

        // Generate offer
        const offerId = await enhancedLicenseRenewalService.generateRenewalOffer(
          input.licenseId,
          ctx.session.user.id
        );

        return {
          data: {
            offerId,
            pricing,
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to generate renewal offer',
        });
      }
    }),

  /**
   * POST: Accept renewal offer
   */
  acceptRenewalOffer: protectedProcedure
    .input(
      z.object({
        licenseId: z.string().cuid(),
        offerId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { enhancedLicenseRenewalService } = await import('./services/enhancedLicenseRenewalService');

        const renewal = await enhancedLicenseRenewalService.acceptRenewalOffer(
          input.licenseId,
          input.offerId,
          ctx.session.user.id
        );

        return { data: transformLicenseForAPI(renewal) };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to accept renewal offer',
        });
      }
    }),

  /**
   * GET: Get renewal analytics
   */
  getRenewalAnalytics: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { renewalAnalyticsService } = await import('./services/renewal-analytics.service');

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        const metrics = await renewalAnalyticsService.calculateRenewalMetrics(
          startDate,
          endDate
        );

        return { data: metrics };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get renewal analytics',
        });
      }
    }),

  /**
   * GET: Get renewal pipeline snapshot
   */
  getRenewalPipeline: adminProcedure.query(async () => {
    try {
      const { renewalAnalyticsService } = await import('./services/renewal-analytics.service');

      const pipeline = await renewalAnalyticsService.getRenewalPipelineSnapshot();

      return { data: pipeline };
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to get renewal pipeline',
      });
    }
  }),

  /**
   * GET: Get brand renewal performance
   */
  getBrandRenewalPerformance: protectedProcedure
    .input(z.object({ brandId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        // Verify user has access to this brand data
        if (ctx.session.user.role !== 'ADMIN') {
          const userBrand = await ctx.db.brand.findUnique({
            where: { userId: ctx.session.user.id },
          });

          if (!userBrand || userBrand.id !== input.brandId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You can only view your own brand performance',
            });
          }
        }

        const { renewalAnalyticsService } = await import('./services/renewal-analytics.service');

        const performance = await renewalAnalyticsService.analyzeBrandRenewalPerformance(
          input.brandId
        );

        return { data: performance };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get brand renewal performance',
        });
      }
    }),

  /**
   * GET: Get license performance metrics (ROI, utilization, approval time)
   */
  getPerformanceMetrics: protectedProcedure
    .input(z.object({ licenseId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        const license = await licenseService.getLicenseById(input.licenseId, false);

        if (!license) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'License not found',
          });
        }

        // Check access permissions
        if (!canAccessLicense(ctx.session.user, license)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You do not have permission to view this license',
          });
        }

        const { licensePerformanceMetricsService } = await import(
          './services/license-performance-metrics.service'
        );

        // Calculate all performance metrics
        const [roiMetrics, utilizationMetrics, approvalMetrics] = await Promise.all([
          licensePerformanceMetricsService.calculateLicenseROI(input.licenseId),
          licensePerformanceMetricsService.calculateLicenseUtilization(input.licenseId),
          licensePerformanceMetricsService.calculateApprovalTimeMetrics(input.licenseId),
        ]);

        return {
          data: {
            roi: roiMetrics,
            utilization: utilizationMetrics,
            approval: approvalMetrics,
          },
        };
      } catch (error: any) {
        if (error.code) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get performance metrics',
        });
      }
    }),

  /**
   * GET: Get aggregated performance metrics for a time period (Admin only)
   */
  getAggregatedPerformanceMetrics: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        granularity: z.enum(['daily', 'weekly', 'monthly']).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { licensePerformanceMetricsService } = await import(
          './services/license-performance-metrics.service'
        );

        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        const granularity = input.granularity || 'monthly';

        const metrics = await licensePerformanceMetricsService.calculateAggregatedMetrics(
          startDate,
          endDate,
          granularity
        );

        return { data: metrics };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get aggregated performance metrics',
        });
      }
    }),

  /**
   * GET: Get conflict rate metrics for a time period (Admin only)
   */
  getConflictRateMetrics: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { licensePerformanceMetricsService } = await import(
          './services/license-performance-metrics.service'
        );

        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);

        const metrics = await licensePerformanceMetricsService.calculateConflictRateMetrics(
          startDate,
          endDate
        );

        return { data: metrics };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get conflict rate metrics',
        });
      }
    }),

  /**
   * GET: Get historical performance metrics (Admin only)
   */
  getHistoricalPerformanceMetrics: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        granularity: z.enum(['daily', 'weekly', 'monthly']).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const { licensePerformanceMetricsService } = await import(
          './services/license-performance-metrics.service'
        );

        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        const granularity = input.granularity || 'daily';

        const metrics = await licensePerformanceMetricsService.getHistoricalMetrics(
          startDate,
          endDate,
          granularity
        );

        return { data: metrics };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get historical performance metrics',
        });
      }
    }),

  /**
   * GET: Get performance dashboard summary (Admin only)
   */
  getPerformanceDashboard: adminProcedure
    .input(
      z.object({
        period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
      })
    )
    .query(async ({ input }) => {
      try {
        const { licensePerformanceMetricsService } = await import(
          './services/license-performance-metrics.service'
        );

        const endDate = new Date();
        let startDate: Date;

        switch (input.period) {
          case '7d':
            startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            break;
          case '1y':
            startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        }

        const metrics = await licensePerformanceMetricsService.calculateAggregatedMetrics(
          startDate,
          endDate,
          'daily'
        );

        // Get conflict rate metrics
        const conflictMetrics = await licensePerformanceMetricsService.calculateConflictRateMetrics(
          startDate,
          endDate
        );

        return {
          data: {
            summary: {
              period: input.period,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
            revenue: metrics.revenue,
            roi: metrics.roi,
            utilization: metrics.utilization,
            conflicts: {
              ...metrics.conflicts,
              details: conflictMetrics,
            },
            approvals: metrics.approvals,
            renewals: metrics.renewals,
          },
        };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to get performance dashboard',
        });
      }
    }),
});

