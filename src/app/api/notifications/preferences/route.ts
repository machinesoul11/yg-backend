/**
 * Notifications API - Preferences Endpoint
 * 
 * REST endpoints for managing user notification preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { NotificationPreferencesService } from '@/modules/system/services/notification-preferences.service';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';

const preferencesService = new NotificationPreferencesService(prisma, redis);

/**
 * GET /api/notifications/preferences
 * Get user's notification preferences
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get preferences
    const preferences = await preferencesService.getPreferences(session.user.id);

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Validation schema for updating preferences
const updatePreferencesSchema = z.object({
  enabledTypes: z.array(
    z.enum(['LICENSE', 'PAYOUT', 'ROYALTY', 'PROJECT', 'SYSTEM', 'MESSAGE'])
  ).optional(),
  digestFrequency: z.enum(['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER']).optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
});

/**
 * PATCH /api/notifications/preferences
 * Update user's notification preferences
 */
export async function PATCH(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validated = updatePreferencesSchema.parse(body);

    // Validate email enabled only if user has verified email
    if (validated.emailEnabled === true) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email_verified: true },
      });

      if (!user?.email_verified) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Cannot enable email notifications without verified email address' 
          },
          { status: 400 }
        );
      }
    }

    // Update preferences
    const preferences = await preferencesService.updatePreferences(
      session.user.id,
      {
        ...validated,
        enabledTypes: validated.enabledTypes as NotificationType[] | undefined,
      }
    );

    return NextResponse.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
