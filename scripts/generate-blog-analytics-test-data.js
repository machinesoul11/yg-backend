/**
 * Blog Analytics Test Script
 * 
 * This script creates sample analytics data to test the performance metrics system.
 * Run this to populate your database with realistic test data.
 */

import { PrismaClient } from '@prisma/client';
import { EVENT_TYPES } from '../src/lib/constants/event-types.js';

const prisma = new PrismaClient();

async function generateSampleAnalyticsData() {
  console.log('🚀 Starting blog analytics test data generation...');

  try {
    // Get some published posts to work with
    const posts = await prisma.post.findMany({
      where: { 
        status: 'PUBLISHED',
        deletedAt: null,
      },
      take: 5,
      select: { id: true, title: true },
    });

    if (posts.length === 0) {
      console.log('❌ No published posts found. Please create some posts first.');
      return;
    }

    console.log(`📝 Found ${posts.length} posts to generate analytics for...`);

    for (const post of posts) {
      await generatePostAnalytics(post.id, post.title);
    }

    console.log('✅ Sample analytics data generation completed!');
    
  } catch (error) {
    console.error('❌ Error generating sample data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function generatePostAnalytics(postId: string, postTitle: string) {
  console.log(`📊 Generating analytics for "${postTitle}"...`);

  // Generate events over the past 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  // Generate 20-100 sessions for this post
  const sessionCount = Math.floor(Math.random() * 80) + 20;
  
  for (let i = 0; i < sessionCount; i++) {
    const sessionId = `session_${postId}_${i}_${Date.now()}`;
    
    // Random date within the last 30 days
    const eventDate = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
    
    // Generate session events
    await generateSessionEvents(postId, sessionId, eventDate);
  }

  // Update post view count
  await prisma.post.update({
    where: { id: postId },
    data: { viewCount: sessionCount },
  });

  console.log(`✅ Generated ${sessionCount} sessions for "${postTitle}"`);
}

async function generateSessionEvents(postId: string, sessionId: string, startTime: Date) {
  const events = [];
  
  // Always start with a page view
  events.push({
    eventType: EVENT_TYPES.POST_VIEWED,
    source: 'web',
    sessionId,
    occurredAt: startTime,
    propsJson: {
      postId,
      isUniqueToday: Math.random() > 0.3, // 70% unique visitors
    },
  });

  // Maybe create attribution data
  if (Math.random() > 0.4) {
    const referrers = [
      'https://google.com/search',
      'https://facebook.com',
      'https://twitter.com',
      'https://linkedin.com',
      'direct',
      'https://example.com/referral',
    ];
    
    const devices = ['desktop', 'mobile', 'tablet'];
    const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];
    const oses = ['Windows', 'macOS', 'iOS', 'Android', 'Linux'];

    // Store referrer in event props for now
    events[0].propsJson.referrer = referrers[Math.floor(Math.random() * referrers.length)];
    events[0].propsJson.deviceType = devices[Math.floor(Math.random() * devices.length)];
    events[0].propsJson.browser = browsers[Math.floor(Math.random() * browsers.length)];
    events[0].propsJson.os = oses[Math.floor(Math.random() * oses.length)];
  }

  // Session duration (30 seconds to 10 minutes)
  const sessionDuration = Math.floor(Math.random() * 570) + 30;
  const isLongSession = sessionDuration > 120; // More than 2 minutes
  const isBounce = sessionDuration < 15 && Math.random() > 0.7;

  // Generate scroll events for longer sessions
  if (isLongSession && !isBounce) {
    const scrollMilestones = [25, 50, 75, 90];
    let timeOffset = 10;
    
    for (const milestone of scrollMilestones) {
      if (Math.random() > 0.3) { // 70% chance to reach each milestone
        events.push({
          eventType: EVENT_TYPES.POST_SCROLL_DEPTH,
          source: 'web',
          sessionId,
          occurredAt: new Date(startTime.getTime() + timeOffset * 1000),
          propsJson: {
            postId,
            depthPercentage: milestone,
            timeToReachMs: timeOffset * 1000,
          },
        });
        timeOffset += Math.floor(Math.random() * 30) + 10;
      }
    }
  }

  // Generate engagement time event
  if (!isBounce) {
    const engagementTime = Math.floor(sessionDuration * (0.6 + Math.random() * 0.4)); // 60-100% of session
    events.push({
      eventType: EVENT_TYPES.POST_ENGAGEMENT_TIME,
      source: 'web',
      sessionId,
      occurredAt: new Date(startTime.getTime() + (sessionDuration - 5) * 1000),
      propsJson: {
        postId,
        engagementTimeSeconds: engagementTime,
        scrollDepthPercentage: isLongSession ? Math.floor(Math.random() * 40) + 60 : Math.floor(Math.random() * 50) + 25,
      },
    });
  }

  // Maybe generate social share event (5% chance)
  if (Math.random() > 0.95) {
    const platforms = ['twitter', 'facebook', 'linkedin', 'pinterest', 'email'];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    
    events.push({
      eventType: EVENT_TYPES.POST_SOCIAL_SHARE_CLICKED,
      source: 'web',
      sessionId,
      occurredAt: new Date(startTime.getTime() + Math.floor(Math.random() * sessionDuration) * 1000),
      propsJson: {
        postId,
        platform,
      },
    });
  }

  // Maybe generate email capture event (2% chance)
  if (Math.random() > 0.98) {
    const locations = ['sidebar', 'inline', 'popup', 'footer'];
    const location = locations[Math.floor(Math.random() * locations.length)];
    
    events.push({
      eventType: EVENT_TYPES.POST_EMAIL_CAPTURE,
      source: 'web',
      sessionId,
      occurredAt: new Date(startTime.getTime() + Math.floor(Math.random() * sessionDuration) * 1000),
      propsJson: {
        postId,
        email: `test${Math.floor(Math.random() * 10000)}@example.com`,
        captureLocation: location,
      },
    });
  }

  // Generate bounce event if it's a bounce
  if (isBounce) {
    events.push({
      eventType: EVENT_TYPES.POST_BOUNCE,
      source: 'web',
      sessionId,
      occurredAt: new Date(startTime.getTime() + sessionDuration * 1000),
      propsJson: {
        postId,
        bounce: true,
      },
    });
  }

  // Insert all events
  for (const event of events) {
    await prisma.event.create({
      data: event,
    });
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  generateSampleAnalyticsData();
}

export { generateSampleAnalyticsData };
