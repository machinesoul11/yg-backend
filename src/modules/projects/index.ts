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
  ProjectEvent,
  ProjectStatus,
  ProjectType,
  ProjectSortBy,
  SortOrder,
  ProjectRequirements,
  ProjectMetadata,
} from './types/project.types';

// Schema exports
export {
  createProjectSchema,
  updateProjectSchema,
  getProjectByIdSchema,
  listProjectsSchema,
  deleteProjectSchema,
  getProjectAssetsSchema,
  getProjectTeamSchema,
  getProjectStatisticsSchema,
  trackEventSchema,
} from './schemas/project.schema';

export type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsInput,
  TrackEventInput,
} from './schemas/project.schema';

// Service exports
export { ProjectService } from './services/project.service';
export { EventService } from './services/event.service';

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
} from './errors/project.errors';
