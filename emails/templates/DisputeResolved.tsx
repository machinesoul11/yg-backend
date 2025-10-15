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

interface DisputeResolvedProps {
  creatorName: string;
  statementId: string;
  resolution: string;
  adjustmentAmount?: string | null;
  newTotal?: string;
  dashboardUrl: string;
}

export default function DisputeResolved({
  creatorName = 'Creator',
  statementId = 'STMT_123',
  resolution = 'Your dispute has been reviewed and resolved.',
  adjustmentAmount = null,
  newTotal = '1,000.00',
  dashboardUrl = 'https://app.yesgoddess.com/creator/royalties',
}: DisputeResolvedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your statement dispute has been resolved</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Dispute Resolved</Heading>

          <Text style={text}>Hello {creatorName},</Text>

          <Text style={text}>
            Your dispute for statement <strong>#{statementId.substring(0, 12)}</strong> has been resolved.
          </Text>

          <Section
            style={{
              background: '#FEF9E7',
              borderLeft: '4px solid #D4AF37',
              padding: '20px',
              marginTop: '24px',
              marginBottom: '24px',
              borderRadius: '8px',
            }}
          >
            <Text style={{ ...text, fontWeight: 'bold', marginBottom: '12px' }}>
              Resolution:
            </Text>
            <Text style={{ ...text, color: '#E5E7EB' }}>
              {resolution}
            </Text>
          </Section>

          {adjustmentAmount && (
            <>
              <Text style={text}>
                An adjustment of <strong>${adjustmentAmount}</strong> has been applied to your statement.
              </Text>
              <Text style={text}>
                Your updated total is: <strong>${newTotal}</strong>
              </Text>
            </>
          )}

          <Section style={buttonContainer}>
            <Button style={button} href={`${dashboardUrl}/${statementId}`}>
              View Statement
            </Button>
          </Section>

          <Hr style={divider} />

          <Text style={{ ...text, fontSize: '14px', color: '#9CA3AF' }}>
            Thank you for bringing this to our attention. If you have additional questions, please contact support.
          </Text>

          <Text style={footer}>
            The work is sacred. The creator is sovereign.
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
