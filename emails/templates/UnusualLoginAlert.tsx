/**
 * Unusual Login Alert Email Template
 * Sent when a successful login is detected from an unusual location or device
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

export interface UnusualLoginAlertProps {
  userName: string;
  ipAddress: string;
  location: string;
  device: string;
  timestamp: string;
  anomalyReasons: string;
}

export default function UnusualLoginAlert({
  userName = 'User',
  ipAddress = 'Unknown',
  location = 'Unknown',
  device = 'Unknown',
  timestamp,
  anomalyReasons,
}: UnusualLoginAlertProps) {
  return (
    <Html>
      <Head />
      <Preview>New sign-in detected from an unusual location or device</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🛡️ Security Alert: Unusual Login Detected</Heading>
          
          <Text style={text}>Hi {userName},</Text>
          
          <Text style={text}>
            We detected a successful login to your YES GODDESS account from a location or device 
            that we haven't seen before. If this was you, you can ignore this message. If you 
            didn't log in, your account may be compromised.
          </Text>

          <Section style={alertBox}>
            <Heading style={alertHeading}>Login Details</Heading>
            <Text style={alertText}>
              <strong>Time:</strong> {timestamp}
            </Text>
            <Text style={alertText}>
              <strong>Location:</strong> {location}
            </Text>
            <Text style={alertText}>
              <strong>IP Address:</strong> {ipAddress}
            </Text>
            <Text style={alertText}>
              <strong>Device:</strong> {device}
            </Text>
            <Text style={alertText}>
              <strong>Detected Anomalies:</strong> {anomalyReasons}
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Was this you?</Heading>
          
          <Section style={buttonSection}>
            <Text style={text}>
              If you recognize this activity, no action is needed. This location and device have 
              been added to your known devices for future reference.
            </Text>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>If this wasn't you</Heading>
          
          <Text style={text}>
            If you didn't make this login attempt, your account may be compromised. Please take 
            these steps immediately:
          </Text>

          <Section style={stepsList}>
            <Text style={stepText}>
              <strong>1.</strong> Change your password immediately
            </Text>
            <Text style={stepText}>
              <strong>2.</strong> Enable two-factor authentication if you haven't already
            </Text>
            <Text style={stepText}>
              <strong>3.</strong> Review your recent account activity
            </Text>
            <Text style={stepText}>
              <strong>4.</strong> Log out of all devices and sessions
            </Text>
            <Text style={stepText}>
              <strong>5.</strong> Contact our support team
            </Text>
          </Section>

          <Section style={buttonSection}>
            <Button
              href="https://ops.yesgoddess.agency/auth/password-reset"
              style={button}
            >
              Reset Password Now
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Enhance your security</Heading>
          
          <Text style={text}>
            We strongly recommend enabling two-factor authentication (2FA) for added security. 
            With 2FA, even if someone knows your password, they won't be able to access your 
            account without your verification code.
          </Text>

          <Section style={buttonSection}>
            <Button
              href="https://ops.yesgoddess.agency/settings/security"
              style={secondaryButton}
            >
              Enable Two-Factor Authentication
            </Button>
          </Section>

          <Hr style={hr} />

          <Heading style={h2}>Need help?</Heading>
          
          <Text style={text}>
            If you need assistance securing your account, our support team is available 24/7:
          </Text>
          
          <Text style={text}>
            <Link href="mailto:support@yesgoddess.agency" style={link}>
              support@yesgoddess.agency
            </Link>
          </Text>

          <Hr style={hr} />
          
          <Text style={footer}>
            This is an automated security notification from YES GODDESS. You're receiving this 
            because we detected unusual login activity on your account. We never ask for your 
            password via email.
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

const alertHeading = {
  color: '#856404',
  fontSize: '16px',
  fontWeight: 'bold',
  margin: '0 0 12px 0',
};

const alertText = {
  color: '#856404',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '8px 0',
};

const stepsList = {
  padding: '0 40px',
  margin: '16px 0',
};

const stepText = {
  color: '#333',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '8px 0',
};

const buttonSection = {
  textAlign: 'center' as const,
  margin: '24px 0',
};

const button = {
  backgroundColor: '#dc3545',
  borderRadius: '4px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
  margin: '8px 0',
};

const secondaryButton = {
  ...button,
  backgroundColor: '#5e6ad2',
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
