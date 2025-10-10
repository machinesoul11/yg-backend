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

interface PasswordResetProps {
  userName: string;
  resetUrl: string;
}

export const PasswordReset = ({ userName, resetUrl }: PasswordResetProps) => {
  const previewText = 'Reset your password';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Reset Your Password</Heading>

          <Text style={text}>Hello {userName},</Text>

          <Text style={text}>
            We received a request to reset your password. Click the button
            below to create a new password.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              Reset Password
            </Button>
          </Section>

          <Text style={text}>This link will expire in 1 hour.</Text>

          <Text style={footer}>
            If you didn't request a password reset, you can safely ignore this
            email. Your password will remain unchanged.
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

export default PasswordReset;
