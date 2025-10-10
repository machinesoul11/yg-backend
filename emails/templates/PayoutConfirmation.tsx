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
import * as React from 'react';

interface PayoutConfirmationProps {
  userName: string;
  amount: string;
  currency: string;
  period: string;
  transferId: string;
  estimatedArrival: string;
}

export const PayoutConfirmation = ({
  userName,
  amount,
  currency,
  period,
  transferId,
  estimatedArrival,
}: PayoutConfirmationProps) => {
  const previewText = `Your payout of ${currency} ${amount} is on its way`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Payout Confirmed</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            Great news! Your payout for <strong>{period}</strong> has been
            processed.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLabel}>Payout Amount</Text>
            <Text style={summaryAmount}>
              {currency} {amount}
            </Text>
          </Section>

          <Section style={detailsBox}>
            <Text style={detailLabel}>Transfer ID</Text>
            <Text style={detailValue}>{transferId}</Text>

            <Text style={detailLabel}>Estimated Arrival</Text>
            <Text style={detailValue}>{estimatedArrival}</Text>
          </Section>

          <Text style={text}>
            Funds will be deposited to your connected bank account or Stripe
            account.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href="https://app.yesgoddess.com/payouts">
              View Payout History
            </Button>
          </Section>

          <Text style={footer}>
            The work is sacred. The creator is sovereign.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: '#0A0A0A',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  backgroundColor: '#F8F6F3',
  margin: '0 auto',
  padding: '48px 32px',
  maxWidth: '600px',
};

const h1 = {
  color: '#0A0A0A',
  fontSize: '32px',
  fontWeight: '400',
  letterSpacing: '2px',
  lineHeight: '1.2',
  margin: '0 0 24px',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
};

const text = {
  color: '#0A0A0A',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const summaryBox = {
  backgroundColor: '#E8F5E9',
  padding: '24px',
  margin: '24px 0',
  textAlign: 'center' as const,
  borderRadius: '4px',
};

const summaryLabel = {
  color: '#666',
  fontSize: '14px',
  fontWeight: '500',
  letterSpacing: '1px',
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
};

const summaryAmount = {
  color: '#2E7D32',
  fontSize: '36px',
  fontWeight: '600',
  margin: '0',
};

const detailsBox = {
  backgroundColor: '#F5F5F5',
  padding: '24px',
  margin: '24px 0',
  borderRadius: '4px',
};

const detailLabel = {
  color: '#666',
  fontSize: '12px',
  fontWeight: '500',
  letterSpacing: '1px',
  margin: '16px 0 4px 0',
  textTransform: 'uppercase' as const,
};

const detailValue = {
  color: '#0A0A0A',
  fontSize: '14px',
  fontFamily: 'monospace',
  margin: '0 0 8px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#B8A888',
  borderRadius: '2px',
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: '500',
  letterSpacing: '1px',
  lineHeight: '1.5',
  padding: '14px 32px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
};

const footer = {
  color: '#C4C0B8',
  fontSize: '14px',
  fontStyle: 'italic',
  lineHeight: '1.4',
  marginTop: '32px',
  textAlign: 'center' as const,
};

export default PayoutConfirmation;
