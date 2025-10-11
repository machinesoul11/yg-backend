/**
 * Project Service
 * Core business logic for project management operations
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { CacheService } from '@/lib/redis/cache.service';
import { EventService } from './event.service';
import {
  ProjectNotFoundError,
  ProjectUnauthorizedError,
  ProjectCreationError,
  ProjectUpdateError,
  ProjectDeleteError,
  InvalidStatusTransitionError,
  ProjectHasActiveLicensesError,
  OnlyBrandsCanCreateProjectsError,
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
} from '../types/project.types';
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from '../schemas/project.schema';

export class ProjectService {
  private eventService: EventService;
  private cacheService: CacheService;

  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private auditService: AuditService
  ) {
    this.eventService = new EventService(prisma);
    this.cacheService = new CacheService();
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

      // 2. Create project
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

      // 3. Log event
      await this.eventService.track({
        eventType: 'project.created',
        actorType: 'brand',
        actorId: brand.id,
        projectId: project.id,
        brandId: brand.id,
        propsJson: { 
          projectType: project.projectType,
          budgetCents: project.budgetCents,
        },
      });

      // 4. Audit log
      await this.auditService.log({
        userId,
        action: 'project.created',
        email: '',
        beforeJson: undefined,
        afterJson: { projectId: project.id, name: project.name },
      });

      return this.formatProjectResponse(project);
    } catch (error) {
      if (error instanceof OnlyBrandsCanCreateProjectsError) {
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

      // 2. Validate status transitions
      if (data.status && data.status !== project.status) {
        this.validateStatusTransition(project.status as ProjectStatus, data.status);
      }

      // 3. Build update data
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

      // 4. Update project
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

      // 5. Log event
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

      // 6. Invalidate cache
      await this.invalidateProjectCache(projectId, updated.brandId);

      // 7. Audit log
      await this.auditService.log({
        userId,
        action: eventType,
        email: '',
        beforeJson: { status: project.status },
        afterJson: { status: updated.status, changes: Object.keys(updateData) },
      });

      return this.formatProjectResponse(updated);
    } catch (error) {
      if (
        error instanceof ProjectNotFoundError ||
        error instanceof ProjectUnauthorizedError ||
        error instanceof InvalidStatusTransitionError
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
          status: { in: ['ACTIVE', 'PENDING'] },
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
        email: '',
        beforeJson: { projectId, name: project.name },
        afterJson: undefined,
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

  // ... continued in next part

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
}
