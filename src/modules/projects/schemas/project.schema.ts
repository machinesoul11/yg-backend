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
