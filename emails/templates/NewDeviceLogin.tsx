/**
 * New Device Login Email Template
 * Sent when a user successfully logs in from a new device
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

export interface NewDeviceLoginProps {
  userName: string;
  loginTime: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  location: string;
  securityUrl: string;
}

export default function NewDeviceLogin({
  userName = 'User',
  loginTime,
  deviceName = 'Unknown Device',
  deviceType = 'Unknown',
  browser = 'Unknown',
  operatingSystem = 'Unknown',
  ipAddress = 'Unknown',
  location = 'Unknown',
  securityUrl,
}: NewDeviceLoginProps) {
  return (
    <Html>
      <Head />
      <Preview>New sign-in from a device we don't recognize</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔔 New Device Sign-In</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            We noticed a successful sign-in to your YES GODDESS account from a new device. If this 
            was you, you can safely ignore this message. If not, your account may be at risk.
          </Text>

          <Section style={infoBox}>
            <Text style={infoTitle}>Sign-In Details</Text>
            <Text style={infoText}>
              <strong>Time:</strong> {loginTime}
            </Text>
            <Text style={infoText}>
              <strong>Device:</strong> {deviceName}
            </Text>
            <Text style={infoText}>
              <strong>Type:</strong> {deviceType}
            </Text>
            <Text style={infoText}>
              <strong>Browser:</strong> {browser}
            </Text>
            <Text style={infoText}>
              <strong>Operating System:</strong> {operatingSystem}
            </Text>
            <Text style={infoText}>
              <strong>IP Address:</strong> {ipAddress}
            </Text>
            <Text style={infoText}>
              <strong>Location:</strong> {location}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Was This You?</Heading>
          
          <Text style={text}>
            If you just signed in from this device, no action is needed. This device has been added 
            to your list of known devices, and you won't receive alerts for future sign-ins from it.
          </Text>

          <Text style={text}>
            You can review all your active devices and sessions in your account security settings.
          </Text>

          <Section style={buttonContainer}>
            <Button href={securityUrl} style={buttonSecondary}>
              View Active Devices
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>If This Wasn't You</Heading>
          
          <Section style={warningBox}>
            <Text style={warningTitle}>
              ⚠️ Take Immediate Action
            </Text>
            <Text style={warningText}>
              If you did not sign in from this device, someone else may have access to your account. 
              Follow these steps immediately:
            </Text>
          </Section>

          <ol style={list}>
            <li style={listItem}>
              <strong>Change your password immediately</strong> - Use a strong, unique password
            </li>
            <li style={listItem}>
              <strong>Enable two-factor authentication</strong> - Add an extra layer of security
            </li>
            <li style={listItem}>
              <strong>Review recent account activity</strong> - Check for any unauthorized changes
            </li>
            <li style={listItem}>
              <strong>Sign out all other sessions</strong> - Remove access from all devices
            </li>
            <li style={listItem}>
              <strong>Contact support</strong> - Report the unauthorized access
            </li>
          </ol>

          <Section style={buttonContainer}>
            <Button href={securityUrl} style={buttonDanger}>
              Secure Your Account Now
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Security Tips</Heading>
          
          <Text style={text}>
            To keep your account secure:
          </Text>

          <ul style={list}>
            <li style={listItem}>
              Use a strong, unique password for your YES GODDESS account
            </li>
            <li style={listItem}>
              Enable two-factor authentication for enhanced security
            </li>
            <li style={listItem}>
              Never share your password or verification codes with anyone
            </li>
            <li style={listItem}>
              Be cautious of phishing emails asking for your login information
            </li>
            <li style={listItem}>
              Regularly review your active sessions and devices
            </li>
          </ul>

          <Hr style={hr} />

          <Text style={footerText}>
            This email was sent to notify you of account activity. If you have any questions or 
            concerns, please contact our support team at{' '}
            <Link href="mailto:support@yesgoddess.com" style={link}>
              support@yesgoddess.com
            </Link>
          </Text>

          <Text style={footerText}>
            © {new Date().getFullYear()} YES GODDESS. All rights reserved.
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
  backgroundColor: '#E3F2FD',
  borderLeft: '4px solid #2196F3',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const infoTitle = {
  color: '#1565C0',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const infoText = {
  color: '#0D47A1',
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

const buttonSecondary = {
  backgroundColor: '#757575',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
  borderRadius: '6px',
};

const buttonDanger = {
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
  margin: '12px 0 0',
  textAlign: 'center' as const,
};
