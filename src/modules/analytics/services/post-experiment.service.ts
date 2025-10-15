/**
 * Post A/B Testing Service
 * Handles post experiment creation, variant assignment, and results analysis
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import type {
  CreateExperimentInput,
  UpdateExperimentInput,
  GetExperimentResultsInput,
  ExperimentAssignmentInput,
} from '@/lib/schemas/analytics.schema';

export interface ExperimentResults {
  experimentId: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  dateRange: {
    start: string;
    end: string;
  };
  variants: Array<{
    id: string;
    name: string;
    isControl: boolean;
    trafficAllocation: number;
    metrics: {
      views: number;
      uniqueVisitors: number;
      conversionRate: number;
      avgEngagementTime: number;
      avgScrollDepth: number;
      ctaClicks: number;
      bounceRate: number;
    };
    significance?: {
      isSignificant: boolean;
      confidenceLevel: number;
      pValue: number;
      liftPercentage: number;
    };
  }>;
  winningVariant?: {
    id: string;
    name: string;
    liftPercentage: number;
    confidenceLevel: number;
  };
  recommendations: Array<{
    type: 'winner' | 'continue' | 'stop' | 'extend';
    message: string;
    confidence: number;
  }>;
}

export interface VariantAssignment {
  experimentId: string;
  variantId: string;
  sessionId: string;
  userId?: string;
  variant: {
    id: string;
    name: string;
    content: Record<string, any>;
    isControl: boolean;
  };
}

export class PostExperimentService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  // ========================================
  // EXPERIMENT MANAGEMENT
  // ========================================

  /**
   * Create a new A/B test experiment
   */
  async createExperiment(
    input: CreateExperimentInput,
    createdBy: string
  ): Promise<{ experimentId: string }> {
    try {
      // Validate that at least one variant is marked as control
      const hasControl = input.variants.some(v => v.name.toLowerCase().includes('control') || v.name.toLowerCase().includes('original'));
      if (!hasControl) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one variant must be the control/original version',
        });
      }

      // Validate traffic allocation sums to 100%
      const totalAllocation = input.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Variant traffic allocations must sum to 100%',
        });
      }

      // Check for overlapping experiments on the same posts
      const overlappingExperiments = await this.prisma.postExperiment.findMany({
        where: {
          postTargets: {
            some: {
              postId: { in: input.postIds },
            },
          },
          status: { in: ['ACTIVE', 'DRAFT'] },
          OR: [
            { startDate: { lte: new Date(input.endDate) } },
            { endDate: { gte: new Date(input.startDate) } },
          ],
        },
      });

      if (overlappingExperiments.length > 0) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'One or more posts already have active experiments in this time period',
        });
      }

      // Create experiment in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create the experiment
        const experiment = await tx.postExperiment.create({
          data: {
            name: input.name,
            description: input.description,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            trafficAllocation: input.trafficAllocation,
            successMetrics: input.successMetrics,
            confidenceLevel: 0.95,
            createdBy,
            status: input.status || 'DRAFT',
          },
        });

        // Create variants
        const variants = await Promise.all(
          input.variants.map((variant, index) =>
            tx.postExperimentVariant.create({
              data: {
                id: variant.id,
                experimentId: experiment.id,
                name: variant.name,
                description: variant.description,
                trafficAllocation: variant.trafficAllocation,
                content: variant.content,
                isControl: index === 0 || variant.name.toLowerCase().includes('control'),
              },
            })
          )
        );

        // Create post targets
        await Promise.all(
          input.postIds.map(postId =>
            tx.postExperimentTarget.create({
              data: {
                experimentId: experiment.id,
                postId,
              },
            })
          )
        );

        return { experimentId: experiment.id };
      });

      return result;
    } catch (error) {
      console.error('[PostExperimentService] Failed to create experiment:', error);
      if (error instanceof TRPCError) throw error;
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create experiment',
      });
    }
  }

  /**
   * Update an existing experiment
   */
  async updateExperiment(
    input: UpdateExperimentInput,
    userId: string
  ): Promise<{ success: boolean }> {
    try {
      const experiment = await this.prisma.postExperiment.findUnique({
        where: { id: input.id },
        include: { variants: true },
      });

      if (!experiment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Experiment not found',
        });
      }

      // Check permissions (only creator or admin can update)
      if (experiment.createdBy !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only update experiments you created',
        });
      }

      // Prevent updates to active experiments (except status changes)
      if (experiment.status === 'ACTIVE' && input.status !== 'PAUSED' && input.status !== 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify active experiments except to pause or complete them',
        });
      }

      await this.prisma.postExperiment.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          status: input.status,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          trafficAllocation: input.trafficAllocation,
          successMetrics: input.successMetrics,
        },
      });

      // Clear any cached assignments if experiment is being modified
      await this.clearExperimentCache(input.id);

      return { success: true };
    } catch (error) {
      console.error('[PostExperimentService] Failed to update experiment:', error);
      if (error instanceof TRPCError) throw error;
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to update experiment',
      });
    }
  }

  // ========================================
  // VARIANT ASSIGNMENT
  // ========================================

  /**
   * Assign a user session to an experiment variant
   */
  async assignVariant(
    postId: string,
    sessionId: string,
    userId?: string
  ): Promise<VariantAssignment | null> {
    try {
      // Check for existing assignment
      const cacheKey = `experiment_assignment:${postId}:${sessionId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Find active experiment for this post
      const experiment = await this.prisma.postExperiment.findFirst({
        where: {
          status: 'ACTIVE',
          postTargets: {
            some: { postId },
          },
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
        include: {
          variants: true,
        },
      });

      if (!experiment) {
        return null; // No active experiment
      }

      // Check for existing assignment in database
      const existingAssignment = await this.prisma.postExperimentAssignment.findUnique({
        where: {
          experimentId_sessionId: {
            experimentId: experiment.id,
            sessionId,
          },
        },
        include: {
          variant: true,
        },
      });

      if (existingAssignment) {
        const assignment: VariantAssignment = {
          experimentId: experiment.id,
          variantId: existingAssignment.variantId,
          sessionId,
          userId,
          variant: {
            id: existingAssignment.variant.id,
            name: existingAssignment.variant.name,
            content: existingAssignment.variant.content as Record<string, any>,
            isControl: existingAssignment.variant.isControl,
          },
        };

        // Cache the assignment
        await this.redis.setex(cacheKey, 3600, JSON.stringify(assignment));
        return assignment;
      }

      // Create new assignment using deterministic hash
      const selectedVariant = this.selectVariantForSession(experiment.variants, sessionId);
      
      const newAssignment = await this.prisma.postExperimentAssignment.create({
        data: {
          experimentId: experiment.id,
          variantId: selectedVariant.id,
          sessionId,
          userId,
        },
        include: {
          variant: true,
        },
      });

      const assignment: VariantAssignment = {
        experimentId: experiment.id,
        variantId: newAssignment.variantId,
        sessionId,
        userId,
        variant: {
          id: newAssignment.variant.id,
          name: newAssignment.variant.name,
          content: newAssignment.variant.content as Record<string, any>,
          isControl: newAssignment.variant.isControl,
        },
      };

      // Cache the assignment for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(assignment));

      return assignment;
    } catch (error) {
      console.error('[PostExperimentService] Failed to assign variant:', error);
      return null;
    }
  }

  // ========================================
  // RESULTS ANALYSIS
  // ========================================

  /**
   * Get experiment results with statistical analysis
   */
  async getExperimentResults(
    input: GetExperimentResultsInput
  ): Promise<ExperimentResults> {
    try {
      const experiment = await this.prisma.postExperiment.findUnique({
        where: { id: input.experimentId },
        include: {
          variants: true,
          postTargets: {
            include: {
              post: true,
            },
          },
        },
      });

      if (!experiment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Experiment not found',
        });
      }

      // Get metrics for each variant
      const variantResults = await Promise.all(
        experiment.variants.map(async (variant) => {
          const metrics = await this.getVariantMetrics(
            experiment.id,
            variant.id,
            experiment.startDate,
            experiment.endDate
          );

          return {
            id: variant.id,
            name: variant.name,
            isControl: variant.isControl,
            trafficAllocation: variant.trafficAllocation,
            metrics,
          };
        })
      );

      // Calculate statistical significance if requested
      if (input.includeStatistics) {
        for (const variant of variantResults) {
          if (!variant.isControl) {
            const controlVariant = variantResults.find(v => v.isControl);
            if (controlVariant) {
              variant.significance = this.calculateStatisticalSignificance(
                controlVariant.metrics,
                variant.metrics,
                input.confidenceLevel
              );
            }
          }
        }
      }

      // Determine winning variant
      const winningVariant = this.determineWinningVariant(variantResults);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        experiment,
        variantResults,
        winningVariant
      );

      return {
        experimentId: experiment.id,
        name: experiment.name,
        status: experiment.status,
        dateRange: {
          start: experiment.startDate.toISOString(),
          end: experiment.endDate.toISOString(),
        },
        variants: variantResults,
        winningVariant,
        recommendations,
      };
    } catch (error) {
      console.error('[PostExperimentService] Failed to get experiment results:', error);
      if (error instanceof TRPCError) throw error;
      
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve experiment results',
      });
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  /**
   * Select variant for session using deterministic hash
   */
  private selectVariantForSession(variants: any[], sessionId: string): any {
    // Create deterministic hash of session ID
    const hash = crypto.createHash('sha256').update(sessionId).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashValue % 10000) / 100; // 0-99.99%

    // Select variant based on traffic allocation
    let cumulativeAllocation = 0;
    for (const variant of variants) {
      cumulativeAllocation += variant.trafficAllocation;
      if (percentage <= cumulativeAllocation) {
        return variant;
      }
    }

    // Fallback to first variant
    return variants[0];
  }

  /**
   * Get metrics for a specific variant
   */
  private async getVariantMetrics(
    experimentId: string,
    variantId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Get all sessions assigned to this variant
    const assignments = await this.prisma.postExperimentAssignment.findMany({
      where: {
        experimentId,
        variantId,
      },
      select: { sessionId: true },
    });

    const sessionIds = assignments.map(a => a.sessionId);

    if (sessionIds.length === 0) {
      return {
        views: 0,
        uniqueVisitors: 0,
        conversionRate: 0,
        avgEngagementTime: 0,
        avgScrollDepth: 0,
        ctaClicks: 0,
        bounceRate: 0,
      };
    }

    // Get events for these sessions
    const [viewEvents, engagementEvents, scrollEvents, ctaEvents] = await Promise.all([
      this.prisma.event.count({
        where: {
          sessionId: { in: sessionIds },
          eventType: 'post_viewed',
          occurredAt: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.event.findMany({
        where: {
          sessionId: { in: sessionIds },
          eventType: 'post_engagement_time',
          occurredAt: { gte: startDate, lte: endDate },
        },
        select: { propsJson: true },
      }),
      this.prisma.event.findMany({
        where: {
          sessionId: { in: sessionIds },
          eventType: 'post_scroll_depth',
          occurredAt: { gte: startDate, lte: endDate },
        },
        select: { propsJson: true },
      }),
      this.prisma.event.count({
        where: {
          sessionId: { in: sessionIds },
          eventType: 'post_cta_clicked',
          occurredAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    // Calculate metrics
    const uniqueVisitors = new Set(sessionIds).size;
    const avgEngagementTime = engagementEvents.length > 0
      ? engagementEvents.reduce((sum, e) => sum + ((e.propsJson as any)?.engagementTimeSeconds || 0), 0) / engagementEvents.length
      : 0;
    const avgScrollDepth = scrollEvents.length > 0
      ? scrollEvents.reduce((sum, e) => sum + ((e.propsJson as any)?.scrollDepthPercentage || 0), 0) / scrollEvents.length
      : 0;
    const bounceRate = viewEvents > 0 
      ? (viewEvents - engagementEvents.length) / viewEvents
      : 0;
    const conversionRate = viewEvents > 0 
      ? (ctaEvents / viewEvents) * 100
      : 0;

    return {
      views: viewEvents,
      uniqueVisitors,
      conversionRate,
      avgEngagementTime,
      avgScrollDepth,
      ctaClicks: ctaEvents,
      bounceRate: bounceRate * 100,
    };
  }

  /**
   * Calculate statistical significance between control and variant
   */
  private calculateStatisticalSignificance(
    controlMetrics: any,
    variantMetrics: any,
    confidenceLevel: number
  ) {
    // For simplicity, we'll use conversion rate for significance testing
    const controlConversions = Math.round((controlMetrics.conversionRate / 100) * controlMetrics.views);
    const variantConversions = Math.round((variantMetrics.conversionRate / 100) * variantMetrics.views);

    // Z-test for proportions
    const p1 = controlMetrics.conversionRate / 100;
    const p2 = variantMetrics.conversionRate / 100;
    const n1 = controlMetrics.views;
    const n2 = variantMetrics.views;

    if (n1 === 0 || n2 === 0) {
      return {
        isSignificant: false,
        confidenceLevel,
        pValue: 1,
        liftPercentage: 0,
      };
    }

    const pooledP = (controlConversions + variantConversions) / (n1 + n2);
    const standardError = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
    const zScore = (p2 - p1) / standardError;
    
    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    const isSignificant = pValue < (1 - confidenceLevel);
    const liftPercentage = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;

    return {
      isSignificant,
      confidenceLevel,
      pValue,
      liftPercentage,
    };
  }

  /**
   * Determine winning variant based on primary success metric
   */
  private determineWinningVariant(variants: any[]) {
    // For now, use conversion rate as the primary metric
    const sortedVariants = variants
      .filter(v => !v.isControl)
      .sort((a, b) => b.metrics.conversionRate - a.metrics.conversionRate);

    if (sortedVariants.length === 0) return undefined;

    const winner = sortedVariants[0];
    const control = variants.find(v => v.isControl);

    if (!control || !winner.significance?.isSignificant) {
      return undefined;
    }

    return {
      id: winner.id,
      name: winner.name,
      liftPercentage: winner.significance.liftPercentage,
      confidenceLevel: winner.significance.confidenceLevel,
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(experiment: any, variants: any[], winningVariant: any) {
    const recommendations = [];
    const now = new Date();
    const daysRemaining = Math.ceil((experiment.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (winningVariant) {
      recommendations.push({
        type: 'winner' as const,
        message: `Variant "${winningVariant.name}" is winning with ${winningVariant.liftPercentage.toFixed(1)}% lift. Consider implementing this change.`,
        confidence: winningVariant.confidenceLevel,
      });
    } else if (experiment.status === 'ACTIVE') {
      const totalSampleSize = variants.reduce((sum, v) => sum + v.metrics.views, 0);
      
      if (totalSampleSize < 1000 && daysRemaining > 0) {
        recommendations.push({
          type: 'continue' as const,
          message: `Sample size is still small (${totalSampleSize} views). Continue experiment for ${daysRemaining} more days.`,
          confidence: 0.7,
        });
      } else if (daysRemaining <= 0) {
        recommendations.push({
          type: 'stop' as const,
          message: 'Experiment has reached its end date. No clear winner found. Consider running a longer test.',
          confidence: 0.8,
        });
      } else {
        recommendations.push({
          type: 'extend' as const,
          message: 'No significant difference detected. Consider extending the experiment or increasing traffic allocation.',
          confidence: 0.6,
        });
      }
    }

    return recommendations;
  }

  /**
   * Normal cumulative distribution function approximation
   */
  private normalCDF(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   */
  private erf(x: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Clear experiment cache
   */
  private async clearExperimentCache(experimentId: string): Promise<void> {
    // Get all post targets for this experiment
    const targets = await this.prisma.postExperimentTarget.findMany({
      where: { experimentId },
      select: { postId: true },
    });

    // Clear cache for all post/session combinations
    const promises = targets.map(target => 
      this.redis.del(`experiment_assignment:${target.postId}:*`)
    );

    await Promise.all(promises);
  }
}
