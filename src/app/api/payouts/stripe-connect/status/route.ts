/**
 * GET /api/payouts/stripe-connect/status
 * Check Stripe Connect account onboarding status
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeConnectService } from '@/modules/creators/services/stripe-connect.service';

const stripeConnectService = new StripeConnectService(prisma);

export async function GET(req: NextRequest) {
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

    // Get account status from Stripe (syncs with DB)
    const status = await stripeConnectService.getAccountStatus(creator.id);

    // Return status information
    return NextResponse.json({
      success: true,
      data: {
        hasAccount: status.hasAccount,
        accountId: creator.stripeAccountId,
        onboardingStatus: status.onboardingStatus,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        requiresAction: status.requiresAction,
        requirements: {
          currentlyDue: status.currentlyDue,
          errors: status.errors,
        },
        isFullyOnboarded: status.hasAccount && 
                          status.onboardingStatus === 'completed' && 
                          status.payoutsEnabled &&
                          !status.requiresAction,
      },
    });

  } catch (error) {
    console.error('[StripeConnect:Status] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve account status' },
      { status: 500 }
    );
  }
}
