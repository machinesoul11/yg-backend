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

interface CreatorWelcomeEmailProps {
  stageName: string;
  dashboardUrl: string;
}

export const CreatorWelcomeEmail = ({
  stageName,
  dashboardUrl,
}: CreatorWelcomeEmailProps) => {
  const previewText = `${stageName.toUpperCase()} - Your Creator Profile Has Been Created`;

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

          <Heading style={h1}>{stageName.toUpperCase()}</Heading>

          <Text style={text}>
            Your creator profile has been created successfully.
          </Text>

          <Text style={text}>
            Complete your verification to start licensing your work and earning royalties on the YES GODDESS platform.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={dashboardUrl}>
              Complete Your Profile
            </Button>
          </Section>

          <Section style={infoBox}>
            <Text style={infoText}>
              <strong>Next Steps:</strong>
            </Text>
            <Text style={infoText}>
              1. Complete your profile information<br />
              2. Upload portfolio samples<br />
              3. Submit for verification<br />
              4. Set up your payout account
            </Text>
          </Section>

          <Text style={footer}>
            This is the platform where creation meets reverence, where artistry commands its true worth, and where the goddess within every creator is finally recognized.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default CreatorWelcomeEmail;

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
  textAlign: 'center' as const,
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

const infoText = {
  ...emailStyles.textSmall,
  color: EMAIL_COLORS.black,
  margin: '8px 0',
};

const footer = {
  ...emailStyles.textSmall,
  textAlign: 'center' as const,
  fontStyle: 'italic',
  marginTop: '32px',
};
