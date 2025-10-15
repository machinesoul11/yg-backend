/**
 * Tax Document Service
 * Core service for managing tax documents (1099s, W8-BEN, etc.)
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import {
  TaxDocumentType,
  TaxFilingStatus,
  TaxDocumentData,
  CreateTaxDocumentInput,
  UpdateTaxDocumentInput,
  TaxFormGenerationResult,
  Form1099Data,
} from '../types';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export class TaxDocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis
  ) {}

  /**
   * Create a new tax document
   */
  async createTaxDocument(input: CreateTaxDocumentInput): Promise<TaxDocumentData> {
    // Validate that creator exists
    const creator = await this.prisma.creator.findUnique({
      where: { id: input.creatorId },
      include: { user: true },
    });

    if (!creator) {
      throw new Error(`Creator with ID ${input.creatorId} not found`);
    }

    // Check for existing document of same type for same year
    const existing = await this.prisma.taxDocument.findUnique({
      where: {
        creatorId_taxYear_documentType: {
          creatorId: input.creatorId,
          taxYear: input.taxYear,
          documentType: input.documentType,
        },
      },
    });

    if (existing) {
      throw new Error(
        `Tax document of type ${input.documentType} for year ${input.taxYear} already exists for creator ${input.creatorId}`
      );
    }

    const taxDocument = await this.prisma.taxDocument.create({
      data: {
        creatorId: input.creatorId,
        taxYear: input.taxYear,
        documentType: input.documentType,
        totalAmountCents: input.totalAmountCents,
        withholdingCents: input.withholdingCents || 0,
        filingStatus: TaxFilingStatus.PENDING,
        metadata: input.metadata || {},
      },
    });

    return this.mapToTaxDocumentData(taxDocument);
  }

  /**
   * Update an existing tax document
   */
  async updateTaxDocument(input: UpdateTaxDocumentInput): Promise<TaxDocumentData> {
    const taxDocument = await this.prisma.taxDocument.update({
      where: { id: input.id },
      data: {
        totalAmountCents: input.totalAmountCents,
        withholdingCents: input.withholdingCents,
        filingStatus: input.filingStatus,
        pdfStorageKey: input.pdfStorageKey,
        pdfGeneratedAt: input.pdfGeneratedAt,
        filedAt: input.filedAt,
        metadata: input.metadata,
      },
    });

    return this.mapToTaxDocumentData(taxDocument);
  }

  /**
   * Get tax documents with filtering and pagination
   */
  async getTaxDocuments(filters: {
    creatorId?: string;
    taxYear?: number;
    documentType?: TaxDocumentType;
    filingStatus?: TaxFilingStatus;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ documents: TaxDocumentData[]; total: number }> {
    const where: any = {};

    if (filters.creatorId) where.creatorId = filters.creatorId;
    if (filters.taxYear) where.taxYear = filters.taxYear;
    if (filters.documentType) where.documentType = filters.documentType;
    if (filters.filingStatus) where.filingStatus = filters.filingStatus;

    const [documents, total] = await Promise.all([
      this.prisma.taxDocument.findMany({
        where,
        include: {
          creator: {
            include: { user: true },
          },
        },
        orderBy: {
          [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc',
        },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.taxDocument.count({ where }),
    ]);

    return {
      documents: documents.map(this.mapToTaxDocumentData),
      total,
    };
  }

  /**
   * Get a specific tax document by ID
   */
  async getTaxDocumentById(id: string): Promise<TaxDocumentData | null> {
    const document = await this.prisma.taxDocument.findUnique({
      where: { id },
      include: {
        creator: {
          include: { user: true },
        },
      },
    });

    return document ? this.mapToTaxDocumentData(document) : null;
  }

  /**
   * Delete a tax document (only if not filed)
   */
  async deleteTaxDocument(id: string): Promise<void> {
    const document = await this.prisma.taxDocument.findUnique({
      where: { id },
    });

    if (!document) {
      throw new Error(`Tax document with ID ${id} not found`);
    }

    if (document.filingStatus === TaxFilingStatus.FILED) {
      throw new Error('Cannot delete a filed tax document');
    }

    await this.prisma.taxDocument.delete({
      where: { id },
    });
  }

  /**
   * Create a correction document for an existing tax document
   */
  async createCorrectionDocument(
    originalDocumentId: string,
    correctionData: Partial<CreateTaxDocumentInput>
  ): Promise<TaxDocumentData> {
    const originalDocument = await this.prisma.taxDocument.findUnique({
      where: { id: originalDocumentId },
    });

    if (!originalDocument) {
      throw new Error(`Original tax document with ID ${originalDocumentId} not found`);
    }

    // Mark original as corrected
    await this.prisma.taxDocument.update({
      where: { id: originalDocumentId },
      data: { filingStatus: TaxFilingStatus.CORRECTED },
    });

    // Create correction document
    const correctionDocument = await this.prisma.taxDocument.create({
      data: {
        creatorId: originalDocument.creatorId,
        taxYear: originalDocument.taxYear,
        documentType: originalDocument.documentType,
        totalAmountCents: correctionData.totalAmountCents || originalDocument.totalAmountCents,
        withholdingCents: correctionData.withholdingCents || originalDocument.withholdingCents,
        filingStatus: TaxFilingStatus.PENDING,
        correctionOf: originalDocumentId,
        metadata: {
          ...originalDocument.metadata,
          ...correctionData.metadata,
          correction: {
            originalDocumentId,
            correctionReason: correctionData.metadata?.correctionReason || 'Amount correction',
            correctedAt: new Date(),
          },
        },
      },
    });

    return this.mapToTaxDocumentData(correctionDocument);
  }

  /**
   * Aggregate payment data for tax document generation
   */
  async aggregatePaymentsForTaxDocument(
    creatorId: string,
    taxYear: number
  ): Promise<{
    totalPaymentsCents: number;
    paymentCount: number;
    withholdingCents: number;
    periodStart: Date;
    periodEnd: Date;
  }> {
    const periodStart = new Date(taxYear, 0, 1); // January 1
    const periodEnd = new Date(taxYear, 11, 31, 23, 59, 59); // December 31

    // Aggregate from royalty statements (paid statements only)
    const royaltyData = await this.prisma.royaltyStatement.aggregate({
      where: {
        creatorId,
        paidAt: {
          gte: periodStart,
          lte: periodEnd,
        },
        status: 'PAID',
      },
      _sum: {
        totalEarningsCents: true,
      },
      _count: {
        id: true,
      },
    });

    // Get withholding information
    const withholdings = await this.prisma.taxWithholding.findMany({
      where: {
        creatorId,
        status: 'ACTIVE',
        effectiveStartDate: { lte: periodEnd },
        OR: [
          { effectiveEndDate: null },
          { effectiveEndDate: { gte: periodStart } },
        ],
      },
    });

    // Calculate total withholding (simplified - in real implementation would need to apply to individual payments)
    const totalPaymentsCents = royaltyData._sum.totalEarningsCents || 0;
    let withholdingCents = 0;

    if (withholdings.length > 0) {
      // Apply highest withholding rate (simplified logic)
      const highestRate = Math.max(...withholdings.map(w => Number(w.percentageRate)));
      withholdingCents = Math.round(totalPaymentsCents * highestRate);
    }

    return {
      totalPaymentsCents,
      paymentCount: royaltyData._count.id,
      withholdingCents,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Generate Form 1099 data for a creator
   */
  async generateForm1099Data(creatorId: string, taxYear: number): Promise<Form1099Data> {
    const creator = await this.prisma.creator.findUnique({
      where: { id: creatorId },
      include: { 
        user: true,
        taxJurisdictions: {
          where: { isPrimary: true },
        },
      },
    });

    if (!creator) {
      throw new Error(`Creator with ID ${creatorId} not found`);
    }

    const paymentData = await this.aggregatePaymentsForTaxDocument(creatorId, taxYear);

    // Platform information (would be configurable)
    const platformInfo = {
      payerName: 'YesGoddess LLC',
      payerAddress: '123 Main St, Suite 100, San Francisco, CA 94102',
      payerTIN: '12-3456789', // Platform EIN
    };

    // Creator information (from profile and tax jurisdiction)
    const primaryJurisdiction = creator.taxJurisdictions[0];
    const recipientTIN = creator.user.email; // In real implementation, would store actual TIN

    return {
      // Payer Information
      payerName: platformInfo.payerName,
      payerAddress: platformInfo.payerAddress,
      payerTIN: platformInfo.payerTIN,
      
      // Recipient Information
      recipientName: creator.stageName,
      recipientAddress: creator.user.email, // In real implementation, would store actual address
      recipientTIN: recipientTIN, // In real implementation, would store actual TIN
      recipientAccountNumber: creatorId.slice(-8), // Last 8 chars of creator ID
      
      // Payment Information
      taxYear,
      totalAmountCents: paymentData.totalPaymentsCents,
      federalTaxWithheldCents: paymentData.withholdingCents,
      
      // Form 1099-NEC Specific
      nonEmployeeCompensationCents: paymentData.totalPaymentsCents,
      
      // Additional Details
      stateTaxWithheldCents: 0, // Would be calculated based on state withholding
      statePayerTIN: undefined,
      stateIncomeCents: paymentData.totalPaymentsCents,
    };
  }

  /**
   * Mark document as filed
   */
  async markDocumentAsFiled(documentId: string): Promise<TaxDocumentData> {
    const document = await this.prisma.taxDocument.update({
      where: { id: documentId },
      data: {
        filingStatus: TaxFilingStatus.FILED,
        filedAt: new Date(),
      },
    });

    return this.mapToTaxDocumentData(document);
  }

  /**
   * Get documents requiring generation for a tax year
   */
  async getDocumentsRequiringGeneration(taxYear: number): Promise<TaxDocumentData[]> {
    const documents = await this.prisma.taxDocument.findMany({
      where: {
        taxYear,
        filingStatus: TaxFilingStatus.PENDING,
        pdfStorageKey: null,
      },
      include: {
        creator: {
          include: { user: true },
        },
      },
    });

    return documents.map(this.mapToTaxDocumentData);
  }

  /**
   * Validate tax identification number format
   */
  validateTIN(tin: string, type: 'SSN' | 'EIN'): boolean {
    if (type === 'SSN') {
      return /^\d{3}-\d{2}-\d{4}$/.test(tin) || /^\d{9}$/.test(tin);
    } else if (type === 'EIN') {
      return /^\d{2}-\d{7}$/.test(tin) || /^\d{9}$/.test(tin);
    }
    return false;
  }

  /**
   * Check if creator meets 1099 threshold for the tax year
   */
  async checkForm1099Threshold(creatorId: string, taxYear: number): Promise<boolean> {
    const FORM_1099_THRESHOLD_CENTS = 60000; // $600 threshold for 1099-NEC

    const paymentData = await this.aggregatePaymentsForTaxDocument(creatorId, taxYear);
    return paymentData.totalPaymentsCents >= FORM_1099_THRESHOLD_CENTS;
  }

  /**
   * Get filing statistics for a tax year
   */
  async getFilingStatistics(taxYear: number): Promise<{
    totalDocuments: number;
    byStatus: Record<TaxFilingStatus, number>;
    byType: Record<TaxDocumentType, number>;
    totalAmountCents: number;
    totalWithholdingCents: number;
  }> {
    const documents = await this.prisma.taxDocument.findMany({
      where: { taxYear },
    });

    const stats = {
      totalDocuments: documents.length,
      byStatus: {} as Record<TaxFilingStatus, number>,
      byType: {} as Record<TaxDocumentType, number>,
      totalAmountCents: 0,
      totalWithholdingCents: 0,
    };

    // Initialize counters
    Object.values(TaxFilingStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });
    Object.values(TaxDocumentType).forEach(type => {
      stats.byType[type] = 0;
    });

    // Count and aggregate
    documents.forEach(doc => {
      stats.byStatus[doc.filingStatus as TaxFilingStatus]++;
      stats.byType[doc.documentType as TaxDocumentType]++;
      stats.totalAmountCents += doc.totalAmountCents;
      stats.totalWithholdingCents += doc.withholdingCents;
    });

    return stats;
  }

  /**
   * Helper method to map Prisma model to our data type
   */
  private mapToTaxDocumentData(document: any): TaxDocumentData {
    return {
      id: document.id,
      creatorId: document.creatorId,
      taxYear: document.taxYear,
      documentType: document.documentType as TaxDocumentType,
      totalAmountCents: document.totalAmountCents,
      withholdingCents: document.withholdingCents,
      filingStatus: document.filingStatus as TaxFilingStatus,
      pdfStorageKey: document.pdfStorageKey,
      pdfGeneratedAt: document.pdfGeneratedAt,
      filedAt: document.filedAt,
      correctionOf: document.correctionOf,
      metadata: document.metadata,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
