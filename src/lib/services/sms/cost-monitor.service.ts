/**
 * SMS Cost Monitoring and Alerting Service
 * Tracks SMS costs and sends alerts when thresholds are exceeded
 */

import { prisma } from '@/lib/db';
import { emailService } from '@/lib/services/email/email.service';

// Cost thresholds for alerting
const COST_THRESHOLDS = {
  daily: {
    warning: 50, // $50/day
    critical: 100, // $100/day
  },
  weekly: {
    warning: 300, // $300/week
    critical: 500, // $500/week
  },
  monthly: {
    warning: 1000, // $1000/month
    critical: 2000, // $2000/month
  },
  perUser: {
    daily: 5, // $5/user/day
    monthly: 20, // $20/user/month
  },
};

export interface CostAlert {
  period: 'daily' | 'weekly' | 'monthly' | 'perUser';
  severity: 'warning' | 'critical';
  currentCost: number;
  threshold: number;
  details: string;
}

export interface CostReport {
  period: string;
  totalCost: number;
  totalSent: number;
  uniqueUsers: number;
  averageCostPerSms: number;
  topUsers: Array<{
    userId: string;
    userName: string | null;
    userEmail: string;
    cost: number;
    count: number;
  }>;
  deliveryStats: Record<string, number>;
  costByDay: Array<{
    date: string;
    cost: number;
    count: number;
  }>;
}

export class SmsCostMonitorService {
  /**
   * Check daily cost thresholds
   */
  async checkDailyCosts(): Promise<CostAlert[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const codes = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        cost: true,
        userId: true,
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const alerts: CostAlert[] = [];

    // Check aggregate daily costs
    if (totalCost >= COST_THRESHOLDS.daily.critical) {
      alerts.push({
        period: 'daily',
        severity: 'critical',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.daily.critical,
        details: `Daily SMS costs have exceeded critical threshold: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.daily.critical})`,
      });
    } else if (totalCost >= COST_THRESHOLDS.daily.warning) {
      alerts.push({
        period: 'daily',
        severity: 'warning',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.daily.warning,
        details: `Daily SMS costs are approaching limit: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.daily.warning})`,
      });
    }

    // Check per-user daily costs
    const userCosts = new Map<string, number>();
    codes.forEach((code) => {
      const current = userCosts.get(code.userId) || 0;
      userCosts.set(code.userId, current + (code.cost || 0));
    });

    for (const [userId, cost] of userCosts.entries()) {
      if (cost >= COST_THRESHOLDS.perUser.daily) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        alerts.push({
          period: 'perUser',
          severity: 'warning',
          currentCost: cost,
          threshold: COST_THRESHOLDS.perUser.daily,
          details: `User ${user?.email || userId} has exceeded daily SMS cost limit: $${cost.toFixed(2)}`,
        });
      }
    }

    return alerts;
  }

  /**
   * Check weekly cost thresholds
   */
  async checkWeeklyCosts(): Promise<CostAlert[]> {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const codes = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: {
          gte: startOfWeek,
        },
      },
      select: {
        cost: true,
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const alerts: CostAlert[] = [];

    if (totalCost >= COST_THRESHOLDS.weekly.critical) {
      alerts.push({
        period: 'weekly',
        severity: 'critical',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.weekly.critical,
        details: `Weekly SMS costs have exceeded critical threshold: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.weekly.critical})`,
      });
    } else if (totalCost >= COST_THRESHOLDS.weekly.warning) {
      alerts.push({
        period: 'weekly',
        severity: 'warning',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.weekly.warning,
        details: `Weekly SMS costs are approaching limit: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.weekly.warning})`,
      });
    }

    return alerts;
  }

  /**
   * Check monthly cost thresholds
   */
  async checkMonthlyCosts(): Promise<CostAlert[]> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const codes = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: {
          gte: startOfMonth,
        },
      },
      select: {
        cost: true,
        userId: true,
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const alerts: CostAlert[] = [];

    // Check aggregate monthly costs
    if (totalCost >= COST_THRESHOLDS.monthly.critical) {
      alerts.push({
        period: 'monthly',
        severity: 'critical',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.monthly.critical,
        details: `Monthly SMS costs have exceeded critical threshold: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.monthly.critical})`,
      });
    } else if (totalCost >= COST_THRESHOLDS.monthly.warning) {
      alerts.push({
        period: 'monthly',
        severity: 'warning',
        currentCost: totalCost,
        threshold: COST_THRESHOLDS.monthly.warning,
        details: `Monthly SMS costs are approaching limit: $${totalCost.toFixed(2)} (threshold: $${COST_THRESHOLDS.monthly.warning})`,
      });
    }

    // Check per-user monthly costs
    const userCosts = new Map<string, number>();
    codes.forEach((code) => {
      const current = userCosts.get(code.userId) || 0;
      userCosts.set(code.userId, current + (code.cost || 0));
    });

    for (const [userId, cost] of userCosts.entries()) {
      if (cost >= COST_THRESHOLDS.perUser.monthly) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        alerts.push({
          period: 'perUser',
          severity: 'warning',
          currentCost: cost,
          threshold: COST_THRESHOLDS.perUser.monthly,
          details: `User ${user?.email || userId} has exceeded monthly SMS cost limit: $${cost.toFixed(2)}`,
        });
      }
    }

    return alerts;
  }

  /**
   * Check all cost thresholds
   */
  async checkAllCosts(): Promise<CostAlert[]> {
    const [daily, weekly, monthly] = await Promise.all([
      this.checkDailyCosts(),
      this.checkWeeklyCosts(),
      this.checkMonthlyCosts(),
    ]);

    return [...daily, ...weekly, ...monthly];
  }

  /**
   * Send cost alerts to administrators
   */
  async sendCostAlerts(alerts: CostAlert[]): Promise<void> {
    if (alerts.length === 0) {
      return;
    }

    const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
    const warningAlerts = alerts.filter((a) => a.severity === 'warning');

    const adminEmail = process.env.BACKUP_ALERT_EMAIL || 'admin@yesgoddess.com';

    const alertSummary = alerts.map((alert) => alert.details).join('\n');

    try {
      await emailService.sendEmail({
        to: adminEmail,
        subject: `[${criticalAlerts.length > 0 ? 'CRITICAL' : 'WARNING'}] SMS Cost Alert - YesGoddess`,
        text: `SMS Cost Alert\n\n${alertSummary}\n\nTotal Alerts: ${alerts.length}\nCritical: ${criticalAlerts.length}\nWarning: ${warningAlerts.length}\n\nPlease review SMS usage and costs.`,
        html: `
          <h2>SMS Cost Alert</h2>
          <p><strong>Total Alerts:</strong> ${alerts.length}</p>
          <p><strong>Critical:</strong> ${criticalAlerts.length}</p>
          <p><strong>Warning:</strong> ${warningAlerts.length}</p>
          
          <h3>Alert Details:</h3>
          <ul>
            ${alerts.map((alert) => `<li><strong>[${alert.severity.toUpperCase()}]</strong> ${alert.details}</li>`).join('')}
          </ul>
          
          <p>Please review SMS usage and costs in the admin dashboard.</p>
        `,
      });
    } catch (error) {
      console.error('[SmsCostMonitor] Failed to send cost alert email:', error);
    }
  }

  /**
   * Generate comprehensive cost report
   */
  async generateCostReport(startDate: Date, endDate: Date): Promise<CostReport> {
    const codes = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    const totalCost = codes.reduce((sum, code) => sum + (code.cost || 0), 0);
    const totalSent = codes.length;
    const uniqueUsers = new Set(codes.map((code) => code.userId)).size;
    const averageCostPerSms = totalSent > 0 ? totalCost / totalSent : 0;

    // Calculate top users by cost
    const userStats = new Map<string, { email: string; name: string | null; cost: number; count: number }>();
    codes.forEach((code) => {
      const existing = userStats.get(code.userId) || {
        email: code.user.email,
        name: code.user.name,
        cost: 0,
        count: 0,
      };
      userStats.set(code.userId, {
        ...existing,
        cost: existing.cost + (code.cost || 0),
        count: existing.count + 1,
      });
    });

    const topUsers = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        userName: stats.name,
        userEmail: stats.email,
        cost: stats.cost,
        count: stats.count,
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // Calculate delivery stats
    const deliveryStats: Record<string, number> = {};
    codes.forEach((code) => {
      const status = code.deliveryStatus || 'unknown';
      deliveryStats[status] = (deliveryStats[status] || 0) + 1;
    });

    // Calculate cost by day
    const costByDay = new Map<string, { cost: number; count: number }>();
    codes.forEach((code) => {
      const date = code.createdAt.toISOString().split('T')[0];
      const existing = costByDay.get(date) || { cost: 0, count: 0 };
      costByDay.set(date, {
        cost: existing.cost + (code.cost || 0),
        count: existing.count + 1,
      });
    });

    const costByDayArray = Array.from(costByDay.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
      totalCost,
      totalSent,
      uniqueUsers,
      averageCostPerSms,
      topUsers,
      deliveryStats,
      costByDay: costByDayArray,
    };
  }

  /**
   * Detect unusual SMS patterns that might indicate abuse
   */
  async detectAnomalies(): Promise<Array<{
    type: 'spike' | 'abuse' | 'failure';
    userId?: string;
    userEmail?: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>> {
    const anomalies: Array<any> = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Check for users sending excessive SMS in the last hour
    const recentCodes = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
      },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    const userCounts = new Map<string, number>();
    recentCodes.forEach((code) => {
      userCounts.set(code.userId, (userCounts.get(code.userId) || 0) + 1);
    });

    for (const [userId, count] of userCounts.entries()) {
      if (count > 10) {
        const user = recentCodes.find((c) => c.userId === userId)?.user;
        anomalies.push({
          type: 'abuse',
          userId,
          userEmail: user?.email,
          description: `User has sent ${count} SMS codes in the last hour`,
          severity: 'high',
        });
      }
    }

    // Check for high failure rates
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentCodesWithStatus = await prisma.smsVerificationCode.findMany({
      where: {
        createdAt: { gte: last24Hours },
      },
    });

    const failureRate = recentCodesWithStatus.filter((c) => c.deliveryStatus === 'failed').length / recentCodesWithStatus.length;
    if (failureRate > 0.2 && recentCodesWithStatus.length > 5) {
      anomalies.push({
        type: 'failure',
        description: `High SMS failure rate detected: ${(failureRate * 100).toFixed(1)}% (${recentCodesWithStatus.length} messages)`,
        severity: 'medium',
      });
    }

    return anomalies;
  }
}

// Export singleton instance
export const smsCostMonitorService = new SmsCostMonitorService();
