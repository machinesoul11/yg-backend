/**
 * YES GODDESS Email Button Component
 * Reusable button following brand guidelines
 */

import { Button as ReactEmailButton } from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ href, children, variant = 'primary' }: ButtonProps) => {
  const baseStyles = {
    fontFamily: EMAIL_FONTS.body,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '1px',
    lineHeight: '1.5',
    textAlign: 'center' as const,
    textDecoration: 'none',
    textTransform: 'uppercase' as const,
    borderRadius: '2px',
    display: 'inline-block',
  };

  const primaryStyles = {
    ...baseStyles,
    backgroundColor: EMAIL_COLORS.ALTAR,
    color: EMAIL_COLORS.VOID,
    padding: '14px 32px',
  };

  const secondaryStyles = {
    ...baseStyles,
    backgroundColor: 'transparent',
    border: `2px solid ${EMAIL_COLORS.ALTAR}`,
    color: EMAIL_COLORS.ALTAR,
    padding: '12px 30px',
  };

  const buttonStyles = variant === 'primary' ? primaryStyles : secondaryStyles;

  return (
    <ReactEmailButton href={href} style={buttonStyles}>
      {children}
    </ReactEmailButton>
  );
};

export default Button;
