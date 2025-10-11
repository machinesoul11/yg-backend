/**
 * Password Changed Email Template
 * Sent when a user's password has been changed
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
  Img,
} from '@react-email/components';
import { BRAND_LOGO, BRAND_COLORS } from '@/lib/constants/brand';

interface PasswordChangedEmailProps {
  userName?: string;
}

export default function PasswordChangedEmail({
  userName = 'User',
}: PasswordChangedEmailProps) {
  const previewText = 'Your YES GODDESS password has been changed';

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
              This is a confirmation that your YES GODDESS password was successfully changed.
            </Text>

            <Text style={paragraph}>
              If you did not make this change, please contact our support team immediately at{' '}
              <Link href="mailto:support@yesgoddess.com" style={link}>
                support@yesgoddess.com
              </Link>
              .
            </Text>

            <Text style={paragraph}>
              For your security:
            </Text>

            <ul style={list}>
              <li style={listItem}>All your previous sessions have been logged out</li>
              <li style={listItem}>You'll need to log in again with your new password</li>
              <li style={listItem}>Your account data remains secure and unchanged</li>
            </ul>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} YES GODDESS. All rights reserved.
            </Text>
            <Text style={footerText}>
              This is an automated security notification. Please do not reply to this email.
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
  borderBottom: `1px solid ${BRAND_COLORS.gold.light}`,
};

const logo = {
  margin: '0 auto',
};

const content = {
  padding: '40px 24px',
};

const greeting = {
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: '600',
  color: '#0A0A0A',
  marginBottom: '16px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#1A1A1A',
  marginBottom: '16px',
};

const list = {
  paddingLeft: '20px',
  marginBottom: '16px',
};

const listItem = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#1A1A1A',
  marginBottom: '8px',
};

const link = {
  color: BRAND_COLORS.gold.DEFAULT,
  textDecoration: 'underline',
};

const footer = {
  padding: '24px',
  borderTop: `1px solid ${BRAND_COLORS.gold.light}`,
  textAlign: 'center' as const,
};

const footerText = {
  fontSize: '12px',
  lineHeight: '18px',
  color: '#666666',
  marginBottom: '8px',
};
