/**
 * Project Validation Service
 * 
 * Comprehensive validation logic for project operations including:
 * - Budget validation and availability checking
 * - Date range validation with business rules
 * - Status transition validation with preconditions
 * - Permission checking and authorization
 * - Duplicate detection with fuzzy matching
 */

import { PrismaClient, ProjectStatus, ProjectType } from '@prisma/client';
import {
  ProjectCreationError,
  InvalidDateRangeError,
  InvalidStatusTransitionError,
  BudgetExceededError,
  ProjectUnauthorizedError,
} from '../errors/project.errors';

// ============================================================================
// Types and Constants
// ============================================================================

interface BudgetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface DateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface StatusTransitionResult {
  valid: boolean;
  errors: string[];
  requiredActions: string[];
}

interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicates: Array<{
    id: string;
    name: string;
    similarity: number;
    status: ProjectStatus;
    createdAt: Date;
  }>;
  warnings: string[];
}

/**
 * Status transition state machine
 * Defines valid transitions between project statuses
 */
const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['IN_PROGRESS', 'CANCELLED', 'ARCHIVED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [], // Terminal state - no transitions allowed
};

/**
 * Minimum budget requirements by project type (in cents)
 */
const MIN_BUDGET_BY_TYPE: Record<ProjectType, number> = {
  CAMPAIGN: 100000, // $1,000 minimum for campaigns
  CONTENT: 50000,   // $500 minimum for content
  LICENSING: 25000, // $250 minimum for licensing
};

/**
 * Maximum budget allowed per project (in cents)
 * Prevents data entry errors
 */
const MAX_BUDGET = 1000000000; // $10,000,000

/**
 * Maximum project duration in days
 * Projects longer than this trigger warnings
 */
const MAX_PROJECT_DURATION_DAYS = 365;

/**
 * Warning threshold for projects approaching this duration
 */
const LONG_PROJECT_WARNING_DAYS = 180;

/**
 * Grace period for past start dates (in days)
 * Allows some flexibility for projects that started recently
 */
const START_DATE_GRACE_PERIOD_DAYS = 7;

/**
 * Similarity threshold for duplicate detection (0-1)
 * Higher values = stricter matching
 */
const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;

// ============================================================================
// Main Validation Service
// ============================================================================

export class ProjectValidationService {
  constructor(private prisma: PrismaClient) {}

  // ==========================================================================
  // Budget Validation
  // ==========================================================================

  /**
   * Validate budget for project creation or update
   * Checks:
   * - Budget is within allowed range
   * - Budget meets minimum for project type
   * - Brand has sufficient budget/credit (if applicable)
   * - Budget doesn't exceed existing financial commitments
   */
  async validateBudget(
    budgetCents: number,
    projectType: ProjectType,
    brandId: string,
    projectId?: string // For updates
  ): Promise<BudgetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Basic range validation
    if (budgetCents < 0) {
      errors.push('Budget cannot be negative');
    }

    if (budgetCents > MAX_BUDGET) {
      errors.push(`Budget cannot exceed $${(MAX_BUDGET / 100).toLocaleString()}`);
    }

    // 2. Minimum budget for project type
    const minBudget = MIN_BUDGET_BY_TYPE[projectType];
    if (budgetCents < minBudget) {
      warnings.push(
        `Budget is below recommended minimum of $${(minBudget / 100).toLocaleString()} for ${projectType} projects`
      );
    }

    // 3. Check existing financial commitments if updating
    if (projectId) {
      const totalCommitted = await this.getCommittedBudget(projectId);
      if (budgetCents < totalCommitted) {
        errors.push(
          `Budget cannot be reduced below $${(totalCommitted / 100).toFixed(2)} due to existing financial commitments`
        );
      }
    }

    // 4. Validate brand budget availability (if brand has budget tracking)
    const brandBudgetCheck = await this.checkBrandBudgetAvailability(
      brandId,
      budgetCents,
      projectId
    );
    
    if (!brandBudgetCheck.available) {
      if (brandBudgetCheck.critical) {
        errors.push(brandBudgetCheck.message);
      } else {
        warnings.push(brandBudgetCheck.message);
      }
    }

    // 5. Budget warning thresholds
    if (budgetCents > 50000000) { // $500k
      warnings.push('High budget project - consider additional approval workflow');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get total committed budget for a project
   * Sums all active licenses and expenses
   */
  private async getCommittedBudget(projectId: string): Promise<number> {
    // Get sum of active license values
    const licenseTotal = await this.prisma.license.aggregate({
      where: {
        projectId,
        status: {
          in: ['ACTIVE', 'PENDING_APPROVAL', 'DRAFT'],
        },
        deletedAt: null,
      },
      _sum: {
        feeCents: true,
      },
    });

    // In a real implementation, you'd also sum expenses
    // For now, we'll use license total as committed amount
    const committed = Number(licenseTotal._sum?.feeCents || 0);

    return committed;
  }

  /**
   * Check if brand has sufficient budget for this project
   * Note: This is a placeholder for future budget tracking feature
   */
  private async checkBrandBudgetAvailability(
    brandId: string,
    requestedBudgetCents: number,
    excludeProjectId?: string
  ): Promise<{ available: boolean; critical: boolean; message: string }> {
    // Get brand's current project budgets
    const existingProjects = await this.prisma.project.aggregate({
      where: {
        brandId,
        id: excludeProjectId ? { not: excludeProjectId } : undefined,
        status: {
          in: ['DRAFT', 'ACTIVE', 'IN_PROGRESS'],
        },
        deletedAt: null,
      },
      _sum: {
        budgetCents: true,
      },
    });

    const totalAllocated = Number(existingProjects._sum.budgetCents || 0);
    const newTotal = totalAllocated + requestedBudgetCents;

    // For now, just warn on very high total allocations
    // In future, check against brand.creditLimit or brand.budgetCap
    if (newTotal > 10000000000) { // $100M total
      return {
        available: false,
        critical: true,
        message: 'Total allocated budget across all projects would exceed reasonable limits',
      };
    }

    if (newTotal > 5000000000) { // $50M total
      return {
        available: true,
        critical: false,
        message: `Total allocated budget across projects: $${(newTotal / 100).toLocaleString()}`,
      };
    }

    return {
      available: true,
      critical: false,
      message: '',
    };
  }

  /**
   * Validate budget adjustment
   * Additional checks for budget changes on existing projects
   */
  async validateBudgetAdjustment(
    projectId: string,
    currentBudgetCents: number,
    newBudgetCents: number,
    userRole: string
  ): Promise<BudgetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const difference = newBudgetCents - currentBudgetCents;
    const percentChange = Math.abs((difference / currentBudgetCents) * 100);

    // Large budget increases may require approval
    if (difference > 0 && percentChange > 50 && userRole !== 'ADMIN') {
      warnings.push(
        'Budget increase exceeds 50% - admin approval recommended'
      );
    }

    if (difference > 10000000 && userRole !== 'ADMIN') { // $100k increase
      errors.push(
        'Budget increases over $100,000 require admin approval'
      );
    }

    // Check if decrease is allowed
    const committed = await this.getCommittedBudget(projectId);
    if (newBudgetCents < committed) {
      errors.push(
        `Cannot reduce budget below committed amount of $${(committed / 100).toFixed(2)}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // Date Range Validation
  // ==========================================================================

  /**
   * Validate project date ranges
   * Checks:
   * - End date is after start date
   * - Dates are within reasonable bounds
   * - Dates don't conflict with existing projects (if needed)
   * - Timezone considerations
   */
  async validateDateRange(
    startDate: Date | null,
    endDate: Date | null,
    projectType: ProjectType,
    brandId: string,
    projectId?: string
  ): Promise<DateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const now = new Date();

    // 1. Basic validation: end date must be after start date
    if (startDate && endDate && endDate <= startDate) {
      errors.push('End date must be after start date');
    }

    // 2. Validate start date is not too far in the past
    if (startDate) {
      const daysInPast = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysInPast > START_DATE_GRACE_PERIOD_DAYS) {
        warnings.push(
          `Start date is ${daysInPast} days in the past - consider updating to current date`
        );
      }

      // Don't allow start dates more than 30 days in the past
      if (daysInPast > 30) {
        errors.push('Start date cannot be more than 30 days in the past');
      }
    }

    // 3. Validate project duration
    if (startDate && endDate) {
      const durationDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (durationDays < 1) {
        errors.push('Project must be at least 1 day long');
      }

      if (durationDays > MAX_PROJECT_DURATION_DAYS) {
        warnings.push(
          `Project duration of ${durationDays} days exceeds recommended maximum of ${MAX_PROJECT_DURATION_DAYS} days`
        );
      }

      if (durationDays > LONG_PROJECT_WARNING_DAYS) {
        warnings.push(
          `Long-term project (${durationDays} days) - consider breaking into phases`
        );
      }

      // Very short projects might be errors
      if (durationDays < 7 && projectType === 'CAMPAIGN') {
        warnings.push(
          'Campaign projects typically run longer than 7 days'
        );
      }
    }

    // 4. Check for overlapping active projects (optional business rule)
    // This prevents brands from having too many concurrent campaigns
    if (startDate && endDate && projectType === 'CAMPAIGN') {
      const overlapping = await this.checkOverlappingProjects(
        brandId,
        startDate,
        endDate,
        projectId
      );

      if (overlapping.count > 5) {
        warnings.push(
          `Brand has ${overlapping.count} overlapping active projects - consider staggering timelines`
        );
      }
    }

    // 5. Fiscal period alignment (optional)
    if (startDate && endDate) {
      const spansFiscalYear = this.spansFiscalYearBoundary(startDate, endDate);
      if (spansFiscalYear) {
        warnings.push(
          'Project spans fiscal year boundary - ensure budget allocation is correct'
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check for overlapping projects
   */
  private async checkOverlappingProjects(
    brandId: string,
    startDate: Date,
    endDate: Date,
    excludeProjectId?: string
  ): Promise<{ count: number; projects: any[] }> {
    const overlapping = await this.prisma.project.findMany({
      where: {
        brandId,
        id: excludeProjectId ? { not: excludeProjectId } : undefined,
        status: {
          in: ['ACTIVE', 'IN_PROGRESS'],
        },
        deletedAt: null,
        AND: [
          { startDate: { lte: endDate } },
          { endDate: { gte: startDate } },
        ],
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    return {
      count: overlapping.length,
      projects: overlapping,
    };
  }

  /**
   * Check if date range spans fiscal year boundary
   * Assumes fiscal year = calendar year for simplicity
   */
  private spansFiscalYearBoundary(startDate: Date, endDate: Date): boolean {
    return startDate.getFullYear() !== endDate.getFullYear();
  }

  /**
   * Validate date changes for existing projects
   */
  async validateDateChange(
    projectId: string,
    currentStartDate: Date | null,
    currentEndDate: Date | null,
    newStartDate: Date | null,
    newEndDate: Date | null
  ): Promise<DateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if dates are being moved earlier (shortening timeline)
    if (currentEndDate && newEndDate && newEndDate < currentEndDate) {
      // Verify no licenses extend beyond new end date
      const extendingLicenses = await this.prisma.license.count({
        where: {
          projectId,
          endDate: { gt: newEndDate },
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (extendingLicenses > 0) {
        errors.push(
          `Cannot shorten project end date - ${extendingLicenses} license(s) extend beyond new end date`
        );
      }
    }

    // Warn if start date is moved significantly
    if (currentStartDate && newStartDate) {
      const daysDifference = Math.abs(
        Math.floor(
          (newStartDate.getTime() - currentStartDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      if (daysDifference > 30) {
        warnings.push(
          `Start date moved by ${daysDifference} days - verify all stakeholders are notified`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // Status Transition Validation
  // ==========================================================================

  /**
   * Validate status transition with precondition checks
   */
  async validateStatusTransition(
    projectId: string,
    currentStatus: ProjectStatus,
    newStatus: ProjectStatus,
    userRole: string
  ): Promise<StatusTransitionResult> {
    const errors: string[] = [];
    const requiredActions: string[] = [];

    // 1. Check if transition is allowed
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      errors.push(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
      return {
        valid: false,
        errors,
        requiredActions,
      };
    }

    // 2. Check preconditions for specific transitions
    switch (newStatus) {
      case 'ACTIVE':
        await this.validateActivationPreconditions(projectId, errors, requiredActions);
        break;

      case 'COMPLETED':
        await this.validateCompletionPreconditions(projectId, errors, requiredActions);
        break;

      case 'CANCELLED':
        await this.validateCancellationPreconditions(projectId, errors, requiredActions, userRole);
        break;

      case 'ARCHIVED':
        await this.validateArchivalPreconditions(projectId, errors, requiredActions);
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
      requiredActions,
    };
  }

  /**
   * Preconditions for activating a project
   */
  private async validateActivationPreconditions(
    projectId: string,
    errors: string[],
    requiredActions: string[]
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        budgetCents: true,
        startDate: true,
        endDate: true,
        description: true,
        requirements: true,
      },
    });

    if (!project) return;

    // Must have budget
    if (project.budgetCents === 0) {
      errors.push('Project must have a budget before activation');
    }

    // Should have dates
    if (!project.startDate || !project.endDate) {
      requiredActions.push('Set project start and end dates');
    }

    // Should have description
    if (!project.description || project.description.length < 20) {
      requiredActions.push('Add detailed project description');
    }

    // Should have requirements
    if (!project.requirements) {
      requiredActions.push('Define project requirements');
    }
  }

  /**
   * Preconditions for completing a project
   */
  private async validateCompletionPreconditions(
    projectId: string,
    errors: string[],
    requiredActions: string[]
  ): Promise<void> {
    // Check for pending licenses
    const pendingLicenses = await this.prisma.license.count({
      where: {
        projectId,
        status: { in: ['PENDING_APPROVAL', 'DRAFT'] },
        deletedAt: null,
      },
    });

    if (pendingLicenses > 0) {
      requiredActions.push(
        `Resolve ${pendingLicenses} pending license(s) before completion`
      );
    }

    // Optionally check for project deliverables or milestones
    // This would require additional schema/tracking
  }

  /**
   * Preconditions for cancelling a project
   */
  private async validateCancellationPreconditions(
    projectId: string,
    errors: string[],
    requiredActions: string[],
    userRole: string
  ): Promise<void> {
    // Check for active licenses
    const activeLicenses = await this.prisma.license.count({
      where: {
        projectId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (activeLicenses > 0) {
      if (userRole !== 'ADMIN') {
        errors.push(
          `Cannot cancel project with ${activeLicenses} active license(s) - contact admin`
        );
      } else {
        requiredActions.push(
          `Handle ${activeLicenses} active license(s) before cancellation`
        );
      }
    }
  }

  /**
   * Preconditions for archiving a project
   */
  private async validateArchivalPreconditions(
    projectId: string,
    errors: string[],
    requiredActions: string[]
  ): Promise<void> {
    // Ensure all licenses are closed
    const openLicenses = await this.prisma.license.count({
      where: {
        projectId,
        status: { notIn: ['EXPIRED', 'TERMINATED'] },
        deletedAt: null,
      },
    });

    if (openLicenses > 0) {
      errors.push(
        `Cannot archive project with ${openLicenses} open license(s)`
      );
    }
  }

  // ==========================================================================
  // Permission Validation
  // ==========================================================================

  /**
   * Check if user has permission to create project
   */
  async canCreateProject(userId: string, userRole: string): Promise<PermissionCheckResult> {
    // Only brands and admins can create projects
    if (userRole === 'ADMIN') {
      return { allowed: true };
    }

    if (userRole === 'BRAND') {
      // Verify brand account exists and is active
      const brand = await this.prisma.brand.findFirst({
        where: {
          userId,
          deletedAt: null,
        },
      });

      if (!brand) {
        return {
          allowed: false,
          reason: 'Brand account not found or inactive',
        };
      }

      // Check if brand is verified (optional requirement)
      if (brand.verificationStatus !== 'approved') {
        return {
          allowed: false,
          reason: 'Brand must be verified before creating projects',
        };
      }

      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Only brand accounts can create projects',
    };
  }

  /**
   * Check if user has permission to update project
   */
  async canUpdateProject(
    userId: string,
    userRole: string,
    projectId: string,
    updates: any
  ): Promise<PermissionCheckResult> {
    // Admins can update anything
    if (userRole === 'ADMIN') {
      return { allowed: true };
    }

    // Get project
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        brandId: true,
        status: true,
        brand: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!project) {
      return {
        allowed: false,
        reason: 'Project not found',
      };
    }

    // Brand must own the project
    if (userRole === 'BRAND') {
      if (project.brand.userId !== userId) {
        return {
          allowed: false,
          reason: 'You can only update your own projects',
        };
      }

      // Archived projects cannot be updated
      if (project.status === 'ARCHIVED') {
        return {
          allowed: false,
          reason: 'Archived projects cannot be updated',
        };
      }

      return { allowed: true };
    }

    return {
      allowed: false,
      reason: 'Insufficient permissions',
    };
  }

  /**
   * Check if user has permission to delete project
   */
  async canDeleteProject(
    userId: string,
    userRole: string,
    projectId: string
  ): Promise<PermissionCheckResult> {
    // Only admins and project owners can delete
    if (userRole === 'ADMIN') {
      return { allowed: true };
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        brandId: true,
        status: true,
        brand: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            licenses: true,
          },
        },
      },
    });

    if (!project) {
      return {
        allowed: false,
        reason: 'Project not found',
      };
    }

    if (userRole === 'BRAND' && project.brand.userId !== userId) {
      return {
        allowed: false,
        reason: 'You can only delete your own projects',
      };
    }

    // Cannot delete projects with licenses
    if (project._count.licenses > 0) {
      return {
        allowed: false,
        reason: 'Cannot delete project with existing licenses',
      };
    }

    return { allowed: true };
  }

  // ==========================================================================
  // Duplicate Detection
  // ==========================================================================

  /**
   * Check for duplicate projects
   * Uses exact match and fuzzy string matching
   */
  async checkForDuplicates(
    brandId: string,
    name: string,
    startDate: Date | null,
    endDate: Date | null,
    excludeProjectId?: string
  ): Promise<DuplicateCheckResult> {
    const warnings: string[] = [];

    // 1. Check for exact name match
    const exactMatch = await this.prisma.project.findFirst({
      where: {
        brandId,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        id: excludeProjectId ? { not: excludeProjectId } : undefined,
        deletedAt: null,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'ARCHIVED'], // Only check active projects
        },
      },
    });

    if (exactMatch) {
      return {
        isDuplicate: true,
        duplicates: [
          {
            id: exactMatch.id,
            name: exactMatch.name,
            similarity: 1.0,
            status: exactMatch.status,
            createdAt: exactMatch.createdAt,
          },
        ],
        warnings: ['Exact duplicate project name found'],
      };
    }

    // 2. Fuzzy match for similar names
    const similarProjects = await this.findSimilarProjects(
      brandId,
      name,
      excludeProjectId
    );

    const duplicates = similarProjects
      .filter((p) => p.similarity >= DUPLICATE_SIMILARITY_THRESHOLD)
      .map((p) => ({
        id: p.id,
        name: p.name,
        similarity: p.similarity,
        status: p.status,
        createdAt: p.createdAt,
      }));

    if (duplicates.length > 0) {
      const topMatch = duplicates[0];
      warnings.push(
        `Similar project found: "${topMatch.name}" (${Math.round(topMatch.similarity * 100)}% match)`
      );
    }

    // 3. Check for time-based duplicates (same name pattern in different years)
    if (startDate && !duplicates.length) {
      const yearPattern = this.extractYearPattern(name);
      if (yearPattern) {
        const samePattern = await this.findProjectsByNamePattern(
          brandId,
          yearPattern.baseName,
          excludeProjectId
        );

        if (samePattern.length > 0) {
          warnings.push(
            `Found ${samePattern.length} project(s) with similar naming pattern - ensure year is correct`
          );
        }
      }
    }

    return {
      isDuplicate: duplicates.length > 0,
      duplicates,
      warnings,
    };
  }

  /**
   * Find projects with similar names using fuzzy matching
   */
  private async findSimilarProjects(
    brandId: string,
    name: string,
    excludeProjectId?: string
  ): Promise<Array<{ id: string; name: string; similarity: number; status: ProjectStatus; createdAt: Date }>> {
    // Get all active projects for the brand
    const projects = await this.prisma.project.findMany({
      where: {
        brandId,
        id: excludeProjectId ? { not: excludeProjectId } : undefined,
        deletedAt: null,
        status: {
          notIn: ['COMPLETED', 'CANCELLED', 'ARCHIVED'],
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
    });

    // Calculate similarity for each project
    const withSimilarity = projects.map((project) => ({
      ...project,
      similarity: this.calculateStringSimilarity(
        name.toLowerCase(),
        project.name.toLowerCase()
      ),
    }));

    // Sort by similarity (highest first)
    return withSimilarity.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * Returns value between 0 (completely different) and 1 (identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {
      return 1.0;
    }

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Extract year pattern from project name
   * E.g., "Summer Campaign 2024" -> { baseName: "Summer Campaign", year: 2024 }
   */
  private extractYearPattern(name: string): { baseName: string; year: number } | null {
    const yearMatch = name.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      const baseName = name.replace(yearMatch[0], '').trim();
      return { baseName, year };
    }
    return null;
  }

  /**
   * Find projects matching a base name pattern
   */
  private async findProjectsByNamePattern(
    brandId: string,
    baseName: string,
    excludeProjectId?: string
  ): Promise<any[]> {
    return this.prisma.project.findMany({
      where: {
        brandId,
        id: excludeProjectId ? { not: excludeProjectId } : undefined,
        name: {
          contains: baseName,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
      },
      take: 5,
    });
  }
}
