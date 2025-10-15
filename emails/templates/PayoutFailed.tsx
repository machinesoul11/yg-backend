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

interface PayoutFailedProps {
  userName: string;
  amount: number;
  currency: string;
  errorMessage: string;
  actionSteps: string;
  supportUrl: string;
}

export const PayoutFailed = ({
  userName,
  amount,
  currency,
  errorMessage,
  actionSteps,
  supportUrl,
}: PayoutFailedProps) => {
  const previewText = `Your payout of ${currency} ${amount} could not be processed`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Payout Failed</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            We were unable to process your payout. Here's what happened:
          </Text>

          <Section style={errorBox}>
            <Text style={errorTitle}>Issue Detected</Text>
            <Text style={errorText}>{errorMessage}</Text>
          </Section>

          <Section style={actionBox}>
            <Text style={actionTitle}>Next Steps</Text>
            <Text style={actionText}>{actionSteps}</Text>
          </Section>

          <Section style={detailsBox}>
            <Text style={detailLabel}>Payout Amount</Text>
            <Text style={detailValue}>
              {currency} {amount}
            </Text>
          </Section>

          <Text style={text}>
            Your funds remain in your account balance and are available for withdrawal once you resolve the issue above.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={supportUrl}>
              Update Payment Settings
            </Button>
          </Section>

          <Text style={helpText}>
            Need help? Contact our support team at support@yesgoddess.agency
          </Text>

          <Text style={footer}>
            The work is sacred. The creator is sovereign.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default PayoutFailed;

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
  color: '#DC2626',
  fontSize: '32px',
  fontWeight: '400',
  letterSpacing: '2px',
  lineHeight: '40px',
  margin: '0 0 20px',
  textTransform: 'uppercase' as const,
};

const text = {
  color: '#374151',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 0',
};

const errorBox = {
  backgroundColor: '#FEF2F2',
  border: '2px solid #DC2626',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const errorTitle = {
  color: '#DC2626',
  fontSize: '14px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 8px',
};

const errorText = {
  color: '#991B1B',
  fontSize: '16px',
  lineHeight: '24px',
  margin: 0,
};

const actionBox = {
  backgroundColor: '#FEF9E7',
  border: '2px solid #D4AF37',
  borderRadius: '8px',
  padding: '20px',
  margin: '24px 0',
};

const actionTitle = {
  color: '#D4AF37',
  fontSize: '14px',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 8px',
};

const actionText = {
  color: '#6B5A2F',
  fontSize: '16px',
  lineHeight: '24px',
  margin: 0,
};

const detailsBox = {
  borderTop: '1px solid #E5E7EB',
  paddingTop: '16px',
  marginTop: '24px',
};

const detailLabel = {
  color: '#6B7280',
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 4px',
};

const detailValue = {
  color: '#0A0A0A',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: 0,
};

const buttonContainer = {
  margin: '32px 0',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#D4AF37',
  borderRadius: '4px',
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '16px 32px',
  letterSpacing: '1px',
  textTransform: 'uppercase' as const,
};

const helpText = {
  color: '#6B7280',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'center' as const,
  margin: '24px 0',
};

const footer = {
  color: '#9CA3AF',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '32px',
  paddingTop: '32px',
  borderTop: '1px solid #E5E7EB',
  fontStyle: 'italic',
};
