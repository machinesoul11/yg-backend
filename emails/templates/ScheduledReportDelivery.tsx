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

interface ScheduledReportDeliveryProps {
  recipientName: string;
  reportName: string;
  reportType: string;
  reportPeriod: string;
  frequency: string;
  downloadUrl: string;
  expiresAt: string;
  nextScheduledDate: string;
  attachmentCount: number;
  fileFormats: string[];
  reportSummary?: {
    keyMetrics: Array<{
      label: string;
      value: string;
      trend?: 'up' | 'down' | 'stable';
    }>;
  };
}

export const ScheduledReportDelivery = ({
  recipientName = 'Administrator',
  reportName = 'Monthly Revenue Summary',
  reportType = 'Revenue Report',
  reportPeriod = 'October 2025',
  frequency = 'Monthly',
  downloadUrl = 'https://yesgoddess.com/reports/download/scheduled/abc123',
  expiresAt = 'November 22, 2025',
  nextScheduledDate = 'December 15, 2025',
  attachmentCount = 3,
  fileFormats = ['PDF', 'Excel', 'CSV'],
  reportSummary = {
    keyMetrics: [
      { label: 'Total Revenue', value: '$145,620', trend: 'up' },
      { label: 'New Licenses', value: '287', trend: 'up' },
      { label: 'Active Creators', value: '1,456', trend: 'stable' }
    ]
  }
}: ScheduledReportDeliveryProps) => {
  const previewText = `Your ${frequency.toLowerCase()} ${reportType} for ${reportPeriod} has been automatically generated`;

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return '↗️';
      case 'down': return '↘️';
      case 'stable': return '→';
      default: return '';
    }
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return '#059669';
      case 'down': return '#dc2626';
      case 'stable': return EMAIL_COLORS.textLight;
      default: return EMAIL_COLORS.text;
    }
  };

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>
        Scheduled Report Delivery 📋
      </Heading>

      <Text style={emailStyles.text}>
        {recipientName},
      </Text>

      <Text style={emailStyles.text}>
        Your scheduled <strong>{reportName}</strong> has been automatically generated and is ready for download.
      </Text>

      {/* Report Schedule Info */}
      <Section
        style={{
          background: EMAIL_COLORS.background,
          borderRadius: '8px',
          padding: '20px',
          marginTop: '24px',
          marginBottom: '24px',
          border: `1px solid ${EMAIL_COLORS.border}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <Text
            style={{
              ...emailStyles.text,
              fontSize: '16px',
              fontWeight: '600',
              margin: '0',
            }}
          >
            {reportName}
          </Text>
          <div style={{
            background: EMAIL_COLORS.gold,
            color: EMAIL_COLORS.text,
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {frequency}
          </div>
        </div>
        
        <Text style={{ ...emailStyles.text, fontSize: '14px', margin: '8px 0' }}>
          <strong>Period:</strong> {reportPeriod}
        </Text>
        
        <Text style={{ ...emailStyles.text, fontSize: '14px', margin: '8px 0' }}>
          <strong>Formats:</strong> {fileFormats.join(', ')}
        </Text>
        
        <Text style={{ ...emailStyles.text, fontSize: '14px', margin: '8px 0' }}>
          <strong>Next Delivery:</strong> {nextScheduledDate}
        </Text>
      </Section>

      {/* Key Metrics Dashboard */}
      {reportSummary?.keyMetrics && (
        <Section style={{ marginBottom: '24px' }}>
          <Text
            style={{
              ...emailStyles.text,
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '16px',
            }}
          >
            Key Performance Metrics
          </Text>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {reportSummary.keyMetrics.map((metric, index) => (
              <div
                key={index}
                style={{ 
                  background: EMAIL_COLORS.goldLight,
                  padding: '16px',
                  borderRadius: '8px',
                  flex: '1',
                  minWidth: '140px',
                  textAlign: 'center',
                  border: `1px solid ${EMAIL_COLORS.gold}`
                }}
              >
                <Text style={{ 
                  fontSize: '12px', 
                  color: EMAIL_COLORS.textLight, 
                  margin: '0 0 6px 0',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {metric.label}
                </Text>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Text style={{ 
                    fontSize: '20px', 
                    fontWeight: '700', 
                    color: getTrendColor(metric.trend),
                    margin: '0'
                  }}>
                    {metric.value}
                  </Text>
                  {metric.trend && (
                    <span style={{ fontSize: '16px' }}>
                      {getTrendIcon(metric.trend)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Hr style={{ margin: '24px 0', borderColor: EMAIL_COLORS.border }} />

      {/* Download Section */}
      <Section>
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
          }}
        >
          Report Files ({attachmentCount} files)
        </Text>
        
        <Text style={emailStyles.text}>
          Your report is available in multiple formats for your convenience:
        </Text>
        
        <div style={{ margin: '16px 0', padding: '0 16px' }}>
          {fileFormats.map((format, index) => (
            <Text key={index} style={{ ...emailStyles.text, margin: '4px 0' }}>
              • <strong>{format}</strong> - {format === 'PDF' ? 'Professional presentation' : format === 'Excel' ? 'Data analysis and charts' : 'Raw data export'}
            </Text>
          ))}
        </div>
        
        <Text style={{
          ...emailStyles.text,
          fontSize: '14px',
          color: EMAIL_COLORS.textLight,
          fontStyle: 'italic',
          margin: '16px 0'
        }}>
          <strong>Security Notice:</strong> Download links expire on {expiresAt} for data protection.
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
          Download All Files
        </Button>
      </Section>

      {/* Automation Settings */}
      <Section
        style={{
          background: EMAIL_COLORS.background,
          borderRadius: '8px',
          padding: '20px',
          marginTop: '24px',
          marginBottom: '24px',
          border: `1px solid ${EMAIL_COLORS.border}`,
        }}
      >
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
          }}
        >
          Automation Settings
        </Text>
        
        <Text style={emailStyles.text}>
          This report is part of your <strong>{frequency.toLowerCase()}</strong> scheduled delivery.
        </Text>
        
        <Text style={emailStyles.text}>
          Next scheduled delivery: <strong>{nextScheduledDate}</strong>
        </Text>
        
        <Text style={emailStyles.text}>
          <Link 
            href="https://yesgoddess.com/admin/reports/scheduled"
            style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
          >
            Manage your scheduled reports
          </Link> | {' '}
          <Link 
            href="https://yesgoddess.com/admin/reports/settings"
            style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
          >
            Update delivery preferences
          </Link>
        </Text>
      </Section>

      {/* Actions */}
      <Section>
        <Text
          style={{
            ...emailStyles.text,
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
          }}
        >
          Quick Actions
        </Text>
        
        <Text style={emailStyles.text}>
          • <Link 
              href="https://yesgoddess.com/admin/reports/archive"
              style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
            >
              View report archive
            </Link> - Access previous reports
        </Text>
        <Text style={emailStyles.text}>
          • <Link 
              href="https://yesgoddess.com/admin/reports/dashboard"
              style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
            >
              Analytics dashboard
            </Link> - Real-time insights
        </Text>
        <Text style={emailStyles.text}>
          • <Link 
              href="https://yesgoddess.com/admin/reports/custom"
              style={{ color: EMAIL_COLORS.gold, textDecoration: 'underline' }}
            >
              Generate custom report
            </Link> - Ad-hoc analysis
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
        This is an automated delivery from YesGoddess Financial Analytics.<br />
        To modify your scheduled reports, visit the{' '}
        <Link 
          href="https://yesgoddess.com/admin/reports"
          style={{ color: EMAIL_COLORS.gold }}
        >
          admin dashboard
        </Link> or contact{' '}
        <Link 
          href="mailto:reports@yesgoddess.com"
          style={{ color: EMAIL_COLORS.gold }}
        >
          reports@yesgoddess.com
        </Link>
      </Text>
    </EmailLayout>
  );
};

export default ScheduledReportDelivery;
