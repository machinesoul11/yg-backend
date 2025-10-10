import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface WelcomeEmailProps {
  userName: string;
  verificationUrl: string;
  role: 'creator' | 'brand';
}

export const WelcomeEmail = ({
  userName,
  verificationUrl,
  role,
}: WelcomeEmailProps) => {
  const previewText = `Welcome to YES GODDESS, ${userName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/logo/yesgoddesslogo.png`}
              width="180"
              height="48"
              alt="YES GODDESS"
            />
          </Section>

          <Heading style={h1}>Welcome to YES GODDESS</Heading>

          <Text style={text}>{userName},</Text>

          <Text style={text}>
            Your {role} account has been created. To complete your
            registration, please verify your email address.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={verificationUrl}>
              Verify Email Address
            </Button>
          </Section>

          <Text style={text}>This link will expire in 24 hours.</Text>

          <Text style={footer}>
            The work is sacred. The creator is sovereign.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

// YES GODDESS Brand-aligned styles
const main = {
  backgroundColor: '#FAF8F5', // Brand warm white
  fontFamily: 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  backgroundColor: '#FFFFFF', // Brand white
  margin: '0 auto',
  padding: '48px 32px',
  maxWidth: '600px',
  border: '1px solid #F5E6D3', // Brand cream
};

const header = {
  textAlign: 'center' as const,
  marginBottom: '32px',
  padding: '24px 0',
  backgroundColor: '#000000', // Brand black
  borderRadius: '8px 8px 0 0',
  marginTop: '-48px',
  marginLeft: '-32px',
  marginRight: '-32px',
};

const h1 = {
  color: '#D4AF37', // Brand gold
  fontFamily: '"Playfair Display", serif',
  fontSize: '32px',
  fontWeight: '700',
  letterSpacing: '-0.01em',
  lineHeight: '1.2',
  margin: '0 0 24px',
  textAlign: 'center' as const,
};

const text = {
  color: '#000000', // Brand black
  fontSize: '16px',
  lineHeight: '1.7',
  margin: '0 0 16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#D4AF37', // Brand gold
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '600',
  letterSpacing: '0',
  lineHeight: '1.5',
  padding: '14px 32px',
  textAlign: 'center' as const,
  textDecoration: 'none',
};

const footer = {
  color: '#6B7280',
  fontSize: '14px',
  fontStyle: 'italic',
  lineHeight: '1.6',
  marginTop: '32px',
  textAlign: 'center' as const,
  borderTop: '1px solid #F5E6D3',
  paddingTop: '24px',
};

export default WelcomeEmail;
