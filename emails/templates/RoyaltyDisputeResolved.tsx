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
} from '@react-email/components';
import { EMAIL_COLORS, emailStyles } from '../styles/brand';
import { EmailLayout } from '../components/EmailLayout';
import * as React from 'react';

interface RoyaltyDisputeResolvedProps {
  creatorName: string;
  resolution: string;
  adjustmentAmount: string | null;
  dashboardUrl: string;
}

export const RoyaltyDisputeResolved = ({
  creatorName = 'Creator',
  resolution = 'Your dispute has been reviewed and resolved.',
  adjustmentAmount = null,
  dashboardUrl = 'https://yesgoddess.com/creator/royalties',
}: RoyaltyDisputeResolvedProps) => {
  const previewText = 'Your royalty dispute has been resolved';

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>Dispute Resolved ✓</Heading>

      <Text style={emailStyles.text}>Hello {creatorName},</Text>

      <Text style={emailStyles.text}>
        Your royalty statement dispute has been reviewed and resolved.
      </Text>

      <Section
        style={{
          background: EMAIL_COLORS.whiteWarm,
          borderRadius: '8px',
          padding: '20px',
          marginTop: '24px',
          marginBottom: '24px',
          border: `1px solid ${EMAIL_COLORS.border}`,
        }}
      >
        <Text style={{ ...emailStyles.h3, marginBottom: '12px' }}>
          Resolution:
        </Text>
        <Text style={{ ...emailStyles.text, margin: 0 }}>{resolution}</Text>
      </Section>

      {adjustmentAmount && (
        <Section
          style={{
            background: EMAIL_COLORS.goldLight,
            borderRadius: '8px',
            padding: '20px',
            marginTop: '16px',
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
            Adjustment Applied
          </Text>
          <Text
            style={{
              fontFamily: emailStyles.h1.fontFamily,
              fontSize: '32px',
              fontWeight: '700',
              color: EMAIL_COLORS.gold,
              textAlign: 'center',
              margin: '0',
            }}
          >
            ${adjustmentAmount}
          </Text>
        </Section>
      )}

      <Text style={emailStyles.text}>
        Your updated statement is now available in your dashboard. Payment will
        be processed according to our regular schedule.
      </Text>

      <Section style={{ marginTop: '32px', marginBottom: '32px' }}>
        <Button href={dashboardUrl} style={emailStyles.buttonPrimary}>
          View Updated Statement
        </Button>
      </Section>

      <Text style={emailStyles.textSmall}>
        Thank you for your patience. If you have any further questions, please
        don't hesitate to reach out to our support team.
      </Text>
    </EmailLayout>
  );
};

export default RoyaltyDisputeResolved;
