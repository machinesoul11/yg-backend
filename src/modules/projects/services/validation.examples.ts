/**
 * Project Validation Service - Example Usage
 * 
 * This file demonstrates how to use the ProjectValidationService
 * for comprehensive project validation.
 */

import { PrismaClient } from '@prisma/client';
import { ProjectValidationService } from '../services/validation.service';

const prisma = new PrismaClient();
const validationService = new ProjectValidationService(prisma);

/**
 * Example 1: Validate Budget for New Project
 */
async function exampleBudgetValidation() {
  console.log('=== Example: Budget Validation ===\n');

  const result = await validationService.validateBudget(
    250000, // $2,500
    'CAMPAIGN',
    'brand_123'
  );

  console.log('Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
  
  // Expected output:
  // Valid: true
  // Errors: []
  // Warnings: ['Budget is below recommended minimum of $1,000 for CAMPAIGN projects']
}

/**
 * Example 2: Validate Date Range
 */
async function exampleDateValidation() {
  console.log('\n=== Example: Date Range Validation ===\n');

  const startDate = new Date('2024-06-01');
  const endDate = new Date('2024-08-31');

  const result = await validationService.validateDateRange(
    startDate,
    endDate,
    'CAMPAIGN',
    'brand_123'
  );

  console.log('Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
  
  // Expected output:
  // Valid: true
  // Errors: []
  // Warnings: []
}

/**
 * Example 3: Validate Status Transition
 */
async function exampleStatusTransition() {
  console.log('\n=== Example: Status Transition Validation ===\n');

  const result = await validationService.validateStatusTransition(
    'project_123',
    'DRAFT',
    'ACTIVE',
    'BRAND'
  );

  console.log('Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log('Required Actions:', result.requiredActions);
  
  // Expected output:
  // Valid: false (if project doesn't meet activation requirements)
  // Errors: ['Project must have a budget before activation']
  // Required Actions: ['Set project start and end dates', 'Add detailed project description']
}

/**
 * Example 4: Check for Duplicates
 */
async function exampleDuplicateDetection() {
  console.log('\n=== Example: Duplicate Detection ===\n');

  const result = await validationService.checkForDuplicates(
    'brand_123',
    'Summer Campaign 2024',
    new Date('2024-06-01'),
    new Date('2024-08-31')
  );

  console.log('Is Duplicate:', result.isDuplicate);
  console.log('Duplicates Found:', result.duplicates.length);
  console.log('Warnings:', result.warnings);
  
  result.duplicates.forEach(dup => {
    console.log(`  - ${dup.name} (${Math.round(dup.similarity * 100)}% match)`);
  });
  
  // Expected output:
  // Is Duplicate: true
  // Duplicates Found: 1
  // Warnings: ['Exact duplicate project name found']
  //   - Summer Campaign 2024 (100% match)
}

/**
 * Example 5: Check Permission
 */
async function examplePermissionCheck() {
  console.log('\n=== Example: Permission Validation ===\n');

  const result = await validationService.canCreateProject('user_123', 'BRAND');

  console.log('Allowed:', result.allowed);
  if (!result.allowed) {
    console.log('Reason:', result.reason);
  }
  
  // Expected output:
  // Allowed: true (if brand is verified)
  // or
  // Allowed: false
  // Reason: 'Brand must be verified before creating projects'
}

/**
 * Example 6: Validate Budget Adjustment
 */
async function exampleBudgetAdjustment() {
  console.log('\n=== Example: Budget Adjustment Validation ===\n');

  const result = await validationService.validateBudgetAdjustment(
    'project_123',
    500000,  // Current: $5,000
    800000,  // New: $8,000 (60% increase)
    'BRAND'
  );

  console.log('Valid:', result.valid);
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);
  
  // Expected output:
  // Valid: true
  // Errors: []
  // Warnings: ['Budget increase exceeds 50% - admin approval recommended']
}

/**
 * Example 7: Comprehensive Validation Pipeline
 */
async function exampleComprehensiveValidation() {
  console.log('\n=== Example: Comprehensive Validation Pipeline ===\n');

  const projectData = {
    name: 'Fall Marketing Campaign',
    budgetCents: 1500000, // $15,000
    projectType: 'CAMPAIGN' as const,
    startDate: new Date('2024-09-01'),
    endDate: new Date('2024-11-30'),
    brandId: 'brand_123',
    userId: 'user_123',
    userRole: 'BRAND',
  };

  // Step 1: Permission check
  const permissionCheck = await validationService.canCreateProject(
    projectData.userId,
    projectData.userRole
  );

  if (!permissionCheck.allowed) {
    console.error('❌ Permission denied:', permissionCheck.reason);
    return;
  }
  console.log('✅ Permission check passed');

  // Step 2: Budget validation
  const budgetCheck = await validationService.validateBudget(
    projectData.budgetCents,
    projectData.projectType,
    projectData.brandId
  );

  if (!budgetCheck.valid) {
    console.error('❌ Budget validation failed:', budgetCheck.errors);
    return;
  }
  if (budgetCheck.warnings.length > 0) {
    console.warn('⚠️  Budget warnings:', budgetCheck.warnings);
  }
  console.log('✅ Budget validation passed');

  // Step 3: Date validation
  const dateCheck = await validationService.validateDateRange(
    projectData.startDate,
    projectData.endDate,
    projectData.projectType,
    projectData.brandId
  );

  if (!dateCheck.valid) {
    console.error('❌ Date validation failed:', dateCheck.errors);
    return;
  }
  if (dateCheck.warnings.length > 0) {
    console.warn('⚠️  Date warnings:', dateCheck.warnings);
  }
  console.log('✅ Date validation passed');

  // Step 4: Duplicate check
  const dupeCheck = await validationService.checkForDuplicates(
    projectData.brandId,
    projectData.name,
    projectData.startDate,
    projectData.endDate
  );

  if (dupeCheck.isDuplicate) {
    console.warn('⚠️  Potential duplicates found:');
    dupeCheck.duplicates.forEach(dup => {
      console.warn(`   - ${dup.name} (${Math.round(dup.similarity * 100)}% match)`);
    });
  } else {
    console.log('✅ No duplicates detected');
  }

  console.log('\n✅ All validations passed - ready to create project');
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await exampleBudgetValidation();
    await exampleDateValidation();
    await exampleStatusTransition();
    await exampleDuplicateDetection();
    await examplePermissionCheck();
    await exampleBudgetAdjustment();
    await exampleComprehensiveValidation();
  } catch (error) {
    console.error('Error running examples:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Export examples for testing
export {
  exampleBudgetValidation,
  exampleDateValidation,
  exampleStatusTransition,
  exampleDuplicateDetection,
  examplePermissionCheck,
  exampleBudgetAdjustment,
  exampleComprehensiveValidation,
};

// Run if executed directly
if (require.main === module) {
  runExamples();
}
