/**
 * Statement PDF Generator Service
 * Generates professional PDF statements for creators
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';
import { PrismaClient } from '@prisma/client';

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
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#0A0A0A',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottom: '1px solid #E5E7EB',
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    marginBottom: 5,
    borderRadius: 4,
  },
  label: {
    fontSize: 10,
    color: '#374151',
    flex: 1,
  },
  value: {
    fontSize: 10,
    color: '#0A0A0A',
    textAlign: 'right',
    flex: 1,
  },
  boldValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0A0A0A',
    textAlign: 'right',
    flex: 1,
  },
  summaryBox: {
    backgroundColor: '#FEF9E7',
    padding: 20,
    borderRadius: 8,
    marginTop: 20,
    borderLeft: '4px solid #D4AF37',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#374151',
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 12,
    borderTop: '2px solid #D4AF37',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9CA3AF',
    borderTop: '1px solid #E5E7EB',
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  lineItemTable: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderBottom: '2px solid #D1D5DB',
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottom: '1px solid #E5E7EB',
  },
  col1: { width: '30%' },
  col2: { width: '20%' },
  col3: { width: '15%' },
  col4: { width: '15%' },
  col5: { width: '20%', textAlign: 'right' },
  metadataText: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 3,
  },
  disclaimer: {
    fontSize: 8,
    color: '#9CA3AF',
    marginTop: 20,
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
  },
});

interface LineItem {
  assetTitle: string;
  licenseId: string;
  periodStart: Date;
  periodEnd: Date;
  revenueCents: number;
  shareBps: number;
  earningsCents: number;
}

interface StatementData {
  statementId: string;
  creatorName: string;
  creatorEmail: string;
  periodStart: Date;
  periodEnd: Date;
  totalEarningsCents: number;
  platformFeeCents?: number;
  netPayableCents?: number;
  lineItems: LineItem[];
  generatedAt: Date;
  statementNumber: string;
}

/**
 * Generate Statement PDF Document Component
 */
const StatementPDFDocument = ({ data }: { data: StatementData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>YesGoddess</Text>
        <Text style={styles.tagline}>The work is sacred. The creator is sovereign.</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>Creator Earnings Statement</Text>
      <Text style={styles.subtitle}>
        Statement #{data.statementNumber}
      </Text>

      {/* Statement Metadata */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Statement Details</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Creator</Text>
          <Text style={styles.value}>{data.creatorName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{data.creatorEmail}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Statement Period</Text>
          <Text style={styles.value}>
            {data.periodStart.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })} -{' '}
            {data.periodEnd.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Generated</Text>
          <Text style={styles.value}>
            {data.generatedAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>

      {/* Line Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Earnings Breakdown</Text>
        
        <View style={styles.lineItemTable}>
          <View style={styles.tableHeader}>
            <Text style={styles.col1}>Asset</Text>
            <Text style={styles.col2}>License</Text>
            <Text style={styles.col3}>Revenue</Text>
            <Text style={styles.col4}>Share</Text>
            <Text style={styles.col5}>Earnings</Text>
          </View>
          
          {data.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.col1}>{item.assetTitle}</Text>
              <Text style={styles.col2}>{item.licenseId.substring(0, 8)}...</Text>
              <Text style={styles.col3}>${(item.revenueCents / 100).toFixed(2)}</Text>
              <Text style={styles.col4}>{(item.shareBps / 100).toFixed(2)}%</Text>
              <Text style={styles.col5}>${(item.earningsCents / 100).toFixed(2)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Summary */}
      <View style={styles.summaryBox}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross Earnings</Text>
          <Text style={styles.summaryValue}>
            ${(data.totalEarningsCents / 100).toFixed(2)}
          </Text>
        </View>
        
        {data.platformFeeCents !== undefined && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee (10%)</Text>
            <Text style={styles.summaryValue}>
              -${(data.platformFeeCents / 100).toFixed(2)}
            </Text>
          </View>
        )}
        
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Net Payable</Text>
          <Text style={styles.totalValue}>
            ${((data.netPayableCents ?? data.totalEarningsCents) / 100).toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text>
          This statement represents earnings for the specified period. Payments are processed within 5-7 business days 
          after statement finalization. For questions or disputes, please contact support@yesgoddess.com within 30 days 
          of receiving this statement.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text>YesGoddess IP Licensing Platform</Text>
          <Text>Statement ID: {data.statementId}</Text>
        </View>
        <View style={styles.footerRow}>
          <Text>support@yesgoddess.com</Text>
          <Text>Generated: {data.generatedAt.toISOString()}</Text>
        </View>
      </View>
    </Page>
  </Document>
);

export class StatementPDFGeneratorService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate PDF buffer for a royalty statement
   */
  async generateStatementPDF(statementId: string): Promise<Buffer> {
    // Fetch statement data with all related information
    const statement = await this.prisma.royaltyStatement.findUnique({
      where: { id: statementId },
      include: {
        creator: {
          include: {
            user: true,
          },
        },
        royaltyRun: true,
        lines: {
          include: {
            ipAsset: true,
            license: true,
          },
          orderBy: {
            earningsCents: 'desc',
          },
        },
      },
    });

    if (!statement) {
      throw new Error(`Statement not found: ${statementId}`);
    }

    // Transform data for PDF
    const data: StatementData = {
      statementId: statement.id,
      creatorName: statement.creator.stageName || statement.creator.user.name || 'Creator',
      creatorEmail: statement.creator.user.email,
      periodStart: statement.royaltyRun.periodStart,
      periodEnd: statement.royaltyRun.periodEnd,
      totalEarningsCents: statement.totalEarningsCents,
      platformFeeCents: statement.platformFeeCents,
      netPayableCents: statement.netPayableCents,
      lineItems: statement.lines
        .filter(line => !['CARRYOVER', 'THRESHOLD_NOTE', 'DISPUTE_RESOLUTION'].includes(line.licenseId))
        .map((line) => ({
          assetTitle: line.ipAsset.title,
          licenseId: line.licenseId,
          periodStart: line.periodStart,
          periodEnd: line.periodEnd,
          revenueCents: line.revenueCents,
          shareBps: line.shareBps,
          earningsCents: line.calculatedRoyaltyCents,
        })),
      generatedAt: new Date(),
      statementNumber: this.generateStatementNumber(statement),
    };

    // Generate PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(StatementPDFDocument, { data })
    );

    return pdfBuffer;
  }

  /**
   * Generate a human-readable statement number
   */
  private generateStatementNumber(statement: any): string {
    const year = statement.royaltyRun.periodEnd.getFullYear();
    const month = (statement.royaltyRun.periodEnd.getMonth() + 1)
      .toString()
      .padStart(2, '0');
    const shortId = statement.id.substring(0, 8).toUpperCase();
    return `${year}${month}-${shortId}`;
  }
}
