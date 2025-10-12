/**
 * Project-specific error classes
 * Following the same pattern as the brands module
 */

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export class ProjectNotFoundError extends ProjectError {
  constructor(projectId?: string) {
    super(projectId ? `Project ${projectId} not found` : 'Project not found');
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectUnauthorizedError extends ProjectError {
  constructor(message: string = 'Unauthorized to access this project') {
    super(message);
    this.name = 'ProjectUnauthorizedError';
  }
}

export class ProjectCreationError extends ProjectError {
  constructor(message: string = 'Failed to create project') {
    super(message);
    this.name = 'ProjectCreationError';
  }
}

export class ProjectUpdateError extends ProjectError {
  constructor(message: string = 'Failed to update project') {
    super(message);
    this.name = 'ProjectUpdateError';
  }
}

export class ProjectDeleteError extends ProjectError {
  constructor(message: string = 'Failed to delete project') {
    super(message);
    this.name = 'ProjectDeleteError';
  }
}

export class InvalidStatusTransitionError extends ProjectError {
  constructor(from: string, to: string) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class ProjectHasActiveLicensesError extends ProjectError {
  constructor(licenseCount: number) {
    super(`Cannot delete project with ${licenseCount} active license(s)`);
    this.name = 'ProjectHasActiveLicensesError';
  }
}

export class OnlyBrandsCanCreateProjectsError extends ProjectError {
  constructor() {
    super('Only brand accounts can create projects');
    this.name = 'OnlyBrandsCanCreateProjectsError';
  }
}

export class InvalidDateRangeError extends ProjectError {
  constructor(message: string = 'End date must be after start date') {
    super(message);
    this.name = 'InvalidDateRangeError';
  }
}

export class TeamMemberNotFoundError extends ProjectError {
  constructor(userId?: string) {
    super(userId ? `Team member ${userId} not found` : 'Team member not found');
    this.name = 'TeamMemberNotFoundError';
  }
}

export class TeamMemberAlreadyExistsError extends ProjectError {
  constructor(userId: string) {
    super(`User ${userId} is already a team member`);
    this.name = 'TeamMemberAlreadyExistsError';
  }
}

export class CannotRemoveBrandAdminError extends ProjectError {
  constructor() {
    super('Cannot remove brand admin from project team');
    this.name = 'CannotRemoveBrandAdminError';
  }
}

export class MilestoneNotFoundError extends ProjectError {
  constructor(milestoneId?: string) {
    super(milestoneId ? `Milestone ${milestoneId} not found` : 'Milestone not found');
    this.name = 'MilestoneNotFoundError';
  }
}

export class ExpenseNotFoundError extends ProjectError {
  constructor(expenseId?: string) {
    super(expenseId ? `Expense ${expenseId} not found` : 'Expense not found');
    this.name = 'ExpenseNotFoundError';
  }
}

export class BudgetExceededError extends ProjectError {
  constructor(budgetCents: number, totalExpenses: number) {
    super(`Budget exceeded: ${totalExpenses} cents spent, budget is ${budgetCents} cents`);
    this.name = 'BudgetExceededError';
  }
}
