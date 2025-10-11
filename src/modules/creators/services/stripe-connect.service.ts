/**
 * Stripe Connect Service
 * Handles Stripe Connect account creation and onboarding for creators
 */

import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import type {
  StripeAccountLinkResponse,
  StripeAccountStatusResponse,
} from '../types/creator.types';
import {
  CreatorNotFoundError,
  StripeAccountCreationFailedError,
  StripeOnboardingIncompleteError,
} from '../errors/creator.errors';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

export class StripeConnectService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Create Stripe Connect Express account for creator
   */
  async createAccount(creatorId: string): Promise<string> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
      include: { user: true },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Check if account already exists
    if (creator.stripeAccountId) {
      return creator.stripeAccountId;
    }

    try {
      // Create Stripe Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US', // TODO: Make this configurable based on creator location
        email: creator.user.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: false }, // Creators receive payouts only
          transfers: { requested: true },
        },
        metadata: {
          creatorId: creator.id,
          userId: creator.userId,
          stageName: creator.stageName,
        },
      });

      // Update creator with Stripe account ID
      await this.prisma.creator.update({
        where: { id: creatorId },
        data: {
          stripeAccountId: account.id,
          onboardingStatus: 'pending',
        },
      });

      return account.id;
    } catch (error) {
      throw new StripeAccountCreationFailedError(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Generate onboarding link for creator
   */
  async getOnboardingLink(
    creatorId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<StripeAccountLinkResponse> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    // Create account if doesn't exist
    let stripeAccountId = creator.stripeAccountId;
    if (!stripeAccountId) {
      stripeAccountId = await this.createAccount(creatorId);
    }

    try {
      // Create account link
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      // Update onboarding status
      await this.prisma.creator.update({
        where: { id: creatorId },
        data: { onboardingStatus: 'in_progress' },
      });

      return {
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      };
    } catch (error) {
      throw new StripeAccountCreationFailedError(
        error instanceof Error ? error.message : 'Failed to create onboarding link'
      );
    }
  }

  /**
   * Refresh onboarding link (if expired)
   */
  async refreshOnboardingLink(
    creatorId: string,
    returnUrl: string,
    refreshUrl: string
  ): Promise<StripeAccountLinkResponse> {
    return this.getOnboardingLink(creatorId, returnUrl, refreshUrl);
  }

  /**
   * Get account status and sync with database
   */
  async getAccountStatus(creatorId: string): Promise<StripeAccountStatusResponse> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    if (!creator.stripeAccountId) {
      return {
        hasAccount: false,
        onboardingStatus: 'pending',
        chargesEnabled: false,
        payoutsEnabled: false,
        requiresAction: true,
        currentlyDue: [],
        errors: [],
      };
    }

    try {
      const account = await stripe.accounts.retrieve(creator.stripeAccountId);

      const status: StripeAccountStatusResponse = {
        hasAccount: true,
        onboardingStatus: account.details_submitted ? 'completed' : creator.onboardingStatus,
        chargesEnabled: account.charges_enabled || false,
        payoutsEnabled: account.payouts_enabled || false,
        requiresAction: !account.details_submitted,
        currentlyDue: account.requirements?.currently_due || [],
        errors: account.requirements?.errors?.map(e => e.reason) || [],
      };

      // Update onboarding status if changed
      if (status.onboardingStatus !== creator.onboardingStatus) {
        await this.prisma.creator.update({
          where: { id: creatorId },
          data: { onboardingStatus: status.onboardingStatus },
        });
      }

      return status;
    } catch (error) {
      throw new StripeAccountCreationFailedError(
        error instanceof Error ? error.message : 'Failed to retrieve account status'
      );
    }
  }

  /**
   * Sync account status from Stripe
   */
  async syncAccountStatus(stripeAccountId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { stripeAccountId },
    });

    if (!creator) {
      console.error(`Creator not found for Stripe account ${stripeAccountId}`);
      return;
    }

    try {
      const account = await stripe.accounts.retrieve(stripeAccountId);

      const newStatus = account.details_submitted ? 'completed' : 'in_progress';

      if (newStatus !== creator.onboardingStatus) {
        await this.prisma.creator.update({
          where: { id: creator.id },
          data: { onboardingStatus: newStatus },
        });
      }
    } catch (error) {
      console.error(`Failed to sync Stripe account ${stripeAccountId}:`, error);
      
      // Update status to failed
      await this.prisma.creator.update({
        where: { id: creator.id },
        data: { onboardingStatus: 'failed' },
      });
    }
  }

  /**
   * Validate payout eligibility
   */
  async validatePayoutEligibility(creatorId: string): Promise<boolean> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator) {
      throw new CreatorNotFoundError(creatorId);
    }

    if (!creator.stripeAccountId) {
      return false;
    }

    if (creator.onboardingStatus !== 'completed') {
      return false;
    }

    try {
      const account = await stripe.accounts.retrieve(creator.stripeAccountId);
      return account.payouts_enabled || false;
    } catch {
      return false;
    }
  }

  /**
   * Handle Stripe webhook - Account Updated
   */
  async handleAccountUpdated(accountId: string): Promise<void> {
    await this.syncAccountStatus(accountId);
  }

  /**
   * Delete Stripe account (when creator deletes profile)
   */
  async deleteAccount(creatorId: string): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
    });

    if (!creator?.stripeAccountId) {
      return;
    }

    try {
      await stripe.accounts.del(creator.stripeAccountId);
    } catch (error) {
      console.error(`Failed to delete Stripe account ${creator.stripeAccountId}:`, error);
      // Don't throw error - continue with local deletion
    }
  }
}
