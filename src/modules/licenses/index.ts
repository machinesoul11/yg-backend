// Licenses Module
export * from './types';
export * from './router';
export * from './service';

// Validators
export { scopeValidator, ScopeValidator } from './validators/scopeValidator';
export type {
  ScopeValidationResult,
  ExclusivityCheckResult,
} from './validators/scopeValidator';

export {
  revenueShareValidator,
  RevenueShareValidator,
} from './validators/revenueShareValidator';
export type {
  RevenueShareValidationResult,
  OwnershipShareDistribution,
} from './validators/revenueShareValidator';

// Services
export {
  feeCalculationService,
  FeeCalculationService,
} from './services/feeCalculationService';
export type {
  FeeCalculationInput,
  FeeCalculationBreakdown,
} from './services/feeCalculationService';

export {
  licenseGenerationService,
  LicenseGenerationService,
} from './services/licenseGenerationService';
export type { LicenseGenerationResult } from './services/licenseGenerationService';

export {
  licenseTermsGenerationService,
  LicenseTermsGenerationService,
} from './services/licenseTermsGenerationService';
export type { GeneratedLicenseTerms } from './services/licenseTermsGenerationService';

export {
  licenseApprovalWorkflowService,
  LicenseApprovalWorkflowService,
} from './services/approvalWorkflowService';
export type {
  ApprovalAction,
  ApprovalContext,
  ApprovalResult,
} from './services/approvalWorkflowService';

export {
  licenseSigningService,
  LicenseSigningService,
} from './services/signingService';
export type {
  SignatureData,
  SigningResult,
  SignatureVerification,
} from './services/signingService';

export {
  licenseValidationService,
  LicenseValidationService,
  type LicenseValidationInput,
  type ValidationCheck,
  type LicenseValidationResult,
  type ApprovalRequirement,
} from './services/licenseValidationService';

