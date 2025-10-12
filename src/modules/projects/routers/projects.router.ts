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
  getProjectAssetsSchema,
  getProjectTeamSchema,
  getProjectStatisticsSchema,
  addTeamMemberSchema,
  removeTeamMemberSchema,
  updateTeamMemberRoleSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  deleteMilestoneSchema,
  listMilestonesSchema,
  addExpenseSchema,
  updateExpenseSchema,
  deleteExpenseSchema,
  getBudgetSummarySchema,
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
  TeamMemberNotFoundError,
  TeamMemberAlreadyExistsError,
  CannotRemoveBrandAdminError,
  MilestoneNotFoundError,
  ExpenseNotFoundError,
  BudgetExceededError,
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

  if (
    error instanceof InvalidStatusTransitionError ||
    error instanceof ProjectHasActiveLicensesError ||
    error instanceof TeamMemberAlreadyExistsError ||
    error instanceof CannotRemoveBrandAdminError
  ) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: error.message,
    });
  }

  if (
    error instanceof TeamMemberNotFoundError ||
    error instanceof MilestoneNotFoundError ||
    error instanceof ExpenseNotFoundError
  ) {
    return new TRPCError({
      code: 'NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof BudgetExceededError) {
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
   * READ - Get project assets with pagination
   */
  getAssets: protectedProcedure
    .input(getProjectAssetsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const result = await projectService.getProjectAssets(
          input.projectId,
          input.page,
          input.limit,
          userId,
          userRole
        );

        return { data: result };
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

  // ============================================================================
  // TEAM MANAGEMENT
  // ============================================================================

  /**
   * CREATE - Add team member to project
   */
  addTeamMember: protectedProcedure
    .input(addTeamMemberSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const member = await projectService.addTeamMember(
          input.projectId,
          input,
          userId,
          userRole
        );

        return { data: member };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * DELETE - Remove team member from project
   */
  removeTeamMember: protectedProcedure
    .input(removeTeamMemberSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        await projectService.removeTeamMember(
          input.projectId,
          input.userId,
          userId,
          userRole
        );

        return { 
          success: true,
          message: 'Team member removed successfully',
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * UPDATE - Update team member role
   */
  updateTeamMemberRole: protectedProcedure
    .input(updateTeamMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const member = await projectService.updateTeamMemberRole(
          input.projectId,
          input.userId,
          input.role,
          userId,
          userRole
        );

        return { data: member };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get enhanced project team members
   */
  getEnhancedTeam: protectedProcedure
    .input(getProjectTeamSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const team = await projectService.getEnhancedProjectTeam(
          input.projectId,
          userId,
          userRole
        );

        return { data: team };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ============================================================================
  // TIMELINE/MILESTONE MANAGEMENT
  // ============================================================================

  /**
   * CREATE - Create milestone
   */
  createMilestone: protectedProcedure
    .input(createMilestoneSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const { projectId, ...data } = input;
        const milestone = await projectService.createMilestone(
          projectId,
          data,
          userId,
          userRole
        );

        return { data: milestone };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * UPDATE - Update milestone
   */
  updateMilestone: protectedProcedure
    .input(updateMilestoneSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const { projectId, milestoneId, ...data } = input;
        const milestone = await projectService.updateMilestone(
          projectId,
          milestoneId,
          data,
          userId,
          userRole
        );

        return { data: milestone };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * DELETE - Delete milestone
   */
  deleteMilestone: protectedProcedure
    .input(deleteMilestoneSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        await projectService.deleteMilestone(
          input.projectId,
          input.milestoneId,
          userId,
          userRole
        );

        return { 
          success: true,
          message: 'Milestone deleted successfully',
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - List milestones
   */
  listMilestones: protectedProcedure
    .input(listMilestonesSchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const milestones = await projectService.listMilestones(
          input.projectId,
          input.status,
          userId,
          userRole
        );

        return { data: milestones };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  // ============================================================================
  // BUDGET TRACKING
  // ============================================================================

  /**
   * CREATE - Add expense
   */
  addExpense: protectedProcedure
    .input(addExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const { projectId, ...data } = input;
        const expense = await projectService.addExpense(
          projectId,
          data,
          userId,
          userRole
        );

        return { data: expense };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * UPDATE - Update expense
   */
  updateExpense: protectedProcedure
    .input(updateExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const { projectId, expenseId, ...data } = input;
        const expense = await projectService.updateExpense(
          projectId,
          expenseId,
          data,
          userId,
          userRole
        );

        return { data: expense };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * DELETE - Delete expense
   */
  deleteExpense: protectedProcedure
    .input(deleteExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        await projectService.deleteExpense(
          input.projectId,
          input.expenseId,
          userId,
          userRole
        );

        return { 
          success: true,
          message: 'Expense deleted successfully',
        };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),

  /**
   * READ - Get budget summary
   */
  getBudgetSummary: protectedProcedure
    .input(getBudgetSummarySchema)
    .query(async ({ ctx, input }) => {
      try {
        const userId = ctx.session.user.id;
        const userRole = ctx.session.user.role;

        const summary = await projectService.getBudgetSummary(
          input.projectId,
          userId,
          userRole
        );

        return { data: summary };
      } catch (error) {
        throw mapErrorToTRPC(error);
      }
    }),
});
