import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';
import { Header } from './Header';
import { Footer } from './Footer';

interface EmailLayoutProps {
  previewText: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
}

export const EmailLayout = ({ previewText, children, unsubscribeUrl }: EmailLayoutProps) => {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={outerContainer}>
          <Container style={container}>
            {/* Header with logo */}
            <Header />

            {/* Main content */}
            <Section style={content}>{children}</Section>

            {/* Footer */}
            <Footer unsubscribeUrl={unsubscribeUrl} />
          </Container>
        </Container>
      </Body>
    </Html>
  );
};

// YES GODDESS Brand Email Styles - aligned with brand guidelines
const main = {
  backgroundColor: EMAIL_COLORS.VOID,
  fontFamily: EMAIL_FONTS.body,
  WebkitFontSmoothing: 'antialiased' as const,
  MozOsxFontSmoothing: 'grayscale' as const,
};

const outerContainer = {
  margin: '0 auto',
  padding: '40px 20px',
};

const container = {
  backgroundColor: EMAIL_COLORS.VOID,
  margin: '0 auto',
  maxWidth: '600px',
  borderRadius: '0px',
  overflow: 'hidden' as const,
};

const content = {
  padding: '40px 32px',
};

export default EmailLayout;
