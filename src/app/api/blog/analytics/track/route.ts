/**
 * Event Tracking API Route
 * POST /api/blog/analytics/track
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { EVENT_TYPES } from '@/lib/constants/event-types';
import { z } from 'zod';

const trackingSchema = z.object({
  eventType: z.enum([
    EVENT_TYPES.POST_VIEWED,
    EVENT_TYPES.POST_ENGAGEMENT_TIME,
    EVENT_TYPES.POST_SCROLL_DEPTH,
    EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED,
    EVENT_TYPES.POST_EMAIL_CAPTURE,
    EVENT_TYPES.POST_SESSION_START,
    EVENT_TYPES.POST_SESSION_END,
    EVENT_TYPES.POST_BOUNCE,
    EVENT_TYPES.POST_READ_COMPLETE,
  ]),
  postId: z.string(),
  sessionId: z.string(),
  userId: z.string().optional(),
  eventData: z.record(z.any()).optional(),
  attribution: z.object({
    referrer: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
    utmTerm: z.string().optional(),
    utmContent: z.string().optional(),
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    browser: z.string().optional(),
    os: z.string().optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = trackingSchema.parse(body);

    const {
      eventType,
      postId,
      sessionId,
      userId,
      eventData = {},
      attribution,
    } = validatedData;

    // Verify the post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });

    if (!post || post.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Post not found or not published' },
        { status: 404 }
      );
    }

    // Create the event
    const event = await prisma.event.create({
      data: {
        eventType,
        source: 'web',
        actorType: userId ? 'user' : undefined,
        actorId: userId,
        projectId: null,
        ipAssetId: null,
        licenseId: null,
        userId: userId,
        sessionId,
        propsJson: {
          postId, // Store postId in props until schema is fully updated
          ...eventData,
        },
      },
    });

    // Create attribution data if provided
    if (attribution && Object.keys(attribution).length > 0) {
      await prisma.attribution.create({
        data: {
          eventId: event.id,
          referrer: attribution.referrer,
          utmSource: attribution.utmSource,
          utmMedium: attribution.utmMedium,
          utmCampaign: attribution.utmCampaign,
          utmTerm: attribution.utmTerm,
          utmContent: attribution.utmContent,
          deviceType: attribution.deviceType,
          browser: attribution.browser,
          os: attribution.os,
        },
      });
    }

    // Handle specific event types
    switch (eventType) {
      case EVENT_TYPES.POST_VIEWED:
        // Increment view count
        await prisma.post.update({
          where: { id: postId },
          data: { viewCount: { increment: 1 } },
        });
        break;

      case EVENT_TYPES.POST_EMAIL_CAPTURE:
        // This would typically integrate with email service
        // For now, just track the event
        break;

      case EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED:
        // Track social share
        const platform = eventData.platform || 'unknown';
        // In a full implementation, this would update PostSocialShare table
        break;
    }

    return NextResponse.json({ 
      success: true, 
      eventId: event.id,
      message: 'Event tracked successfully' 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid event data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error tracking event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve event types for client reference
export async function GET() {
  return NextResponse.json({
    eventTypes: {
      POST_VIEWED: EVENT_TYPES.POST_VIEWED,
      POST_ENGAGEMENT_TIME: EVENT_TYPES.POST_ENGAGEMENT_TIME,
      POST_SCROLL_DEPTH: EVENT_TYPES.POST_SCROLL_DEPTH,
      POST_SOCIAL_SHARE_CLICKED: EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED,
      POST_EMAIL_CAPTURE: EVENT_TYPES.POST_EMAIL_CAPTURE,
      POST_SESSION_START: EVENT_TYPES.POST_SESSION_START,
      POST_SESSION_END: EVENT_TYPES.POST_SESSION_END,
      POST_BOUNCE: EVENT_TYPES.POST_BOUNCE,
      POST_READ_COMPLETE: EVENT_TYPES.POST_READ_COMPLETE,
    },
    documentation: {
      description: 'Use POST to track blog post analytics events',
      requiredFields: ['eventType', 'postId', 'sessionId'],
      optionalFields: ['userId', 'eventData', 'attribution'],
    },
  });
}
