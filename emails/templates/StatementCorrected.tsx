import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
  Preview,
  Heading,
} from '@react-email/components';
import React from 'react';

interface StatementCorrectedProps {
  creatorName: string;
  statementId: string;
  adjustmentAmount: string;
  adjustmentType: 'credit' | 'debit';
  reason: string;
  newTotal: string;
  dashboardUrl: string;
}

export default function StatementCorrected({
  creatorName = 'Creator',
  statementId = 'STMT_123',
  adjustmentAmount = '25.00',
  adjustmentType = 'credit',
  reason = 'Calculation adjustment',
  newTotal = '1,025.00',
  dashboardUrl = 'https://app.yesgoddess.com/creator/royalties',
}: StatementCorrectedProps) {
  return (
    <Html>
      <Head />
      <Preview>Statement correction: {adjustmentType === 'credit' ? '+' : '-'}${adjustmentAmount}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Statement Corrected</Heading>

          <Text style={text}>Hello {creatorName},</Text>

          <Text style={text}>
            We've applied a correction to your royalty statement <strong>#{statementId.substring(0, 12)}</strong>.
          </Text>

          <Section
            style={{
              background: adjustmentType === 'credit' ? '#ECFDF5' : '#FEF2F2',
              borderLeft: `4px solid ${adjustmentType === 'credit' ? '#10B981' : '#EF4444'}`,
              padding: '20px',
              marginTop: '24px',
              marginBottom: '24px',
              borderRadius: '8px',
            }}
          >
            <Text style={{ ...text, marginBottom: '8px', color: '#374151' }}>
              Adjustment Type:{' '}
              <strong>{adjustmentType === 'credit' ? 'Credit' : 'Debit'}</strong>
            </Text>
            <Text
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: adjustmentType === 'credit' ? '#10B981' : '#EF4444',
                marginBottom: '8px',
              }}
            >
              {adjustmentType === 'credit' ? '+' : '-'}${adjustmentAmount}
            </Text>
            <Text style={{ ...text, fontSize: '14px', color: '#6B7280' }}>
              Reason: {reason}
            </Text>
          </Section>

          <Text style={text}>
            Your updated statement total is now: <strong>${newTotal}</strong>
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={`${dashboardUrl}/${statementId}`}>
              View Updated Statement
            </Button>
          </Section>

          <Hr style={divider} />

          <Text style={{ ...text, fontSize: '14px', color: '#9CA3AF' }}>
            A corrected PDF statement has been automatically generated and is available in your dashboard.
            If you have questions about this correction, please contact support.
          </Text>

          <Text style={footer}>
            The work is sacred. The creator is compensated.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: '#0A0A0A',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
};

const h1 = {
  color: '#D4AF37',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '32px',
  padding: '0',
  margin: '30px 0 20px',
};

const text = {
  color: '#E5E7EB',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 0',
};

const buttonContainer = {
  padding: '24px 0',
};

const button = {
  backgroundColor: '#D4AF37',
  borderRadius: '6px',
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
};

const divider = {
  borderColor: '#374151',
  margin: '24px 0',
};

const footer = {
  color: '#9CA3AF',
  fontSize: '14px',
  lineHeight: '20px',
  marginTop: '32px',
  fontStyle: 'italic',
};
