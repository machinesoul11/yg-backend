/**
 * GET /api/payouts/stripe-connect/account
 * Get detailed Stripe Connect account information
 * 
 * PATCH /api/payouts/stripe-connect/account
 * Update Stripe Connect account information
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StripeConnectService } from '@/modules/creators/services/stripe-connect.service';
import { AuditService } from '@/lib/services/audit.service';
import Stripe from 'stripe';
import { z } from 'zod';

// Initialize Stripe with fallback for build time
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-09-30.clover',
});

const auditService = new AuditService(prisma);
const stripeConnectService = new StripeConnectService(prisma);

const updateAccountSchema = z.object({
  businessProfile: z.object({
    name: z.string().min(1).max(255).optional(),
    url: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    productDescription: z.string().max(500).optional(),
  }).optional(),
  settings: z.object({
    payouts: z.object({
      schedule: z.object({
        interval: z.enum(['daily', 'weekly', 'monthly', 'manual']).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

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

    // Check if creator has a Stripe account
    if (!creator.stripeAccountId) {
      return NextResponse.json({
        success: true,
        data: {
          hasAccount: false,
          message: 'No Stripe account found. Please start onboarding first.',
        },
      });
    }

    // Retrieve account details from Stripe with expanded data
    const account = await stripe.accounts.retrieve(creator.stripeAccountId, {
      expand: ['capabilities', 'external_accounts'],
    });

    // Get requirements from our service
    const requirements = await stripeConnectService.getAccountRequirements(creator.id);

    // Transform to frontend-friendly format
    const accountDetails = {
      id: account.id,
      type: account.type,
      country: account.country,
      email: account.email,
      
      // Business profile
      businessProfile: account.business_profile ? {
        name: account.business_profile.name,
        url: account.business_profile.url,
        supportEmail: account.business_profile.support_email,
        supportPhone: account.business_profile.support_phone,
        supportUrl: account.business_profile.support_url,
        productDescription: account.business_profile.product_description,
        mcc: account.business_profile.mcc,
      } : null,

      // Capabilities
      capabilities: account.capabilities ? Object.entries(account.capabilities).map(([name, cap]) => ({
        name,
        status: (cap as any)?.status || 'inactive',
      })) : [],

      // External accounts (masked for security)
      externalAccounts: account.external_accounts?.data.map((acc: any) => ({
        id: acc.id,
        object: acc.object,
        bankName: acc.bank_name,
        last4: acc.last4,
        currency: acc.currency,
        country: acc.country,
        routingNumber: acc.routing_number ? `***${acc.routing_number.slice(-4)}` : null,
        default: acc.default_for_currency,
      })) || [],

      // Account status
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,

      // Requirements
      requirements: {
        currentlyDue: requirements.filter(r => r.requirementType === 'currently_due'),
        eventuallyDue: requirements.filter(r => r.requirementType === 'eventually_due'),
        pastDue: requirements.filter(r => r.requirementType === 'past_due'),
        pendingVerification: requirements.filter(r => r.requirementType === 'pending_verification'),
      },

      // Metadata
      created: account.created,
      metadata: account.metadata,
    };

    return NextResponse.json({
      success: true,
      data: accountDetails,
    });

  } catch (error) {
    console.error('[StripeConnect:GetAccount] Error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: 'Stripe Error', message: error.message },
        { status: error.statusCode || 500 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve account details' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
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
        },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const validation = updateAccountSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const updateData = validation.data;

    // Build Stripe update object
    const stripeUpdateData: Stripe.AccountUpdateParams = {};

    if (updateData.businessProfile) {
      stripeUpdateData.business_profile = {
        name: updateData.businessProfile.name,
        url: updateData.businessProfile.url,
        support_email: updateData.businessProfile.supportEmail,
        support_phone: updateData.businessProfile.supportPhone,
        product_description: updateData.businessProfile.productDescription,
      };
    }

    if (updateData.settings?.payouts?.schedule) {
      stripeUpdateData.settings = {
        payouts: {
          schedule: {
            interval: updateData.settings.payouts.schedule.interval,
          },
        },
      };
    }

    if (updateData.metadata) {
      stripeUpdateData.metadata = updateData.metadata as Record<string, string>;
    }

    // Update account via service
    await stripeConnectService.updateAccountInfo(creator.id, stripeUpdateData);

    // Audit log
    await auditService.log({
      action: 'STRIPE_ACCOUNT_UPDATED',
      entityType: 'creator',
      entityId: creator.id,
      userId: userId,
      after: {
        stripeAccountId: creator.stripeAccountId,
        updatedFields: Object.keys(updateData),
      },
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    // Retrieve updated account details
    const account = await stripe.accounts.retrieve(creator.stripeAccountId, {
      expand: ['capabilities', 'external_accounts'],
    });

    // Return updated account data
    return NextResponse.json({
      success: true,
      message: 'Account updated successfully',
      data: {
        id: account.id,
        businessProfile: account.business_profile ? {
          name: account.business_profile.name,
          url: account.business_profile.url,
          supportEmail: account.business_profile.support_email,
          supportPhone: account.business_profile.support_phone,
          productDescription: account.business_profile.product_description,
        } : null,
        metadata: account.metadata,
      },
    });

  } catch (error) {
    console.error('[StripeConnect:UpdateAccount] Error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      // Handle specific Stripe errors
      if (error.type === 'StripeInvalidRequestError') {
        return NextResponse.json(
          { 
            error: 'Invalid Request', 
            message: error.message,
            details: 'The requested change may conflict with verified information or regulatory requirements.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Stripe Error', message: error.message },
        { status: error.statusCode || 500 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update account' },
      { status: 500 }
    );
  }
}
