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

interface CustomReportReadyProps {
  recipientName: string;
  reportName: string;
  reportDescription?: string;
  reportCategory: string;
  dateRange: string;
  downloadUrl: string;
  expiresAt: string;
  fileFormat: string;
  fileSizeMB: string;
  generationTime: string;
  warnings?: string[];
}

export const CustomReportReady = ({
  recipientName = 'User',
  reportName = 'Custom Financial Analysis',
  reportDescription = 'Revenue analysis by creator with monthly grouping',
  reportCategory = 'Financial Report',
  dateRange = 'January 1, 2025 - October 17, 2025',
  downloadUrl = 'https://yesgoddess.com/reports/download/custom/abc123',
  expiresAt = 'October 24, 2025 at 5:00 PM',
  fileFormat = 'PDF',
  fileSizeMB = '2.4',
  generationTime = '45 seconds',
  warnings = []
}: CustomReportReadyProps) => {
  const previewText = `Your custom report "${reportName}" is ready for download`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>
        Custom Report Ready ✅
      </Heading>

      <Text style={emailStyles.text}>
        Hi {recipientName},
      </Text>

      <Text style={emailStyles.text}>
        Your custom report <strong>{reportName}</strong> has been successfully generated and is ready for download.
      </Text>

      {/* Report Info Card */}
      <Section style={emailStyles.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.textMuted,
                fontSize: '14px',
                width: '140px'
              }}>
                Report Name:
              </td>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.text,
                fontSize: '14px',
                fontWeight: '600'
              }}>
                {reportName}
              </td>
            </tr>
            {reportDescription && (
              <tr>
                <td style={{ 
                  padding: '8px 0', 
                  color: EMAIL_COLORS.textMuted,
                  fontSize: '14px'
                }}>
                  Description:
                </td>
                <td style={{ 
                  padding: '8px 0', 
                  color: EMAIL_COLORS.text,
                  fontSize: '14px'
                }}>
                  {reportDescription}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.textMuted,
                fontSize: '14px'
              }}>
                Category:
              </td>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.text,
                fontSize: '14px'
              }}>
                {reportCategory}
              </td>
            </tr>
            <tr>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.textMuted,
                fontSize: '14px'
              }}>
                Date Range:
              </td>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.text,
                fontSize: '14px'
              }}>
                {dateRange}
              </td>
            </tr>
            <tr>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.textMuted,
                fontSize: '14px'
              }}>
                Format:
              </td>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.text,
                fontSize: '14px'
              }}>
                {fileFormat} ({fileSizeMB} MB)
              </td>
            </tr>
            <tr>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.textMuted,
                fontSize: '14px'
              }}>
                Generated In:
              </td>
              <td style={{ 
                padding: '8px 0', 
                color: EMAIL_COLORS.text,
                fontSize: '14px'
              }}>
                {generationTime}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Warnings (if any) */}
      {warnings && warnings.length > 0 && (
        <Section
          style={{
            background: '#FEF3C7',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            border: '1px solid #F59E0B',
          }}
        >
          <Text style={{ 
            margin: '0 0 8px 0', 
            fontSize: '14px', 
            fontWeight: '600',
            color: '#92400E'
          }}>
            ⚠️ Important Notes:
          </Text>
          {warnings.map((warning, index) => (
            <Text key={index} style={{ 
              margin: '4px 0', 
              fontSize: '13px',
              color: '#92400E'
            }}>
              • {warning}
            </Text>
          ))}
        </Section>
      )}

      {/* Download Button */}
      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          href={downloadUrl}
          style={emailStyles.buttonPrimary}
        >
          Download Report
        </Button>
      </Section>

      {/* Expiration Notice */}
      <Section
        style={{
          background: '#FEE2E2',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          border: '1px solid #EF4444',
        }}
      >
        <Text style={{ 
          margin: 0, 
          fontSize: '13px',
          color: '#7F1D1D'
        }}>
          🕐 <strong>Download Link Expires:</strong> {expiresAt}
        </Text>
        <Text style={{ 
          margin: '8px 0 0 0', 
          fontSize: '13px',
          color: '#7F1D1D'
        }}>
          Please download your report before this link expires. After expiration, you'll need to regenerate the report.
        </Text>
      </Section>

      {/* Help Section */}
      <Hr style={emailStyles.divider} />

      <Section>
        <Heading style={{ ...emailStyles.h2, fontSize: '16px', marginTop: '24px' }}>
          Need Help?
        </Heading>
        <Text style={{ ...emailStyles.text, fontSize: '14px' }}>
          If you have questions about your report or need to create additional custom reports:
        </Text>
        <ul style={{ margin: '12px 0', paddingLeft: '20px' }}>
          <li style={{ ...emailStyles.text, fontSize: '14px', marginBottom: '8px' }}>
            <Link 
              href="https://yesgoddess.com/admin/reports/custom" 
              style={emailStyles.link}
            >
              Create Another Custom Report
            </Link>
          </li>
          <li style={{ ...emailStyles.text, fontSize: '14px', marginBottom: '8px' }}>
            <Link 
              href="https://yesgoddess.com/admin/reports/saved" 
              style={emailStyles.link}
            >
              View Saved Report Configurations
            </Link>
          </li>
          <li style={{ ...emailStyles.text, fontSize: '14px', marginBottom: '8px' }}>
            <Link 
              href="https://yesgoddess.com/admin/support" 
              style={emailStyles.link}
            >
              Contact Support
            </Link>
          </li>
        </ul>
      </Section>

      <Text style={{ ...emailStyles.text, fontSize: '14px', marginTop: '24px' }}>
        Best regards,
        <br />
        The YES GODDESS Team
      </Text>
    </EmailLayout>
  );
};

export default CustomReportReady;
