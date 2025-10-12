/**
 * License Signing Service
 * Digital signature and license execution
 */

import { prisma } from '@/lib/db';
import { EmailService } from '@/lib/services/email/email.service';
import { AuditService } from '@/lib/services/audit.service';
import { licenseTermsGenerationService } from './licenseTermsGenerationService';
import type { License } from '@prisma/client';
import * as crypto from 'crypto';

const auditService = new AuditService(prisma);

/**
 * Signature data
 */
export interface SignatureData {
  userId: string;
  userRole: 'creator' | 'brand';
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  licenseTermsHash: string;
}

/**
 * Signing result
 */
export interface SigningResult {
  license: License;
  signatureProof: string;
  allPartiesSigned: boolean;
  executedAt?: Date;
  message: string;
}

/**
 * Signature verification result
 */
export interface SignatureVerification {
  valid: boolean;
  signedBy: {
    userId: string;
    role: string;
    timestamp: Date;
  }[];
  licenseId: string;
  status: string;
  termsHash: string;
}

/**
 * License Signing Service
 */
export class LicenseSigningService {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Sign a license
   */
  async signLicense(
    licenseId: string,
    userId: string,
    userRole: 'creator' | 'brand',
    context: {
      ipAddress: string;
      userAgent: string;
    }
  ): Promise<SigningResult> {
    // Get license with full details
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Verify license is in signable state
    if (license.status !== 'PENDING_APPROVAL' && license.status !== 'DRAFT') {
      throw new Error(
        `License cannot be signed in ${license.status} status. Must be in PENDING_APPROVAL or DRAFT.`
      );
    }

    // Verify user has permission to sign
    await this.verifySigningPermission(license, userId, userRole);

    // Generate or retrieve license terms
    const terms = await licenseTermsGenerationService.generateTerms(licenseId);
    const termsHash = this.generateTermsHash(terms.fullText);

    // Get existing signatures
    const metadata = (license.metadata as any) || {};
    const signatures = metadata.signatures || [];

    // Check if user already signed
    const existingSignature = signatures.find(
      (s: any) => s.userId === userId && s.role === userRole
    );

    if (existingSignature) {
      throw new Error('You have already signed this license');
    }

    // Create signature data
    const signatureData: SignatureData = {
      userId,
      userRole,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      timestamp: new Date(),
      licenseTermsHash: termsHash,
    };

    // Add signature
    signatures.push(signatureData);

    // Check if all required parties have signed
    const allPartiesSigned = this.checkAllPartiesSigned(license, signatures);

    // Update license
    const updatedLicense = await prisma.$transaction(async (tx) => {
      const updated = await tx.license.update({
        where: { id: licenseId },
        data: {
          ...(allPartiesSigned && {
            status: 'ACTIVE',
            signedAt: new Date(),
          }),
          signatureProof: this.generateSignatureProof(signatures, termsHash),
          metadata: {
            ...metadata,
            signatures,
            termsVersion: terms.version,
            termsHash,
            fullyExecutedAt: allPartiesSigned ? new Date().toISOString() : null,
          },
          updatedBy: userId,
        },
        include: {
          ipAsset: {
            include: {
              ownerships: {
                include: {
                  creator: {
                    include: {
                      user: true,
                    },
                  },
                },
              },
            },
          },
          brand: {
            include: {
              user: true,
            },
          },
        },
      });

      // Create audit trail
      await auditService.log({
        action: 'license.signed',
        entityType: 'license',
        entityId: licenseId,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        after: {
          userId,
          userRole,
          signedAt: signatureData.timestamp,
          allPartiesSigned,
          status: updated.status,
        },
      });

      // Log event
      await tx.event.create({
        data: {
          source: 'api',
          eventType: 'license.signed',
          actorType: userRole,
          actorId: userId,
          licenseId: license.id,
          propsJson: {
            licenseId: license.id,
            userRole,
            allPartiesSigned,
            executedAt: allPartiesSigned ? new Date().toISOString() : null,
          },
        },
      });

      return updated;
    });

    // Send notifications
    await this.sendSigningNotifications(updatedLicense, userRole, allPartiesSigned);

    // Generate message
    let message: string;
    if (allPartiesSigned) {
      message = 'License fully executed! All parties have signed. The license is now active.';
    } else {
      message = `Your signature has been recorded. Awaiting signature from ${userRole === 'creator' ? 'brand' : 'creators'}.`;
    }

    return {
      license: updatedLicense,
      signatureProof: updatedLicense.signatureProof || '',
      allPartiesSigned,
      executedAt: allPartiesSigned ? updatedLicense.signedAt || undefined : undefined,
      message,
    };
  }

  /**
   * Verify user has permission to sign
   */
  private async verifySigningPermission(
    license: any,
    userId: string,
    userRole: 'creator' | 'brand'
  ): Promise<void> {
    if (userRole === 'creator') {
      // Verify user is an owner of the asset
      const isOwner = license.ipAsset.ownerships.some(
        (o: any) => o.creator.userId === userId
      );

      if (!isOwner) {
        throw new Error(
          'You do not have permission to sign this license. Only asset owners can sign.'
        );
      }
    } else if (userRole === 'brand') {
      // Verify user is associated with the brand
      if (license.brand.userId !== userId) {
        throw new Error(
          'You do not have permission to sign this license. Only the brand owner can sign.'
        );
      }
    } else {
      throw new Error('Invalid user role');
    }
  }

  /**
   * Check if all required parties have signed
   */
  private checkAllPartiesSigned(license: any, signatures: SignatureData[]): boolean {
    // Check if all creators have signed
    const creatorsWhoSigned = new Set(
      signatures.filter((s) => s.userRole === 'creator').map((s) => s.userId)
    );

    const allCreatorsSigned = license.ipAsset.ownerships.every((o: any) =>
      creatorsWhoSigned.has(o.creator.userId)
    );

    // Check if brand has signed
    const brandSigned = signatures.some((s) => s.userRole === 'brand');

    return allCreatorsSigned && brandSigned;
  }

  /**
   * Generate cryptographic hash of license terms
   */
  private generateTermsHash(termsText: string): string {
    return crypto.createHash('sha256').update(termsText).digest('hex');
  }

  /**
   * Generate signature proof (cryptographic proof of all signatures)
   */
  private generateSignatureProof(signatures: SignatureData[], termsHash: string): string {
    const signatureString = signatures
      .map(
        (s) =>
          `${s.userId}:${s.userRole}:${s.timestamp.toISOString()}:${s.licenseTermsHash}`
      )
      .sort()
      .join('|');

    const combinedString = `${termsHash}:${signatureString}`;
    return crypto.createHash('sha256').update(combinedString).digest('hex');
  }

  /**
   * Verify signature proof
   */
  async verifySignature(licenseId: string): Promise<SignatureVerification> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const metadata = (license.metadata as any) || {};
    const signatures: SignatureData[] = metadata.signatures || [];
    const termsHash = metadata.termsHash || '';
    const storedProof = license.signatureProof;

    // Regenerate proof
    const calculatedProof = this.generateSignatureProof(signatures, termsHash);

    // Verify proof matches
    const valid = storedProof === calculatedProof;

    return {
      valid,
      signedBy: signatures.map((s) => ({
        userId: s.userId,
        role: s.userRole,
        timestamp: new Date(s.timestamp),
      })),
      licenseId: license.id,
      status: license.status,
      termsHash,
    };
  }

  /**
   * Withdraw signature (before license is fully executed)
   */
  async withdrawSignature(
    licenseId: string,
    userId: string,
    userRole: 'creator' | 'brand',
    reason: string
  ): Promise<License> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      include: {
        ipAsset: {
          include: {
            ownerships: {
              include: {
                creator: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        brand: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    // Cannot withdraw if license is already active
    if (license.status === 'ACTIVE') {
      throw new Error('Cannot withdraw signature from an active license. Use termination instead.');
    }

    const metadata = (license.metadata as any) || {};
    const signatures: SignatureData[] = metadata.signatures || [];

    // Find and remove signature
    const signatureIndex = signatures.findIndex(
      (s: any) => s.userId === userId && s.userRole === userRole
    );

    if (signatureIndex === -1) {
      throw new Error('Signature not found');
    }

    signatures.splice(signatureIndex, 1);

    // Update license
    const updated = await prisma.license.update({
      where: { id: licenseId },
      data: {
        status: 'DRAFT',
        signatureProof: signatures.length > 0 ? this.generateSignatureProof(signatures, metadata.termsHash) : null,
        metadata: {
          ...metadata,
          signatures,
          signatureWithdrawals: [
            ...(metadata.signatureWithdrawals || []),
            {
              userId,
              userRole,
              reason,
              withdrawnAt: new Date().toISOString(),
            },
          ],
        },
        updatedBy: userId,
      },
    });

    // Create audit trail
    await auditService.log({
      action: 'license.signature_withdrawn',
      entityType: 'license',
      entityId: licenseId,
      userId,
      after: {
        userId,
        userRole,
        reason,
      },
    });

    return updated;
  }

  /**
   * Send signing notifications
   */
  private async sendSigningNotifications(
    license: any,
    signerRole: 'creator' | 'brand',
    allPartiesSigned: boolean
  ): Promise<void> {
    const metadata = license.metadata as any;
    const referenceNumber = metadata?.referenceNumber || license.id;

    try {
      if (allPartiesSigned) {
        // Notify all parties that license is fully executed
        // Notify creators
        for (const ownership of license.ipAsset.ownerships) {
          if (ownership.creator.user.email) {
            await this.emailService.sendTransactional({
              email: ownership.creator.user.email,
              subject: 'License Fully Executed - Now Active',
              template: 'welcome', // TODO: Create proper template
              variables: {
                name: ownership.creator.stageName || ownership.creator.user.name || 'Creator',
              } as any,
            });
          }
        }

        // Notify brand
        if (license.brand.user.email) {
          await this.emailService.sendTransactional({
            email: license.brand.user.email,
            subject: 'License Fully Executed - Ready to Use',
            template: 'welcome', // TODO: Create proper template
            variables: {
              name: license.brand.companyName,
            } as any,
          });
        }
      } else {
        // Notify the other party that signature is pending
        if (signerRole === 'creator') {
          // Creator signed, notify brand
          if (license.brand.user.email) {
            await this.emailService.sendTransactional({
              email: license.brand.user.email,
              subject: 'Creator Signed - Your Signature Needed',
              template: 'welcome', // TODO: Create proper template
              variables: {
                name: license.brand.companyName,
              } as any,
            });
          }
        } else {
          // Brand signed, notify creators
          for (const ownership of license.ipAsset.ownerships) {
            if (ownership.creator.user.email) {
              await this.emailService.sendTransactional({
                email: ownership.creator.user.email,
                subject: 'Brand Signed - Your Signature Needed',
                template: 'welcome', // TODO: Create proper template
                variables: {
                  name: ownership.creator.stageName || ownership.creator.user.name || 'Creator',
                } as any,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send signing notification:', error);
      // Don't throw - notification failure shouldn't break the signing process
    }
  }

  /**
   * Generate digital certificate for executed license
   */
  async generateCertificate(licenseId: string): Promise<{
    certificateId: string;
    licenseId: string;
    issuedAt: Date;
    signatureProof: string;
    certificateUrl: string;
  }> {
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new Error('License not found');
    }

    if (license.status !== 'ACTIVE' || !license.signedAt) {
      throw new Error('License must be active and fully executed to generate certificate');
    }

    const certificateId = `CERT-${Date.now().toString(36).toUpperCase()}`;
    const signatureProof = license.signatureProof || '';

    // Update metadata with certificate info
    await prisma.license.update({
      where: { id: licenseId },
      data: {
        metadata: {
          ...(license.metadata as any),
          certificate: {
            id: certificateId,
            issuedAt: new Date().toISOString(),
            signatureProof,
          },
        },
      },
    });

    return {
      certificateId,
      licenseId: license.id,
      issuedAt: new Date(),
      signatureProof,
      certificateUrl: `${process.env.NEXT_PUBLIC_APP_URL}/licenses/${licenseId}/certificate`,
    };
  }
}

export const licenseSigningService = new LicenseSigningService();
