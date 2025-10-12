/**
 * Project Types
 * TypeScript type definitions for projects module
 */

// Enums (matching Prisma)
export type ProjectStatus = 
  | 'DRAFT'
  | 'ACTIVE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ProjectType = 
  | 'CAMPAIGN'
  | 'CONTENT'
  | 'LICENSING';

// Core Project Types
export interface ProjectRequirements {
  assetTypes?: ('image' | 'video' | 'audio' | 'document')[];
  deliverables?: number;
  exclusivity?: boolean;
  usage?: string[];
  territory?: string[];
  duration?: string;
  [key: string]: any; // Allow flexible requirements
}

export interface ProjectMetadata {
  attachments?: {
    key: string;
    url: string;
    name: string;
    size: number;
    type: string;
  }[];
  tags?: string[];
  categories?: string[];
  [key: string]: any; // Allow flexible metadata
}

export interface Project {
  id: string;
  brandId: string;
  brandName?: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  budgetCents: number;
  startDate: string | null;
  endDate: string | null;
  objectives: string[] | null;
  requirements: ProjectRequirements | null;
  metadata: ProjectMetadata | null;
  projectType: ProjectType;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  
  // Optional computed fields
  assetCount?: number;
  licenseCount?: number;
}

export interface ProjectWithRelations extends Project {
  brand: {
    id: string;
    companyName: string;
    logo: string | null;
  };
  _count?: {
    assets?: number;
    licenses?: number;
    events?: number;
  };
}

// List/Pagination Types
export interface ProjectSearchFilters {
  brandId?: string;
  status?: ProjectStatus;
  projectType?: ProjectType;
  search?: string;
  budgetMin?: number;
  budgetMax?: number;
  startDateFrom?: string;
  startDateTo?: string;
}

export type ProjectSortBy = 
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'budgetCents'
  | 'startDate';

export type SortOrder = 'asc' | 'desc';

export interface ProjectListResponse {
  data: Project[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Statistics
export interface ProjectStatistics {
  total: number;
  byStatus: Record<ProjectStatus, number>;
  byType: Record<ProjectType, number>;
  totalBudgetCents: number;
  avgBudgetCents: number;
}

// Team Members
export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: 'brand_admin' | 'creator' | 'collaborator' | 'viewer';
  avatarUrl: string | null;
  addedAt?: string;
  addedBy?: string;
}

export type TeamMemberRole = 'brand_admin' | 'creator' | 'collaborator' | 'viewer';

export interface TeamMemberUpdate {
  userId: string;
  role: TeamMemberRole;
}

// Timeline & Milestones
export interface ProjectMilestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  status: MilestoneStatus;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  createdBy: string;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface CreateMilestoneInput {
  name: string;
  description?: string;
  dueDate: string;
}

export interface UpdateMilestoneInput {
  name?: string;
  description?: string;
  dueDate?: string;
  status?: MilestoneStatus;
}

// Budget Tracking
export interface BudgetExpense {
  id: string;
  description: string;
  amountCents: number;
  category: string;
  date: string;
  createdBy: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface CreateExpenseInput {
  description: string;
  amountCents: number;
  category: string;
  date: string;
  metadata?: Record<string, any>;
}

export interface BudgetSummary {
  budgetCents: number;
  spentCents: number;
  remainingCents: number;
  utilizationPercent: number;
  expenseCount: number;
  expenses: BudgetExpense[];
}

// Analytics Event
export interface ProjectEvent {
  id: string;
  eventType: string;
  actorType: 'brand' | 'creator' | 'admin' | 'system';
  actorId: string | null;
  projectId: string | null;
  propsJson: Record<string, any> | null;
  createdAt: string;
}
