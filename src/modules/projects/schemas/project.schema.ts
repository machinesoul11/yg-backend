/**
 * Project Validation Schemas (Zod)
 * Input validation for all project operations
 */

import { z } from 'zod';

// Project Requirements Schema
export const projectRequirementsSchema = z.object({
  assetTypes: z.array(z.enum(['image', 'video', 'audio', 'document'])).optional(),
  deliverables: z.number().int().min(1).max(100).optional(),
  exclusivity: z.boolean().optional(),
  usage: z.array(z.string()).optional(),
  territory: z.array(z.string()).optional(),
  duration: z.string().optional(),
}).passthrough(); // Allow additional fields

// Project Metadata Schema
export const projectMetadataSchema = z.object({
  attachments: z.array(z.object({
    key: z.string(),
    url: z.string().url(),
    name: z.string(),
    size: z.number(),
    type: z.string(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
}).passthrough(); // Allow additional fields

// Create Project Schema
export const createProjectSchema = z.object({
  name: z.string()
    .min(3, 'Project name must be at least 3 characters')
    .max(200, 'Project name must not exceed 200 characters'),
  description: z.string()
    .max(5000, 'Description must not exceed 5000 characters')
    .optional(),
  budgetCents: z.number()
    .int('Budget must be a whole number')
    .min(0, 'Budget cannot be negative')
    .max(100000000, 'Budget cannot exceed $1,000,000'), // Max $1M
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  objectives: z.array(z.string())
    .max(10, 'Maximum 10 objectives allowed')
    .optional(),
  requirements: projectRequirementsSchema.optional(),
  metadata: projectMetadataSchema.optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).default('CAMPAIGN'),
}).refine(
  (data) => {
    // Validate end date is after start date
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

// Update Project Schema
export const updateProjectSchema = z.object({
  id: z.string().cuid('Invalid project ID'),
  name: z.string()
    .min(3, 'Project name must be at least 3 characters')
    .max(200, 'Project name must not exceed 200 characters')
    .optional(),
  description: z.string()
    .max(5000, 'Description must not exceed 5000 characters')
    .optional()
    .nullable(),
  budgetCents: z.number()
    .int('Budget must be a whole number')
    .min(0, 'Budget cannot be negative')
    .max(100000000)
    .optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  objectives: z.array(z.string())
    .max(10, 'Maximum 10 objectives allowed')
    .optional()
    .nullable(),
  requirements: projectRequirementsSchema.optional().nullable(),
  metadata: projectMetadataSchema.optional().nullable(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
}).refine(
  (data) => {
    // Validate end date is after start date
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// Get Project By ID Schema
export const getProjectByIdSchema = z.object({
  id: z.string().cuid('Invalid project ID'),
});

// List Projects Schema
export const listProjectsSchema = z.object({
  // Filters
  brandId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  projectType: z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING']).optional(),
  search: z.string().optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  startDateFrom: z.string().datetime().optional(),
  startDateTo: z.string().datetime().optional(),
  
  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  
  // Sorting
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'budgetCents', 'startDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine(
  (data) => {
    // Ensure budgetMax > budgetMin
    if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
      return data.budgetMax >= data.budgetMin;
    }
    return true;
  },
  {
    message: 'Maximum budget must be greater than or equal to minimum budget',
    path: ['budgetMax'],
  }
);

export type ListProjectsInput = z.infer<typeof listProjectsSchema>;

// Search Projects Schema
export const searchProjectsSchema = z.object({
  // Search query
  query: z.string()
    .min(2, 'Search query must be at least 2 characters')
    .max(200, 'Search query must be at most 200 characters')
    .trim()
    .optional(),
  
  // Filters
  status: z.array(z.enum(['DRAFT', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED'])).optional(),
  projectType: z.array(z.enum(['CAMPAIGN', 'CONTENT', 'LICENSING'])).optional(),
  brandId: z.string().cuid().optional(),
  creatorId: z.string().cuid().optional(), // Search by creator involvement
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  
  // Pagination
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  
  // Sorting
  sortBy: z.enum(['relevance', 'createdAt', 'updatedAt', 'name', 'budgetCents', 'startDate']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine(
  (data) => {
    // Ensure budgetMax > budgetMin
    if (data.budgetMin !== undefined && data.budgetMax !== undefined) {
      return data.budgetMax >= data.budgetMin;
    }
    return true;
  },
  {
    message: 'Maximum budget must be greater than or equal to minimum budget',
    path: ['budgetMax'],
  }
).refine(
  (data) => {
    // Ensure dateTo > dateFrom
    if (data.dateFrom && data.dateTo) {
      return new Date(data.dateTo) >= new Date(data.dateFrom);
    }
    return true;
  },
  {
    message: 'End date must be after or equal to start date',
    path: ['dateTo'],
  }
);

export type SearchProjectsInput = z.infer<typeof searchProjectsSchema>;

// Delete Project Schema
export const deleteProjectSchema = z.object({
  id: z.string().cuid('Invalid project ID'),
});

// Get Project Assets Schema
export const getProjectAssetsSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

// Get Project Team Schema
export const getProjectTeamSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
});

// Get Project Statistics Schema
export const getProjectStatisticsSchema = z.object({
  brandId: z.string().optional(),
});

// Track Event Schema
export const trackEventSchema = z.object({
  eventType: z.string().max(100),
  actorType: z.enum(['brand', 'creator', 'admin', 'system']),
  actorId: z.string().optional(),
  projectId: z.string().optional(),
  userId: z.string().optional(),
  brandId: z.string().optional(),
  creatorId: z.string().optional(),
  propsJson: z.record(z.string(), z.any()).optional(),
});

export type TrackEventInput = z.infer<typeof trackEventSchema>;

// Team Management Schemas
export const addTeamMemberSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  userId: z.string().cuid('Invalid user ID'),
  role: z.enum(['collaborator', 'viewer']).default('collaborator'),
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>;

export const removeTeamMemberSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  userId: z.string().cuid('Invalid user ID'),
});

export type RemoveTeamMemberInput = z.infer<typeof removeTeamMemberSchema>;

export const updateTeamMemberRoleSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  userId: z.string().cuid('Invalid user ID'),
  role: z.enum(['collaborator', 'viewer']),
});

export type UpdateTeamMemberRoleInput = z.infer<typeof updateTeamMemberRoleSchema>;

// Timeline/Milestone Schemas
export const createMilestoneSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  name: z.string().min(3, 'Milestone name must be at least 3 characters').max(200),
  description: z.string().max(1000).optional(),
  dueDate: z.string().datetime(),
});

export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  milestoneId: z.string().cuid('Invalid milestone ID'),
  name: z.string().min(3).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  dueDate: z.string().datetime().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

export const deleteMilestoneSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  milestoneId: z.string().cuid('Invalid milestone ID'),
});

export const listMilestonesSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

export type ListMilestonesInput = z.infer<typeof listMilestonesSchema>;

// Budget Tracking Schemas
export const addExpenseSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  description: z.string().min(3).max(500),
  amountCents: z.number().int().min(1, 'Amount must be positive'),
  category: z.string().min(1).max(100),
  date: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type AddExpenseInput = z.infer<typeof addExpenseSchema>;

export const updateExpenseSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  expenseId: z.string().cuid('Invalid expense ID'),
  description: z.string().min(3).max(500).optional(),
  amountCents: z.number().int().min(1).optional(),
  category: z.string().min(1).max(100).optional(),
  date: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const deleteExpenseSchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
  expenseId: z.string().cuid('Invalid expense ID'),
});

export const getBudgetSummarySchema = z.object({
  projectId: z.string().cuid('Invalid project ID'),
});

export type GetBudgetSummaryInput = z.infer<typeof getBudgetSummarySchema>;
