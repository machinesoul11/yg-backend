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

// Renewal Services
export {
  renewalEligibilityService,
  RenewalEligibilityService,
} from './services/renewal-eligibility.service';
export type {
  RenewalEligibilityContext,
  SingleLicenseEligibilityCheck,
  BatchEligibilityResult,
} from './services/renewal-eligibility.service';

export {
  renewalPricingService,
  RenewalPricingService,
} from './services/renewal-pricing.service';
export type {
  PricingStrategy,
  RenewalPricingInput,
  RenewalPricingBreakdown,
  PricingAdjustment,
  PricingConfiguration,
} from './services/renewal-pricing.service';

export {
  renewalNotificationService,
  RenewalNotificationService,
} from './services/renewal-notifications.service';
export type {
  NotificationStage,
  RenewalNotificationLog,
  NotificationResult,
} from './services/renewal-notifications.service';

export {
  renewalAnalyticsService,
  RenewalAnalyticsService,
} from './services/renewal-analytics.service';
export type {
  RenewalMetrics,
  RenewalPipelineSnapshot,
  BrandRenewalPerformance,
} from './services/renewal-analytics.service';

export {
  licensePerformanceMetricsService,
  LicensePerformanceMetricsService,
} from './services/license-performance-metrics.service';
export type {
  LicenseROIMetrics,
  LicenseUtilizationMetrics,
  ApprovalTimeMetrics,
  ConflictRateMetrics,
  AggregatedPerformanceMetrics,
} from './services/license-performance-metrics.service';

export {
  enhancedLicenseRenewalService,
  EnhancedLicenseRenewalService,
} from './services/enhancedLicenseRenewalService';
export type {
  RenewalEligibility,
  RenewalTerms,
  RenewalOffer,
} from './services/enhancedLicenseRenewalService';

// Expiry Management Services
export {
  licenseExpiryMonitorService,
  LicenseExpiryMonitorService,
} from './services/license-expiry-monitor.service';
export type {
  ExpiryNotificationStage,
  LicenseWithDetails,
  ExpiryMonitoringResult,
  ExpiryProcessingResult,
} from './services/license-expiry-monitor.service';

