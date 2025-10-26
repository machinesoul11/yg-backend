/**
 * Licensing Configuration
 * Centralized configuration for licensing operations and IP management
 */

/**
 * Enable multi-party approval for ownership modifications
 * When true, ownership split changes require approval from all affected creators
 */
export const ENABLE_MULTI_PARTY_OWNERSHIP_APPROVAL = 
  process.env.ENABLE_MULTI_PARTY_OWNERSHIP_APPROVAL !== 'false'; // Default: true

/**
 * Minimum ownership percentage change threshold (in basis points)
 * Changes below this threshold can be applied without special approval workflow
 * 100 bps = 1%
 */
export const OWNERSHIP_CHANGE_THRESHOLD_BPS = parseInt(
  process.env.OWNERSHIP_CHANGE_THRESHOLD_BPS || '100' // Default: 1% (100 bps)
);

/**
 * Enable retroactive ownership adjustments
 * When true, allows ownership modifications to apply to historical periods
 * Requires special authorization and comprehensive audit trail
 */
export const ENABLE_RETROACTIVE_OWNERSHIP_ADJUSTMENTS = 
  process.env.ENABLE_RETROACTIVE_OWNERSHIP_ADJUSTMENTS === 'true'; // Default: false

/**
 * License renewal advance notice period in days
 * Number of days before expiration to send renewal notifications
 */
export const LICENSE_RENEWAL_NOTICE_DAYS = parseInt(
  process.env.LICENSE_RENEWAL_NOTICE_DAYS || '30' // Default: 30 days
);

/**
 * Enable automatic renewal for evergreen licenses
 * When true, licenses with evergreen provisions can auto-renew
 */
export const ENABLE_AUTO_RENEWAL = 
  process.env.ENABLE_AUTO_RENEWAL !== 'false'; // Default: true

/**
 * License renewal grace period in days
 * Time after expiration during which renewal can be processed
 */
export const LICENSE_RENEWAL_GRACE_PERIOD_DAYS = parseInt(
  process.env.LICENSE_RENEWAL_GRACE_PERIOD_DAYS || '90' // Default: 90 days
);

/**
 * Enable license edit version control
 * When true, all license edits create new versions with complete history
 */
export const ENABLE_LICENSE_VERSION_CONTROL = 
  process.env.ENABLE_LICENSE_VERSION_CONTROL !== 'false'; // Default: true

/**
 * Maximum license term duration in months
 * Upper limit for license agreement duration
 */
export const MAX_LICENSE_TERM_MONTHS = parseInt(
  process.env.MAX_LICENSE_TERM_MONTHS || '120' // Default: 10 years (120 months)
);

/**
 * Minimum royalty rate in basis points
 * Floor for royalty rates in license agreements
 * 100 bps = 1%
 */
export const MIN_ROYALTY_RATE_BPS = parseInt(
  process.env.MIN_ROYALTY_RATE_BPS || '500' // Default: 5% (500 bps)
);

/**
 * Enable license termination reconciliation workflow
 * When true, ensures all earned royalties are calculated before termination
 */
export const ENABLE_TERMINATION_RECONCILIATION = 
  process.env.ENABLE_TERMINATION_RECONCILIATION !== 'false'; // Default: true

/**
 * License termination grace period in days
 * Time for brand to complete post-termination obligations
 */
export const LICENSE_TERMINATION_GRACE_PERIOD_DAYS = parseInt(
  process.env.LICENSE_TERMINATION_GRACE_PERIOD_DAYS || '30' // Default: 30 days
);

/**
 * Enable comprehensive license audit logging
 * When true, all licensing operations are logged with full context
 */
export const ENABLE_LICENSE_AUDIT_LOGGING = 
  process.env.ENABLE_LICENSE_AUDIT_LOGGING !== 'false'; // Default: true

/**
 * High-value license threshold for additional scrutiny (in cents)
 * Licenses at or above this fee amount are flagged for admin review
 */
export const HIGH_VALUE_LICENSE_THRESHOLD_CENTS = parseInt(
  process.env.HIGH_VALUE_LICENSE_THRESHOLD_CENTS || '1000000' // Default: $10,000.00
);

/**
 * Enable creator consent requirement for all licenses
 * When true, licenses always require creator approval regardless of other factors
 */
export const REQUIRE_CREATOR_CONSENT = 
  process.env.REQUIRE_CREATOR_CONSENT !== 'false'; // Default: true

/**
 * Ownership split validation tolerance in basis points
 * Acceptable rounding error when validating ownership percentages sum to 100%
 */
export const OWNERSHIP_SPLIT_TOLERANCE_BPS = parseInt(
  process.env.OWNERSHIP_SPLIT_TOLERANCE_BPS || '1' // Default: 0.01% (1 bp)
);

/**
 * Check if an ownership change requires special approval
 * @param changePercentageBps - Ownership change amount in basis points
 * @returns true if approval is required
 */
export function ownershipChangeRequiresApproval(changePercentageBps: number): boolean {
  if (!ENABLE_MULTI_PARTY_OWNERSHIP_APPROVAL) {
    return false;
  }
  return Math.abs(changePercentageBps) >= OWNERSHIP_CHANGE_THRESHOLD_BPS;
}

/**
 * Validate ownership split totals to 100% within tolerance
 * @param ownershipBps - Array of ownership percentages in basis points
 * @returns true if valid
 */
export function validateOwnershipSplit(ownershipBps: number[]): boolean {
  const total = ownershipBps.reduce((sum, bps) => sum + bps, 0);
  const target = 10000; // 100% in basis points
  return Math.abs(total - target) <= OWNERSHIP_SPLIT_TOLERANCE_BPS;
}

/**
 * Check if a license term duration requires review
 * @param durationMonths - License term in months
 * @returns true if review is recommended
 */
export function licenseTermRequiresReview(durationMonths: number): boolean {
  return durationMonths > 12; // Licenses longer than 1 year
}

/**
 * Check if a license fee amount requires admin approval
 * @param feeCents - License fee in cents
 * @returns true if admin approval is required
 */
export function licenseRequiresAdminApproval(feeCents: number): boolean {
  return feeCents >= HIGH_VALUE_LICENSE_THRESHOLD_CENTS;
}

/**
 * Configuration object for export to other modules
 */
export const LICENSING_CONFIG = {
  enableMultiPartyOwnershipApproval: ENABLE_MULTI_PARTY_OWNERSHIP_APPROVAL,
  ownershipChangeThresholdBps: OWNERSHIP_CHANGE_THRESHOLD_BPS,
  enableRetroactiveOwnershipAdjustments: ENABLE_RETROACTIVE_OWNERSHIP_ADJUSTMENTS,
  licenseRenewalNoticeDays: LICENSE_RENEWAL_NOTICE_DAYS,
  enableAutoRenewal: ENABLE_AUTO_RENEWAL,
  licenseRenewalGracePeriodDays: LICENSE_RENEWAL_GRACE_PERIOD_DAYS,
  enableLicenseVersionControl: ENABLE_LICENSE_VERSION_CONTROL,
  maxLicenseTermMonths: MAX_LICENSE_TERM_MONTHS,
  minRoyaltyRateBps: MIN_ROYALTY_RATE_BPS,
  enableTerminationReconciliation: ENABLE_TERMINATION_RECONCILIATION,
  licenseTerminationGracePeriodDays: LICENSE_TERMINATION_GRACE_PERIOD_DAYS,
  enableLicenseAuditLogging: ENABLE_LICENSE_AUDIT_LOGGING,
  highValueLicenseThresholdCents: HIGH_VALUE_LICENSE_THRESHOLD_CENTS,
  requireCreatorConsent: REQUIRE_CREATOR_CONSENT,
  ownershipSplitToleranceBps: OWNERSHIP_SPLIT_TOLERANCE_BPS,
} as const;
