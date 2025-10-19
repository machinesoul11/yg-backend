/**
 * Low Backup Codes Alert Email Template
 * Sent when a user has fewer than 3 backup codes remaining
 */

import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Link,
  Button,
  Img,
} from '@react-email/components';
import { BRAND_LOGO, BRAND_COLORS } from '@/lib/constants/brand';

interface LowBackupCodesAlertProps {
  userName?: string;
  remainingCodes: number;
  regenerateUrl: string;
}

export default function LowBackupCodesAlert({
  userName = 'User',
  remainingCodes = 2,
  regenerateUrl,
}: LowBackupCodesAlertProps) {
  const previewText = `You have ${remainingCodes} backup code${remainingCodes !== 1 ? 's' : ''} remaining`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with Logo */}
          <Section style={header}>
            <Img
              src={`${process.env.NEXT_PUBLIC_APP_URL}${BRAND_LOGO.path}`}
              width={BRAND_LOGO.email.header.width}
              height={BRAND_LOGO.email.header.height}
              alt="YES GODDESS"
              style={logo}
            />
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>Hello {userName},</Text>

            <Text style={paragraph}>
              This is an important security notification about your two-factor authentication backup codes.
            </Text>

            <Section style={warningBox}>
              <Text style={warningText}>
                ⚠️ You currently have <strong>{remainingCodes}</strong> backup code{remainingCodes !== 1 ? 's' : ''} remaining.
              </Text>
            </Section>

            <Text style={paragraph}>
              Backup codes are essential for accessing your account if you lose access to your authenticator app. 
              We strongly recommend regenerating your backup codes to ensure you always have enough codes available.
            </Text>

            <Text style={paragraph}>
              When you regenerate backup codes:
            </Text>

            <ul style={list}>
              <li style={listItem}>You'll receive 10 new backup codes</li>
              <li style={listItem}>All existing unused codes will be invalidated</li>
              <li style={listItem}>Each new code can only be used once</li>
              <li style={listItem}>You should save them in a secure location immediately</li>
            </ul>

            <Section style={buttonContainer}>
              <Button href={regenerateUrl} style={button}>
                Regenerate Backup Codes
              </Button>
            </Section>

            <Text style={paragraph}>
              Or copy and paste this link into your browser:
            </Text>
            <Text style={urlText}>
              {regenerateUrl}
            </Text>

            <Text style={infoBox}>
              <strong>Important:</strong> Store your new backup codes in a secure location such as a password manager 
              or a secure physical location. You will only see them once during generation.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} YES GODDESS. All rights reserved.
            </Text>
            <Text style={footerText}>
              This is an automated security notification. If you did not recently use a backup code, 
              please contact support immediately at{' '}
              <Link href="mailto:support@yesgoddess.com" style={footerLink}>
                support@yesgoddess.com
              </Link>
            </Text>
          </Section>
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
  padding: '20px 0',
  maxWidth: '600px',
};

const header = {
  padding: '32px 24px',
  textAlign: 'center' as const,
  borderBottom: `2px solid ${BRAND_COLORS.gold.DEFAULT}`,
};

const logo = {
  margin: '0 auto',
};

const content = {
  padding: '32px 24px',
};

const greeting = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#1A1A1A',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#374151',
  marginBottom: '16px',
};

const warningBox = {
  backgroundColor: '#FEF3C7',
  border: '2px solid #F59E0B',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
};

const warningText = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#92400E',
  margin: 0,
  textAlign: 'center' as const,
};

const list = {
  paddingLeft: '20px',
  marginBottom: '24px',
};

const listItem = {
  fontSize: '15px',
  lineHeight: '24px',
  color: '#374151',
  marginBottom: '8px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '24px',
};

const button = {
  backgroundColor: BRAND_COLORS.gold.DEFAULT,
  borderRadius: '6px',
  color: '#FFFFFF',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '14px 32px',
};

const urlText = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#6B7280',
  wordBreak: 'break-all' as const,
  marginBottom: '24px',
};

const infoBox = {
  backgroundColor: '#EEF2FF',
  border: '1px solid #C7D2FE',
  borderRadius: '6px',
  padding: '16px',
  fontSize: '14px',
  lineHeight: '20px',
  color: '#3730A3',
  marginTop: '24px',
};

const footer = {
  padding: '24px',
  borderTop: '1px solid #E5E7EB',
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#6B7280',
  marginBottom: '8px',
};

const footerLink = {
  color: BRAND_COLORS.gold.DEFAULT,
  textDecoration: 'none',
};
