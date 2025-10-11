/**
 * Password History Service
 * Manages password history tracking to prevent password reuse
 */

import { PrismaClient } from '@prisma/client';
import { verifyPassword } from './password';

const PASSWORD_HISTORY_LIMIT = 10; // Store last 10 passwords
const PASSWORD_HISTORY_MAX_AGE_DAYS = 365; // Keep history for 1 year max

export class PasswordHistoryService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Check if a password has been used recently
   * Returns true if password matches any in history
   */
  async isPasswordReused(userId: string, newPassword: string): Promise<boolean> {
    // Get recent password history
    const history = await this.prisma.passwordHistory.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - PASSWORD_HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
    });

    // Check new password against each historical hash
    for (const entry of history) {
      const matches = await verifyPassword(newPassword, entry.passwordHash);
      if (matches) {
        return true;
      }
    }

    return false;
  }

  /**
   * Add a password to history when user changes their password
   * This should be called BEFORE updating the user's current password
   */
  async addToHistory(userId: string, currentPasswordHash: string): Promise<void> {
    // Add current password to history
    await this.prisma.passwordHistory.create({
      data: {
        userId,
        passwordHash: currentPasswordHash,
      },
    });

    // Clean up old history entries (keep only the most recent ones)
    await this.cleanupOldHistory(userId);
  }

  /**
   * Clean up old password history entries
   * Keeps only the most recent PASSWORD_HISTORY_LIMIT entries
   * and removes entries older than PASSWORD_HISTORY_MAX_AGE_DAYS
   */
  private async cleanupOldHistory(userId: string): Promise<void> {
    const cutoffDate = new Date(Date.now() - PASSWORD_HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    // Get all history entries for user
    const allHistory = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Determine which entries to delete
    const toDelete = allHistory.filter((entry, index) => {
      // Delete if beyond the limit
      if (index >= PASSWORD_HISTORY_LIMIT) {
        return true;
      }
      // Delete if older than max age
      if (entry.createdAt < cutoffDate) {
        return true;
      }
      return false;
    });

    // Delete old entries
    if (toDelete.length > 0) {
      await this.prisma.passwordHistory.deleteMany({
        where: {
          id: {
            in: toDelete.map((entry) => entry.id),
          },
        },
      });
    }
  }

  /**
   * Get count of password history entries for a user
   */
  async getHistoryCount(userId: string): Promise<number> {
    return this.prisma.passwordHistory.count({
      where: { userId },
    });
  }

  /**
   * Clear all password history for a user (e.g., on account deletion)
   */
  async clearHistory(userId: string): Promise<void> {
    await this.prisma.passwordHistory.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get the configured history limit
   */
  getHistoryLimit(): number {
    return PASSWORD_HISTORY_LIMIT;
  }
}
