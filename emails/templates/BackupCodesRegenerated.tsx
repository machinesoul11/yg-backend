/**
 * Backup Codes Regenerated Email Template
 * Sent when a user regenerates their 2FA backup codes
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

export interface BackupCodesRegeneratedProps {
  userName: string;
  regeneratedAt: string;
  newCodesCount: number;
  ipAddress: string;
  device: string;
  securityUrl: string;
}

export default function BackupCodesRegenerated({
  userName = 'User',
  regeneratedAt,
  newCodesCount = 10,
  ipAddress = 'Unknown',
  device = 'Unknown',
  securityUrl,
}: BackupCodesRegeneratedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your backup codes have been regenerated</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔑 Backup Codes Regenerated</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            Your two-factor authentication backup codes have been regenerated. All previously 
            generated backup codes have been invalidated and can no longer be used.
          </Text>

          <Section style={infoBox}>
            <Text style={infoTitle}>Regeneration Details</Text>
            <Text style={infoText}>
              <strong>Regenerated at:</strong> {regeneratedAt}
            </Text>
            <Text style={infoText}>
              <strong>New codes generated:</strong> {newCodesCount}
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
            You now have {newCodesCount} new backup codes for your account. Each code can be used 
            only once to access your account if you lose access to your authenticator app.
          </Text>

          <Section style={warningBox}>
            <Text style={warningTitle}>
              ⚠️ Important: Old Backup Codes Are Invalid
            </Text>
            <Text style={warningText}>
              All your previously generated backup codes have been invalidated and will no longer 
              work. Make sure to update your stored backup codes with the new ones you received 
              during regeneration.
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Storing Your Backup Codes Securely</Heading>
          
          <Text style={text}>
            Your backup codes are sensitive security credentials. Store them securely using one of 
            these methods:
          </Text>

          <ul style={list}>
            <li style={listItem}>
              <strong>Password Manager:</strong> Store them in your password manager alongside your 
              account credentials
            </li>
            <li style={listItem}>
              <strong>Encrypted Storage:</strong> Save them in an encrypted file or document
            </li>
            <li style={listItem}>
              <strong>Physical Storage:</strong> Write them down and keep them in a secure physical 
              location like a safe
            </li>
          </ul>

          <Text style={text}>
            <strong>Never:</strong>
          </Text>

          <ul style={list}>
            <li style={listItem}>Email backup codes to yourself</li>
            <li style={listItem}>Store them in plain text files on your computer</li>
            <li style={listItem}>Share them with anyone, including support staff</li>
            <li style={listItem}>Take screenshots and store them in cloud photo libraries</li>
          </ul>

          <Hr style={hr} />

          <Heading style={h2}>Using Your Backup Codes</Heading>
          
          <Text style={text}>
            Use a backup code when you:
          </Text>

          <ul style={list}>
            <li style={listItem}>
              Lost access to your authenticator app
            </li>
            <li style={listItem}>
              Got a new phone and haven't transferred your authenticator
            </li>
            <li style={listItem}>
              Are unable to receive verification codes
            </li>
          </ul>

          <Text style={text}>
            During sign-in, select "Use a backup code" instead of entering your authenticator code. 
            Remember: each code can only be used once.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>Didn't Regenerate These?</Heading>
          
          <Text style={text}>
            If you did not regenerate your backup codes, someone else may have access to your 
            account. Take immediate action:
          </Text>

          <Section style={buttonContainer}>
            <Button href={securityUrl} style={button}>
              Review Security Settings
            </Button>
          </Section>

          <Text style={text}>
            Change your password immediately and contact our support team at{' '}
            <Link href="mailto:support@yesgoddess.com" style={link}>
              support@yesgoddess.com
            </Link>
          </Text>

          <Hr style={hr} />

          <Text style={footerText}>
            This email was sent to confirm a security change to your YES GODDESS account. For 
            questions about account security, please contact our support team.
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
  backgroundColor: '#FFF3CD',
  borderLeft: '4px solid #FFC107',
  padding: '16px',
  margin: '20px 0',
  borderRadius: '4px',
};

const warningTitle = {
  color: '#F57C00',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const warningText = {
  color: '#E65100',
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
  margin: '12px 0 0',
  textAlign: 'center' as const,
};
