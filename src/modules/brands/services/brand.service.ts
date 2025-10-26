/**
 * Brand Service
 * Core business logic for brand management operations
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { RoleAssignmentService } from '@/lib/services/role-assignment.service';
import type { IStorageProvider } from '@/lib/storage';
import {
  BrandAlreadyExistsError,
  BrandNotFoundError,
  BrandUnauthorizedError,
  BrandHasActiveLicensesError,
  TeamMemberAlreadyExistsError,
  UserNotFoundForInvitationError,
  CannotRemoveBrandOwnerError,
  LastAdminRemainingError,
  BrandCreationError,
  BrandUpdateError,
} from '../errors/brand.errors';
import type {
  Brand,
  BrandWithUser,
  CompanySize,
  TargetAudience,
  BillingInfo,
  ContactInfo,
  TeamMember,
  BrandListResponse,
  BrandSearchFilters,
  BrandStatistics,
} from '../types/brand.types';
import type {
  CreateBrandInput,
  UpdateBrandInput,
  AddTeamMemberInput,
} from '../schemas/brand.schema';

export class BrandService {
  private roleAssignmentService: RoleAssignmentService;

  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private auditService: AuditService,
    private storageProvider: IStorageProvider
  ) {
    this.roleAssignmentService = new RoleAssignmentService(prisma, auditService);
  }

  /**
   * Create new brand profile
   */
  async createBrand(userId: string, data: CreateBrandInput): Promise<Brand> {
    try {
      // Check if user already has a brand
      const existingBrand = await this.prisma.brand.findUnique({
        where: { userId, deletedAt: null },
      });

      if (existingBrand) {
        throw new BrandAlreadyExistsError(userId);
      }

      // Create brand
      const brand = await this.prisma.brand.create({
        data: {
          userId,
          companyName: data.companyName,
          industry: data.industry || null,
          companySize: data.companySize as any,
          targetAudience: data.targetAudience as any,
          contactInfo: data.contactInfo as any,
          billingInfo: data.billingInfo as any,
          verificationStatus: 'pending',
          // Legacy fields for compatibility
          website: data.contactInfo.website || null,
          description: null,
        },
        include: { user: true },
      });

      // Trigger verification email to admin (async, don't await)
      this.emailService
        .sendTransactional({
          email: process.env.ADMIN_EMAIL || 'admin@yesgoddess.com',
          subject: `New Brand Verification Request: ${data.companyName}`,
          template: 'brand-verification-request',
          variables: {
            brandName: data.companyName,
            companyName: data.companyName,
            industry: data.industry || 'Not specified',
            website: data.contactInfo.website || 'Not provided',
            verificationUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL}/admin/brands/${brand.id}/verify`,
          },
        })
        .catch((err) =>
          console.error('Failed to send verification email to admin:', err)
        );

      // Trigger welcome email to brand (async, don't await)
      this.emailService
        .sendTransactional({
          userId,
          email: data.contactInfo.primaryContact.email,
          subject: 'Welcome to YES GODDESS',
          template: 'brand-welcome',
          variables: {
            brandName: data.companyName,
            contactName: data.contactInfo.primaryContact.name,
          },
        })
        .catch((err) =>
          console.error('Failed to send welcome email to brand:', err)
        );

      // Audit log
      await this.auditService.log({
        action: 'brand.created',
        userId,
        afterJson: this.sanitizeBrandForAudit(brand),
      });

      return this.formatBrandForOutput(brand);
    } catch (error) {
      if (
        error instanceof BrandAlreadyExistsError ||
        error instanceof BrandCreationError
      ) {
        throw error;
      }
      throw new BrandCreationError((error as Error).message, error);
    }
  }

  /**
   * Get brand by ID with authorization checks
   */
  async getBrandById(
    brandId: string,
    userId: string,
    userRole: string
  ): Promise<Brand | null> {
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: brandId,
        deletedAt: null,
        ...(userRole !== 'ADMIN' && {
          OR: [
            { userId }, // User owns brand
            { verificationStatus: 'verified' }, // Public verified brands
          ],
        }),
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!brand) {
      return null;
    }

    // Filter sensitive data if not owner/admin
    if (userRole !== 'ADMIN' && brand.userId !== userId) {
      (brand as any).billingInfo = null;
      (brand as any).teamMembers = null;
      (brand as any).verificationNotes = null;
    }

    return this.formatBrandForOutput(brand);
  }

  /**
   * Get current user's brand profile
   */
  async getMyBrand(userId: string): Promise<Brand | null> {
    const brand = await this.prisma.brand.findUnique({
      where: { userId, deletedAt: null },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!brand) {
      return null;
    }

    return this.formatBrandForOutput(brand);
  }

  /**
   * List brands with filtering and pagination
   */
  async listBrands(
    page: number,
    limit: number,
    filters: BrandSearchFilters | undefined,
    sortBy: 'companyName' | 'createdAt' | 'updatedAt',
    sortOrder: 'asc' | 'desc',
    userId: string,
    userRole: string
  ): Promise<BrandListResponse> {
    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
      ...(filters?.industry && { industry: filters.industry }),
      ...(filters?.verificationStatus && {
        verificationStatus: filters.verificationStatus,
      }),
      ...(filters?.companySize && {
        companySize: {
          path: ['employeeCount'],
          equals: filters.companySize,
        },
      }),
      ...(filters?.search && {
        companyName: {
          contains: filters.search,
          mode: 'insensitive',
        },
      }),
      // Row-level security
      ...(userRole === 'CREATOR' && {
        verificationStatus: 'verified',
      }),
      ...(userRole === 'BRAND' && {
        userId,
      }),
    };

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy:
          sortBy === 'companyName'
            ? { companyName: sortOrder }
            : { [sortBy]: sortOrder },
        select: {
          id: true,
          companyName: true,
          industry: true,
          companySize: true,
          verificationStatus: true,
          brandGuidelinesUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return {
      brands: brands.map((b) => this.formatBrandForOutput(b)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Search brands (for creator discovery)
   */
  async searchBrands(
    query: string,
    filters: { industry?: string; companySize?: string } | undefined,
    userId: string,
    userRole: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ brands: Brand[]; total: number }> {
    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
      ...(userRole !== 'ADMIN' && { verificationStatus: 'verified' }),
      ...(query && {
        companyName: {
          contains: query,
          mode: 'insensitive',
        },
      }),
      ...(filters?.industry && { industry: filters.industry }),
      ...(filters?.companySize && {
        companySize: {
          path: ['employeeCount'],
          equals: filters.companySize,
        },
      }),
    };

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { companyName: 'asc' },
        select: {
          id: true,
          companyName: true,
          industry: true,
          companySize: true,
          brandGuidelinesUrl: true,
          targetAudience: true,
          verificationStatus: true,
          createdAt: true,
        },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return {
      brands: brands.map((b) => this.formatBrandForOutput(b)),
      total,
    };
  }

  /**
   * Update brand profile
   */
  async updateBrand(
    brandId: string,
    data: UpdateBrandInput,
    userId: string,
    userRole: string
  ): Promise<Brand> {
    try {
      // Authorization check
      const brand = await this.prisma.brand.findFirst({
        where: {
          id: brandId,
          deletedAt: null,
          ...(userRole !== 'ADMIN' && { userId }),
        },
      });

      if (!brand) {
        throw new BrandNotFoundError(brandId);
      }

      // Store before state for audit
      const beforeState = { ...brand };

      // Update brand
      const updatedBrand = await this.prisma.brand.update({
        where: { id: brandId },
        data: {
          ...(data.companyName && { companyName: data.companyName }),
          ...(data.industry !== undefined && { industry: data.industry }),
          ...(data.companySize && { companySize: data.companySize as any }),
          ...(data.targetAudience && {
            targetAudience: data.targetAudience as any,
          }),
          ...(data.contactInfo && { contactInfo: data.contactInfo as any }),
          ...(data.billingInfo && { billingInfo: data.billingInfo as any }),
          updatedAt: new Date(),
          // Update legacy website field if in contactInfo
          ...(data.contactInfo?.website && {
            website: data.contactInfo.website,
          }),
        },
      });

      // Audit log
      await this.auditService.log({
        action: 'brand.updated',
        userId,
        beforeJson: this.sanitizeBrandForAudit(beforeState),
        afterJson: this.sanitizeBrandForAudit(updatedBrand),
      });

      return this.formatBrandForOutput(updatedBrand);
    } catch (error) {
      if (
        error instanceof BrandNotFoundError ||
        error instanceof BrandUnauthorizedError
      ) {
        throw error;
      }
      throw new BrandUpdateError((error as Error).message, error);
    }
  }

  /**
   * Update brand guidelines
   */
  async updateBrandGuidelines(
    brandId: string,
    fileKey: string,
    userId: string,
    userRole: string
  ): Promise<{ brandGuidelinesUrl: string; uploadedAt: string }> {
    // Authorization check
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: brandId,
        deletedAt: null,
        ...(userRole !== 'ADMIN' && { userId }),
      },
    });

    if (!brand) {
      throw new BrandNotFoundError(brandId);
    }

    // Get public URL from storage
    const publicUrl = `${process.env.NEXT_PUBLIC_STORAGE_URL}/${fileKey}`;

    // Delete old guidelines if exists
    if ((brand as any).brandGuidelinesUrl) {
      const oldKey = this.extractKeyFromUrl((brand as any).brandGuidelinesUrl);
      await this.storageProvider
        .delete(oldKey)
        .catch((err: Error) =>
          console.error('Failed to delete old guidelines:', err)
        );
    }

    // Update brand
    await this.prisma.brand.update({
      where: { id: brandId },
      data: { brandGuidelinesUrl: publicUrl },
    });

    // Audit log
    await this.auditService.log({
      action: 'brand.guidelines_updated',
      userId,
      afterJson: { brandId, fileKey, publicUrl },
    });

    return {
      brandGuidelinesUrl: publicUrl,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify brand (admin only)
   */
  async verifyBrand(
    brandId: string,
    adminId: string,
    notes?: string
  ): Promise<Brand> {
    // Fetch brand first to get userId
    const existingBrand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      select: { id: true, userId: true },
    });

    if (!existingBrand) {
      throw new BrandNotFoundError(brandId);
    }

    // Update brand and assign role in transaction
    const brand = await this.prisma.$transaction(async (tx) => {
      // Update brand verification status
      const updatedBrand = await tx.brand.update({
        where: { id: brandId },
        data: {
          verificationStatus: 'verified',
          verifiedAt: new Date(),
          verificationNotes: notes || null,
          isVerified: true, // Legacy field
        },
        include: { user: true },
      });

      // Automatically assign BRAND role to user
      await this.roleAssignmentService.assignBrandRoleOnVerification(
        existingBrand.userId,
        brandId,
        adminId
      );

      return updatedBrand;
    });

    // Send verification email to brand
    const contactEmail = ((brand as any).contactInfo as any)?.primaryContact?.email;
    if (contactEmail) {
      await this.emailService
        .sendTransactional({
          userId: brand.userId,
          email: contactEmail,
          subject: 'Your YES GODDESS Brand Profile is Verified',
          template: 'brand-verification-complete',
          variables: {
            brandName: brand.companyName,
            contactName: ((brand as any).contactInfo as any)?.primaryContact?.name,
            dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          },
        })
        .catch((err) =>
          console.error('Failed to send verification email:', err)
        );
    }

    // Audit log
    await this.auditService.log({
      action: 'brand.verified',
      userId: adminId,
      entityType: 'brand',
      entityId: brandId,
      after: { brandId, notes },
    });

    return this.formatBrandForOutput(brand);
  }

  /**
   * Reject brand verification (admin only)
   */
  async rejectBrand(
    brandId: string,
    adminId: string,
    reason: string,
    notes?: string
  ): Promise<Brand> {
    const brand = await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        verificationStatus: 'rejected',
        verificationNotes: notes
          ? `REJECTION: ${reason}\nNOTES: ${notes}`
          : `REJECTION: ${reason}`,
        isVerified: false, // Legacy field
      },
      include: { user: true },
    });

    // Send rejection email to brand
    const contactEmail = ((brand as any).contactInfo as any)?.primaryContact?.email;
    if (contactEmail) {
      await this.emailService
        .sendTransactional({
          userId: brand.userId,
          email: contactEmail,
          subject: 'Update on Your YES GODDESS Brand Verification',
          template: 'brand-verification-rejected',
          variables: {
            brandName: brand.companyName,
            contactName: ((brand as any).contactInfo as any)?.primaryContact?.name,
            reason,
            supportEmail: process.env.SUPPORT_EMAIL || 'support@yesgoddess.com',
          },
        })
        .catch((err) =>
          console.error('Failed to send rejection email:', err)
        );
    }

    // Audit log
    await this.auditService.log({
      action: 'brand.rejected',
      userId: adminId,
      afterJson: { brandId, reason, notes },
    });

    return this.formatBrandForOutput(brand);
  }

  /**
   * Request additional information from brand (admin only)
   */
  async requestBrandInfo(
    brandId: string,
    requestedInfo: string[],
    message: string,
    adminId: string,
    deadline?: string
  ): Promise<void> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
      include: { user: true },
    });

    if (!brand) {
      throw new BrandNotFoundError(brandId);
    }

    // Update brand with info request details
    await this.prisma.brand.update({
      where: { id: brandId },
      data: {
        verificationStatus: 'pending',
        verificationNotes: `INFO REQUESTED: ${message}\nITEMS: ${requestedInfo.join(', ')}\nDEADLINE: ${deadline || 'Not specified'}`,
      },
    });

    // Send info request email to brand
    const contactEmail = ((brand as any).contactInfo as any)?.primaryContact?.email;
    if (contactEmail) {
      await this.emailService
        .sendTransactional({
          userId: brand.userId,
          email: contactEmail,
          subject: 'Additional Information Needed - YES GODDESS Brand Verification',
          template: 'brand-info-request',
          variables: {
            brandName: brand.companyName,
            contactName: ((brand as any).contactInfo as any)?.primaryContact?.name,
            message,
            requestedInfo: requestedInfo.join(', '),
            deadline: deadline || 'As soon as possible',
            replyToEmail: process.env.BRAND_VERIFICATION_EMAIL || 'brands@yesgoddess.com',
          },
        })
        .catch((err) =>
          console.error('Failed to send info request email:', err)
        );
    }

    // Audit log
    await this.auditService.log({
      action: 'brand.info_requested',
      userId: adminId,
      entityType: 'brand',
      entityId: brandId,
      after: {
        requestedInfo,
        message,
        deadline,
        contactEmail,
      },
    });
  }

  /**
   * Add team member to brand
   */
  async addTeamMember(
    input: AddTeamMemberInput,
    addedByUserId: string
  ): Promise<TeamMember> {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!user) {
      throw new UserNotFoundForInvitationError(input.email);
    }

    // Get brand and check authorization
    const brand = await this.prisma.brand.findUnique({
      where: { id: input.brandId },
    });

    if (!brand) {
      throw new BrandNotFoundError(input.brandId);
    }

    // Check if user already a team member
    const currentTeam = ((brand as any).teamMembers as TeamMember[]) || [];
    if (currentTeam.some((m) => m.userId === user.id)) {
      throw new TeamMemberAlreadyExistsError(input.email);
    }

    // Add new team member
    const newMember: TeamMember = {
      userId: user.id,
      role: input.role,
      permissions: input.permissions,
      addedAt: new Date().toISOString(),
      addedBy: addedByUserId,
    };

    const updatedTeam = [...currentTeam, newMember];

    await this.prisma.brand.update({
      where: { id: input.brandId },
      data: { teamMembers: updatedTeam as any },
    });

    // Send invitation email
    await this.emailService
      .sendTransactional({
        userId: user.id,
        email: input.email,
        subject: `You've been added to ${brand.companyName} team`,
        template: 'brand-team-invitation',
        variables: {
          brandName: brand.companyName,
          userName: user.name || 'there',
          role: input.role,
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
        },
      })
      .catch((err) => console.error('Failed to send invitation email:', err));

    // Audit log
    await this.auditService.log({
      action: 'brand.team_member_added',
      userId: addedByUserId,
      afterJson: { brandId: input.brandId, newMember },
    });

    return newMember;
  }

  /**
   * Remove team member
   */
  async removeTeamMember(
    brandId: string,
    userIdToRemove: string,
    removedByUserId: string
  ): Promise<void> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: brandId },
    });

    if (!brand) {
      throw new BrandNotFoundError(brandId);
    }

    // Cannot remove brand owner
    if (brand.userId === userIdToRemove) {
      throw new CannotRemoveBrandOwnerError();
    }

    const currentTeam = ((brand as any).teamMembers as TeamMember[]) || [];
    const updatedTeam = currentTeam.filter((m) => m.userId !== userIdToRemove);

    // Ensure at least one admin remains
    const adminCount = updatedTeam.filter((m) => m.role === 'admin').length;
    if (adminCount === 0 && brand.userId !== removedByUserId) {
      throw new LastAdminRemainingError();
    }

    await this.prisma.brand.update({
      where: { id: brandId },
      data: { teamMembers: updatedTeam as any },
    });

    // Audit log
    await this.auditService.log({
      action: 'brand.team_member_removed',
      userId: removedByUserId,
      afterJson: { brandId, removedUserId: userIdToRemove },
    });
  }

  /**
   * Soft delete brand
   */
  async deleteBrand(
    brandId: string,
    userId: string,
    userRole: string,
    reason?: string
  ): Promise<void> {
    // Check for active licenses
    const activeLicenses = await this.prisma.license.count({
      where: {
        brandId,
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
    });

    if (activeLicenses > 0) {
      throw new BrandHasActiveLicensesError(activeLicenses);
    }

    await this.prisma.brand.update({
      where: { id: brandId },
      data: { deletedAt: new Date() },
    });

    // Audit log
    await this.auditService.log({
      action: 'brand.deleted',
      userId,
      afterJson: { brandId, reason },
    });
  }

  /**
   * Get brand statistics (admin only)
   */
  async getBrandStatistics(): Promise<BrandStatistics> {
    const [total, verified, pending, rejected] = await Promise.all([
      this.prisma.brand.count({ where: { deletedAt: null } }),
      this.prisma.brand.count({
        where: { deletedAt: null, verificationStatus: 'verified' },
      }),
      this.prisma.brand.count({
        where: { deletedAt: null, verificationStatus: 'pending' },
      }),
      this.prisma.brand.count({
        where: { deletedAt: null, verificationStatus: 'rejected' },
      }),
    ]);

    // Active brands (with projects in last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    // Note: This assumes a Project model exists
    // const activeBrands = await this.prisma.brand.count({
    //   where: {
    //     deletedAt: null,
    //     projects: { some: { createdAt: { gte: ninetyDaysAgo } } },
    //   },
    // });

    return {
      total,
      verified,
      pending,
      rejected,
      active: 0, // TODO: Implement when Project model exists
      inactive: 0, // TODO: Implement when Project model exists
    };
  }

  /**
   * Format brand for API output
   */
  private formatBrandForOutput(brand: any): Brand {
    return {
      id: brand.id,
      userId: brand.userId,
      companyName: brand.companyName,
      industry: brand.industry,
      companySize: brand.companySize as CompanySize,
      targetAudience: brand.targetAudience as TargetAudience,
      contactInfo: brand.contactInfo as ContactInfo,
      billingInfo: brand.billingInfo as BillingInfo,
      brandGuidelinesUrl: brand.brandGuidelinesUrl,
      teamMembers: brand.teamMembers as TeamMember[],
      verificationStatus: brand.verificationStatus,
      verifiedAt: brand.verifiedAt,
      verificationNotes: brand.verificationNotes,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
      deletedAt: brand.deletedAt,
      // Legacy fields
      website: brand.website,
      description: brand.description,
      logo: brand.logo,
      isVerified: brand.isVerified,
      totalSpent: brand.totalSpent ? Number(brand.totalSpent) : 0,
    };
  }

  /**
   * Sanitize brand data for audit logs (remove sensitive info)
   */
  private sanitizeBrandForAudit(brand: any): any {
    const sanitized = { ...brand };
    if (sanitized.billingInfo) {
      sanitized.billingInfo = { ...sanitized.billingInfo };
      delete sanitized.billingInfo.taxId;
    }
    return sanitized;
  }

  /**
   * Extract storage key from URL
   */
  private extractKeyFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.substring(1); // Remove leading slash
    } catch {
      return url; // Return as-is if not a valid URL
    }
  }
}
