/**
 * POST /api/payouts/stripe-connect/onboard
 * Start Stripe Connect onboarding for authenticated creator
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

const onboardRequestSchema = z.object({
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
      include: { user: true },
    });

    if (!creator) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Creator profile not found' },
        { status: 404 }
      );
    }

    // Parse and validate request body
    const body = await req.json().catch(() => ({}));
    const validation = onboardRequestSchema.safeParse(body);
    
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

    // Check if creator already has a Stripe account
    const hasExistingAccount = !!creator.stripeAccountId;

    // Generate onboarding link (creates account if doesn't exist)
    const onboardingLink = await stripeConnectService.getOnboardingLink(
      creator.id,
      finalReturnUrl,
      finalRefreshUrl
    );

    // Audit log
    await auditService.log({
      action: hasExistingAccount ? 'STRIPE_ONBOARDING_LINK_GENERATED' : 'STRIPE_ACCOUNT_CREATED',
      entityType: 'creator',
      entityId: creator.id,
      userId: userId,
      after: {
        stripeAccountId: creator.stripeAccountId,
        hasExistingAccount,
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
        isNewAccount: !hasExistingAccount,
      },
    }, { status: hasExistingAccount ? 200 : 201 });

  } catch (error) {
    console.error('[StripeConnect:Onboard] Error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to start onboarding' },
      { status: 500 }
    );
  }
}
