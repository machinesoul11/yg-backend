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
} from '@react-email/components';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';
import { EmailLayout } from '../components/EmailLayout';
import * as React from 'react';

interface RoyaltyStatementReadyProps {
  creatorName: string;
  periodStart: string;
  periodEnd: string;
  totalEarnings: string;
  dashboardUrl: string;
}

export const RoyaltyStatementReady = ({
  creatorName = 'Creator',
  periodStart = 'January 1, 2025',
  periodEnd = 'January 31, 2025',
  totalEarnings = '1,234.56',
  dashboardUrl = 'https://yesgoddess.com/creator/royalties',
}: RoyaltyStatementReadyProps) => {
  const previewText = `Your royalty statement for ${periodStart} - ${periodEnd} is ready`;

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>
        Your Royalty Statement is Ready 📊
      </Heading>

      <Text style={emailStyles.text}>Hello {creatorName},</Text>

      <Text style={emailStyles.text}>
        Your royalty statement for the period <strong>{periodStart}</strong> to{' '}
        <strong>{periodEnd}</strong> is now available for review.
      </Text>

      <Section
        style={{
          background: EMAIL_COLORS.goldLight,
          borderRadius: '8px',
          padding: '24px',
          marginTop: '24px',
          marginBottom: '24px',
        }}
      >
        <Text
          style={{
            ...emailStyles.text,
            textAlign: 'center',
            fontSize: '14px',
            marginBottom: '8px',
          }}
        >
          Total Earnings
        </Text>
        <Text
          style={{
            fontFamily: emailStyles.h1.fontFamily,
            fontSize: '36px',
            fontWeight: '700',
            color: EMAIL_COLORS.gold,
            textAlign: 'center',
            margin: '0',
          }}
        >
          ${totalEarnings}
        </Text>
      </Section>

      <Text style={emailStyles.text}>
        Your statement includes a detailed breakdown of all license revenue and
        your earnings from each IP asset.
      </Text>

      <Section style={{ marginTop: '32px', marginBottom: '32px' }}>
        <Button
          href={dashboardUrl}
          style={{
            ...emailStyles.buttonPrimary,
            width: '100%',
          }}
        >
          View Statement Details
        </Button>
      </Section>

      <Hr style={emailStyles.divider} />

      <Text style={emailStyles.textSmall}>
        <strong>Next Steps:</strong>
      </Text>
      <Text style={emailStyles.textSmall}>
        • Review your statement for accuracy
        <br />
        • If you have any questions or concerns, you can dispute the statement
        <br />
        • Once reviewed, your payment will be processed automatically
        <br />
      </Text>

      <Text style={emailStyles.textSmall}>
        If you believe there's an error in your statement, you can submit a
        dispute directly from your dashboard. We'll review it promptly and get
        back to you.
      </Text>
    </EmailLayout>
  );
};

export default RoyaltyStatementReady;
