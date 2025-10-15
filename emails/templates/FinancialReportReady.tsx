import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link
} from '@react-email/components';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';
import { EmailLayout } from '../components/EmailLayout';
import * as React from 'react';

interface FinancialReportReadyProps {
  recipientName: string;
  reportTitle: string;
  reportType: string;
  reportPeriod: string;
  generatedAt: string;
  downloadUrl: string;
  expiresAt: string;
  fileSize: string;
  reportSummary?: {
    totalRevenue?: string;
    totalTransactions?: string;
    keyMetric?: string;
  };
}

export const FinancialReportReady = ({
  recipientName = 'Administrator',
  reportTitle = 'Monthly Financial Report',
  reportType = 'Monthly Revenue Report',
  reportPeriod = 'October 2025',
  generatedAt = 'November 15, 2025 at 2:30 PM',
  downloadUrl = 'https://yesgoddess.com/reports/download/abc123',
  expiresAt = 'November 22, 2025',
  fileSize = '2.4 MB',
  reportSummary = {
    totalRevenue: '$145,620.00',
    totalTransactions: '1,234',
    keyMetric: '23% growth'
  }
}: FinancialReportReadyProps) => {
  const previewText = `Your ${reportType} for ${reportPeriod} is ready for download`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>
        Financial Report Ready 📊
      </Heading>

      <Text style={emailStyles.text}>
        {recipientName},
      </Text>

      <Text style={emailStyles.text}>
        Your <strong>{reportTitle}</strong> has been generated and is ready for download.
      </Text>

      {/* Report Details Card */}
      <Section
        style={{
          background: EMAIL_COLORS.goldLight,
          borderRadius: '8px',
          padding: '24px',
          marginTop: '24px',
          marginBottom: '24px',
          border: `2px solid ${EMAIL_COLORS.gold}`,
        }}
      >
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '18px',
            fontWeight: '600',
            color: EMAIL_COLORS.text,
            marginBottom: '16px',
            textAlign: 'center',
          }}
        >
          {reportType}
        </Text>
        
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            color: EMAIL_COLORS.textLight,
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          Period: <strong>{reportPeriod}</strong>
        </Text>
        
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '14px',
            color: EMAIL_COLORS.textLight,
            textAlign: 'center',
            margin: '0',
          }}
        >
          Generated: {generatedAt}
        </Text>
      </Section>

      {/* Summary Metrics */}
      {reportSummary && (
        <Section style={{ marginBottom: '24px' }}>
          <Text
            style={{
              ...emailStyles.text,
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '16px',
            }}
          >
            Key Highlights
          </Text>
          
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {reportSummary.totalRevenue && (
              <div style={{ 
                background: EMAIL_COLORS.background,
                padding: '12px 16px',
                borderRadius: '6px',
                flex: '1',
                minWidth: '120px',
                textAlign: 'center'
              }}>
                <Text style={{ 
                  fontSize: '12px', 
                  color: EMAIL_COLORS.textLight, 
                  margin: '0 0 4px 0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Total Revenue
                </Text>
                <Text style={{ 
                  fontSize: '18px', 
                  fontWeight: '700', 
                  color: EMAIL_COLORS.gold,
                  margin: '0'
                }}>
                  {reportSummary.totalRevenue}
                </Text>
              </div>
            )}
            
            {reportSummary.totalTransactions && (
              <div style={{ 
                background: EMAIL_COLORS.background,
                padding: '12px 16px',
                borderRadius: '6px',
                flex: '1',
                minWidth: '120px',
                textAlign: 'center'
              }}>
                <Text style={{ 
                  fontSize: '12px', 
                  color: EMAIL_COLORS.textLight, 
                  margin: '0 0 4px 0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Transactions
                </Text>
                <Text style={{ 
                  fontSize: '18px', 
                  fontWeight: '700', 
                  color: EMAIL_COLORS.text,
                  margin: '0'
                }}>
                  {reportSummary.totalTransactions}
                </Text>
              </div>
            )}
            
            {reportSummary.keyMetric && (
              <div style={{ 
                background: EMAIL_COLORS.background,
                padding: '12px 16px',
                borderRadius: '6px',
                flex: '1',
                minWidth: '120px',
                textAlign: 'center'
              }}>
                <Text style={{ 
                  fontSize: '12px', 
                  color: EMAIL_COLORS.textLight, 
                  margin: '0 0 4px 0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Growth
                </Text>
                <Text style={{ 
                  fontSize: '18px', 
                  fontWeight: '700', 
                  color: '#059669',
                  margin: '0'
                }}>
                  {reportSummary.keyMetric}
                </Text>
              </div>
            )}
          </div>
        </Section>
      )}

      <Hr style={{ margin: '24px 0', borderColor: EMAIL_COLORS.border }} />

      {/* Download Information */}
      <Section>
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
          }}
        >
          Download Details
        </Text>
        
        <Text style={emailStyles.text}>
          <strong>File Size:</strong> {fileSize}
        </Text>
        
        <Text style={emailStyles.text}>
          <strong>Download Link Expires:</strong> {expiresAt}
        </Text>
        
        <Text style={{
          ...emailStyles.text,
          fontSize: '14px',
          color: EMAIL_COLORS.textLight,
          fontStyle: 'italic'
        }}>
          For security, this download link will expire automatically. 
          Contact support if you need the report regenerated.
        </Text>
      </Section>

      {/* Download Button */}
      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          style={{
            backgroundColor: EMAIL_COLORS.gold,
            borderRadius: '2px',
            color: EMAIL_COLORS.text,
            fontSize: '16px',
            fontWeight: '600',
            letterSpacing: '1px',
            lineHeight: '1.5',
            padding: '16px 32px',
            textAlign: 'center',
            textDecoration: 'none',
            textTransform: 'uppercase',
          }}
          href={downloadUrl}
        >
          Download Report
        </Button>
      </Section>

      {/* Next Steps */}
      <Section>
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
          }}
        >
          What's Next
        </Text>
        
        <Text style={emailStyles.text}>
          • Review the report data and analysis
        </Text>
        <Text style={emailStyles.text}>
          • Share insights with your team as needed
        </Text>
        <Text style={emailStyles.text}>
          • Archive the report for compliance records
        </Text>
        <Text style={emailStyles.text}>
          • <Link 
              href="https://yesgoddess.com/admin/reports/schedule"
              style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
            >
              Set up automated delivery
            </Link> for recurring reports
        </Text>
      </Section>

      <Hr style={{ margin: '24px 0', borderColor: EMAIL_COLORS.border }} />

      {/* Footer */}
      <Text
        style={{
          ...emailStyles.text,
          fontSize: '14px',
          color: EMAIL_COLORS.textLight,
          textAlign: 'center',
          marginTop: '24px',
        }}
      >
        This is an automated notification from YesGoddess Financial Analytics.<br />
        For questions about this report, reply to this email or contact{' '}
        <Link 
          href="mailto:finance@yesgoddess.com"
          style={{ color: EMAIL_COLORS.gold }}
        >
          finance@yesgoddess.com
        </Link>
      </Text>

      <Text
        style={{
          ...emailStyles.text,
          fontSize: '12px',
          color: EMAIL_COLORS.textLight,
          textAlign: 'center',
          marginTop: '16px',
          fontStyle: 'italic',
        }}
      >
        CONFIDENTIAL: This report contains proprietary financial information.
      </Text>
    </EmailLayout>
  );
};

export default FinancialReportReady;
