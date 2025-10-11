/**
 * Account Lockout Service
 * Manages account lockout after failed login attempts with progressive lockout periods
 */

import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/email/email.service';

const FAILED_ATTEMPTS_THRESHOLD = 5; // Lock after 5 failed attempts
const LOCKOUT_WINDOW_MINUTES = 15; // Reset counter after 15 minutes of no attempts
const INITIAL_LOCKOUT_MINUTES = 30; // First lockout: 30 minutes
const SECOND_LOCKOUT_MINUTES = 60; // Second lockout: 1 hour
const THIRD_LOCKOUT_MINUTES = 1440; // Third lockout: 24 hours

export interface LockoutStatus {
  isLocked: boolean;
  lockedUntil?: Date;
  failedAttempts: number;
  canRetryAt?: Date;
}

export class AccountLockoutService {
  constructor(
    private prisma: PrismaClient,
    private emailService?: EmailService
  ) {}

  /**
   * Check if an account is currently locked
   */
  async isAccountLocked(userId: string): Promise<LockoutStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        locked_until: true,
        failed_login_count: true,
        last_failed_login: true,
      },
    });

    if (!user) {
      return { isLocked: false, failedAttempts: 0 };
    }

    const now = new Date();

    // Check if currently locked
    if (user.locked_until && user.locked_until > now) {
      return {
        isLocked: true,
        lockedUntil: user.locked_until,
        failedAttempts: user.failed_login_count,
        canRetryAt: user.locked_until,
      };
    }

    return {
      isLocked: false,
      failedAttempts: user.failed_login_count,
    };
  }

  /**
   * Record a failed login attempt and potentially lock the account
   */
  async recordFailedAttempt(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<LockoutStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        failed_login_count: true,
        last_failed_login: true,
        locked_until: true,
      },
    });

    if (!user) {
      return { isLocked: false, failedAttempts: 0 };
    }

    const now = new Date();
    const windowCutoff = new Date(now.getTime() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);

    // Determine if we should reset the counter (outside the window)
    let newFailedCount = user.failed_login_count + 1;
    if (user.last_failed_login && user.last_failed_login < windowCutoff) {
      newFailedCount = 1; // Reset counter
    }

    // Update failed attempt count
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failed_login_count: newFailedCount,
        last_failed_login: now,
      },
    });

    // Check if we should lock the account
    if (newFailedCount >= FAILED_ATTEMPTS_THRESHOLD) {
      const lockoutDuration = this.calculateLockoutDuration(newFailedCount);
      const lockedUntil = new Date(now.getTime() + lockoutDuration * 60 * 1000);

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          locked_until: lockedUntil,
          isActive: false, // Temporarily deactivate
        },
      });

      // Send lockout notification email
      if (this.emailService) {
        try {
          await this.emailService.sendTransactional({
            email: user.email,
            subject: 'Account Security Alert',
            template: 'account-locked',
            variables: {
              userName: user.name || 'User',
              lockedUntil: lockedUntil.toISOString(),
              lockoutMinutes: lockoutDuration,
              ipAddress: ipAddress || 'Unknown',
            },
          });
        } catch (error) {
          console.error('Failed to send account lockout email:', error);
        }
      }

      return {
        isLocked: true,
        lockedUntil,
        failedAttempts: newFailedCount,
        canRetryAt: lockedUntil,
      };
    }

    return {
      isLocked: false,
      failedAttempts: newFailedCount,
    };
  }

  /**
   * Reset failed login counter on successful login
   */
  async resetFailedAttempts(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failed_login_count: 0,
        last_failed_login: null,
        locked_until: null,
        isActive: true,
      },
    });
  }

  /**
   * Manually unlock an account (admin action)
   */
  async unlockAccount(
    userId: string,
    adminId: string
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        locked_until: null,
        failed_login_count: 0,
        last_failed_login: null,
        isActive: true,
      },
    });

    // Log the unlock action in audit trail
    await this.prisma.auditEvent.create({
      data: {
        userId: adminId,
        entityType: 'user',
        entityId: userId,
        action: 'ACCOUNT_UNLOCKED',
        afterJson: { unlockedBy: adminId },
      },
    });
  }

  /**
   * Calculate lockout duration based on number of failed attempts
   * Progressive lockout: increases with repeated violations
   */
  private calculateLockoutDuration(failedAttempts: number): number {
    if (failedAttempts >= 15) {
      // 15+ attempts in window = 24 hours
      return THIRD_LOCKOUT_MINUTES;
    } else if (failedAttempts >= 10) {
      // 10+ attempts in window = 1 hour
      return SECOND_LOCKOUT_MINUTES;
    } else {
      // 5-9 attempts in window = 30 minutes
      return INITIAL_LOCKOUT_MINUTES;
    }
  }

  /**
   * Check and unlock accounts whose lockout period has expired
   * Should be run periodically as a background job
   */
  async unlockExpiredAccounts(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.user.updateMany({
      where: {
        locked_until: { lt: now },
        isActive: false,
      },
      data: {
        locked_until: null,
        failed_login_count: 0,
        isActive: true,
      },
    });

    return result.count;
  }

  /**
   * Get lockout statistics for monitoring
   */
  async getLockoutStats(): Promise<{
    currentlyLocked: number;
    lockedToday: number;
    averageLockoutDuration: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [currentlyLocked, lockedToday] = await Promise.all([
      this.prisma.user.count({
        where: {
          locked_until: { gt: now },
        },
      }),
      this.prisma.user.count({
        where: {
          locked_until: { gte: todayStart },
        },
      }),
    ]);

    return {
      currentlyLocked,
      lockedToday,
      averageLockoutDuration: INITIAL_LOCKOUT_MINUTES,
    };
  }
}
