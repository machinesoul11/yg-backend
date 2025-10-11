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

interface RoyaltyDisputeConfirmationProps {
  creatorName: string;
  statementId: string;
}

export const RoyaltyDisputeConfirmation = ({
  creatorName = 'Creator',
  statementId = 'stmt_xxx',
}: RoyaltyDisputeConfirmationProps) => {
  const previewText = 'Your dispute has been submitted successfully';

  return (
    <EmailLayout previewText={previewText}>
      <Heading style={emailStyles.h1}>Dispute Submitted ✓</Heading>

      <Text style={emailStyles.text}>Hello {creatorName},</Text>

      <Text style={emailStyles.text}>
        We've received your dispute for royalty statement{' '}
        <strong>{statementId}</strong>.
      </Text>

      <Section
        style={{
          background: EMAIL_COLORS.goldLight,
          borderRadius: '8px',
          padding: '20px',
          marginTop: '24px',
          marginBottom: '24px',
        }}
      >
        <Text style={{ ...emailStyles.text, margin: 0 }}>
          <strong>What happens next:</strong>
        </Text>
        <Text style={{ ...emailStyles.textSmall, marginTop: '12px' }}>
          1. Our team will review your dispute within 48 hours
          <br />
          2. We'll investigate the calculation and check for any errors
          <br />
          3. You'll receive an email with our resolution
          <br />
          4. If an adjustment is needed, it will be applied to your statement
          <br />
        </Text>
      </Section>

      <Text style={emailStyles.text}>
        We take accuracy seriously and appreciate you bringing this to our
        attention. If you have any additional information, please reply to this
        email.
      </Text>

      <Text style={emailStyles.textSmall}>
        Reference ID: {statementId}
      </Text>
    </EmailLayout>
  );
};

export default RoyaltyDisputeConfirmation;
