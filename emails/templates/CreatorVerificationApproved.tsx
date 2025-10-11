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

interface CreatorVerificationApprovedEmailProps {
  stageName: string;
  dashboardUrl: string;
  stripeOnboardingUrl?: string;
}

export const CreatorVerificationApprovedEmail = ({
  stageName,
  dashboardUrl,
  stripeOnboardingUrl,
}: CreatorVerificationApprovedEmailProps) => {
  const previewText = `${stageName.toUpperCase()} - Your Creator Profile Has Been Approved`;

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

          <Heading style={h1}>APPROVED</Heading>

          <Text style={text}>
            {stageName.toUpperCase()},
          </Text>

          <Text style={text}>
            Congratulations! Your creator profile has been verified and approved.
          </Text>

          <Text style={text}>
            You can now upload your intellectual property and start licensing your work to brands.
          </Text>

          {stripeOnboardingUrl && (
            <>
              <Section style={infoBox}>
                <Text style={infoTitle}>
                  <strong>Important: Set Up Payouts</strong>
                </Text>
                <Text style={infoText}>
                  Before you can receive royalties, you need to complete your payout account setup with Stripe.
                </Text>
              </Section>

              <Section style={buttonContainer}>
                <Button style={button} href={stripeOnboardingUrl}>
                  Complete Payout Setup
                </Button>
              </Section>
            </>
          )}

          <Section style={buttonContainer}>
            <Button style={buttonSecondary} href={dashboardUrl}>
              Go to Dashboard
            </Button>
          </Section>

          <Text style={footer}>
            Welcome to the sanctuary for sovereign creators. Where creation meets reverence, where artistry commands its true worth.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default CreatorVerificationApprovedEmail;

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
  color: EMAIL_COLORS.success,
};

const text = {
  ...emailStyles.text,
  textAlign: 'center' as const,
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '16px 0',
};

const button = {
  ...emailStyles.buttonPrimary,
  display: 'inline-block',
};

const buttonSecondary = {
  backgroundColor: EMAIL_COLORS.blackSoft,
  borderRadius: '8px',
  color: EMAIL_COLORS.white,
  fontSize: '16px',
  fontWeight: '600',
  lineHeight: '1.5',
  padding: '14px 32px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  display: 'inline-block',
};

const infoBox = {
  backgroundColor: EMAIL_COLORS.roseLight,
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
};

const infoTitle = {
  ...emailStyles.text,
  color: EMAIL_COLORS.black,
  margin: '0 0 12px',
  textAlign: 'center' as const,
};

const infoText = {
  ...emailStyles.textSmall,
  color: EMAIL_COLORS.black,
  textAlign: 'center' as const,
};

const footer = {
  ...emailStyles.textSmall,
  textAlign: 'center' as const,
  fontStyle: 'italic',
  marginTop: '32px',
};
