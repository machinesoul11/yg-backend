/**
 * Event Enrichment Service
 * Adds contextual information to events asynchronously
 */

import { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { UAParser } from 'ua-parser-js';

/**
 * Parsed user agent information
 */
export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
}

/**
 * Geographic information
 */
export interface GeoLocation {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Session context information
 */
export interface SessionContext {
  sessionStartTime: Date | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}

export class EventEnrichmentService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis
  ) {}

  /**
   * Enrich a single event with contextual data
   */
  async enrichEvent(eventId: string): Promise<void> {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: { attribution: true },
      });

      if (!event) {
        console.warn(`[EventEnrichment] Event ${eventId} not found`);
        return;
      }

      const propsJson = event.propsJson as any;

      // 1. Parse user agent
      if (propsJson?.userAgent) {
        await this.enrichUserAgent(event, propsJson.userAgent);
      }

      // 2. Enrich with session context
      if (event.sessionId) {
        await this.enrichSessionContext(event);
      }

      // 3. Enrich with entity snapshot data
      if (event.ipAssetId) {
        await this.enrichAssetSnapshot(event);
      }

      if (event.licenseId) {
        await this.enrichLicenseSnapshot(event);
      }

      console.log(`[EventEnrichment] Successfully enriched event ${eventId}`);
    } catch (error) {
      console.error(`[EventEnrichment] Error enriching event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Parse and store user agent information
   */
  private async enrichUserAgent(event: any, userAgent: string): Promise<void> {
    try {
      const parsed = this.parseUserAgent(userAgent);

      // Check if attribution record exists
      if (event.attribution) {
        // Update existing attribution
        await this.prisma.attribution.update({
          where: { eventId: event.id },
          data: {
            deviceType: parsed.deviceType,
            browser: parsed.browser,
            os: parsed.os,
          },
        });
      } else {
        // Create new attribution record
        await this.prisma.attribution.create({
          data: {
            eventId: event.id,
            deviceType: parsed.deviceType,
            browser: parsed.browser,
            os: parsed.os,
          },
        });
      }

      // Store detailed info in event props
      const updatedProps = {
        ...(event.propsJson as any),
        device: {
          type: parsed.deviceType,
          brand: parsed.deviceBrand,
          model: parsed.deviceModel,
        },
        browser: {
          name: parsed.browser,
          version: parsed.browserVersion,
        },
        os: {
          name: parsed.os,
          version: parsed.osVersion,
        },
      };

      await this.prisma.event.update({
        where: { id: event.id },
        data: { propsJson: updatedProps },
      });
    } catch (error) {
      console.error('[EventEnrichment] Error enriching user agent:', error);
    }
  }

  /**
   * Parse user agent string using ua-parser-js
   */
  private parseUserAgent(userAgent: string): ParsedUserAgent {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser.name || null,
      browserVersion: result.browser.version || null,
      os: result.os.name || null,
      osVersion: result.os.version || null,
      deviceType: this.normalizeDeviceType(result.device.type),
      deviceBrand: result.device.vendor || null,
      deviceModel: result.device.model || null,
    };
  }

  /**
   * Normalize device type to standard values
   */
  private normalizeDeviceType(type?: string): string {
    if (!type) return 'desktop';

    const normalized = type.toLowerCase();
    if (normalized === 'mobile') return 'mobile';
    if (normalized === 'tablet') return 'tablet';
    if (normalized === 'smarttv') return 'tv';
    if (normalized === 'wearable') return 'wearable';
    if (normalized === 'console') return 'console';

    return 'desktop';
  }

  /**
   * Enrich event with session context
   */
  private async enrichSessionContext(event: any): Promise<void> {
    try {
      const sessionKey = `session:${event.sessionId}`;
      const sessionData = await this.redis.get(sessionKey);

      if (!sessionData) {
        console.log(`[EventEnrichment] No session data found for ${event.sessionId}`);
        return;
      }

      const session: SessionContext = JSON.parse(sessionData);

      // Calculate session duration if start time available
      let sessionDurationMs = null;
      if (session.sessionStartTime) {
        const startTime = new Date(session.sessionStartTime);
        sessionDurationMs = event.occurredAt.getTime() - startTime.getTime();
      }

      // Update event props with session context
      const updatedProps = {
        ...(event.propsJson as any),
        session: {
          startTime: session.sessionStartTime,
          durationMs: sessionDurationMs,
          referrer: session.referrer,
        },
        campaign: {
          utmSource: session.utmSource,
          utmMedium: session.utmMedium,
          utmCampaign: session.utmCampaign,
          utmTerm: session.utmTerm,
          utmContent: session.utmContent,
        },
      };

      await this.prisma.event.update({
        where: { id: event.id },
        data: { propsJson: updatedProps },
      });

      // Update attribution if UTM parameters exist
      if (session.utmSource || session.utmMedium || session.utmCampaign) {
        const attributionData = {
          utmSource: session.utmSource,
          utmMedium: session.utmMedium,
          utmCampaign: session.utmCampaign,
          utmTerm: session.utmTerm,
          utmContent: session.utmContent,
          referrer: session.referrer,
        };

        if (event.attribution) {
          await this.prisma.attribution.update({
            where: { eventId: event.id },
            data: attributionData,
          });
        } else {
          await this.prisma.attribution.create({
            data: {
              eventId: event.id,
              ...attributionData,
            },
          });
        }
      }
    } catch (error) {
      console.error('[EventEnrichment] Error enriching session context:', error);
    }
  }

  /**
   * Enrich event with asset snapshot data
   */
  private async enrichAssetSnapshot(event: any): Promise<void> {
    try {
      const asset = await this.prisma.ipAsset.findUnique({
        where: { id: event.ipAssetId },
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          projectId: true,
          createdBy: true,
          createdAt: true,
        },
      });

      if (!asset) {
        console.warn(`[EventEnrichment] Asset ${event.ipAssetId} not found`);
        return;
      }

      // Store asset state at time of event
      const updatedProps = {
        ...(event.propsJson as any),
        asset_snapshot: {
          id: asset.id,
          title: asset.title,
          type: asset.type,
          status: asset.status,
          projectId: asset.projectId,
          createdBy: asset.createdBy,
          createdAt: asset.createdAt,
          snapshotAt: new Date(),
        },
      };

      await this.prisma.event.update({
        where: { id: event.id },
        data: { propsJson: updatedProps },
      });
    } catch (error) {
      console.error('[EventEnrichment] Error enriching asset snapshot:', error);
    }
  }

  /**
   * Enrich event with license snapshot data
   */
  private async enrichLicenseSnapshot(event: any): Promise<void> {
    try {
      const license = await this.prisma.license.findUnique({
        where: { id: event.licenseId },
        select: {
          id: true,
          status: true,
          licenseType: true,
          startDate: true,
          endDate: true,
          feeCents: true,
          revShareBps: true,
          brandId: true,
          projectId: true,
          scopeJson: true,
        },
      });

      if (!license) {
        console.warn(`[EventEnrichment] License ${event.licenseId} not found`);
        return;
      }

      // Store license state at time of event
      const updatedProps = {
        ...(event.propsJson as any),
        license_snapshot: {
          id: license.id,
          status: license.status,
          type: license.licenseType,
          startDate: license.startDate,
          endDate: license.endDate,
          feeCents: license.feeCents,
          revShareBps: license.revShareBps,
          brandId: license.brandId,
          projectId: license.projectId,
          scope: license.scopeJson,
          snapshotAt: new Date(),
        },
      };

      await this.prisma.event.update({
        where: { id: event.id },
        data: { propsJson: updatedProps },
      });
    } catch (error) {
      console.error('[EventEnrichment] Error enriching license snapshot:', error);
    }
  }

  /**
   * Store session context in Redis for enrichment
   */
  async storeSessionContext(
    sessionId: string,
    context: SessionContext
  ): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      await this.redis.setex(
        sessionKey,
        3600, // 1 hour TTL
        JSON.stringify(context)
      );
    } catch (error) {
      console.error('[EventEnrichment] Error storing session context:', error);
    }
  }

  /**
   * Get session context from Redis
   */
  async getSessionContext(sessionId: string): Promise<SessionContext | null> {
    try {
      const sessionKey = `session:${sessionId}`;
      const data = await this.redis.get(sessionKey);

      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      console.error('[EventEnrichment] Error getting session context:', error);
      return null;
    }
  }
}
