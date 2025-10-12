/**
 * Email Deliverability Monitoring Service
 * 
 * Monitors email deliverability metrics in real-time and triggers alerts
 * when thresholds are exceeded:
 * - Delivery rate (target: >95%)
 * - Bounce rate (warning: >2%, critical: >5%)
 * - Complaint rate (warning: >0.1%, critical: >0.3%)
 * - Failed sends tracking
 * 
 * Integrates with:
 * - EmailReputationService for overall health
 * - Notification system for admin alerts
 * - Redis for real-time metric caching
 */

import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';

export interface DeliverabilityMetrics {
  period: 'hour' | 'day' | 'week';
  startTime: Date;
  endTime: Date;
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalFailed: number;
  totalComplained: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  failureRate: number;
  bouncesByType?: {
    hard: number;
    soft: number;
    unknown: number;
  };
}

export interface DeliverabilityAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical' | 'urgent';
  type: 'delivery_rate' | 'bounce_rate' | 'complaint_rate' | 'failure_spike' | 'reputation';
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
}

export interface DomainDeliverability {
  domain: string;
  totalSent: number;
  deliveryRate: number;
  bounceRate: number;
  complaintRate: number;
  issues: string[];
}

export class EmailDeliverabilityService {
  private readonly THRESHOLDS = {
    // Delivery rate thresholds
    DELIVERY_RATE_WARNING: 0.95, // 95%
    DELIVERY_RATE_CRITICAL: 0.90, // 90%
    
    // Bounce rate thresholds
    BOUNCE_RATE_WARNING: 0.02, // 2%
    BOUNCE_RATE_CRITICAL: 0.05, // 5%
    
    // Complaint rate thresholds
    COMPLAINT_RATE_WARNING: 0.001, // 0.1%
    COMPLAINT_RATE_CRITICAL: 0.003, // 0.3%
    
    // Failure spike threshold
    FAILURE_SPIKE_COUNT: 100, // More than 100 failures in an hour
    
    // Alert suppression (don't re-alert within this time)
    ALERT_SUPPRESSION_HOURS: 4,
  };

  /**
   * Calculate deliverability metrics for a given time period
   */
  async calculateMetrics(period: 'hour' | 'day' | 'week' = 'hour'): Promise<DeliverabilityMetrics> {
    const now = new Date();
    const startTime = this.getStartTime(now, period);

    const events = await prisma.emailEvent.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: now,
        },
      },
      select: {
        eventType: true,
        bounceReason: true,
      },
    });

    const totalSent = events.filter(e => e.eventType === 'SENT').length;
    const totalDelivered = events.filter(e => e.eventType === 'DELIVERED').length;
    const totalBounced = events.filter(e => e.eventType === 'BOUNCED').length;
    const totalFailed = events.filter(e => e.eventType === 'FAILED').length;
    const totalComplained = events.filter(e => e.eventType === 'COMPLAINED').length;

    // Classify bounces by type (hard/soft)
    const bouncesByType = {
      hard: 0,
      soft: 0,
      unknown: 0,
    };

    events.filter(e => e.eventType === 'BOUNCED').forEach(e => {
      const reason = e.bounceReason?.toLowerCase() || '';
      if (reason.includes('permanent') || reason.includes('invalid') || reason.includes('not exist')) {
        bouncesByType.hard++;
      } else if (reason.includes('temporary') || reason.includes('mailbox full') || reason.includes('timeout')) {
        bouncesByType.soft++;
      } else {
        bouncesByType.unknown++;
      }
    });

    const metrics: DeliverabilityMetrics = {
      period,
      startTime,
      endTime: now,
      totalSent,
      totalDelivered,
      totalBounced,
      totalFailed,
      totalComplained,
      deliveryRate: totalSent > 0 ? totalDelivered / totalSent : 0,
      bounceRate: totalSent > 0 ? totalBounced / totalSent : 0,
      complaintRate: totalSent > 0 ? totalComplained / totalSent : 0,
      failureRate: totalSent > 0 ? totalFailed / totalSent : 0,
      bouncesByType,
    };

    // Cache metrics
    await this.cacheMetrics(period, metrics);

    return metrics;
  }

  /**
   * Monitor deliverability and generate alerts if thresholds exceeded
   */
  async monitorAndAlert(): Promise<DeliverabilityAlert[]> {
    const alerts: DeliverabilityAlert[] = [];

    // Check hourly metrics
    const hourlyMetrics = await this.calculateMetrics('hour');
    const hourlyAlerts = await this.checkThresholds(hourlyMetrics);
    alerts.push(...hourlyAlerts);

    // Check daily metrics for trends
    const dailyMetrics = await this.calculateMetrics('day');
    const dailyAlerts = await this.checkThresholds(dailyMetrics);
    alerts.push(...dailyAlerts);

    // Filter out suppressed alerts
    const activeAlerts = await this.filterSuppressedAlerts(alerts);

    // Send alerts to admins
    if (activeAlerts.length > 0) {
      await this.sendAlerts(activeAlerts);
    }

    return activeAlerts;
  }

  /**
   * Check metrics against thresholds and generate alerts
   */
  private async checkThresholds(metrics: DeliverabilityMetrics): Promise<DeliverabilityAlert[]> {
    const alerts: DeliverabilityAlert[] = [];

    // Check delivery rate
    if (metrics.deliveryRate < this.THRESHOLDS.DELIVERY_RATE_CRITICAL) {
      alerts.push({
        id: `delivery-rate-${metrics.period}-${Date.now()}`,
        severity: 'critical',
        type: 'delivery_rate',
        metric: 'delivery_rate',
        currentValue: metrics.deliveryRate,
        threshold: this.THRESHOLDS.DELIVERY_RATE_CRITICAL,
        period: metrics.period,
        message: `Critical delivery rate: ${(metrics.deliveryRate * 100).toFixed(2)}% (threshold: ${(this.THRESHOLDS.DELIVERY_RATE_CRITICAL * 100)}%)`,
        recommendation: 'Immediately investigate email infrastructure. Check DNS records, sender authentication, and provider status.',
        affectedEmails: metrics.totalSent - metrics.totalDelivered,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    } else if (metrics.deliveryRate < this.THRESHOLDS.DELIVERY_RATE_WARNING) {
      alerts.push({
        id: `delivery-rate-${metrics.period}-${Date.now()}`,
        severity: 'warning',
        type: 'delivery_rate',
        metric: 'delivery_rate',
        currentValue: metrics.deliveryRate,
        threshold: this.THRESHOLDS.DELIVERY_RATE_WARNING,
        period: metrics.period,
        message: `Low delivery rate: ${(metrics.deliveryRate * 100).toFixed(2)}% (threshold: ${(this.THRESHOLDS.DELIVERY_RATE_WARNING * 100)}%)`,
        recommendation: 'Monitor closely. Review recent email list changes and verify sender reputation.',
        affectedEmails: metrics.totalSent - metrics.totalDelivered,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    }

    // Check bounce rate
    if (metrics.bounceRate >= this.THRESHOLDS.BOUNCE_RATE_CRITICAL) {
      alerts.push({
        id: `bounce-rate-${metrics.period}-${Date.now()}`,
        severity: 'critical',
        type: 'bounce_rate',
        metric: 'bounce_rate',
        currentValue: metrics.bounceRate,
        threshold: this.THRESHOLDS.BOUNCE_RATE_CRITICAL,
        period: metrics.period,
        message: `Critical bounce rate: ${(metrics.bounceRate * 100).toFixed(2)}% (threshold: ${(this.THRESHOLDS.BOUNCE_RATE_CRITICAL * 100)}%)`,
        recommendation: 'URGENT: Pause all sending immediately. Clean email list, remove hard bounces, and implement email validation.',
        affectedEmails: metrics.totalBounced,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    } else if (metrics.bounceRate >= this.THRESHOLDS.BOUNCE_RATE_WARNING) {
      alerts.push({
        id: `bounce-rate-${metrics.period}-${Date.now()}`,
        severity: 'warning',
        type: 'bounce_rate',
        metric: 'bounce_rate',
        currentValue: metrics.bounceRate,
        threshold: this.THRESHOLDS.BOUNCE_RATE_WARNING,
        period: metrics.period,
        message: `Elevated bounce rate: ${(metrics.bounceRate * 100).toFixed(2)}% (threshold: ${(this.THRESHOLDS.BOUNCE_RATE_WARNING * 100)}%)`,
        recommendation: 'Review email list quality. Implement email validation on signup and regularly clean list.',
        affectedEmails: metrics.totalBounced,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    }

    // Check complaint rate
    if (metrics.complaintRate >= this.THRESHOLDS.COMPLAINT_RATE_CRITICAL) {
      alerts.push({
        id: `complaint-rate-${metrics.period}-${Date.now()}`,
        severity: 'urgent',
        type: 'complaint_rate',
        metric: 'complaint_rate',
        currentValue: metrics.complaintRate,
        threshold: this.THRESHOLDS.COMPLAINT_RATE_CRITICAL,
        period: metrics.period,
        message: `URGENT: Critical spam complaint rate: ${(metrics.complaintRate * 100).toFixed(4)}% (threshold: ${(this.THRESHOLDS.COMPLAINT_RATE_CRITICAL * 100).toFixed(1)}%)`,
        recommendation: 'IMMEDIATE ACTION REQUIRED: Pause all campaigns. Review email content, targeting, and unsubscribe process. Risk of provider suspension.',
        affectedEmails: metrics.totalComplained,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    } else if (metrics.complaintRate >= this.THRESHOLDS.COMPLAINT_RATE_WARNING) {
      alerts.push({
        id: `complaint-rate-${metrics.period}-${Date.now()}`,
        severity: 'warning',
        type: 'complaint_rate',
        metric: 'complaint_rate',
        currentValue: metrics.complaintRate,
        threshold: this.THRESHOLDS.COMPLAINT_RATE_WARNING,
        period: metrics.period,
        message: `Elevated spam complaint rate: ${(metrics.complaintRate * 100).toFixed(4)}% (threshold: ${(this.THRESHOLDS.COMPLAINT_RATE_WARNING * 100).toFixed(1)}%)`,
        recommendation: 'Review email relevance and frequency. Ensure unsubscribe links are prominent and working.',
        affectedEmails: metrics.totalComplained,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    }

    // Check for failure spikes (hour only)
    if (metrics.period === 'hour' && metrics.totalFailed > this.THRESHOLDS.FAILURE_SPIKE_COUNT) {
      alerts.push({
        id: `failure-spike-${metrics.period}-${Date.now()}`,
        severity: 'critical',
        type: 'failure_spike',
        metric: 'failed_count',
        currentValue: metrics.totalFailed,
        threshold: this.THRESHOLDS.FAILURE_SPIKE_COUNT,
        period: metrics.period,
        message: `Email failure spike detected: ${metrics.totalFailed} failures in the last hour`,
        recommendation: 'Check email provider status and API connectivity. Review application logs for errors.',
        affectedEmails: metrics.totalFailed,
        triggeredAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Filter out alerts that were recently sent (suppression)
   */
  private async filterSuppressedAlerts(alerts: DeliverabilityAlert[]): Promise<DeliverabilityAlert[]> {
    const activeAlerts: DeliverabilityAlert[] = [];

    for (const alert of alerts) {
      const suppressionKey = `alert:suppressed:${alert.type}:${alert.period}`;
      const suppressed = await redis.get(suppressionKey);

      if (!suppressed) {
        activeAlerts.push(alert);
        
        // Set suppression for this alert type
        await redis.set(
          suppressionKey,
          '1',
          'EX',
          this.THRESHOLDS.ALERT_SUPPRESSION_HOURS * 3600
        );
      }
    }

    return activeAlerts;
  }

  /**
   * Send alerts to administrators via notification system
   */
  private async sendAlerts(alerts: DeliverabilityAlert[]): Promise<void> {
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
      console.warn('[Deliverability] No admin users found to send alerts');
      return;
    }

    // Group alerts by severity
    const urgentAlerts = alerts.filter(a => a.severity === 'urgent');
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');

    // Determine overall priority
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' = 'MEDIUM';
    if (urgentAlerts.length > 0) {
      priority = 'URGENT';
    } else if (criticalAlerts.length > 0) {
      priority = 'URGENT';
    } else if (warningAlerts.length > 0) {
      priority = 'HIGH';
    }

    // Format alert message
    const message = this.formatAlertMessage(alerts);

    // Create notifications for each admin
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'SYSTEM',
          priority,
          title: `Email Deliverability Alert - ${alerts.length} Issue${alerts.length > 1 ? 's' : ''}`,
          message,
          metadata: {
            alerts: alerts.map(a => ({
              type: a.type,
              severity: a.severity,
              metric: a.metric,
              currentValue: a.currentValue,
              threshold: a.threshold,
            })),
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    // Log alert
    console.warn(`[Deliverability] Sent ${alerts.length} alert(s) to ${admins.length} admin(s)`);
    alerts.forEach(alert => {
      console.warn(`[Deliverability] ${alert.severity.toUpperCase()}: ${alert.message}`);
    });
  }

  /**
   * Format alert message for notifications
   */
  private formatAlertMessage(alerts: DeliverabilityAlert[]): string {
    const lines: string[] = [
      '⚠️ Email deliverability issues detected:',
      '',
    ];

    alerts.forEach((alert, index) => {
      const emoji = alert.severity === 'urgent' ? '🚨' : alert.severity === 'critical' ? '❌' : '⚠️';
      lines.push(`${emoji} **${alert.message}**`);
      lines.push(`   Period: ${alert.period}`);
      if (alert.affectedEmails) {
        lines.push(`   Affected: ${alert.affectedEmails} emails`);
      }
      lines.push(`   Action: ${alert.recommendation}`);
      if (index < alerts.length - 1) {
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  /**
   * Get deliverability metrics by domain
   */
  async getMetricsByDomain(period: 'hour' | 'day' = 'day'): Promise<DomainDeliverability[]> {
    const now = new Date();
    const startTime = this.getStartTime(now, period);

    const events = await prisma.emailEvent.findMany({
      where: {
        createdAt: {
          gte: startTime,
          lte: now,
        },
      },
      select: {
        eventType: true,
        email: true,
      },
    });

    // Group by domain
    const domainStats = new Map<string, {
      sent: number;
      delivered: number;
      bounced: number;
      complained: number;
    }>();

    events.forEach(event => {
      const domain = event.email.split('@')[1] || 'unknown';
      
      if (!domainStats.has(domain)) {
        domainStats.set(domain, {
          sent: 0,
          delivered: 0,
          bounced: 0,
          complained: 0,
        });
      }

      const stats = domainStats.get(domain)!;
      
      if (event.eventType === 'SENT') stats.sent++;
      if (event.eventType === 'DELIVERED') stats.delivered++;
      if (event.eventType === 'BOUNCED') stats.bounced++;
      if (event.eventType === 'COMPLAINED') stats.complained++;
    });

    // Convert to array and calculate rates
    const results: DomainDeliverability[] = [];

    domainStats.forEach((stats, domain) => {
      const deliveryRate = stats.sent > 0 ? stats.delivered / stats.sent : 0;
      const bounceRate = stats.sent > 0 ? stats.bounced / stats.sent : 0;
      const complaintRate = stats.sent > 0 ? stats.complained / stats.sent : 0;

      const issues: string[] = [];
      if (deliveryRate < 0.90) issues.push('Low delivery rate');
      if (bounceRate > 0.05) issues.push('High bounce rate');
      if (complaintRate > 0.001) issues.push('High complaint rate');

      results.push({
        domain,
        totalSent: stats.sent,
        deliveryRate,
        bounceRate,
        complaintRate,
        issues,
      });
    });

    // Sort by sent count descending
    results.sort((a, b) => b.totalSent - a.totalSent);

    return results;
  }

  /**
   * Get historical deliverability trend
   */
  async getDeliverabilityTrend(days: number = 7): Promise<Array<{
    date: string;
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
  }>> {
    const results: Array<{
      date: string;
      deliveryRate: number;
      bounceRate: number;
      complaintRate: number;
    }> = [];

    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      const events = await prisma.emailEvent.findMany({
        where: {
          createdAt: {
            gte: date,
            lte: endDate,
          },
        },
        select: {
          eventType: true,
        },
      });

      const sent = events.filter(e => e.eventType === 'SENT').length;
      const delivered = events.filter(e => e.eventType === 'DELIVERED').length;
      const bounced = events.filter(e => e.eventType === 'BOUNCED').length;
      const complained = events.filter(e => e.eventType === 'COMPLAINED').length;

      results.push({
        date: date.toISOString().split('T')[0],
        deliveryRate: sent > 0 ? delivered / sent : 0,
        bounceRate: sent > 0 ? bounced / sent : 0,
        complaintRate: sent > 0 ? complained / sent : 0,
      });
    }

    return results.reverse(); // Oldest to newest
  }

  /**
   * Cache metrics in Redis for quick access
   */
  private async cacheMetrics(period: string, metrics: DeliverabilityMetrics): Promise<void> {
    const key = `deliverability:metrics:${period}:${new Date().toISOString().split('T')[0]}`;
    
    await redis.set(
      key,
      JSON.stringify(metrics),
      'EX',
      period === 'hour' ? 3600 : 86400 // 1 hour or 24 hours
    );
  }

  /**
   * Get cached metrics
   */
  async getCachedMetrics(period: 'hour' | 'day'): Promise<DeliverabilityMetrics | null> {
    const key = `deliverability:metrics:${period}:${new Date().toISOString().split('T')[0]}`;
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }

  /**
   * Helper to get start time for a period
   */
  private getStartTime(now: Date, period: 'hour' | 'day' | 'week'): Date {
    const start = new Date(now);

    if (period === 'hour') {
      start.setHours(start.getHours() - 1);
    } else if (period === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    }

    return start;
  }

  /**
   * Record a bounce for deliverability tracking
   */
  async recordBounce(email: string, bounceType: string, bounceReason: string): Promise<void> {
    // Implementation is handled through calculateMetrics
    // This method exists for API compatibility
    console.log(`[Deliverability] Recorded ${bounceType} bounce for ${email}: ${bounceReason}`);
  }

  /**
   * Record a complaint for deliverability tracking
   */
  async recordComplaint(email: string): Promise<void> {
    // Implementation is handled through calculateMetrics
    // This method exists for API compatibility
    console.log(`[Deliverability] Recorded complaint for ${email}`);
  }

  /**
   * Record a successful delivery
   */
  async recordDelivery(email: string): Promise<void> {
    // Implementation is handled through calculateMetrics
    // This method exists for API compatibility
    console.log(`[Deliverability] Recorded delivery for ${email}`);
  }

  /**
   * Record a failed send
   */
  async recordFailure(email: string, error: string): Promise<void> {
    // Implementation is handled through calculateMetrics
    // This method exists for API compatibility
    console.log(`[Deliverability] Recorded failure for ${email}: ${error}`);
  }
}

export const emailDeliverabilityService = new EmailDeliverabilityService();
