/**
 * Two-Factor Authentication Disabled Email Template
 * Sent when a user disables 2FA on their account
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

export interface TwoFactorDisabledProps {
  userName: string;
  disabledAt: string;
  method: string;
  ipAddress: string;
  device: string;
  securityUrl: string;
}

export default function TwoFactorDisabled({
  userName = 'User',
  disabledAt,
  method = 'Authenticator App',
  ipAddress = 'Unknown',
  device = 'Unknown',
  securityUrl,
}: TwoFactorDisabledProps) {
  return (
    <Html>
      <Head />
      <Preview>Two-factor authentication has been disabled on your account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔓 Two-Factor Authentication Disabled</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Section style={warningBox}>
            <Text style={warningTitle}>
              ⚠️ Security Level Reduced
            </Text>
            <Text style={warningText}>
              Two-factor authentication has been disabled on your YES GODDESS account. Your account 
              is now less secure and protected only by your password.
            </Text>
          </Section>

          <Section style={infoBox}>
            <Text style={infoTitle}>Disable Details</Text>
            <Text style={infoText}>
              <strong>Method Disabled:</strong> {method}
            </Text>
            <Text style={infoText}>
              <strong>Disabled at:</strong> {disabledAt}
            </Text>
            <Text style={infoText}>
              <strong>IP Address:</strong> {ipAddress}
            </Text>
            <Text style={infoText}>
              <strong>Device:</strong> {device}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>What This Means</Heading>
          
          <Text style={text}>
            With two-factor authentication disabled, your account is protected only by your password. 
            This makes it more vulnerable to unauthorized access if your password is compromised.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Your Backup Codes</Heading>
          
          <Text style={text}>
            All your backup codes have been invalidated and can no longer be used. If you re-enable 
            two-factor authentication, you'll receive new backup codes.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Didn't Disable This?</Heading>
          
          <Text style={dangerText}>
            <strong>IMPORTANT:</strong> If you did not disable two-factor authentication on your 
            account, someone may have unauthorized access to your account. Take immediate action:
          </Text>

          <ol style={list}>
            <li style={listItem}>
              <strong>Change your password immediately</strong>
            </li>
            <li style={listItem}>
              <strong>Re-enable two-factor authentication</strong>
            </li>
            <li style={listItem}>
              <strong>Review recent account activity</strong>
            </li>
            <li style={listItem}>
              <strong>Contact support if you notice any suspicious activity</strong>
            </li>
          </ol>

          <Section style={buttonContainer}>
            <Button href={securityUrl} style={button}>
              Secure Your Account Now
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>We Recommend Re-Enabling 2FA</Heading>
          
          <Text style={text}>
            Two-factor authentication is one of the best ways to protect your account from 
            unauthorized access. We strongly recommend re-enabling it to keep your account secure.
          </Text>

          <Text style={text}>
            Benefits of two-factor authentication:
          </Text>

          <ul style={list}>
            <li style={listItem}>Protects against password theft</li>
            <li style={listItem}>Prevents unauthorized access</li>
            <li style={listItem}>Secures your creative work and earnings</li>
            <li style={listItem}>Adds peace of mind</li>
          </ul>

          <Hr style={hr} />

          <Text style={footerText}>
            If you have any questions about account security, please contact our support team at{' '}
            <Link href="mailto:support@yesgoddess.com" style={link}>
              support@yesgoddess.com
            </Link>
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

const dangerText = {
  color: '#D32F2F',
  fontSize: '16px',
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const infoBox = {
  backgroundColor: '#F5F5F5',
  borderLeft: '4px solid #9E9E9E',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const infoTitle = {
  color: '#616161',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const infoText = {
  color: '#424242',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const warningBox = {
  backgroundColor: '#FFEBEE',
  borderLeft: '4px solid #F44336',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const warningTitle = {
  color: '#C62828',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const warningText = {
  color: '#B71C1C',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0',
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
  backgroundColor: '#D32F2F',
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
