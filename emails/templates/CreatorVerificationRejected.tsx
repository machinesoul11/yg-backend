import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
  Button,
} from '@react-email/components';
import * as React from 'react';
import { emailStyles, EMAIL_COLORS } from '../styles/brand';

interface CreatorVerificationRejectedEmailProps {
  stageName: string;
  reason: string;
  dashboardUrl: string;
}

export const CreatorVerificationRejectedEmail = ({
  stageName,
  reason,
  dashboardUrl,
}: CreatorVerificationRejectedEmailProps) => {
  const previewText = `${stageName.toUpperCase()} - Profile Verification Update`;

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

          <Heading style={h1}>Profile Verification Update</Heading>

          <Text style={text}>
            {stageName.toUpperCase()},
          </Text>

          <Text style={text}>
            Thank you for submitting your creator profile. After careful review, we need you to make some updates before approval.
          </Text>

          <Section style={reasonBox}>
            <Text style={reasonTitle}>
              <strong>Feedback:</strong>
            </Text>
            <Text style={reasonText}>
              {reason}
            </Text>
          </Section>

          <Text style={text}>
            Please update your profile and resubmit for verification.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={dashboardUrl}>
              Update Profile
            </Button>
          </Section>

          <Text style={footer}>
            We maintain high standards to ensure the integrity of our creator community. We look forward to welcoming you once the updates are complete.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default CreatorVerificationRejectedEmail;

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

const reasonBox = {
  backgroundColor: EMAIL_COLORS.roseLight,
  borderRadius: '8px',
  padding: '24px',
  margin: '24px 0',
  borderLeft: `4px solid ${EMAIL_COLORS.error}`,
};

const reasonTitle = {
  ...emailStyles.text,
  color: EMAIL_COLORS.black,
  margin: '0 0 12px',
};

const reasonText = {
  ...emailStyles.text,
  color: EMAIL_COLORS.textMuted,
  whiteSpace: 'pre-wrap' as const,
};

const footer = {
  ...emailStyles.textSmall,
  textAlign: 'center' as const,
  fontStyle: 'italic',
  marginTop: '32px',
};
