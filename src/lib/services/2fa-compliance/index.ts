/**
 * 2FA Compliance & Reporting Services
 * Central export for all compliance and reporting related services
 */

export { TwoFactorComplianceService } from '../2fa-compliance.service';
export { TwoFactorSecurityEventsService } from '../2fa-security-events.service';
export { TwoFactorSecurityAlertsService } from '../2fa-security-alerts.service';
export { TwoFactorReportingService } from '../2fa-reporting.service';

export {
  log2FASuccess,
  log2FAFailure,
  log2FASetup,
  log2FADisable,
  log2FALockout,
  log2FABackupCodeUsage,
  log2FABackupCodeRegeneration,
  log2FAAdminReset,
  log2FAEmergencyCode,
  log2FASuspiciousActivity,
} from '../2fa-event-logger';

// Types
export type {
  AdoptionMetrics,
  AuthenticationMetrics,
  SecurityMetrics,
  ComplianceSnapshot,
} from '../2fa-compliance.service';

export type {
  SecurityEventInput,
  AnomalyDetectionResult,
} from '../2fa-security-events.service';

export type {
  AlertThresholds,
} from '../2fa-security-alerts.service';

export type {
  MonthlySecurityReportData,
} from '../2fa-reporting.service';
