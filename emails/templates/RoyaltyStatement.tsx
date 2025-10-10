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
import * as React from 'react';

interface RoyaltyStatementProps {
  userName: string;
  period: string;
  totalAmount: string;
  currency: string;
  statementUrl: string;
  royalties: Array<{
    licenseName: string;
    amount: string;
  }>;
}

export const RoyaltyStatement = ({
  userName,
  period,
  totalAmount,
  currency,
  statementUrl,
  royalties,
}: RoyaltyStatementProps) => {
  const previewText = `Your royalty statement for ${period}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Royalty Statement</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            Your royalty statement for <strong>{period}</strong> is now
            available.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLabel}>Total Royalties Earned</Text>
            <Text style={summaryAmount}>
              {currency} {totalAmount}
            </Text>
          </Section>

          <Text style={sectionHeading}>Breakdown by License</Text>

          {royalties.map((royalty, index) => (
            <React.Fragment key={index}>
              <Section style={royaltyItem}>
                <Text style={royaltyName}>{royalty.licenseName}</Text>
                <Text style={royaltyAmount}>
                  {currency} {royalty.amount}
                </Text>
              </Section>
              {index < royalties.length - 1 && <Hr style={divider} />}
            </React.Fragment>
          ))}

          <Section style={buttonContainer}>
            <Button style={button} href={statementUrl}>
              View Full Statement
            </Button>
          </Section>

          <Text style={footer}>
            Payments are processed within 5 business days.
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
  backgroundColor: '#E8E4DF',
  padding: '24px',
  margin: '24px 0',
  textAlign: 'center' as const,
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
  color: '#0A0A0A',
  fontSize: '36px',
  fontWeight: '600',
  margin: '0',
};

const sectionHeading = {
  color: '#0A0A0A',
  fontSize: '18px',
  fontWeight: '500',
  letterSpacing: '1px',
  margin: '32px 0 16px',
  textTransform: 'uppercase' as const,
};

const royaltyItem = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px 0',
};

const royaltyName = {
  color: '#0A0A0A',
  fontSize: '16px',
  margin: '0',
};

const royaltyAmount = {
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
};

const divider = {
  borderColor: '#C4C0B8',
  margin: '0',
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

export default RoyaltyStatement;
