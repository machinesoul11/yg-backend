/**
 * Project Service
 * Core business logic for project management operations
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { CacheService } from '@/lib/redis/cache.service';
import { EventService } from './event.service';
import { ProjectValidationService } from './validation.service';
import {
  ProjectNotFoundError,
  ProjectUnauthorizedError,
  ProjectCreationError,
  ProjectUpdateError,
  ProjectDeleteError,
  InvalidStatusTransitionError,
  ProjectHasActiveLicensesError,
  OnlyBrandsCanCreateProjectsError,
  TeamMemberNotFoundError,
  TeamMemberAlreadyExistsError,
  CannotRemoveBrandAdminError,
  MilestoneNotFoundError,
  ExpenseNotFoundError,
  BudgetExceededError,
} from '../errors/project.errors';
import type {
  Project,
  ProjectWithRelations,
  ProjectListResponse,
  ProjectStatistics,
  TeamMember,
  ProjectStatus,
  ProjectSortBy,
  SortOrder,
  ProjectSearchFilters,
  ProjectMilestone,
  MilestoneStatus,
  BudgetExpense,
  BudgetSummary,
  TeamMemberRole,
} from '../types/project.types';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  AddTeamMemberInput,
  UpdateTeamMemberRoleInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  AddExpenseInput,
  UpdateExpenseInput,
} from '../schemas/project.schema';

export class ProjectService {
  private eventService: EventService;
  private cacheService: CacheService;
  private validationService: ProjectValidationService;

  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private auditService: AuditService
  ) {
    this.eventService = new EventService(prisma);
    this.cacheService = new CacheService();
    this.validationService = new ProjectValidationService(prisma);
  }

  /**
   * Create new project
   */
  async createProject(
    userId: string,
    data: CreateProjectInput
  ): Promise<Project> {
    try {
      // 1. Validate user is a Brand admin
      const brand = await this.prisma.brand.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!brand) {
        throw new OnlyBrandsCanCreateProjectsError();
      }

      // 2. Comprehensive validation
      
      // Permission check
      const permissionCheck = await this.validationService.canCreateProject(userId, 'BRAND');
      if (!permissionCheck.allowed) {
        throw new ProjectUnauthorizedError(permissionCheck.reason);
      }

      // Budget validation
      const budgetValidation = await this.validationService.validateBudget(
        data.budgetCents,
        data.projectType,
        brand.id
      );
      
      if (!budgetValidation.valid) {
        throw new ProjectCreationError(
          `Budget validation failed: ${budgetValidation.errors.join(', ')}`
        );
      }

      // Log budget warnings if any
      if (budgetValidation.warnings.length > 0) {
        console.warn('[ProjectService] Budget warnings:', budgetValidation.warnings);
      }

      // Date range validation (if provided)
      if (data.startDate || data.endDate) {
        const dateValidation = await this.validationService.validateDateRange(
          data.startDate ? new Date(data.startDate) : null,
          data.endDate ? new Date(data.endDate) : null,
          data.projectType,
          brand.id
        );

        if (!dateValidation.valid) {
          throw new ProjectCreationError(
            `Date validation failed: ${dateValidation.errors.join(', ')}`
          );
        }

        // Log date warnings if any
        if (dateValidation.warnings.length > 0) {
          console.warn('[ProjectService] Date warnings:', dateValidation.warnings);
        }
      }

      // Duplicate detection
      const duplicateCheck = await this.validationService.checkForDuplicates(
        brand.id,
        data.name,
        data.startDate ? new Date(data.startDate) : null,
        data.endDate ? new Date(data.endDate) : null
      );

      if (duplicateCheck.isDuplicate) {
        // Log warning but don't block creation - user may intentionally create similar projects
        console.warn('[ProjectService] Potential duplicate project detected:', {
          newName: data.name,
          duplicates: duplicateCheck.duplicates,
        });
      }

      // 3. Create project
      const project = await (this.prisma as any).project.create({
        data: {
          brandId: brand.id,
          name: data.name,
          description: data.description || null,
          budgetCents: data.budgetCents,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          objectives: data.objectives || null,
          requirements: data.requirements || null,
          metadata: data.metadata || null,
          projectType: data.projectType,
          status: 'DRAFT',
          createdBy: userId,
        },
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
              logo: true,
            },
          },
        },
      });

      // 4. Log event
      await this.eventService.track({
        eventType: 'project.created',
        actorType: 'brand',
        actorId: brand.id,
        projectId: project.id,
        brandId: brand.id,
        propsJson: { 
          projectType: project.projectType,
          budgetCents: project.budgetCents,
          hasDuplicateWarning: duplicateCheck.isDuplicate,
        },
      });

      // 5. Audit log
      await this.auditService.log({
        userId,
        action: 'project.created',
        entityType: 'project',
        entityId: project.id,
        email: '',
        before: undefined,
        after: { 
          projectId: project.id, 
          name: project.name,
          validationWarnings: [
            ...budgetValidation.warnings,
            ...duplicateCheck.warnings,
          ],
        },
      });

      return this.formatProjectResponse(project);
    } catch (error) {
      if (error instanceof OnlyBrandsCanCreateProjectsError ||
          error instanceof ProjectUnauthorizedError ||
          error instanceof ProjectCreationError) {
        throw error;
      }
      console.error('[ProjectService] Create project error:', error);
      throw new ProjectCreationError(
        error instanceof Error ? error.message : 'Failed to create project'
      );
    }
  }

  /**
   * Update existing project
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectInput,
    userId: string,
    userRole: string
  ): Promise<Project> {
    try {
      // 1. Fetch existing project with ownership check
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Permission check for update
      const permissionCheck = await this.validationService.canUpdateProject(
        userId,
        userRole,
        projectId,
        data
      );

      if (!permissionCheck.allowed) {
        throw new ProjectUnauthorizedError(permissionCheck.reason);
      }

      // 3. Validate budget changes if budget is being updated
      if (data.budgetCents !== undefined && data.budgetCents !== project.budgetCents) {
        const budgetAdjustment = await this.validationService.validateBudgetAdjustment(
          projectId,
          project.budgetCents,
          data.budgetCents,
          userRole
        );

        if (!budgetAdjustment.valid) {
          throw new ProjectUpdateError(
            `Budget adjustment failed: ${budgetAdjustment.errors.join(', ')}`
          );
        }

        if (budgetAdjustment.warnings.length > 0) {
          console.warn('[ProjectService] Budget adjustment warnings:', budgetAdjustment.warnings);
        }
      }

      // 4. Validate date changes if dates are being updated
      const newStartDate = data.startDate !== undefined 
        ? (data.startDate ? new Date(data.startDate) : null)
        : (project.startDate || null);
      
      const newEndDate = data.endDate !== undefined
        ? (data.endDate ? new Date(data.endDate) : null)
        : (project.endDate || null);

      if (data.startDate !== undefined || data.endDate !== undefined) {
        // Validate new date range
        const dateValidation = await this.validationService.validateDateRange(
          newStartDate,
          newEndDate,
          data.projectType || project.projectType,
          project.brandId,
          projectId
        );

        if (!dateValidation.valid) {
          throw new ProjectUpdateError(
            `Date validation failed: ${dateValidation.errors.join(', ')}`
          );
        }

        // Validate date changes against existing data
        const dateChangeValidation = await this.validationService.validateDateChange(
          projectId,
          project.startDate,
          project.endDate,
          newStartDate,
          newEndDate
        );

        if (!dateChangeValidation.valid) {
          throw new ProjectUpdateError(
            `Date change validation failed: ${dateChangeValidation.errors.join(', ')}`
          );
        }
      }

      // 5. Validate status transitions
      if (data.status && data.status !== project.status) {
        const statusValidation = await this.validationService.validateStatusTransition(
          projectId,
          project.status as ProjectStatus,
          data.status,
          userRole
        );

        if (!statusValidation.valid) {
          throw new InvalidStatusTransitionError(project.status, data.status);
        }

        if (statusValidation.requiredActions.length > 0) {
          console.warn('[ProjectService] Status transition required actions:', 
            statusValidation.requiredActions);
        }
      }

      // 6. Build update data
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.budgetCents !== undefined) updateData.budgetCents = data.budgetCents;
      if (data.startDate !== undefined) {
        updateData.startDate = data.startDate ? new Date(data.startDate) : null;
      }
      if (data.endDate !== undefined) {
        updateData.endDate = data.endDate ? new Date(data.endDate) : null;
      }
      if (data.objectives !== undefined) updateData.objectives = data.objectives;
      if (data.requirements !== undefined) updateData.requirements = data.requirements;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.projectType !== undefined) updateData.projectType = data.projectType;
      
      updateData.updatedBy = userId;

      // 7. Update project
      const updated = await (this.prisma as any).project.update({
        where: { id: projectId },
        data: updateData,
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
              logo: true,
            },
          },
        },
      });

      // 8. Log event
      const eventType = data.status && data.status !== project.status
        ? 'project.status_changed'
        : 'project.updated';

      await this.eventService.track({
        eventType,
        actorType: 'brand',
        actorId: updated.brandId,
        projectId,
        brandId: updated.brandId,
        propsJson: {
          fromStatus: project.status,
          toStatus: data.status,
          changes: Object.keys(updateData),
        },
      });

      // 9. Invalidate cache
      await this.invalidateProjectCache(projectId, updated.brandId);

      // 10. Audit log
      await this.auditService.log({
        userId,
        action: eventType,
        entityType: 'project',
        entityId: projectId,
        email: '',
        before: { status: project.status },
        after: { status: updated.status, changes: Object.keys(updateData) },
      });

      return this.formatProjectResponse(updated);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof InvalidStatusTransitionError ||
        error instanceof ProjectUpdateError
      ) {
        throw error;
      }
      console.error('[ProjectService] Update project error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to update project'
      );
    }
  }

  /**
   * List projects with filtering and pagination
   */
  async listProjects(
    page: number,
    limit: number,
    filters: ProjectSearchFilters,
    sortBy: ProjectSortBy,
    sortOrder: SortOrder,
    userId: string,
    userRole: string
  ): Promise<ProjectListResponse> {
    try {
      // 1. Build where clause with role-based filtering
      const where: any = {
        deletedAt: null,
      };

      // Row-level security: Brands see only their projects
      if (userRole === 'BRAND') {
        const brand = await this.prisma.brand.findFirst({
          where: { userId, deletedAt: null },
        });
        if (!brand) {
          throw new ProjectUnauthorizedError();
        }
        where.brandId = brand.id;
      }

      // Admins can filter by brandId
      if (userRole === 'ADMIN' && filters.brandId) {
        where.brandId = filters.brandId;
      }

      // Apply filters
      if (filters.status) where.status = filters.status;
      if (filters.projectType) where.projectType = filters.projectType;
      
      if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) {
        where.budgetCents = {};
        if (filters.budgetMin !== undefined) {
          where.budgetCents.gte = filters.budgetMin;
        }
        if (filters.budgetMax !== undefined) {
          where.budgetCents.lte = filters.budgetMax;
        }
      }

      if (filters.startDateFrom || filters.startDateTo) {
        where.startDate = {};
        if (filters.startDateFrom) {
          where.startDate.gte = new Date(filters.startDateFrom);
        }
        if (filters.startDateTo) {
          where.startDate.lte = new Date(filters.startDateTo);
        }
      }

      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // 2. Execute query with pagination
      const [projects, total] = await Promise.all([
        (this.prisma as any).project.findMany({
          where,
          include: {
            brand: {
              select: {
                id: true,
                companyName: true,
                logo: true,
              },
            },
          },
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
        }),
        (this.prisma as any).project.count({ where }),
      ]);

      // 3. Format response
      return {
        data: projects.map((p: any) => this.formatProjectResponse(p)),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof ProjectUnauthorizedError) {
        throw error;
      }
      console.error('[ProjectService] List projects error:', error);
      throw error;
    }
  }

  /**
   * Get project by ID
   */
  async getProjectById(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<Project> {
    try {
      const where: any = {
        id: projectId,
        deletedAt: null,
      };

      // Row-level security
      if (userRole === 'BRAND') {
        const brand = await this.prisma.brand.findFirst({
          where: { userId, deletedAt: null },
        });
        if (!brand) {
          throw new ProjectUnauthorizedError();
        }
        where.brandId = brand.id;
      }

      const project = await (this.prisma as any).project.findFirst({
        where,
        include: {
          brand: {
            select: {
              id: true,
              companyName: true,
              logo: true,
            },
          },
        },
      });

      if (!project) {
        throw new ProjectNotFoundError(projectId);
      }

      return this.formatProjectResponse(project);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError
      ) {
        throw error;
      }
      console.error('[ProjectService] Get project error:', error);
      throw error;
    }
  }

  /**
   * Delete project (soft delete)
   */
  async deleteProject(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    try {
      // 1. Verify ownership
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Check for active licenses (prevent deletion if licenses exist)
      const activeLicenses = await this.prisma.license.count({
        where: {
          // @ts-ignore - project field may not exist yet
          projectId,
          status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
        },
      });

      if (activeLicenses > 0) {
        throw new ProjectHasActiveLicensesError(activeLicenses);
      }

      // 3. Soft delete
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          deletedAt: new Date(),
          status: 'ARCHIVED',
        },
      });

      // 4. Log event
      await this.eventService.track({
        eventType: 'project.deleted',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
      });

      // 5. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      // 6. Audit log
      await this.auditService.log({
        userId,
        action: 'project.deleted',
        entityType: 'project',
        entityId: projectId,
        email: '',
        before: { projectId, name: project.name },
        after: { deletedAt: new Date() },
      });
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof ProjectHasActiveLicensesError
      ) {
        throw error;
      }
      console.error('[ProjectService] Delete project error:', error);
      throw new ProjectDeleteError(
        error instanceof Error ? error.message : 'Failed to delete project'
      );
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStatistics(
    brandId?: string,
    userRole?: string
  ): Promise<ProjectStatistics> {
    const where: any = { deletedAt: null };
    if (brandId) where.brandId = brandId;

    const [total, projects] = await Promise.all([
      (this.prisma as any).project.count({ where }),
      (this.prisma as any).project.findMany({
        where,
        select: {
          status: true,
          projectType: true,
          budgetCents: true,
        },
      }),
    ]);

    const byStatus: Record<ProjectStatus, number> = {
      DRAFT: 0,
      ACTIVE: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      ARCHIVED: 0,
    };

    const byType: Record<string, number> = {
      CAMPAIGN: 0,
      CONTENT: 0,
      LICENSING: 0,
    };

    let totalBudgetCents = 0;

    projects.forEach((p: any) => {
      byStatus[p.status as ProjectStatus]++;
      byType[p.projectType]++;
      totalBudgetCents += p.budgetCents;
    });

    return {
      total,
      byStatus,
      byType: byType as Record<any, number>,
      totalBudgetCents,
      avgBudgetCents: total > 0 ? Math.round(totalBudgetCents / total) : 0,
    };
  }

  /**
   * Get project team members
   */
  async getProjectTeam(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<TeamMember[]> {
    // Verify access
    await this.getProjectById(projectId, userId, userRole);

    // Fetch brand admin
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      include: {
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    const teamMembers: TeamMember[] = [];

    // Add brand admin
    if (project?.brand?.user) {
      teamMembers.push({
        id: project.brand.user.id,
        name: project.brand.user.name,
        email: project.brand.user.email,
        role: 'brand_admin',
        avatarUrl: project.brand.user.avatar,
      });
    }

    // TODO: Add creators with assets in project when IP Assets module is implemented

    return teamMembers;
  }

  /**
   * Get project assets with pagination
   */
  async getProjectAssets(
    projectId: string,
    page: number,
    limit: number,
    userId: string,
    userRole: string
  ): Promise<{
    assets: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // 1. Verify project access
      await this.getProjectById(projectId, userId, userRole);

      // 2. Build where clause for assets
      const where: any = {
        projectId,
        deletedAt: null,
      };

      // 3. Apply row-level security for creators
      if (userRole === 'CREATOR') {
        // Creators can only see their own assets
        const creator = await this.prisma.creator.findFirst({
          where: { userId, deletedAt: null },
        });
        if (creator) {
          where.createdBy = userId;
        } else {
          // If not a creator, return empty list
          return {
            assets: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          };
        }
      }

      // 4. Get total count
      const total = await this.prisma.ipAsset.count({ where });

      // 5. Fetch assets with pagination
      const skip = (page - 1) * limit;
      const assets = await this.prisma.ipAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          storageKey: true,
          fileSize: true,
          mimeType: true,
          thumbnailUrl: true,
          previewUrl: true,
          status: true,
          metadata: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              creator: {
                select: {
                  id: true,
                  stageName: true,
                },
              },
            },
          },
          _count: {
            select: {
              licenses: true,
              ownerships: true,
            },
          },
        },
      });

      // 6. Format response
      const formattedAssets = assets.map((asset: any) => ({
        id: asset.id,
        title: asset.title,
        description: asset.description,
        type: asset.type,
        storageKey: asset.storageKey,
        fileSize: asset.fileSize.toString(), // Convert BigInt to string
        mimeType: asset.mimeType,
        thumbnailUrl: asset.thumbnailUrl,
        previewUrl: asset.previewUrl,
        status: asset.status,
        metadata: asset.metadata,
        createdBy: asset.createdBy,
        createdAt: asset.createdAt.toISOString(),
        updatedAt: asset.updatedAt.toISOString(),
        creator: {
          id: asset.creator.id,
          name: asset.creator.name,
          email: asset.creator.email,
          avatar: asset.creator.avatar,
          stageName: asset.creator.creator?.stageName,
        },
        licenseCount: asset._count.licenses,
        ownershipCount: asset._count.ownerships,
      }));

      const totalPages = Math.ceil(total / limit);

      return {
        assets: formattedAssets,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError
      ) {
        throw error;
      }
      console.error('[ProjectService] Get project assets error:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to retrieve project assets'
      );
    }
  }

  // Private helper methods

  /**
   * Get project for update with ownership check
   */
  private async getProjectForUpdate(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<any> {
    const where: any = {
      id: projectId,
      deletedAt: null,
    };

    // Row-level security: only brand owner can update
    if (userRole === 'BRAND') {
      const brand = await this.prisma.brand.findFirst({
        where: { userId, deletedAt: null },
      });
      if (!brand) {
        throw new ProjectUnauthorizedError();
      }
      where.brandId = brand.id;
    }

    const project = await (this.prisma as any).project.findFirst({ where });

    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return project;
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(from: ProjectStatus, to: ProjectStatus): void {
    const validTransitions: Record<ProjectStatus, ProjectStatus[]> = {
      DRAFT: ['ACTIVE', 'CANCELLED'],
      ACTIVE: ['IN_PROGRESS', 'CANCELLED', 'ARCHIVED'],
      IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
      COMPLETED: ['ARCHIVED'],
      CANCELLED: ['ARCHIVED'],
      ARCHIVED: [], // No transitions from archived
    };

    if (!validTransitions[from].includes(to)) {
      throw new InvalidStatusTransitionError(from, to);
    }
  }

  /**
   * Format project response
   */
  private formatProjectResponse(project: any): Project {
    return {
      id: project.id,
      brandId: project.brandId,
      brandName: project.brand?.companyName,
      name: project.name,
      description: project.description,
      status: project.status,
      budgetCents: project.budgetCents,
      startDate: project.startDate?.toISOString() || null,
      endDate: project.endDate?.toISOString() || null,
      objectives: project.objectives as string[] | null,
      requirements: project.requirements,
      metadata: project.metadata,
      projectType: project.projectType,
      createdBy: project.createdBy,
      updatedBy: project.updatedBy,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      deletedAt: project.deletedAt?.toISOString() || null,
      assetCount: project._count?.assets,
      licenseCount: project._count?.licenses,
    };
  }

  /**
   * Invalidate project cache
   */
  private async invalidateProjectCache(projectId: string, brandId: string): Promise<void> {
    try {
      await Promise.all([
        this.cacheService.delete(`project:${projectId}`),
        this.cacheService.deletePattern(`projects:brand:${brandId}:*`),
      ]);
    } catch (error) {
      console.error('[ProjectService] Cache invalidation error:', error);
      // Don't throw - cache errors shouldn't break the operation
    }
  }

  // ============================================================================
  // TEAM MANAGEMENT
  // ============================================================================

  /**
   * Add team member to project
   */
  async addTeamMember(
    projectId: string,
    data: AddTeamMemberInput,
    currentUserId: string,
    userRole: string
  ): Promise<TeamMember> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, currentUserId, userRole);

      // 2. Verify user to add exists
      const userToAdd = await this.prisma.user.findFirst({
        where: { id: data.userId, deleted_at: null },
        select: { id: true, name: true, email: true, avatar: true },
      });

      if (!userToAdd) {
        throw new TeamMemberNotFoundError(data.userId);
      }

      // 3. Get current metadata
      const metadata = (project.metadata as any) || {};
      const teamMembers = (metadata.teamMembers || []) as any[];

      // 4. Check if already a member
      const existing = teamMembers.find((m: any) => m.userId === data.userId);
      if (existing) {
        throw new TeamMemberAlreadyExistsError(data.userId);
      }

      // 5. Add team member
      const newMember = {
        userId: data.userId,
        role: data.role,
        addedAt: new Date().toISOString(),
        addedBy: currentUserId,
      };

      teamMembers.push(newMember);

      // 6. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            teamMembers,
          },
          updatedBy: currentUserId,
        },
      });

      // 7. Log event
      await this.eventService.track({
        eventType: 'project.team_member_added',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: {
          userId: data.userId,
          role: data.role,
        },
      });

      // 8. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return {
        id: userToAdd.id,
        name: userToAdd.name,
        email: userToAdd.email,
        role: data.role,
        avatarUrl: userToAdd.avatar,
        addedAt: newMember.addedAt,
        addedBy: currentUserId,
      };
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof TeamMemberNotFoundError ||
        error instanceof TeamMemberAlreadyExistsError
      ) {
        throw error;
      }
      console.error('[ProjectService] Add team member error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to add team member'
      );
    }
  }

  /**
   * Remove team member from project
   */
  async removeTeamMember(
    projectId: string,
    userId: string,
    currentUserId: string,
    userRole: string
  ): Promise<void> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, currentUserId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const teamMembers = (metadata.teamMembers || []) as any[];

      // 3. Find member
      const memberIndex = teamMembers.findIndex((m: any) => m.userId === userId);
      if (memberIndex === -1) {
        throw new TeamMemberNotFoundError(userId);
      }

      // 4. Remove member
      teamMembers.splice(memberIndex, 1);

      // 5. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            teamMembers,
          },
          updatedBy: currentUserId,
        },
      });

      // 6. Log event
      await this.eventService.track({
        eventType: 'project.team_member_removed',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: { userId },
      });

      // 7. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof TeamMemberNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Remove team member error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to remove team member'
      );
    }
  }

  /**
   * Update team member role
   */
  async updateTeamMemberRole(
    projectId: string,
    userId: string,
    role: TeamMemberRole,
    currentUserId: string,
    userRole: string
  ): Promise<TeamMember> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, currentUserId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const teamMembers = (metadata.teamMembers || []) as any[];

      // 3. Find member
      const member = teamMembers.find((m: any) => m.userId === userId);
      if (!member) {
        throw new TeamMemberNotFoundError(userId);
      }

      // 4. Update role
      member.role = role;

      // 5. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            teamMembers,
          },
          updatedBy: currentUserId,
        },
      });

      // 6. Get user details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, avatar: true },
      });

      // 7. Log event
      await this.eventService.track({
        eventType: 'project.team_member_role_updated',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: { userId, role },
      });

      // 8. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return {
        id: userId,
        name: user?.name || null,
        email: user?.email || '',
        role,
        avatarUrl: user?.avatar || null,
        addedAt: member.addedAt,
        addedBy: member.addedBy,
      };
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof TeamMemberNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Update team member role error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to update team member role'
      );
    }
  }

  /**
   * Get enhanced project team members (including team from metadata)
   */
  async getEnhancedProjectTeam(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<TeamMember[]> {
    // Verify access
    const project = await this.getProjectById(projectId, userId, userRole);

    const teamMembers: TeamMember[] = [];

    // Get project with brand
    const projectWithBrand = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      include: {
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    // Add brand admin
    if (projectWithBrand?.brand?.user) {
      teamMembers.push({
        id: projectWithBrand.brand.user.id,
        name: projectWithBrand.brand.user.name,
        email: projectWithBrand.brand.user.email,
        role: 'brand_admin',
        avatarUrl: projectWithBrand.brand.user.avatar,
      });
    }

    // Add team members from metadata
    const metadata = (projectWithBrand.metadata as any) || {};
    const metadataTeam = (metadata.teamMembers || []) as any[];

    if (metadataTeam.length > 0) {
      const userIds = metadataTeam.map((m: any) => m.userId);
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, deleted_at: null },
        select: { id: true, name: true, email: true, avatar: true },
      });

      for (const member of metadataTeam) {
        const user = users.find((u) => u.id === member.userId);
        if (user) {
          teamMembers.push({
            id: user.id,
            name: user.name,
            email: user.email,
            role: member.role,
            avatarUrl: user.avatar,
            addedAt: member.addedAt,
            addedBy: member.addedBy,
          });
        }
      }
    }

    return teamMembers;
  }

  // ============================================================================
  // TIMELINE MANAGEMENT
  // ============================================================================

  /**
   * Create milestone
   */
  async createMilestone(
    projectId: string,
    data: Omit<CreateMilestoneInput, 'projectId'>,
    userId: string,
    userRole: string
  ): Promise<ProjectMilestone> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Validate due date is within project dates
      if (project.startDate && new Date(data.dueDate) < new Date(project.startDate)) {
        throw new ProjectUpdateError('Milestone due date cannot be before project start date');
      }
      if (project.endDate && new Date(data.dueDate) > new Date(project.endDate)) {
        throw new ProjectUpdateError('Milestone due date cannot be after project end date');
      }

      // 3. Get current metadata
      const metadata = (project.metadata as any) || {};
      const milestones = (metadata.milestones || []) as any[];

      // 4. Create milestone
      const milestone: ProjectMilestone = {
        id: `ms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        description: data.description,
        dueDate: data.dueDate,
        status: 'pending' as MilestoneStatus,
        completedAt: undefined,
        completedBy: undefined,
        createdAt: new Date().toISOString(),
        createdBy: userId,
      };

      milestones.push(milestone);

      // 5. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            milestones,
          },
          updatedBy: userId,
        },
      });

      // 6. Log event
      await this.eventService.track({
        eventType: 'project.milestone_created',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: {
          milestoneId: milestone.id,
          name: milestone.name,
          dueDate: milestone.dueDate,
        },
      });

      // 7. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return milestone;
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError
      ) {
        throw error;
      }
      console.error('[ProjectService] Create milestone error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to create milestone'
      );
    }
  }

  /**
   * Update milestone
   */
  async updateMilestone(
    projectId: string,
    milestoneId: string,
    data: Omit<UpdateMilestoneInput, 'projectId' | 'milestoneId'>,
    userId: string,
    userRole: string
  ): Promise<ProjectMilestone> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const milestones = (metadata.milestones || []) as any[];

      // 3. Find milestone
      const milestone = milestones.find((m: any) => m.id === milestoneId);
      if (!milestone) {
        throw new MilestoneNotFoundError(milestoneId);
      }

      // 4. Update fields
      if (data.name !== undefined) milestone.name = data.name;
      if (data.description !== undefined) milestone.description = data.description;
      if (data.dueDate !== undefined) {
        // Validate against project dates
        if (project.startDate && new Date(data.dueDate) < new Date(project.startDate)) {
          throw new ProjectUpdateError('Milestone due date cannot be before project start date');
        }
        if (project.endDate && new Date(data.dueDate) > new Date(project.endDate)) {
          throw new ProjectUpdateError('Milestone due date cannot be after project end date');
        }
        milestone.dueDate = data.dueDate;
      }
      if (data.status !== undefined) {
        milestone.status = data.status;
        if (data.status === 'completed' && !milestone.completedAt) {
          milestone.completedAt = new Date().toISOString();
          milestone.completedBy = userId;
        } else if (data.status !== 'completed') {
          milestone.completedAt = undefined;
          milestone.completedBy = undefined;
        }
      }

      // 5. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            milestones,
          },
          updatedBy: userId,
        },
      });

      // 6. Log event
      await this.eventService.track({
        eventType: 'project.milestone_updated',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: {
          milestoneId,
          changes: Object.keys(data),
        },
      });

      // 7. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return milestone;
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof MilestoneNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Update milestone error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to update milestone'
      );
    }
  }

  /**
   * Delete milestone
   */
  async deleteMilestone(
    projectId: string,
    milestoneId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const milestones = (metadata.milestones || []) as any[];

      // 3. Find and remove milestone
      const index = milestones.findIndex((m: any) => m.id === milestoneId);
      if (index === -1) {
        throw new MilestoneNotFoundError(milestoneId);
      }

      milestones.splice(index, 1);

      // 4. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            milestones,
          },
          updatedBy: userId,
        },
      });

      // 5. Log event
      await this.eventService.track({
        eventType: 'project.milestone_deleted',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: { milestoneId },
      });

      // 6. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof MilestoneNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Delete milestone error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to delete milestone'
      );
    }
  }

  /**
   * List milestones
   */
  async listMilestones(
    projectId: string,
    status: MilestoneStatus | undefined,
    userId: string,
    userRole: string
  ): Promise<ProjectMilestone[]> {
    // Verify access
    await this.getProjectById(projectId, userId, userRole);

    const projectWithMetadata = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      select: { metadata: true },
    });

    const metadata = (projectWithMetadata.metadata as any) || {};
    let milestones = (metadata.milestones || []) as ProjectMilestone[];

    // Filter by status if provided
    if (status) {
      milestones = milestones.filter((m) => m.status === status);
    }

    // Sort by due date
    milestones.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    return milestones;
  }

  // ============================================================================
  // BUDGET TRACKING
  // ============================================================================

  /**
   * Add expense to project
   */
  async addExpense(
    projectId: string,
    data: Omit<AddExpenseInput, 'projectId'>,
    userId: string,
    userRole: string
  ): Promise<BudgetExpense> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const expenses = (metadata.expenses || []) as any[];

      // 3. Calculate total expenses
      const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amountCents, 0);
      const newTotal = totalExpenses + data.amountCents;

      // 4. Warn if budget exceeded (don't block, just log)
      if (project.budgetCents > 0 && newTotal > project.budgetCents) {
        console.warn(
          `[ProjectService] Budget exceeded for project ${projectId}: ${newTotal} > ${project.budgetCents}`
        );
      }

      // 5. Create expense
      const expense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        description: data.description,
        amountCents: data.amountCents,
        category: data.category,
        date: data.date,
        metadata: data.metadata || {},
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      expenses.push(expense);

      // 6. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            expenses,
          },
          updatedBy: userId,
        },
      });

      // 7. Log event
      await this.eventService.track({
        eventType: 'project.expense_added',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: {
          expenseId: expense.id,
          amountCents: expense.amountCents,
          category: expense.category,
        },
      });

      // 8. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return expense;
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError
      ) {
        throw error;
      }
      console.error('[ProjectService] Add expense error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to add expense'
      );
    }
  }

  /**
   * Update expense
   */
  async updateExpense(
    projectId: string,
    expenseId: string,
    data: Omit<UpdateExpenseInput, 'projectId' | 'expenseId'>,
    userId: string,
    userRole: string
  ): Promise<BudgetExpense> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const expenses = (metadata.expenses || []) as any[];

      // 3. Find expense
      const expense = expenses.find((e: any) => e.id === expenseId);
      if (!expense) {
        throw new ExpenseNotFoundError(expenseId);
      }

      // 4. Update fields
      if (data.description !== undefined) expense.description = data.description;
      if (data.amountCents !== undefined) expense.amountCents = data.amountCents;
      if (data.category !== undefined) expense.category = data.category;
      if (data.date !== undefined) expense.date = data.date;
      if (data.metadata !== undefined) expense.metadata = data.metadata;

      // 5. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            expenses,
          },
          updatedBy: userId,
        },
      });

      // 6. Log event
      await this.eventService.track({
        eventType: 'project.expense_updated',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: {
          expenseId,
          changes: Object.keys(data),
        },
      });

      // 7. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);

      return expense;
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof ExpenseNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Update expense error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to update expense'
      );
    }
  }

  /**
   * Delete expense
   */
  async deleteExpense(
    projectId: string,
    expenseId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    try {
      // 1. Verify project exists and user has permission
      const project = await this.getProjectForUpdate(projectId, userId, userRole);

      // 2. Get current metadata
      const metadata = (project.metadata as any) || {};
      const expenses = (metadata.expenses || []) as any[];

      // 3. Find and remove expense
      const index = expenses.findIndex((e: any) => e.id === expenseId);
      if (index === -1) {
        throw new ExpenseNotFoundError(expenseId);
      }

      expenses.splice(index, 1);

      // 4. Update project metadata
      await (this.prisma as any).project.update({
        where: { id: projectId },
        data: {
          metadata: {
            ...metadata,
            expenses,
          },
          updatedBy: userId,
        },
      });

      // 5. Log event
      await this.eventService.track({
        eventType: 'project.expense_deleted',
        actorType: 'brand',
        actorId: project.brandId,
        projectId,
        brandId: project.brandId,
        propsJson: { expenseId },
      });

      // 6. Invalidate cache
      await this.invalidateProjectCache(projectId, project.brandId);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof ExpenseNotFoundError
      ) {
        throw error;
      }
      console.error('[ProjectService] Delete expense error:', error);
      throw new ProjectUpdateError(
        error instanceof Error ? error.message : 'Failed to delete expense'
      );
    }
  }

  /**
   * Get budget summary
   */
  async getBudgetSummary(
    projectId: string,
    userId: string,
    userRole: string
  ): Promise<BudgetSummary> {
    // Verify access
    await this.getProjectById(projectId, userId, userRole);

    const projectWithMetadata = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      select: { budgetCents: true, metadata: true },
    });

    const metadata = (projectWithMetadata.metadata as any) || {};
    const expenses = (metadata.expenses || []) as BudgetExpense[];

    // Calculate totals
    const spentCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);
    const budgetCents = projectWithMetadata.budgetCents;
    const remainingCents = budgetCents - spentCents;
    const utilizationPercent = budgetCents > 0 
      ? Math.round((spentCents / budgetCents) * 100) 
      : 0;

    // Sort expenses by date (newest first)
    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return {
      budgetCents,
      spentCents,
      remainingCents,
      utilizationPercent,
      expenseCount: expenses.length,
      expenses: sortedExpenses,
    };
  }
}
