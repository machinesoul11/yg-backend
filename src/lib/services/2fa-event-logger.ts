/**
 * 2FA Event Logger Helper
 * 
 * Helper functions to log 2FA security events from authentication flows.
 * Import and use these functions in authentication endpoints.
 */

import { prisma } from '@/lib/db';
import { TwoFactorSecurityEventsService } from './2fa-security-events.service';

const eventsService = new TwoFactorSecurityEventsService(prisma);

/**
 * Log successful 2FA authentication
 */
export async function log2FASuccess(params: {
  userId: string;
  method: 'totp' | 'sms' | 'backup_code';
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'successful_auth',
    eventCategory: 'authentication',
    success: true,
    method: params.method,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    deviceFingerprint: params.deviceFingerprint,
    locationCountry: params.location?.country,
    locationRegion: params.location?.region,
    locationCity: params.location?.city,
  });
}

/**
 * Log failed 2FA authentication
 */
export async function log2FAFailure(params: {
  userId: string;
  method: 'totp' | 'sms' | 'backup_code';
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'failed_attempt',
    eventCategory: 'authentication',
    success: false,
    failureReason: params.reason,
    method: params.method,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    deviceFingerprint: params.deviceFingerprint,
    locationCountry: params.location?.country,
    locationRegion: params.location?.region,
    locationCity: params.location?.city,
  });
}

/**
 * Log 2FA setup
 */
export async function log2FASetup(params: {
  userId: string;
  method: 'totp' | 'sms';
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'setup',
    eventCategory: 'configuration',
    success: true,
    method: params.method,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

/**
 * Log 2FA disable
 */
export async function log2FADisable(params: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'disable',
    eventCategory: 'configuration',
    success: true,
    failureReason: params.reason,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

/**
 * Log account lockout due to 2FA failures
 */
export async function log2FALockout(params: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'lockout',
    eventCategory: 'security',
    success: true,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: params.metadata,
  });
}

/**
 * Log backup code usage
 */
export async function log2FABackupCodeUsage(params: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  remainingCodes: number;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'backup_code_usage',
    eventCategory: 'authentication',
    success: true,
    method: 'backup_code',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      remainingCodes: params.remainingCodes,
    },
  });
}

/**
 * Log backup code regeneration
 */
export async function log2FABackupCodeRegeneration(params: {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  codesGenerated: number;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'backup_code_regeneration',
    eventCategory: 'configuration',
    success: true,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: {
      codesGenerated: params.codesGenerated,
    },
  });
}

/**
 * Log admin reset of 2FA
 */
export async function log2FAAdminReset(params: {
  userId: string;
  adminId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'admin_reset',
    eventCategory: 'security',
    success: true,
    adminId: params.adminId,
    adminAction: 'reset_2fa',
    adminReason: params.reason,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}

/**
 * Log emergency code generation
 */
export async function log2FAEmergencyCode(params: {
  userId: string;
  adminId: string;
  reason: string;
  ipAddress?: string;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'emergency_code_generated',
    eventCategory: 'security',
    success: true,
    adminId: params.adminId,
    adminAction: 'generate_emergency_code',
    adminReason: params.reason,
    ipAddress: params.ipAddress,
  });
}

/**
 * Log suspicious activity
 */
export async function log2FASuspiciousActivity(params: {
  userId: string;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}): Promise<void> {
  await eventsService.logEvent({
    userId: params.userId,
    eventType: 'suspicious_activity',
    eventCategory: 'security',
    success: true,
    failureReason: params.reason,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: params.metadata,
  });
}
