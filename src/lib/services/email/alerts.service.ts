/**
 * Email Alerts Management Service
 * 
 * Manages deliverability and email health alerts for administrators.
 * Handles alert generation, acknowledgment, and historical tracking.
 * 
 * Alert Types:
 * - Delivery rate issues
 * - High bounce rates
 * - Spam complaint spikes
 * - Email failure spikes
 * - Reputation degradation
 * 
 * Features:
 * - Alert suppression to prevent notification fatigue
 * - Severity-based routing (info, warning, critical, urgent)
 * - Alert acknowledgment tracking
 * - Historical alert analytics
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

export interface EmailAlert {
  id: string;
  type: 'delivery_rate' | 'bounce_rate' | 'complaint_rate' | 'failure_spike' | 'reputation';
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  metric: string;
  currentValue: number;
  threshold: number;
  period: string;
  message: string;
  recommendation: string;
  affectedEmails?: number;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  metadata?: Record<string, any>;
}

export interface AlertStatistics {
  totalAlerts: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  averageAcknowledgmentTime?: number;
  mostCommonType: string;
  alertTrend: Array<{
    date: string;
    count: number;
  }>;
}

export class EmailAlertsService {
  private readonly ALERT_CACHE_KEY_PREFIX = 'email:alert:';
  private readonly ALERT_HISTORY_KEY = 'email:alerts:history';
  private readonly SUPPRESSION_HOURS = 4;

  /**
   * Create a new email alert
   */
  async createAlert(alert: Omit<EmailAlert, 'id' | 'acknowledged' | 'acknowledgedAt' | 'acknowledgedBy'>): Promise<EmailAlert> {
    const alertId = `${alert.type}-${alert.period}-${Date.now()}`;

    const fullAlert: EmailAlert = {
      ...alert,
      id: alertId,
      acknowledged: false,
    };

    // Store in Redis with expiration
    const cacheKey = `${this.ALERT_CACHE_KEY_PREFIX}${alertId}`;
    await redis.set(
      cacheKey,
      JSON.stringify(fullAlert),
      'EX',
      7 * 24 * 3600 // Keep for 7 days
    );

    // Add to alert history list
    await redis.lpush(
      this.ALERT_HISTORY_KEY,
      JSON.stringify(fullAlert)
    );

    // Trim history to last 1000 alerts
    await redis.ltrim(this.ALERT_HISTORY_KEY, 0, 999);

    // Send notifications to admins
    await this.sendAlertNotifications(fullAlert);

    console.log(`[EmailAlerts] Created ${alert.severity} alert: ${alert.message}`);

    return fullAlert;
  }

  /**
   * Check if an alert type is currently suppressed
   */
  async isAlertSuppressed(alertType: string, period: string): Promise<boolean> {
    const suppressionKey = `alert:suppressed:${alertType}:${period}`;
    const suppressed = await redis.get(suppressionKey);
    return !!suppressed;
  }

  /**
   * Suppress alerts of a specific type for a period
   */
  async suppressAlert(alertType: string, period: string): Promise<void> {
    const suppressionKey = `alert:suppressed:${alertType}:${period}`;
    await redis.set(
      suppressionKey,
      '1',
      'EX',
      this.SUPPRESSION_HOURS * 3600
    );
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<EmailAlert | null> {
    const cacheKey = `${this.ALERT_CACHE_KEY_PREFIX}${alertId}`;
    const alertJson = await redis.get(cacheKey);

    if (!alertJson) {
      console.warn(`[EmailAlerts] Alert ${alertId} not found`);
      return null;
    }

    const alert: EmailAlert = JSON.parse(alertJson);
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    // Update in cache
    await redis.set(
      cacheKey,
      JSON.stringify(alert),
      'EX',
      7 * 24 * 3600
    );

    console.log(`[EmailAlerts] Alert ${alertId} acknowledged by ${acknowledgedBy}`);

    return alert;
  }

  /**
   * Get all active (unacknowledged) alerts
   */
  async getActiveAlerts(): Promise<EmailAlert[]> {
    const keys = await redis.keys(`${this.ALERT_CACHE_KEY_PREFIX}*`);
    
    if (keys.length === 0) {
      return [];
    }

    const alerts: EmailAlert[] = [];

    for (const key of keys) {
      const alertJson = await redis.get(key);
      if (alertJson) {
        const alert: EmailAlert = JSON.parse(alertJson);
        if (!alert.acknowledged) {
          alerts.push(alert);
        }
      }
    }

    // Sort by triggered date (newest first)
    alerts.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());

    return alerts;
  }

  /**
   * Get alert history
   */
  async getAlertHistory(limit = 100): Promise<EmailAlert[]> {
    const alertsJson = await redis.lrange(this.ALERT_HISTORY_KEY, 0, limit - 1);
    
    return alertsJson.map(json => JSON.parse(json) as EmailAlert);
  }

  /**
   * Get alert statistics
   */
  async getAlertStatistics(days = 30): Promise<AlertStatistics> {
    const history = await this.getAlertHistory(1000);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentAlerts = history.filter(
      alert => new Date(alert.triggeredAt) >= cutoffDate
    );

    // Count by type
    const byType: Record<string, number> = {};
    recentAlerts.forEach(alert => {
      byType[alert.type] = (byType[alert.type] || 0) + 1;
    });

    // Count by severity
    const bySeverity: Record<string, number> = {};
    recentAlerts.forEach(alert => {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
    });

    // Find most common type
    const mostCommonType = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

    // Calculate average acknowledgment time
    const acknowledgedAlerts = recentAlerts.filter(a => a.acknowledged && a.acknowledgedAt);
    const avgAcknowledgmentTime = acknowledgedAlerts.length > 0
      ? acknowledgedAlerts.reduce((sum, alert) => {
          const ackTime = new Date(alert.acknowledgedAt!).getTime();
          const triggerTime = new Date(alert.triggeredAt).getTime();
          return sum + (ackTime - triggerTime);
        }, 0) / acknowledgedAlerts.length / (1000 * 60) // Convert to minutes
      : undefined;

    // Calculate daily trend
    const alertsByDate = new Map<string, number>();
    recentAlerts.forEach(alert => {
      const date = new Date(alert.triggeredAt).toISOString().split('T')[0];
      alertsByDate.set(date, (alertsByDate.get(date) || 0) + 1);
    });

    const alertTrend = Array.from(alertsByDate.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalAlerts: recentAlerts.length,
      byType,
      bySeverity,
      averageAcknowledgmentTime: avgAcknowledgmentTime ? Math.round(avgAcknowledgmentTime) : undefined,
      mostCommonType,
      alertTrend,
    };
  }

  /**
   * Send alert notifications to administrators
   */
  private async sendAlertNotifications(alert: EmailAlert): Promise<void> {
    // Get admin users
    const admins = await prisma.user.findMany({
      where: {
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (admins.length === 0) {
      console.warn('[EmailAlerts] No admin users found to send alerts');
      return;
    }

    // Map severity to notification priority
    const priorityMap: Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'> = {
      info: 'LOW',
      warning: 'HIGH',
      critical: 'URGENT',
      urgent: 'URGENT',
    };

    const priority = priorityMap[alert.severity] || 'MEDIUM';

    // Create notifications for each admin
    for (const admin of admins) {
      try {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'SYSTEM',
            priority,
            title: `Email Alert: ${alert.type.replace(/_/g, ' ').toUpperCase()}`,
            message: this.formatAlertMessage(alert),
            metadata: {
              alertId: alert.id,
              alertType: alert.type,
              severity: alert.severity,
              metric: alert.metric,
              currentValue: alert.currentValue,
              threshold: alert.threshold,
            },
          },
        });
      } catch (error) {
        console.error(`[EmailAlerts] Failed to create notification for admin ${admin.id}:`, error);
      }
    }

    console.log(`[EmailAlerts] Sent ${alert.severity} alert to ${admins.length} admin(s)`);
  }

  /**
   * Format alert message for notifications
   */
  private formatAlertMessage(alert: EmailAlert): string {
    const emoji = alert.severity === 'urgent' ? '🚨' : alert.severity === 'critical' ? '❌' : '⚠️';
    
    const lines: string[] = [
      `${emoji} **${alert.message}**`,
      '',
      `**Period:** ${alert.period}`,
      `**Metric:** ${alert.metric}`,
      `**Current Value:** ${this.formatValue(alert.currentValue, alert.metric)}`,
      `**Threshold:** ${this.formatValue(alert.threshold, alert.metric)}`,
    ];

    if (alert.affectedEmails) {
      lines.push(`**Affected Emails:** ${alert.affectedEmails}`);
    }

    lines.push('');
    lines.push(`**Recommended Action:**`);
    lines.push(alert.recommendation);

    return lines.join('\n');
  }

  /**
   * Format metric value for display
   */
  private formatValue(value: number, metric: string): string {
    if (metric.includes('rate')) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toString();
  }

  /**
   * Clear old alerts from history
   */
  async clearOldAlerts(daysToKeep = 30): Promise<number> {
    const history = await this.getAlertHistory(10000);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const toKeep = history.filter(
      alert => new Date(alert.triggeredAt) >= cutoffDate
    );

    // Clear and rebuild the history list
    await redis.del(this.ALERT_HISTORY_KEY);
    
    for (const alert of toKeep.reverse()) {
      await redis.lpush(this.ALERT_HISTORY_KEY, JSON.stringify(alert));
    }

    const removed = history.length - toKeep.length;
    console.log(`[EmailAlerts] Cleared ${removed} old alerts`);

    return removed;
  }
}

export const emailAlertsService = new EmailAlertsService();
