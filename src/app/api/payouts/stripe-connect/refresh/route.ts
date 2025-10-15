/**
 * POST /api/payouts/stripe-connect/refresh
 * Refresh expired Stripe Connect onboarding link
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeConnectService } from '@/modules/creators/services/stripe-connect.service';
import { AuditService } from '@/lib/services/audit.service';
import { z } from 'zod';

const auditService = new AuditService(prisma);
const stripeConnectService = new StripeConnectService(prisma);

const refreshRequestSchema = z.object({
  returnUrl: z.string().url().optional(),
  refreshUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Find creator profile
    const creator = await prisma.creator.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!creator) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Creator profile not found' },
        { status: 404 }
      );
    }

    // Check if creator has a Stripe account
    if (!creator.stripeAccountId) {
      return NextResponse.json(
        { 
          error: 'Bad Request', 
          message: 'No Stripe account found. Please start onboarding first.',
          action: 'start_onboarding',
        },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await req.json().catch(() => ({}));
    const validation = refreshRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { returnUrl, refreshUrl } = validation.data;

    // Use provided URLs or defaults
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com';
    const finalReturnUrl = returnUrl || `${baseUrl}/dashboard/settings/payouts/return`;
    const finalRefreshUrl = refreshUrl || `${baseUrl}/dashboard/settings/payouts/refresh`;

    // Check if onboarding is already complete
    const accountStatus = await stripeConnectService.getAccountStatus(creator.id);
    
    if (accountStatus.onboardingStatus === 'completed' && 
        accountStatus.payoutsEnabled && 
        !accountStatus.requiresAction) {
      return NextResponse.json({
        success: true,
        message: 'Onboarding is already complete',
        data: {
          onboardingComplete: true,
          accountId: creator.stripeAccountId,
          payoutsEnabled: accountStatus.payoutsEnabled,
        },
      });
    }

    // Generate fresh onboarding link
    const onboardingLink = await stripeConnectService.refreshOnboardingLink(
      creator.id,
      finalReturnUrl,
      finalRefreshUrl
    );

    // Audit log
    await auditService.log({
      action: 'STRIPE_ONBOARDING_LINK_REFRESHED',
      entityType: 'creator',
      entityId: creator.id,
      userId: userId,
      after: {
        stripeAccountId: creator.stripeAccountId,
        onboardingStatus: accountStatus.onboardingStatus,
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    // Return response
    return NextResponse.json({
      success: true,
      data: {
        url: onboardingLink.url,
        expiresAt: onboardingLink.expiresAt,
        accountId: creator.stripeAccountId,
      },
    });

  } catch (error) {
    console.error('[StripeConnect:Refresh] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to refresh onboarding link' },
      { status: 500 }
    );
  }
}
