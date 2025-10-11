/**
 * Event Service
 * Handles analytics event tracking for projects and other entities
 */

import { PrismaClient } from '@prisma/client';
import type { TrackEventInput } from '../schemas/project.schema';

export class EventService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Track an analytics event
   */
  async track(data: TrackEventInput): Promise<void> {
    try {
      await (this.prisma as any).event.create({
        data: {
          eventType: data.eventType,
          actorType: data.actorType,
          actorId: data.actorId || null,
          projectId: data.projectId || null,
          userId: data.userId || null,
          brandId: data.brandId || null,
          creatorId: data.creatorId || null,
          propsJson: data.propsJson || null,
        },
      });
    } catch (error) {
      // Log error but don't throw - analytics failures shouldn't break operations
      console.error('[EventService] Failed to track event:', error);
    }
  }

  /**
   * Get events for a project
   */
  async getProjectEvents(
    projectId: string,
    limit: number = 50
  ): Promise<any[]> {
    return (this.prisma as any).event.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get events by type
   */
  async getEventsByType(
    eventType: string,
    limit: number = 100
  ): Promise<any[]> {
    return (this.prisma as any).event.findMany({
      where: { eventType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get event counts by type
   */
  async getEventCounts(
    filters?: {
      projectId?: string;
      brandId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<Record<string, number>> {
    const where: any = {};
    
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.brandId) where.brandId = filters.brandId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const events = await (this.prisma as any).event.groupBy({
      by: ['eventType'],
      where,
      _count: true,
    });

    return events.reduce((acc: Record<string, number>, event: any) => {
      acc[event.eventType] = event._count;
      return acc;
    }, {} as Record<string, number>);
  }
}
