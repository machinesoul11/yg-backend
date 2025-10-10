import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface EmailLayoutProps {
  previewText: string;
  children: React.ReactNode;
}

export const EmailLayout = ({ previewText, children }: EmailLayoutProps) => {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Body style={main}>
        <Container style={outerContainer}>
          <Container style={container}>
            {/* Header with logo */}
            <Section style={header}>
              <Img
                src={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/logo/yesgoddesslogo.png`}
                width="180"
                height="48"
                alt="YES GODDESS"
                style={logoStyle}
              />
            </Section>

            {/* Main content */}
            <Section style={content}>{children}</Section>

            {/* Footer */}
            <Section style={footer}>
              <Text style={footerTagline}>
                The work is sacred. The creator is sovereign.
              </Text>
              <Text style={footerText}>
                © {new Date().getFullYear()} YES GODDESS. All rights reserved.
              </Text>
              <Text style={footerLinks}>
                <a href="https://yesgoddess.com/terms" style={link}>
                  Terms
                </a>
                {' • '}
                <a href="https://yesgoddess.com/privacy" style={link}>
                  Privacy
                </a>
                {' • '}
                <a href="https://yesgoddess.com/support" style={link}>
                  Support
                </a>
              </Text>
            </Section>
          </Container>
        </Container>
      </Body>
    </Html>
  );
};

// YES GODDESS Brand Email Styles
const main = {
  backgroundColor: '#FAF8F5', // Brand warm white
  fontFamily: 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  WebkitFontSmoothing: 'antialiased' as const,
  MozOsxFontSmoothing: 'grayscale' as const,
};

const outerContainer = {
  margin: '0 auto',
  padding: '40px 20px',
};

const container = {
  backgroundColor: '#FFFFFF',
  margin: '0 auto',
  maxWidth: '600px',
  borderRadius: '12px',
  overflow: 'hidden' as const,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
};

const header = {
  backgroundColor: '#000000',
  padding: '32px',
  textAlign: 'center' as const,
};

const logoStyle = {
  margin: '0 auto',
};

const content = {
  padding: '40px 32px',
};

const footer = {
  backgroundColor: '#F5E6D3', // Brand cream
  padding: '32px',
  textAlign: 'center' as const,
  borderTop: '2px solid #D4AF37', // Brand gold
};

const footerTagline = {
  color: '#000000',
  fontSize: '14px',
  fontStyle: 'italic' as const,
  lineHeight: '1.6',
  margin: '0 0 16px',
  fontFamily: '"Playfair Display", serif',
};

const footerText = {
  color: '#6B7280',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const footerLinks = {
  color: '#6B7280',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
};

const link = {
  color: '#D4AF37', // Brand gold
  textDecoration: 'none',
};

export default EmailLayout;
