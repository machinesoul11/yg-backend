/**
 * Two-Factor Authentication Enabled Email Template
 * Sent when a user successfully enables 2FA on their account
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
  Button,
} from '@react-email/components';
import * as React from 'react';

export interface TwoFactorEnabledProps {
  userName: string;
  enabledAt: string;
  method: string;
  ipAddress: string;
  device: string;
  backupCodesCount: number;
  securityUrl: string;
}

export default function TwoFactorEnabled({
  userName = 'User',
  enabledAt,
  method = 'Authenticator App',
  ipAddress = 'Unknown',
  device = 'Unknown',
  backupCodesCount = 10,
  securityUrl,
}: TwoFactorEnabledProps) {
  return (
    <Html>
      <Head />
      <Preview>Two-factor authentication has been enabled on your account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔐 Two-Factor Authentication Enabled</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            Great news! Two-factor authentication (2FA) has been successfully enabled on your 
            YES GODDESS account. Your account is now more secure.
          </Text>

          <Section style={infoBox}>
            <Text style={infoTitle}>Security Enhancement Details</Text>
            <Text style={infoText}>
              <strong>Method:</strong> {method}
            </Text>
            <Text style={infoText}>
              <strong>Enabled at:</strong> {enabledAt}
            </Text>
            <Text style={infoText}>
              <strong>IP Address:</strong> {ipAddress}
            </Text>
            <Text style={infoText}>
              <strong>Device:</strong> {device}
            </Text>
            <Text style={infoText}>
              <strong>Backup codes generated:</strong> {backupCodesCount}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>What is Two-Factor Authentication?</Heading>
          
          <Text style={text}>
            Two-factor authentication adds an extra layer of security to your account. When you 
            sign in, you'll need to provide both your password and a verification code from your 
            authenticator app.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Important: Your Backup Codes</Heading>
          
          <Text style={text}>
            You've been provided with {backupCodesCount} backup codes. These codes are essential for 
            accessing your account if you lose access to your authenticator app.
          </Text>

          <Section style={warningBox}>
            <Text style={warningText}>
              ⚠️ <strong>Save your backup codes in a secure location immediately!</strong>
            </Text>
            <Text style={warningText}>
              Each code can only be used once. Store them in a password manager or secure 
              physical location.
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Next Time You Sign In</Heading>
          
          <Text style={text}>
            When you sign in to YES GODDESS, you'll follow these steps:
          </Text>

          <ol style={list}>
            <li style={listItem}>Enter your email and password</li>
            <li style={listItem}>Open your authenticator app</li>
            <li style={listItem}>Enter the 6-digit verification code</li>
            <li style={listItem}>Complete sign-in</li>
          </ol>

          <Hr style={hr} />

          <Heading style={h2}>Didn't Enable This?</Heading>
          
          <Text style={text}>
            If you did not enable two-factor authentication on your account, someone may have 
            unauthorized access. Please take immediate action:
          </Text>

          <Section style={buttonContainer}>
            <Button href={securityUrl} style={button}>
              Review Security Settings
            </Button>
          </Section>

          <Text style={text}>
            You should also change your password immediately and contact our support team at{' '}
            <Link href="mailto:support@yesgoddess.com" style={link}>
              support@yesgoddess.com
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={footerText}>
            This email was sent to confirm a security change to your YES GODDESS account. If you 
            have any questions, please contact our support team.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: '#F8F6F3',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const container = {
  backgroundColor: '#FFFFFF',
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
};

const h1 = {
  color: '#1A1A1A',
  fontSize: '28px',
  fontWeight: '700',
  lineHeight: '1.3',
  margin: '0 0 20px',
  textAlign: 'center' as const,
};

const h2 = {
  color: '#1A1A1A',
  fontSize: '20px',
  fontWeight: '600',
  lineHeight: '1.4',
  margin: '0 0 12px',
};

const text = {
  color: '#4A4A4A',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const infoBox = {
  backgroundColor: '#E8F5E9',
  borderLeft: '4px solid #4CAF50',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const infoTitle = {
  color: '#2E7D32',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const infoText = {
  color: '#1B5E20',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const warningBox = {
  backgroundColor: '#FFF3CD',
  borderLeft: '4px solid #FFC107',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const warningText = {
  color: '#856404',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const list = {
  paddingLeft: '20px',
  margin: '0 0 16px',
};

const listItem = {
  color: '#4A4A4A',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '24px 0',
};

const button = {
  backgroundColor: '#1A1A1A',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  borderRadius: '6px',
};

const link = {
  color: '#1A1A1A',
  textDecoration: 'underline',
};

const hr = {
  borderColor: '#E0E0E0',
  margin: '24px 0',
};

const footerText = {
  color: '#9E9E9E',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '24px 0 0',
  textAlign: 'center' as const,
};
