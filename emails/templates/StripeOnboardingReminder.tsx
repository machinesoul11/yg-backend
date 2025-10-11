import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';
import { emailStyles, EMAIL_COLORS } from '../styles/brand';

interface StripeOnboardingReminderEmailProps {
  stageName: string;
  onboardingUrl: string;
}

export const StripeOnboardingReminderEmail = ({
  stageName,
  onboardingUrl,
}: StripeOnboardingReminderEmailProps) => {
  const previewText = `${stageName.toUpperCase()} - Complete Your Payout Account Setup`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/logo/yesgoddesslogo.png`}
              width="180"
              height="48"
              alt="YES GODDESS"
            />
          </Section>

          <Heading style={h1}>Payout Setup Incomplete</Heading>

          <Text style={text}>
            {stageName.toUpperCase()},
          </Text>

          <Text style={text}>
            We noticed you haven't completed your payout account setup yet.
          </Text>

          <Text style={text}>
            To receive royalties from your licensed work, you need to complete this one-time setup process with our payment partner, Stripe.
          </Text>

          <Section style={infoBox}>
            <Text style={infoTitle}>
              <strong>Why You Need This:</strong>
            </Text>
            <Text style={infoText}>
              • Receive royalty payments directly to your bank account<br />
              • Secure and encrypted payment processing<br />
              • Track your earnings in real-time<br />
              • Set up takes less than 5 minutes
            </Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={onboardingUrl}>
              Complete Payout Setup
            </Button>
          </Section>

          <Text style={footer}>
            Your work deserves its true worth. Complete setup to start earning.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default StripeOnboardingReminderEmail;

const main = {
  backgroundColor: EMAIL_COLORS.whiteWarm,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  backgroundColor: EMAIL_COLORS.white,
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '600px',
};

const header = {
  textAlign: 'center' as const,
  marginBottom: '32px',
};

const h1 = {
  ...emailStyles.h1,
  color: EMAIL_COLORS.warning,
};

const text = {
  ...emailStyles.text,
  textAlign: 'center' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  ...emailStyles.buttonPrimary,
  display: 'inline-block',
};

const infoBox = {
  backgroundColor: EMAIL_COLORS.goldLight,
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const infoTitle = {
  ...emailStyles.text,
  color: EMAIL_COLORS.black,
  margin: '0 0 12px',
  textAlign: 'left' as const,
};

const infoText = {
  ...emailStyles.textSmall,
  color: EMAIL_COLORS.black,
  lineHeight: '1.8',
  textAlign: 'left' as const,
};

const footer = {
  ...emailStyles.textSmall,
  textAlign: 'center' as const,
  fontStyle: 'italic',
  marginTop: '32px',
};
