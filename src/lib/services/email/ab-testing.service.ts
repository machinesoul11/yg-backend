/**
 * Email A/B Testing Service
 * 
 * Manages multivariate email testing:
 * - Subject line tests
 * - Content/template tests
 * - Send time tests
 * - Deterministic variant assignment
 * - Statistical significance calculation
 * - Automatic winner selection
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';

export interface CreateTestParams {
  name: string;
  description?: string;
  testType: 'subject_line' | 'content' | 'send_time' | 'from_name';
  variants: Array<{
    id: string;
    name: string;
    changes: Record<string, any>;
  }>;
  allocationPercentage: Record<string, number>; // variant_id: percentage
  primaryMetric: 'open_rate' | 'click_rate' | 'conversion_rate';
  startDate?: Date;
  endDate?: Date;
}

export interface TestResults {
  testId: string;
  variants: Array<{
    id: string;
    name: string;
    recipients: number;
    opens: number;
    clicks: number;
    conversions: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
  }>;
  winner?: {
    variantId: string;
    confidence: number;
    improvement: number;
  };
  statisticallySignificant: boolean;
}

export class ABTestingService {
  /**
   * Create a new A/B test
   */
  async createTest(params: CreateTestParams): Promise<string> {
    // Validate allocation percentages sum to 100
    const totalAllocation = Object.values(params.allocationPercentage).reduce(
      (sum, pct) => sum + pct,
      0
    );

    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error('Allocation percentages must sum to 100');
    }

    const test = await prisma.emailTest.create({
      data: {
        name: params.name,
        description: params.description,
        testType: params.testType,
        variants: params.variants,
        allocationPercentage: params.allocationPercentage,
        primaryMetric: params.primaryMetric,
        startDate: params.startDate,
        endDate: params.endDate,
        status: 'DRAFT',
      },
    });

    console.log(`[ABTesting] Created test ${test.id}: ${params.name}`);

    return test.id;
  }

  /**
   * Start an A/B test
   */
  async startTest(testId: string): Promise<void> {
    await prisma.emailTest.update({
      where: { id: testId },
      data: {
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });

    console.log(`[ABTesting] Started test ${testId}`);
  }

  /**
   * Assign a recipient to a variant using deterministic hashing
   */
  async assignVariant(testId: string, email: string, userId?: string): Promise<string> {
    // Check if already assigned
    const existing = await prisma.emailTestAssignment.findFirst({
      where: { testId, email },
    });

    if (existing) {
      return existing.variantId;
    }

    // Get test
    const test = await prisma.emailTest.findUnique({
      where: { id: testId },
    });

    if (!test || test.status !== 'ACTIVE') {
      throw new Error('Test not active');
    }

    // Deterministic variant assignment based on hash of email + testId
    const hash = crypto
      .createHash('md5')
      .update(`${email}-${testId}`)
      .digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashValue % 100) + 1; // 1-100

    // Determine variant based on allocation percentages
    const allocationPercentage = test.allocationPercentage as Record<string, number>;
    let cumulative = 0;
    let assignedVariant = '';

    for (const [variantId, allocation] of Object.entries(allocationPercentage)) {
      cumulative += allocation;
      if (percentage <= cumulative) {
        assignedVariant = variantId;
        break;
      }
    }

    // Store assignment
    await prisma.emailTestAssignment.create({
      data: {
        testId,
        userId,
        email,
        variantId: assignedVariant,
      },
    });

    console.log(`[ABTesting] Assigned ${email} to variant ${assignedVariant} in test ${testId}`);

    return assignedVariant;
  }

  /**
   * Get variant configuration for a recipient
   */
  async getVariantConfig(testId: string, email: string): Promise<Record<string, any> | null> {
    const assignment = await prisma.emailTestAssignment.findFirst({
      where: { testId, email },
      include: {
        test: true,
      },
    });

    if (!assignment) return null;

    const variants = assignment.test.variants as Array<{
      id: string;
      name: string;
      changes: Record<string, any>;
    }>;

    const variant = variants.find(v => v.id === assignment.variantId);

    return variant?.changes || null;
  }

  /**
   * Calculate test results and statistical significance
   */
  async calculateResults(testId: string): Promise<TestResults> {
    const test = await prisma.emailTest.findUnique({
      where: { id: testId },
      include: {
        assignments: true,
      },
    });

    if (!test) {
      throw new Error('Test not found');
    }

    const variants = test.variants as Array<{ id: string; name: string }>;
    const variantResults = [];

    for (const variant of variants) {
      const assignments = test.assignments.filter(a => a.variantId === variant.id);
      const recipients = assignments.length;
      const opens = assignments.filter(a => a.opened).length;
      const clicks = assignments.filter(a => a.clicked).length;
      const conversions = assignments.filter(a => a.converted).length;

      variantResults.push({
        id: variant.id,
        name: variant.name,
        recipients,
        opens,
        clicks,
        conversions,
        openRate: recipients > 0 ? opens / recipients : 0,
        clickRate: recipients > 0 ? clicks / recipients : 0,
        conversionRate: recipients > 0 ? conversions / recipients : 0,
      });
    }

    // Determine winner based on primary metric
    const metricKey =
      test.primaryMetric === 'open_rate'
        ? 'openRate'
        : test.primaryMetric === 'click_rate'
        ? 'clickRate'
        : 'conversionRate';

    const sorted = [...variantResults].sort(
      (a, b) => b[metricKey] - a[metricKey]
    );

    const winner = sorted[0];
    const runnerUp = sorted[1];

    // Calculate statistical significance using z-test
    const { isSignificant, confidence } = this.calculateSignificance(
      winner.recipients,
      winner[metricKey],
      runnerUp.recipients,
      runnerUp[metricKey]
    );

    const improvement = runnerUp[metricKey] > 0
      ? ((winner[metricKey] - runnerUp[metricKey]) / runnerUp[metricKey]) * 100
      : 0;

    // Update test if statistically significant
    if (isSignificant && !test.statisticalSignificanceReached) {
      await prisma.emailTest.update({
        where: { id: testId },
        data: {
          statisticalSignificanceReached: true,
          winningVariantId: winner.id,
          confidenceLevel: confidence,
        },
      });
    }

    return {
      testId,
      variants: variantResults,
      winner: isSignificant
        ? {
            variantId: winner.id,
            confidence,
            improvement,
          }
        : undefined,
      statisticallySignificant: isSignificant,
    };
  }

  /**
   * Calculate statistical significance using z-test for proportions
   */
  private calculateSignificance(
    n1: number,
    p1: number,
    n2: number,
    p2: number
  ): { isSignificant: boolean; confidence: number } {
    if (n1 < 30 || n2 < 30) {
      // Not enough data
      return { isSignificant: false, confidence: 0 };
    }

    // Pooled proportion
    const pPool = (n1 * p1 + n2 * p2) / (n1 + n2);

    // Standard error
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

    if (se === 0) {
      return { isSignificant: false, confidence: 0 };
    }

    // Z-score
    const z = (p1 - p2) / se;

    // Two-tailed p-value (approximate)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Confidence level
    const confidence = (1 - pValue) * 100;

    // Significant at 95% confidence level
    const isSignificant = confidence >= 95;

    return { isSignificant, confidence };
  }

  /**
   * Normal cumulative distribution function (approximation)
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp((-x * x) / 2);
    const prob =
      d *
      t *
      (0.3193815 +
        t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Complete a test
   */
  async completeTest(testId: string): Promise<void> {
    const results = await this.calculateResults(testId);

    await prisma.emailTest.update({
      where: { id: testId },
      data: {
        status: 'COMPLETED',
        endDate: new Date(),
      },
    });

    console.log(
      `[ABTesting] Completed test ${testId} - Winner: ${results.winner?.variantId || 'No clear winner'}`
    );
  }

  /**
   * Get active tests
   */
  async getActiveTests(): Promise<any[]> {
    return prisma.emailTest.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });
  }
}

export const abTestingService = new ABTestingService();
