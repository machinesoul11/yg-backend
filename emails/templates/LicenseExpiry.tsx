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

interface LicenseExpiryProps {
  userName: string;
  licenseName: string;
  brandName: string;
  expiryDate: string;
  daysRemaining: number;
  renewalUrl: string;
}

export const LicenseExpiry = ({
  userName,
  licenseName,
  brandName,
  expiryDate,
  daysRemaining,
  renewalUrl,
}: LicenseExpiryProps) => {
  const previewText = `Your license "${licenseName}" expires in ${daysRemaining} days`;

  const urgency = daysRemaining <= 30 ? 'high' : daysRemaining <= 60 ? 'medium' : 'low';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>License Expiring Soon</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            Your license <strong>"{licenseName}"</strong> with {brandName} will
            expire in <strong>{daysRemaining} days</strong> on {expiryDate}.
          </Text>

          {urgency === 'high' && (
            <Section style={{ ...alertBox, ...alertBoxHigh }}>
              <Text style={alertText}>⚠️ Urgent: License expires soon!</Text>
            </Section>
          )}

          {urgency === 'medium' && (
            <Section style={{ ...alertBox, ...alertBoxMedium }}>
              <Text style={alertText}>
                ⏰ Reminder: License expires in {daysRemaining} days
              </Text>
            </Section>
          )}

          <Text style={text}>
            To avoid interruption of royalty payments and maintain your
            licensing agreement, please review and renew your license before the
            expiry date.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={renewalUrl}>
              Review License
            </Button>
          </Section>

          <Text style={footer}>
            Questions? Contact the brand directly through your dashboard.
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

const alertBox = {
  padding: '16px 24px',
  margin: '24px 0',
  borderRadius: '4px',
  textAlign: 'center' as const,
};

const alertBoxHigh = {
  backgroundColor: '#FFE5E5',
  border: '2px solid #FF4444',
};

const alertBoxMedium = {
  backgroundColor: '#FFF4E5',
  border: '2px solid #FFA500',
};

const alertText = {
  color: '#0A0A0A',
  fontSize: '16px',
  fontWeight: '600',
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

export default LicenseExpiry;
