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

      // Store onboarding session for tracking
      await this.prisma.stripeOnboardingSession.create({
        data: {
          creatorId,
          stripeAccountId,
          accountLinkUrl: accountLink.url,
          returnUrl,
          refreshUrl,
          expiresAt: new Date(accountLink.expires_at * 1000),
        },
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

      // Sync capabilities
      await this.syncAccountCapabilities(creator.id, stripeAccountId, account);

      // Sync requirements
      await this.syncAccountRequirements(creator.id, stripeAccountId, account);

      // Mark completed onboarding sessions
      if (account.details_submitted) {
        await this.prisma.stripeOnboardingSession.updateMany({
          where: {
            creatorId: creator.id,
            completedAt: null,
          },
          data: {
            completedAt: new Date(),
          },
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

  /**
   * Sync account capabilities from Stripe
   */
  private async syncAccountCapabilities(
    creatorId: string,
    stripeAccountId: string,
    account: any
  ): Promise<void> {
    if (!account.capabilities) return;

    for (const [capability, capabilityStatus] of Object.entries(account.capabilities)) {
      const status = (capabilityStatus as any)?.status || 'inactive';

      await this.prisma.stripeAccountCapability.upsert({
        where: {
          stripeAccountId_capability: {
            stripeAccountId,
            capability,
          },
        },
        create: {
          creatorId,
          stripeAccountId,
          capability,
          status,
          requestedAt: status !== 'inactive' ? new Date() : null,
          enabledAt: status === 'active' ? new Date() : null,
        },
        update: {
          status,
          enabledAt: status === 'active' && !account.enabledAt ? new Date() : undefined,
          disabledAt: status === 'inactive' ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Sync account requirements from Stripe
   */
  private async syncAccountRequirements(
    creatorId: string,
    stripeAccountId: string,
    account: any
  ): Promise<void> {
    if (!account.requirements) return;

    const requirements = account.requirements;
    const allRequirements: Array<{ type: string; fields: string[] }> = [
      { type: 'currently_due', fields: requirements.currently_due || [] },
      { type: 'eventually_due', fields: requirements.eventually_due || [] },
      { type: 'past_due', fields: requirements.past_due || [] },
      { type: 'pending_verification', fields: requirements.pending_verification || [] },
    ];

    // Mark all existing requirements as resolved if they're no longer in Stripe's response
    const allCurrentFields = allRequirements.flatMap(r => r.fields);
    await this.prisma.stripeAccountRequirement.updateMany({
      where: {
        stripeAccountId,
        fieldName: { notIn: allCurrentFields },
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
      },
    });

    // Create or update current requirements
    for (const { type, fields } of allRequirements) {
      for (const fieldName of fields) {
        const deadline = type === 'eventually_due' && requirements.current_deadline
          ? new Date(requirements.current_deadline * 1000)
          : null;

        const errorInfo = requirements.errors?.find((e: any) => 
          e.requirement === fieldName
        );

        await this.prisma.stripeAccountRequirement.upsert({
          where: {
            stripeAccountId_fieldName: {
              stripeAccountId,
              fieldName,
            },
          },
          create: {
            creatorId,
            stripeAccountId,
            requirementType: type,
            fieldName,
            deadline,
            errorCode: errorInfo?.code,
            errorReason: errorInfo?.reason,
          },
          update: {
            requirementType: type,
            deadline,
            errorCode: errorInfo?.code,
            errorReason: errorInfo?.reason,
            resolvedAt: null, // Mark as unresolved if it reappears
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * Check if account has specific capability enabled
   */
  async checkCapability(creatorId: string, capability: string): Promise<boolean> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator?.stripeAccountId) {
      return false;
    }

    const capabilityRecord = await this.prisma.stripeAccountCapability.findUnique({
      where: {
        stripeAccountId_capability: {
          stripeAccountId: creator.stripeAccountId,
          capability,
        },
      },
    });

    return capabilityRecord?.status === 'active';
  }

  /**
   * Get all current requirements for an account
   */
  async getAccountRequirements(creatorId: string): Promise<any[]> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator?.stripeAccountId) {
      return [];
    }

    const requirements = await this.prisma.stripeAccountRequirement.findMany({
      where: {
        stripeAccountId: creator.stripeAccountId,
        resolvedAt: null,
      },
      orderBy: [
        { requirementType: 'asc' }, // Show currently_due first
        { fieldName: 'asc' },
      ],
    });

    return requirements.map(req => ({
      fieldName: req.fieldName,
      requirementType: req.requirementType,
      deadline: req.deadline,
      errorCode: req.errorCode,
      errorReason: req.errorReason,
      description: this.getRequirementDescription(req.fieldName),
    }));
  }

  /**
   * Get human-readable description for requirement field
   */
  private getRequirementDescription(fieldName: string): string {
    const descriptions: Record<string, string> = {
      'individual.id_number': 'Government-issued ID number (SSN or EIN)',
      'individual.dob.day': 'Date of birth - day',
      'individual.dob.month': 'Date of birth - month',
      'individual.dob.year': 'Date of birth - year',
      'individual.first_name': 'Legal first name',
      'individual.last_name': 'Legal last name',
      'individual.address.line1': 'Street address',
      'individual.address.city': 'City',
      'individual.address.state': 'State or province',
      'individual.address.postal_code': 'Postal code',
      'individual.verification.document': 'Government-issued ID (photo)',
      'individual.verification.additional_document': 'Additional verification document',
      'business_profile.url': 'Business website URL',
      'business_profile.mcc': 'Business category code',
      'tos_acceptance.date': 'Terms of service acceptance date',
      'tos_acceptance.ip': 'IP address when accepting terms',
      'external_account': 'Bank account information for payouts',
    };

    return descriptions[fieldName] || fieldName.replace(/_/g, ' ').replace(/\./g, ' - ');
  }

  /**
   * Update account information (for verification updates)
   */
  async updateAccountInfo(creatorId: string, updateData: any): Promise<void> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId, deletedAt: null },
    });

    if (!creator?.stripeAccountId) {
      throw new CreatorNotFoundError(creatorId);
    }

    try {
      await stripe.accounts.update(creator.stripeAccountId, updateData);
      
      // Trigger a sync to update our database
      await this.syncAccountStatus(creator.stripeAccountId);
    } catch (error) {
      throw new StripeAccountCreationFailedError(
        error instanceof Error ? error.message : 'Failed to update account'
      );
    }
  }
}
