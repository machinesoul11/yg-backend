/**
 * Projects tRPC Router
 * API endpoints for project management operations
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc';
import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { ProjectService } from '../services/project.service';
import {
  createProjectSchema,
  updateProjectSchema,
  getProjectByIdSchema,
  listProjectsSchema,
  deleteProjectSchema,
  getProjectTeamSchema,
  getProjectStatisticsSchema,
} from '../schemas/project.schema';
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

// Initialize services
const emailService = new EmailService();
const auditService = new AuditService(prisma);
const projectService = new ProjectService(prisma, emailService, auditService);

/**
 * Map custom errors to tRPC errors
 */
function mapErrorToTRPC(error: unknown): TRPCError {
  if (error instanceof ProjectNotFoundError) {
    return new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ProjectUnauthorizedError) {
    return new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }

  if (error instanceof OnlyBrandsCanCreateProjectsError) {
    return new TRPCError({
      code: 'FORBIDDEN',
      message: error.message,
    });
  }

  if (error instanceof InvalidStatusTransitionError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }

  if (error instanceof ProjectHasActiveLicensesError) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }

  if (
    error instanceof ProjectCreationError ||
    error instanceof ProjectUpdateError ||
    error instanceof ProjectDeleteError
  ) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  if (error instanceof Error) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unknown error occurred',
  });
}

export const projectsRouter = createTRPCRouter({
  /**
   * CREATE - Create new project
   */
  create: protectedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const project = await projectService.createProject(userId, input);
        return { data: project };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get project by ID
   */
  getById: protectedProcedure
    .input(getProjectByIdSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;
        
        const project = await projectService.getProjectById(
          input.id,
          userId,
          userRole
        );

        return { data: project };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - List projects with filtering
   */
  list: protectedProcedure
    .input(listProjectsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const filters = {
          brandId: input.brandId,
          status: input.status,
          projectType: input.projectType,
          search: input.search,
          budgetMin: input.budgetMin,
          budgetMax: input.budgetMax,
          startDateFrom: input.startDateFrom,
          startDateTo: input.startDateTo,
        };

        const result = await projectService.listProjects(
          input.page,
          input.limit,
          filters,
          input.sortBy,
          input.sortOrder,
          userId,
          userRole
        );

        return { data: result };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * UPDATE - Update project
   */
  update: protectedProcedure
    .input(updateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const project = await projectService.updateProject(
          input.id,
          input,
          userId,
          userRole
        );

        return { data: project };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * DELETE - Delete project (soft delete)
   */
  delete: protectedProcedure
    .input(deleteProjectSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        await projectService.deleteProject(input.id, userId, userRole);

        return { 
          success: true,
          message: 'Project deleted successfully',
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get project team members
   */
  getTeam: protectedProcedure
    .input(getProjectTeamSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const team = await projectService.getProjectTeam(
          input.projectId,
          userId,
          userRole
        );

        return { data: team };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get project statistics
   */
  getStatistics: protectedProcedure
    .input(getProjectStatisticsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userRole = ctx.session.user.role;

        const stats = await projectService.getProjectStatistics(
          input.brandId,
          userRole
        );

        return { data: stats };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get my brand's projects
   */
  getMyProjects: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        // Get user's brand (already available in ctx.securityContext)
        if (!ctx.securityContext?.brandId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only brand accounts can view their projects',
          });
        }

        const filters = {
          brandId: ctx.securityContext.brandId,
          status: input.status,
        };

        const result = await projectService.listProjects(
          input.page,
          input.limit,
          filters,
          'createdAt',
          'desc',
          userId,
          userRole
        );

        return { data: result };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),
});
