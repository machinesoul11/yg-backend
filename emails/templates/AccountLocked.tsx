/**
 * Account Locked Email Template
 * Sent when a user account is locked due to excessive failed login attempts
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
  Link,
} from '@react-email/components';
import * as React from 'react';

export interface AccountLockedProps {
  userName: string;
  lockedUntil: string;
  lockoutMinutes: number;
  ipAddress: string;
  failedAttempts: number;
  unlockTime: string;
}

export default function AccountLocked({
  userName = 'User',
  lockedUntil,
  lockoutMinutes = 30,
  ipAddress = 'Unknown',
  failedAttempts = 10,
  unlockTime,
}: AccountLockedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your account has been temporarily locked for security reasons</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔒 Account Security Alert</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            Your account has been temporarily locked due to {failedAttempts} consecutive failed login attempts.
            This is a security measure to protect your account from unauthorized access.
          </Text>

          <Section style={alertBox}>
            <Text style={alertText}>
              <strong>Account Status:</strong> Locked
            </Text>
            <Text style={alertText}>
              <strong>Lockout Duration:</strong> {lockoutMinutes} minutes
            </Text>
            <Text style={alertText}>
              <strong>Will unlock at:</strong> {unlockTime}
            </Text>
            <Text style={alertText}>
              <strong>IP Address:</strong> {ipAddress}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>What happens next?</Heading>
          
          <Text style={text}>
            Your account will automatically unlock after {lockoutMinutes} minutes. You'll then be able to 
            log in again with your correct credentials.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Was this you?</Heading>
          
          <Text style={text}>
            If you were trying to log in and forgot your password, you can reset it using the 
            password reset feature once your account is unlocked.
          </Text>

          <Text style={text}>
            <strong>If this wasn't you:</strong> Someone may be trying to access your account. 
            We recommend changing your password as soon as your account is unlocked. If you have 
            concerns about your account security, please contact our support team immediately.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Need help?</Heading>
          
          <Text style={text}>
            If you're having trouble accessing your account or have security concerns, our support 
            team is here to help:
          </Text>
          
          <Text style={text}>
            <Link href="mailto:support@yesgoddess.agency" style={link}>
              support@yesgoddess.agency
            </Link>
          </Text>

          <Hr style={hr} />
          
          <Text style={footer}>
            This is an automated security notification from YES GODDESS. 
            You're receiving this because your account experienced multiple failed login attempts.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
};

const h2 = {
  color: '#333',
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '24px 0 16px',
  padding: '0 40px',
};

const text = {
  color: '#333',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
  padding: '0 40px',
};

const alertBox = {
  backgroundColor: '#fff3cd',
  border: '1px solid #ffc107',
  borderRadius: '4px',
  padding: '16px',
  margin: '24px 40px',
};

const alertText = {
  color: '#856404',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '8px 0',
};

const link = {
  color: '#5e6ad2',
  textDecoration: 'underline',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 40px',
  marginTop: '32px',
};
