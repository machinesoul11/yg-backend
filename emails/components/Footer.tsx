/**
 * YES GODDESS Email Footer Component
 * Consistent footer for all email templates
 */

import { Section, Text, Hr } from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';

interface FooterProps {
  unsubscribeUrl?: string;
}

export const Footer = ({ unsubscribeUrl }: FooterProps) => {
  return (
    <>
      <Hr style={dividerStyle} />
      <Section style={footerStyle}>
        <Text style={taglineStyle}>
          The work is sacred. The creator is sovereign.
        </Text>
        <Text style={copyrightStyle}>
          © {new Date().getFullYear()} YES GODDESS. All rights reserved.
        </Text>
        <Text style={linksStyle}>
          <a href="https://yesgoddess.com/terms" style={linkStyle}>
            Terms
          </a>
          {' • '}
          <a href="https://yesgoddess.com/privacy" style={linkStyle}>
            Privacy
          </a>
          {' • '}
          <a href="https://yesgoddess.com/support" style={linkStyle}>
            Support
          </a>
          {unsubscribeUrl && (
            <>
              {' • '}
              <a href={unsubscribeUrl} style={linkStyle}>
                Unsubscribe
              </a>
            </>
          )}
        </Text>
      </Section>
    </>
  );
};

const dividerStyle = {
  borderTop: `1px solid ${EMAIL_COLORS.SANCTUM}`,
  margin: '32px 0 24px',
  opacity: 0.3,
};

const footerStyle = {
  padding: '24px 0',
  textAlign: 'center' as const,
};

const taglineStyle = {
  color: EMAIL_COLORS.SANCTUM,
  fontFamily: EMAIL_FONTS.display,
  fontSize: '14px',
  fontStyle: 'italic' as const,
  lineHeight: '1.6',
  margin: '0 0 16px',
};

const copyrightStyle = {
  color: EMAIL_COLORS.SANCTUM,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '12px',
  letterSpacing: '0.5px',
  lineHeight: '1.5',
  margin: '0 0 8px',
};

const linksStyle = {
  color: EMAIL_COLORS.SANCTUM,
  fontFamily: EMAIL_FONTS.body,
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
};

const linkStyle = {
  color: EMAIL_COLORS.ALTAR,
  textDecoration: 'none',
};

export default Footer;
