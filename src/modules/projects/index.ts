/**
 * Projects Module
 * Organizational containers for creative work within YES GODDESS
 * 
 * This module manages projects/campaigns created by brands to discover
 * and license creator work. Projects act as the bridge between Brands
 * and IP Assets.
 */

// Type exports
export type {
  Project,
  ProjectWithRelations,
  ProjectSearchFilters,
  ProjectListResponse,
  ProjectStatistics,
  TeamMember,
  TeamMemberRole,
  ProjectEvent,
  ProjectStatus,
  ProjectType,
  ProjectSortBy,
  SortOrder,
  ProjectRequirements,
  ProjectMetadata,
  ProjectMilestone,
  MilestoneStatus,
  BudgetExpense,
  BudgetSummary,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  CreateExpenseInput,
  TeamMemberUpdate,
} from './types/project.types';

// Schema exports
export {
  createProjectSchema,
  updateProjectSchema,
  getProjectByIdSchema,
  listProjectsSchema,
  searchProjectsSchema,
  deleteProjectSchema,
  getProjectAssetsSchema,
  getProjectTeamSchema,
  getProjectStatisticsSchema,
  trackEventSchema,
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
} from './schemas/project.schema';

export type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsInput,
  SearchProjectsInput,
  TrackEventInput,
  AddTeamMemberInput,
  RemoveTeamMemberInput,
  UpdateTeamMemberRoleInput,
  ListMilestonesInput,
  AddExpenseInput,
  UpdateExpenseInput,
  GetBudgetSummaryInput,
} from './schemas/project.schema';

// Service exports
export { ProjectService } from './services/project.service';
export { EventService } from './services/event.service';
export { ProjectValidationService } from './services/validation.service';

// Router export
export { projectsRouter } from './routers/projects.router';

// Error exports
export {
  ProjectError,
  ProjectNotFoundError,
  ProjectUnauthorizedError,
  ProjectCreationError,
  ProjectUpdateError,
  ProjectDeleteError,
  InvalidStatusTransitionError,
  ProjectHasActiveLicensesError,
  OnlyBrandsCanCreateProjectsError,
  InvalidDateRangeError,
  TeamMemberNotFoundError,
  TeamMemberAlreadyExistsError,
  CannotRemoveBrandAdminError,
  MilestoneNotFoundError,
  ExpenseNotFoundError,
  BudgetExceededError,
} from './errors/project.errors';
