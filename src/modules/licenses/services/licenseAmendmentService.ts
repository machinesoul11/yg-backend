/**
 * License Amendment Service
 * Manages formal modifications to license terms requiring multi-party approval
 */

import { prisma } from '@/lib/db';
import { AuditService } from '@/lib/services/audit.service';
import { EmailService } from '@/lib/services/email/email.service';

const auditService = new AuditService(prisma);
const emailService = new EmailService();

export interface AmendmentProposal {
  licenseId: string;
  proposedBy: string;
  proposedByRole: 'brand' | 'creator' | 'admin';
  amendmentType: 'FINANCIAL' | 'SCOPE' | 'DATES' | 'OTHER';
  justification: string;
  changes: {
    field: string;
    currentValue: any;
    proposedValue: any;
  }[];
  approvalDeadlineDays?: number;
}

export interface AmendmentApprovalInput {
  amendmentId: string;
  approverId: string;
  approverRole: 'brand' | 'creator' | 'admin';
  action: 'approve' | 'reject';
  comments?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class LicenseAmendmentService {
  /**
   * Propose an amendment to an existing license
   */
  async proposeAmendment(proposal: AmendmentProposal): Promise<any> {
    // Fetch license with all necessary relations
    const license = await prisma.license.findUnique({
      where: { id: proposal.licenseId },
      include: {
        brand: { include: { user: true } },
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: { include: { user: true } },
              },
            },
          },
        },
        // amendments: true,
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Validate license status - only certain statuses can be amended
    if (!['ACTIVE', 'PENDING_APPROVAL'].includes(license.status)) {
      throw new Error(`Cannot amend ${license.status.toLowerCase()} licenses`);
    }

    // Validate proposer has permission
    await this.validateProposer(license, proposal);

    // Calculate amendment number
    const amendmentCount = license.amendmentCount || 0;
    const amendmentNumber = amendmentCount + 1;

    // Prepare amendment data
    const fieldsChanged = proposal.changes.map((c) => c.field);
    const beforeValues: Record<string, any> = {};
    const afterValues: Record<string, any> = {};

    proposal.changes.forEach((change) => {
      beforeValues[change.field] = change.currentValue;
      afterValues[change.field] = change.proposedValue;
    });

    const approvalDeadline = proposal.approvalDeadlineDays
      ? new Date(Date.now() + proposal.approvalDeadlineDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // Default 14 days

    // Create amendment in transaction
    const amendment = await prisma.$transaction(async (tx) => {
      const created = await tx.$executeRaw`
        INSERT INTO license_amendments (
          id, license_id, amendment_number, proposed_by, proposed_by_role,
          status, amendment_type, justification, fields_changed, before_values,
          after_values, approval_deadline, created_at, updated_at
        ) VALUES (
          gen_random_uuid()::text,
          ${proposal.licenseId},
          ${amendmentNumber},
          ${proposal.proposedBy},
          ${proposal.proposedByRole},
          'PROPOSED',
          ${proposal.amendmentType},
          ${proposal.justification},
          ${JSON.stringify(fieldsChanged)}::jsonb,
          ${JSON.stringify(beforeValues)}::jsonb,
          ${JSON.stringify(afterValues)}::jsonb,
          ${approvalDeadline},
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      // Get the created amendment
      const amendmentId = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM license_amendments 
        WHERE license_id = ${proposal.licenseId} 
        AND amendment_number = ${amendmentNumber}
        LIMIT 1
      `;

      if (!amendmentId || amendmentId.length === 0) {
        throw new Error('Failed to create amendment');
      }

      const amendId = amendmentId[0].id;

      // Create approval records for all required approvers
      const approvers = await this.getRequiredApprovers(license, proposal.proposedByRole);

      for (const approver of approvers) {
        await tx.$executeRaw`
          INSERT INTO license_amendment_approvals (
            id, amendment_id, approver_id, approver_role, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid()::text,
            ${amendId},
            ${approver.id},
            ${approver.role},
            'PENDING',
            NOW(),
            NOW()
          )
        `;
      }

      return amendId;
    });

    // Send notifications to all approvers
    await this.notifyAmendmentProposed(license, proposal, amendment);

    // Log audit event
    await auditService.log({
      action: 'amendment_proposed',
      entityType: 'license',
      entityId: proposal.licenseId,
      userId: proposal.proposedBy,
      before: beforeValues,
      after: afterValues,
    });

    return amendment;
  }

  /**
   * Process approval or rejection of an amendment
   */
  async processAmendmentApproval(input: AmendmentApprovalInput): Promise<any> {
    // Get amendment with license and approval records
    const amendment = await prisma.$queryRaw<
      Array<{
        id: string;
        license_id: string;
        status: string;
        after_values: any;
      }>
    >`
      SELECT * FROM license_amendments WHERE id = ${input.amendmentId} LIMIT 1
    `;

    if (!amendment || amendment.length === 0) {
      throw new Error('Amendment not found');
    }

    const amendmentData = amendment[0];

    if (amendmentData.status !== 'PROPOSED') {
      throw new Error('Amendment is not pending approval');
    }

    // Update approval record
    await prisma.$executeRaw`
      UPDATE license_amendment_approvals
      SET 
        status = ${input.action === 'approve' ? 'APPROVED' : 'REJECTED'},
        ${input.action === 'approve' ? 'approved_at' : 'rejected_at'} = NOW(),
        comments = ${input.comments || null},
        ip_address = ${input.ipAddress || null},
        user_agent = ${input.userAgent || null},
        updated_at = NOW()
      WHERE amendment_id = ${input.amendmentId}
        AND approver_id = ${input.approverId}
    `;

    // Check if all approvals are collected
    const approvals = await prisma.$queryRaw<
      Array<{ status: string }>
    >`
      SELECT status FROM license_amendment_approvals
      WHERE amendment_id = ${input.amendmentId}
    `;

    const allApproved = approvals.every((a) => a.status === 'APPROVED');
    const anyRejected = approvals.some((a) => a.status === 'REJECTED');

    if (anyRejected) {
      // Mark amendment as rejected
      await prisma.$executeRaw`
        UPDATE license_amendments
        SET status = 'REJECTED', rejected_at = NOW(), updated_at = NOW()
        WHERE id = ${input.amendmentId}
      `;

      await this.notifyAmendmentRejected(amendmentData.license_id, input.amendmentId);

      return { status: 'REJECTED' };
    }

    if (allApproved) {
      // All approved - apply the amendment
      await this.applyAmendment(input.amendmentId, amendmentData.license_id, amendmentData.after_values);

      return { status: 'APPROVED' };
    }

    // Still waiting for more approvals
    return { status: 'PENDING', remainingApprovals: approvals.filter((a) => a.status === 'PENDING').length };
  }

  /**
   * Apply approved amendment to license
   */
  private async applyAmendment(amendmentId: string, licenseId: string, afterValues: any): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Build update data from afterValues
      const updateData: any = {};

      if (afterValues.feeCents !== undefined) updateData.feeCents = afterValues.feeCents;
      if (afterValues.revShareBps !== undefined) updateData.revShareBps = afterValues.revShareBps;
      if (afterValues.scopeJson !== undefined) updateData.scopeJson = afterValues.scopeJson;
      if (afterValues.endDate !== undefined) updateData.endDate = new Date(afterValues.endDate);
      if (afterValues.paymentTerms !== undefined) updateData.paymentTerms = afterValues.paymentTerms;
      if (afterValues.billingFrequency !== undefined)
        updateData.billingFrequency = afterValues.billingFrequency;

      // Update license
      await tx.license.update({
        where: { id: licenseId },
        data: {
          ...updateData,
          amendmentCount: { increment: 1 },
        },
      });

      // Mark amendment as approved
      await tx.$executeRaw`
        UPDATE license_amendments
        SET status = 'APPROVED', approved_at = NOW(), updated_at = NOW()
        WHERE id = ${amendmentId}
      `;
    });

    // Notify all parties
    await this.notifyAmendmentApproved(licenseId, amendmentId);

    // Log audit event
    await auditService.log({
      action: 'amendment_applied',
      entityType: 'license',
      entityId: licenseId,
      after: afterValues,
    });
  }

  /**
   * Get all amendments for a license
   */
  async getAmendments(licenseId: string) {
    return prisma.$queryRaw<Array<any>>`
      SELECT 
        a.*,
        (
          SELECT json_agg(json_build_object(
            'id', ap.id,
            'approver_id', ap.approver_id,
            'approver_role', ap.approver_role,
            'status', ap.status,
            'approved_at', ap.approved_at,
            'rejected_at', ap.rejected_at,
            'comments', ap.comments
          ))
          FROM license_amendment_approvals ap
          WHERE ap.amendment_id = a.id
        ) as approvals
      FROM license_amendments a
      WHERE a.license_id = ${licenseId}
      ORDER BY a.amendment_number DESC
    `;
  }

  /**
   * Get pending amendments for a user to approve
   */
  async getPendingAmendmentsForUser(userId: string, userRole: string) {
    return prisma.$queryRaw<Array<any>>`
      SELECT 
        a.*,
        l.brand_id,
        l.ip_asset_id,
        ap.id as approval_id,
        ap.status as approval_status
      FROM license_amendments a
      INNER JOIN license_amendment_approvals ap ON ap.amendment_id = a.id
      INNER JOIN licenses l ON l.id = a.license_id
      WHERE ap.approver_id = ${userId}
        AND ap.status = 'PENDING'
        AND a.status = 'PROPOSED'
      ORDER BY a.proposed_at DESC
    `;
  }

  /**
   * Get amendment history/timeline for a license
   */
  async getAmendmentHistory(licenseId: string) {
    const amendments = await this.getAmendments(licenseId);

    return amendments.map((amendment) => ({
      amendmentNumber: amendment.amendment_number,
      type: amendment.amendment_type,
      proposedAt: amendment.proposed_at,
      approvedAt: amendment.approved_at,
      rejectedAt: amendment.rejected_at,
      status: amendment.status,
      changes: amendment.fields_changed,
      justification: amendment.justification,
      approvals: amendment.approvals,
    }));
  }

  // Private helper methods

  private async validateProposer(license: any, proposal: AmendmentProposal): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: proposal.proposedBy },
      include: { brand: true, creator: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Brands can propose amendments to their licenses
    if (proposal.proposedByRole === 'brand') {
      if (!user.brand || user.brand.id !== license.brandId) {
        throw new Error('Only the brand owner can propose amendments');
      }
    }

    // Creators can propose amendments to licenses on their IP
    if (proposal.proposedByRole === 'creator') {
      const ownsAsset = license.ipAsset.ownerships.some(
        (o: any) => o.creatorId === user.creator?.id
      );
      if (!ownsAsset) {
        throw new Error('Only IP owners can propose amendments');
      }
    }
  }

  private async getRequiredApprovers(
    license: any,
    proposerRole: string
  ): Promise<Array<{ id: string; role: string }>> {
    const approvers: Array<{ id: string; role: string }> = [];

    // If brand proposed, creators must approve
    if (proposerRole === 'brand') {
      for (const ownership of license.ipAsset.ownerships) {
        approvers.push({
          id: ownership.creator.userId,
          role: 'creator',
        });
      }
    }

    // If creator proposed, brand must approve
    if (proposerRole === 'creator') {
      approvers.push({
        id: license.brand.userId,
        role: 'brand',
      });
    }

    return approvers;
  }

  private async notifyAmendmentProposed(license: any, proposal: AmendmentProposal, amendmentId: string): Promise<void> {
    // Send email notifications to all required approvers
    // Implementation would use EmailService
  }

  private async notifyAmendmentApproved(licenseId: string, amendmentId: string): Promise<void> {
    // Send confirmation emails
  }

  private async notifyAmendmentRejected(licenseId: string, amendmentId: string): Promise<void> {
    // Send rejection notifications
  }
}

export const licenseAmendmentService = new LicenseAmendmentService();
