/**
 * License Terms Generation Service
 * Generates comprehensive legal license agreements
 */

import { prisma } from '@/lib/db';
import type { License, LicenseType } from '@prisma/client';
import type { LicenseScope } from '../types';

/**
 * Generated license terms
 */
export interface GeneratedLicenseTerms {
  licenseId: string;
  referenceNumber: string;
  version: string;
  generatedAt: Date;
  fullText: string;
  sections: {
    title: string;
    content: string;
  }[];
}

/**
 * License Terms Generation Service
 */
export class LicenseTermsGenerationService {
  private readonly templateVersion = '1.0.0';
  private readonly platformName = 'YES GODDESS';

  /**
   * Generate complete license agreement
   */
  async generateTerms(licenseId: string): Promise<GeneratedLicenseTerms> {
    // Get full license details
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
        project: true,
      },
    });

    if (!license) {
      throw new Error('License not found');
    }

    const scope = license.scopeJson as unknown as LicenseScope;
    const metadata = license.metadata as any;
    const referenceNumber = metadata?.referenceNumber || license.id;

    // Generate all sections
    const sections: GeneratedLicenseTerms['sections'] = [];

    // 1. Header
    sections.push(this.generateHeader(license, referenceNumber));

    // 2. Parties
    sections.push(this.generateParties(license));

    // 3. Grant of Rights
    sections.push(this.generateGrantOfRights(license, scope));

    // 4. Scope of Use
    sections.push(this.generateScopeOfUse(scope));

    // 5. Term and Duration
    sections.push(this.generateTermAndDuration(license));

    // 6. Financial Terms
    sections.push(this.generateFinancialTerms(license));

    // 7. Ownership and Attribution
    sections.push(this.generateOwnershipAndAttribution(license, scope));

    // 8. Modifications and Cutdowns
    sections.push(this.generateModificationTerms(scope));

    // 9. Warranties and Representations
    sections.push(this.generateWarrantiesAndRepresentations(license));

    // 10. Limitation of Liability
    sections.push(this.generateLimitationOfLiability());

    // 11. Termination
    sections.push(this.generateTerminationTerms(license));

    // 12. General Provisions
    sections.push(this.generateGeneralProvisions());

    // 13. Signatures
    sections.push(this.generateSignatureBlocks(license));

    // Compile full text
    const fullText = this.compileFullText(sections);

    return {
      licenseId: license.id,
      referenceNumber,
      version: this.templateVersion,
      generatedAt: new Date(),
      fullText,
      sections,
    };
  }

  /**
   * Generate header section
   */
  private generateHeader(license: any, referenceNumber: string) {
    return {
      title: 'INTELLECTUAL PROPERTY LICENSE AGREEMENT',
      content: `
LICENSE AGREEMENT NO: ${referenceNumber}
EFFECTIVE DATE: ${license.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

This Intellectual Property License Agreement ("Agreement") is entered into by and between the parties identified below, facilitated through the ${this.platformName} platform.
      `.trim(),
    };
  }

  /**
   * Generate parties section
   */
  private generateParties(license: any) {
    const creators = license.ipAsset.ownerships
      .map((o: any) => ({
        name: o.creator.stageName || o.creator.user.name || 'Creator',
        share: o.shareBps / 100,
      }))
      .filter((c: any) => c.share > 0);

    const creatorsList =
      creators.length > 1
        ? creators
            .map((c: any, i: number) => `${i + 1}. ${c.name} (${c.share.toFixed(2)}% ownership)`)
            .join('\n   ')
        : creators[0]?.name || 'Creator';

    return {
      title: '1. PARTIES',
      content: `
1.1 LICENSOR ("Creator"):
   ${creatorsList}

1.2 LICENSEE ("Brand"):
   ${license.brand.companyName}
   ${license.brand.user.email}

1.3 LICENSED PROPERTY:
   Title: "${license.ipAsset.title}"
   Type: ${license.ipAsset.type}
   Asset ID: ${license.ipAsset.id}
      `.trim(),
    };
  }

  /**
   * Generate grant of rights section
   */
  private generateGrantOfRights(license: any, scope: any) {
    const exclusivityText =
      license.licenseType === 'EXCLUSIVE'
        ? 'exclusive, non-transferable'
        : license.licenseType === 'EXCLUSIVE_TERRITORY'
        ? 'territorially exclusive, non-transferable'
        : 'non-exclusive, non-transferable';

    return {
      title: '2. GRANT OF RIGHTS',
      content: `
2.1 GRANT. Subject to the terms and conditions of this Agreement, Creator hereby grants to Brand a ${exclusivityText} license to use the Licensed Property in accordance with the Scope of Use defined in Section 3.

2.2 RESERVATION OF RIGHTS. Creator retains all intellectual property rights, title, and interest in and to the Licensed Property. All rights not expressly granted herein are reserved by Creator.

2.3 NO TRANSFER OF OWNERSHIP. This Agreement does not transfer any ownership rights in the Licensed Property to Brand. Brand acknowledges that Creator remains the sole owner of the Licensed Property.

${
  license.licenseType === 'EXCLUSIVE'
    ? `
2.4 EXCLUSIVITY. During the Term of this Agreement, Creator shall not license the Licensed Property to any third party for any purpose. Creator shall not use the Licensed Property for Creator's own commercial purposes that would compete with Brand's licensed use.
`
    : ''
}

${
  license.licenseType === 'EXCLUSIVE_TERRITORY' && scope.geographic
    ? `
2.4 TERRITORIAL EXCLUSIVITY. The exclusive rights granted herein apply only within the following territories: ${scope.geographic.territories.join(', ')}. Creator retains the right to license the Licensed Property in other territories.
`
    : ''
}

${
  scope.exclusivity?.category
    ? `
2.5 CATEGORY EXCLUSIVITY. The exclusive rights granted herein apply only within the following category: ${scope.exclusivity.category}. Creator retains the right to license the Licensed Property for use in other categories.
`
    : ''
}
      `.trim(),
    };
  }

  /**
   * Generate scope of use section
   */
  private generateScopeOfUse(scope: any) {
    const mediaTypes = Object.entries(scope.media)
      .filter(([_, v]) => v)
      .map(([k]) => k.toUpperCase());

    const placements = Object.entries(scope.placement)
      .filter(([_, v]) => v)
      .map(([k]) => this.formatPlacementName(k));

    const territories = scope.geographic?.territories || ['GLOBAL'];

    return {
      title: '3. SCOPE OF USE',
      content: `
3.1 PERMITTED MEDIA TYPES. Brand may use the Licensed Property in the following media formats:
   ${mediaTypes.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n   ')}

3.2 PERMITTED PLACEMENTS. Brand may use the Licensed Property in the following placements:
   ${placements.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n   ')}

3.3 GEOGRAPHIC SCOPE. Brand's rights to use the Licensed Property are limited to the following territories:
   ${territories.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n   ')}

3.4 PROHIBITED USES. Brand shall not:
   a) Use the Licensed Property in any manner not explicitly permitted in this Agreement
   b) Sublicense or transfer rights to any third party without Creator's prior written consent
   c) Use the Licensed Property in any way that disparages or damages Creator's reputation
   d) Remove, alter, or obscure any copyright notices, watermarks, or metadata embedded in the Licensed Property
   e) Register or claim any intellectual property rights in the Licensed Property
      `.trim(),
    };
  }

  /**
   * Generate term and duration section
   */
  private generateTermAndDuration(license: any) {
    const duration = Math.ceil(
      (license.endDate.getTime() - license.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      title: '4. TERM AND DURATION',
      content: `
4.1 TERM. This Agreement shall commence on ${license.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} and shall continue until ${license.endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (approximately ${Math.round(duration / 30)} months), unless earlier terminated in accordance with Section 10.

4.2 EXPIRATION. Upon expiration of the Term, all rights granted to Brand under this Agreement shall immediately terminate. Brand shall cease all use of the Licensed Property and shall remove the Licensed Property from all Brand materials within thirty (30) days of expiration.

${
  license.autoRenew
    ? `
4.3 AUTOMATIC RENEWAL. This Agreement shall automatically renew for successive periods of equal length unless either party provides written notice of non-renewal at least thirty (30) days prior to the end of the then-current Term. Renewal terms shall be subject to renegotiation of financial terms.
`
    : `
4.3 NO AUTOMATIC RENEWAL. This Agreement shall not automatically renew. Any extension of this Agreement requires a new written agreement between the parties.
`
}
      `.trim(),
    };
  }

  /**
   * Generate financial terms section
   */
  private generateFinancialTerms(license: any) {
    const fee = license.feeCents / 100;
    const revShare = license.revShareBps / 100;
    const hasFixedFee = license.feeCents > 0;
    const hasRevShare = license.revShareBps > 0;

    let paymentStructure = '';
    if (hasFixedFee && hasRevShare) {
      paymentStructure = 'hybrid model consisting of a fixed license fee plus revenue sharing';
    } else if (hasFixedFee) {
      paymentStructure = 'fixed license fee';
    } else if (hasRevShare) {
      paymentStructure = 'revenue sharing arrangement';
    }

    return {
      title: '5. FINANCIAL TERMS',
      content: `
5.1 LICENSE FEE. Brand agrees to pay Creator the following compensation for the rights granted under this Agreement (${paymentStructure}):

${
  hasFixedFee
    ? `
   a) FIXED LICENSE FEE: $${fee.toFixed(2)} USD
   b) PAYMENT DUE: Within fourteen (14) days of Agreement execution
   c) PAYMENT METHOD: Via ${this.platformName} platform payment processing
`
    : ''
}

${
  hasRevShare
    ? `
   ${hasFixedFee ? 'd' : 'a'}) REVENUE SHARE: ${revShare.toFixed(2)}% of Net Revenue
   ${hasFixedFee ? 'e' : 'b'}) NET REVENUE DEFINITION: Gross revenue generated from products/campaigns featuring the Licensed Property, less returns, refunds, shipping costs, and applicable taxes
   ${hasFixedFee ? 'f' : 'c'}) REPORTING FREQUENCY: ${this.formatBillingFrequency(license.billingFrequency)}
   ${hasFixedFee ? 'g' : 'd'}) PAYMENT TERMS: Revenue share payments due within thirty (30) days of the end of each reporting period
`
    : ''
}

5.2 PLATFORM FEES. All payments shall be processed through the ${this.platformName} platform. Platform fees (typically 10%) shall be deducted from Creator's compensation and are the responsibility of Creator.

${
  hasRevShare
    ? `
5.3 REVENUE REPORTING. Brand shall provide Creator with detailed revenue reports ${this.formatBillingFrequency(license.billingFrequency).toLowerCase()}, including:
   a) Total gross revenue generated using the Licensed Property
   b) Itemized deductions (returns, refunds, shipping, taxes)
   c) Calculation of Net Revenue
   d) Revenue share amount due

5.4 AUDIT RIGHTS. Creator reserves the right to audit Brand's records relating to revenue generated from the Licensed Property upon thirty (30) days written notice, no more than once per year. Audits shall be conducted during normal business hours at Brand's principal place of business.
`
    : ''
}

${license.paymentTerms ? `\n5.5 ADDITIONAL PAYMENT TERMS. ${license.paymentTerms}\n` : ''}

5.6 LATE PAYMENTS. Any payment not received within the timeframes specified herein shall accrue interest at a rate of 1.5% per month (18% per annum) or the maximum rate permitted by law, whichever is less.
      `.trim(),
    };
  }

  /**
   * Generate ownership and attribution section
   */
  private generateOwnershipAndAttribution(license: any, scope: any) {
    const attributionRequired = scope.attribution?.required ?? true;
    const attributionFormat = scope.attribution?.format || `© ${new Date().getFullYear()} ${license.ipAsset.ownerships[0]?.creator.stageName || 'Creator'}`;

    return {
      title: '6. OWNERSHIP AND ATTRIBUTION',
      content: `
6.1 INTELLECTUAL PROPERTY OWNERSHIP. Creator retains all right, title, and interest in and to the Licensed Property, including all intellectual property rights therein. Brand acquires no ownership rights under this Agreement.

6.2 COPYRIGHT NOTICE. Brand shall not remove, alter, or obscure any copyright notices, metadata, or other proprietary rights information embedded in or affixed to the Licensed Property.

${
  attributionRequired
    ? `
6.3 ATTRIBUTION REQUIREMENT. Brand shall provide proper attribution to Creator in all uses of the Licensed Property. Attribution shall be in the following format, or as close to this format as the medium reasonably allows:

   "${attributionFormat}"

   Attribution shall be clearly visible and legible in a size and placement appropriate to the medium and use context.
`
    : `
6.3 ATTRIBUTION. While not required, Brand is encouraged to provide attribution to Creator where practicable.
`
}

6.4 METADATA PRESERVATION. Brand shall preserve all metadata associated with the Licensed Property, including but not limited to EXIF data, copyright information, and creator attribution.
      `.trim(),
    };
  }

  /**
   * Generate modification terms section
   */
  private generateModificationTerms(scope: any) {
    const allowEdits = scope.cutdowns?.allowEdits ?? false;

    return {
      title: '7. MODIFICATIONS AND DERIVATIVE WORKS',
      content: `
${
  allowEdits
    ? `
7.1 PERMITTED MODIFICATIONS. Brand is permitted to make the following modifications to the Licensed Property:
   ${scope.cutdowns.maxDuration ? `a) Video cutdowns not exceeding ${scope.cutdowns.maxDuration} seconds in duration` : ''}
   ${scope.cutdowns.aspectRatios ? `b) Aspect ratio adjustments to the following formats: ${scope.cutdowns.aspectRatios.join(', ')}` : ''}
   c) Minor adjustments for technical compatibility (compression, format conversion)
   d) Color correction and minor retouching that does not substantially alter the content

7.2 QUALITY STANDARDS. All modifications must maintain the professional quality and integrity of the original Licensed Property. Brand shall not make modifications that:
   a) Materially alter the composition, meaning, or message of the Licensed Property
   b) Combine the Licensed Property with content that is defamatory, obscene, or otherwise objectionable
   c) Create derivative works that disparage Creator or the original work
   d) Result in a lower quality presentation that could damage Creator's reputation

7.3 APPROVAL FOR MAJOR MODIFICATIONS. Any modifications beyond those expressly permitted in Section 7.1 require Creator's prior written approval. Approval requests must be submitted with mockups or descriptions of the proposed modifications.
`
    : `
7.1 NO MODIFICATIONS. Brand shall not make any modifications, alterations, edits, or derivative works based on the Licensed Property without Creator's express prior written consent. The Licensed Property must be used in its original form, except for technical adjustments necessary for different media formats (file format conversion, compression) that do not materially alter the visual or auditory content.

7.2 TECHNICAL ADJUSTMENTS. Brand may make only the following technical adjustments:
   a) File format conversion necessary for the intended use
   b) Compression or optimization for web/mobile delivery
   c) Aspect ratio adjustments that do not crop or distort the content
   
7.3 PROHIBITED MODIFICATIONS. Brand shall not:
   a) Crop, edit, or alter the composition of the Licensed Property
   b) Apply filters, effects, or overlays
   c) Combine the Licensed Property with other content in a manner that alters its meaning
   d) Create derivative works based on the Licensed Property
`
}
      `.trim(),
    };
  }

  /**
   * Generate warranties section
   */
  private generateWarrantiesAndRepresentations(license: any) {
    return {
      title: '8. WARRANTIES AND REPRESENTATIONS',
      content: `
8.1 CREATOR WARRANTIES. Creator represents and warrants that:
   a) Creator is the sole owner of the Licensed Property or has full authority to grant the rights herein
   b) The Licensed Property does not infringe upon any third-party intellectual property rights
   c) The Licensed Property does not contain any defamatory, obscene, or otherwise unlawful content
   d) Creator has obtained all necessary releases, permissions, and consents for any recognizable persons or property depicted in the Licensed Property
   e) Creator has full power and authority to enter into this Agreement

8.2 BRAND WARRANTIES. Brand represents and warrants that:
   a) Brand has full power and authority to enter into this Agreement
   b) Brand shall use the Licensed Property only in accordance with the terms of this Agreement
   c) Brand shall not use the Licensed Property in any manner that violates applicable laws or regulations
   d) Brand shall not use the Licensed Property in a manner that damages Creator's reputation

8.3 DISCLAIMER. EXCEPT AS EXPRESSLY PROVIDED HEREIN, THE LICENSED PROPERTY IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
      `.trim(),
    };
  }

  /**
   * Generate limitation of liability section
   */
  private generateLimitationOfLiability() {
    return {
      title: '9. LIMITATION OF LIABILITY',
      content: `
9.1 LIMITATION. IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR EXEMPLARY DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF REVENUE, LOSS OF DATA, OR LOSS OF BUSINESS OPPORTUNITIES, EVEN IF SUCH PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

9.2 MAXIMUM LIABILITY. EACH PARTY'S TOTAL LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE TOTAL AMOUNT OF FEES PAID OR PAYABLE BY BRAND TO CREATOR UNDER THIS AGREEMENT.

9.3 INDEMNIFICATION. Brand agrees to indemnify, defend, and hold harmless Creator from and against any and all claims, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising from Brand's use of the Licensed Property in violation of this Agreement or applicable law.
      `.trim(),
    };
  }

  /**
   * Generate termination terms section
   */
  private generateTerminationTerms(license: any) {
    return {
      title: '10. TERMINATION',
      content: `
10.1 TERMINATION FOR BREACH. Either party may terminate this Agreement immediately upon written notice if the other party:
   a) Materially breaches any term of this Agreement and fails to cure such breach within thirty (30) days of receiving written notice
   b) Becomes insolvent, files for bankruptcy, or has a receiver appointed

10.2 TERMINATION BY CREATOR. Creator may terminate this Agreement immediately if:
   a) Brand fails to make any payment when due
   b) Brand uses the Licensed Property outside the scope of the license granted
   c) Brand makes unauthorized modifications to the Licensed Property

10.3 EFFECT OF TERMINATION. Upon termination:
   a) All rights granted to Brand under this Agreement shall immediately cease
   b) Brand shall immediately cease all use of the Licensed Property
   c) Brand shall remove the Licensed Property from all Brand materials, websites, and marketing channels within ten (10) business days
   d) Brand shall certify in writing to Creator that all uses have ceased and all copies have been removed or destroyed
   e) Any amounts owed to Creator as of the termination date shall become immediately due and payable

10.4 SURVIVAL. The following provisions shall survive termination: Sections 5 (Financial Terms - for amounts accrued), 6 (Ownership), 8 (Warranties), 9 (Limitation of Liability), and 11 (General Provisions).
      `.trim(),
    };
  }

  /**
   * Generate general provisions section
   */
  private generateGeneralProvisions() {
    return {
      title: '11. GENERAL PROVISIONS',
      content: `
11.1 ENTIRE AGREEMENT. This Agreement constitutes the entire agreement between the parties regarding the subject matter hereof and supersedes all prior agreements, understandings, and communications, whether written or oral.

11.2 AMENDMENTS. This Agreement may be amended only by a written instrument signed by both parties.

11.3 ASSIGNMENT. Brand may not assign or transfer this Agreement or any rights hereunder without Creator's prior written consent. Creator may assign this Agreement to any successor in interest.

11.4 GOVERNING LAW. This Agreement shall be governed by and construed in accordance with the laws of the State of [STATE], without regard to conflict of law principles.

11.5 DISPUTE RESOLUTION. Any disputes arising under this Agreement shall first be subject to good faith negotiation between the parties. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association.

11.6 SEVERABILITY. If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.

11.7 WAIVER. No waiver of any provision of this Agreement shall be effective unless in writing and signed by the party against whom the waiver is sought to be enforced.

11.8 NOTICES. All notices under this Agreement shall be in writing and delivered via the ${this.platformName} platform messaging system or to the email addresses registered with the platform.

11.9 RELATIONSHIP OF PARTIES. The parties are independent contractors. This Agreement does not create a partnership, joint venture, employment, or agency relationship.

11.10 FORCE MAJEURE. Neither party shall be liable for any failure or delay in performance due to causes beyond its reasonable control.

11.11 CONFIDENTIALITY. Both parties agree to maintain the confidentiality of any proprietary or confidential information disclosed during the term of this Agreement.

11.12 PLATFORM FACILITATION. This Agreement is facilitated through the ${this.platformName} platform. All communications, payments, and dispute resolution processes shall be conducted through the platform in accordance with the platform's Terms of Service.
      `.trim(),
    };
  }

  /**
   * Generate signature blocks section
   */
  private generateSignatureBlocks(license: any) {
    const creators = license.ipAsset.ownerships.map(
      (o: any) => o.creator.stageName || o.creator.user.name || 'Creator'
    );

    return {
      title: '12. SIGNATURES',
      content: `
By executing this Agreement electronically through the ${this.platformName} platform, the parties acknowledge that they have read, understood, and agree to be bound by all terms and conditions contained herein.

CREATOR (LICENSOR):
${creators.map((name: string, i: number) => `\n${i + 1}. ${name}\n   Signature: ___________________________\n   Date: ______________`).join('\n')}

BRAND (LICENSEE):
${license.brand.companyName}
Authorized Representative: ${license.brand.user.name || license.brand.user.email}
Signature: ___________________________
Date: ______________

This Agreement has been executed electronically through the ${this.platformName} platform.
Electronic signatures are legally binding in accordance with the ESIGN Act and applicable state laws.

Agreement ID: ${license.id}
Platform Transaction ID: ${(license.metadata as any)?.referenceNumber || license.id}
Generated: ${new Date().toISOString()}
      `.trim(),
    };
  }

  /**
   * Compile full text from sections
   */
  private compileFullText(sections: { title: string; content: string }[]): string {
    const header = `
================================================================================
                    INTELLECTUAL PROPERTY LICENSE AGREEMENT
                              ${this.platformName}
================================================================================

`.trim();

    const body = sections.map((section) => `\n${section.title}\n${'='.repeat(section.title.length)}\n\n${section.content}\n`).join('\n');

    const footer = `
\n\n================================================================================
                              END OF AGREEMENT
================================================================================
    `.trim();

    return `${header}\n\n${body}\n${footer}`;
  }

  /**
   * Helper: Format placement name
   */
  private formatPlacementName(key: string): string {
    const names: Record<string, string> = {
      social: 'Social Media',
      website: 'Website',
      email: 'Email Marketing',
      paid_ads: 'Paid Advertising',
      packaging: 'Product Packaging',
    };
    return names[key] || key.toUpperCase();
  }

  /**
   * Helper: Format billing frequency
   */
  private formatBillingFrequency(frequency: string | null): string {
    if (!frequency) return 'Monthly';
    const formats: Record<string, string> = {
      ONE_TIME: 'One-time',
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      ANNUALLY: 'Annually',
    };
    return formats[frequency] || 'Monthly';
  }
}

export const licenseTermsGenerationService = new LicenseTermsGenerationService();
