/**
 * YES GODDESS Email Header Component
 * Consistent header for all email templates
 */

import { Section, Img } from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS } from '../styles/brand';

export const Header = () => {
  return (
    <Section style={headerStyle}>
      <Img
        src={`${process.env.NEXT_PUBLIC_APP_URL || 'https://yesgoddess.com'}/logo/yesgoddesslogo.png`}
        width="180"
        height="48"
        alt="YES GODDESS"
        style={logoStyle}
      />
    </Section>
  );
};

const headerStyle = {
  backgroundColor: EMAIL_COLORS.VOID,
  padding: '32px',
  textAlign: 'center' as const,
};

const logoStyle = {
  margin: '0 auto',
};

export default Header;
