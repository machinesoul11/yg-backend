/**
 * Payout Receipt Generator Service
 * Generates PDF receipts for payout transactions
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { PrismaClient, PayoutStatus } from '@prisma/client';
import { storageProvider } from '@/lib/storage';

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2px solid #D4AF37',
    paddingBottom: 20,
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 5,
  },
  tagline: {
    fontSize: 9,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#0A0A0A',
  },
  receiptNumber: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottom: '1px solid #E5E7EB',
  },
  label: {
    fontSize: 10,
    color: '#374151',
  },
  value: {
    fontSize: 10,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  amountBox: {
    backgroundColor: '#FEF9E7',
    border: '2px solid #D4AF37',
    borderRadius: 8,
    padding: 15,
    marginVertical: 20,
  },
  amountLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 5,
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  footer: {
    marginTop: 30,
    paddingTop: 20,
    borderTop: '1px solid #E5E7EB',
    fontSize: 8,
    color: '#6B7280',
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 8,
    color: '#9CA3AF',
    marginTop: 10,
    fontStyle: 'italic',
  },
});

export class PayoutReceiptService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate payout receipt PDF
   */
  async generateReceipt(payoutId: string): Promise<string> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyStatement: {
          include: {
            royaltyRun: true,
            lines: {
              include: {
                license: {
                  include: {
                    ipAsset: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payout || payout.status !== PayoutStatus.COMPLETED) {
      throw new Error('Payout not found or not completed');
    }

    // Generate PDF
    const pdf = await this.createPDFDocument(payout);
    const pdfBuffer = await renderToBuffer(pdf);

    // Upload to storage
    const fileName = `payout-receipt-${payout.id}.pdf`;
    const storageKey = `receipts/payouts/${payout.creatorId}/${fileName}`;

    await storageProvider.uploadFile({
      key: storageKey,
      body: pdfBuffer,
      contentType: 'application/pdf',
      metadata: {
        payoutId: payout.id,
        creatorId: payout.creatorId,
        generatedAt: new Date().toISOString(),
      },
    });

    // Update payout record with receipt key
    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        // Note: You may need to add receiptStorageKey field to Payout model
        // receiptStorageKey: storageKey,
      },
    });

    return storageKey;
  }

  /**
   * Create PDF document
   */
  private async createPDFDocument(payout: any): Promise<React.ReactElement> {
    const creator = payout.creator;
    const amountFormatted = `$${(payout.amountCents / 100).toFixed(2)}`;
    const processedDate = new Date(payout.processedAt || payout.createdAt);

    return (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.logo}>YES GODDESS</Text>
            <Text style={styles.tagline}>The work is sacred. The creator is sovereign.</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>Payout Receipt</Text>
          <Text style={styles.receiptNumber}>Receipt #{payout.id.substring(0, 12).toUpperCase()}</Text>

          {/* Creator Information */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.label}>Creator</Text>
              <Text style={styles.value}>
                {creator.stageName || creator.user.name || 'Creator'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{creator.user.email}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Creator ID</Text>
              <Text style={styles.value}>{creator.id.substring(0, 12)}</Text>
            </View>
          </View>

          {/* Payout Details */}
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.label}>Transaction Date</Text>
              <Text style={styles.value}>
                {processedDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Transfer ID</Text>
              <Text style={styles.value}>{payout.stripeTransferId || 'N/A'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Payment Method</Text>
              <Text style={styles.value}>Stripe Transfer</Text>
            </View>
            {payout.royaltyStatement && (
              <View style={styles.row}>
                <Text style={styles.label}>Earnings Period</Text>
                <Text style={styles.value}>
                  {new Date(payout.royaltyStatement.royaltyRun.periodStart).toLocaleDateString()} -{' '}
                  {new Date(payout.royaltyStatement.royaltyRun.periodEnd).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>

          {/* Amount */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Net Payout Amount</Text>
            <Text style={styles.amount}>{amountFormatted} USD</Text>
          </View>

          {/* Breakdown */}
          {payout.royaltyStatement && (
            <View style={styles.section}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>
                Earnings Breakdown
              </Text>
              <View style={styles.row}>
                <Text style={styles.label}>Gross Earnings</Text>
                <Text style={styles.value}>
                  ${(payout.royaltyStatement.totalEarningsCents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Platform Fee</Text>
                <Text style={styles.value}>
                  -${(payout.royaltyStatement.platformFeeCents / 100).toFixed(2)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Net Payable</Text>
                <Text style={styles.value}>
                  ${(payout.royaltyStatement.netPayableCents / 100).toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text>YES GODDESS • The Creator Sovereignty Platform</Text>
            <Text style={{ marginTop: 5 }}>
              Generated on {new Date().toLocaleDateString('en-US')} at{' '}
              {new Date().toLocaleTimeString('en-US')}
            </Text>
            <Text style={styles.disclaimer}>
              This receipt is for your records. Funds are transferred via Stripe and typically
              arrive within 2-7 business days. For questions, contact support@yesgoddess.agency
            </Text>
          </View>
        </Page>
      </Document>
    );
  }

  /**
   * Get receipt download URL
   */
  async getReceiptUrl(payoutId: string): Promise<string | null> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    // Note: Add receiptStorageKey field to access the storage key
    // const storageKey = payout?.receiptStorageKey;
    // if (!storageKey) return null;
    
    // return storageProvider.getSignedUrl(storageKey, 3600); // 1 hour expiry
    
    return null; // Placeholder until schema updated
  }
}
