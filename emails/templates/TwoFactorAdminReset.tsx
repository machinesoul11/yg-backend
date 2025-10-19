/**
 * 2FA Admin Reset Email Template
 * Sent when an administrator resets a user's 2FA configuration
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

export interface TwoFactorAdminResetProps {
  userName: string;
  resetReason: string;
  resetDate: string;
  setupUrl: string;
}

export default function TwoFactorAdminReset({
  userName = 'User',
  resetReason = 'Administrative action',
  resetDate,
  setupUrl,
}: TwoFactorAdminResetProps) {
  return (
    <Html>
      <Head />
      <Preview>Your two-factor authentication has been reset by an administrator</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🔐 Two-Factor Authentication Reset</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            An administrator has reset your two-factor authentication (2FA) configuration.
          </Text>

          <Section style={noticeBox}>
            <Text style={noticeText}>
              <strong>Reset Reason:</strong> {resetReason}
            </Text>
            <Text style={noticeText}>
              <strong>Reset Date:</strong> {resetDate}
            </Text>
          </Section>

          <Text style={text}>
            Your account security is important to us. This action was taken to help you regain
            access to your account or to update your security settings.
          </Text>

          <Hr style={hr} />

          <Heading style={h2}>What This Means</Heading>

          <Text style={text}>
            The following 2FA settings have been removed from your account:
          </Text>

          <ul style={list}>
            <li style={listItem}>Authenticator app configuration</li>
            <li style={listItem}>Phone number for SMS verification</li>
            <li style={listItem}>All backup codes</li>
            <li style={listItem}>Emergency access codes</li>
          </ul>

          <Hr style={hr} />

          <Heading style={h2}>Next Steps</Heading>

          <Text style={text}>
            If your account requires two-factor authentication, you will need to set it up
            again the next time you log in. If 2FA is optional, you can choose to enable
            it at any time for enhanced security.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={setupUrl}>
              Set Up 2FA Now
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Need Help?</Heading>

          <Text style={text}>
            If you did not request this reset or have questions about this change, please
            contact our support team immediately.
          </Text>

          <Text style={footerText}>
            This is an automated security notification. Please do not reply to this email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            <Link href="https://yesgoddess.agency" style={footerLink}>
              YesGoddess
            </Link>
            {' • '}
            Secure creator-brand collaboration platform
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

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
};

const h1 = {
  color: '#1a1a1a',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 40px',
};

const h2 = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '30px 0 15px',
  padding: '0 40px',
};

const text = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '16px 0',
  padding: '0 40px',
};

const noticeBox = {
  backgroundColor: '#fef3c7',
  borderLeft: '4px solid #f59e0b',
  padding: '16px 20px',
  margin: '24px 40px',
  borderRadius: '4px',
};

const noticeText = {
  color: '#92400e',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '8px 0',
};

const list = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '24px',
  padding: '0 40px',
  margin: '16px 0',
};

const listItem = {
  margin: '8px 0',
};

const buttonContainer = {
  padding: '27px 40px',
};

const button = {
  backgroundColor: '#D4AF37',
  borderRadius: '5px',
  color: '#000',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  width: '100%',
  padding: '14px 20px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footerText = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  margin: '16px 0',
  padding: '0 40px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  textAlign: 'center' as const,
  marginTop: '32px',
};

const footerLink = {
  color: '#8898aa',
  textDecoration: 'underline',
};
