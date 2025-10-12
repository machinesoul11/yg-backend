/**
 * YES GODDESS Email Typography Components
 * Reusable text components following brand guidelines
 */

import { Heading, Text as ReactEmailText } from '@react-email/components';
import * as React from 'react';
import { EMAIL_COLORS, EMAIL_FONTS } from '../styles/brand';

interface TypographyProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

// H1 - Primary Headings (ALL CAPS per guidelines)
export const H1 = ({ children, style }: TypographyProps) => {
  return (
    <Heading
      style={{
        color: EMAIL_COLORS.BONE,
        fontFamily: EMAIL_FONTS.body,
        fontSize: '32px',
        fontWeight: '400',
        letterSpacing: '2px',
        lineHeight: '1.1',
        margin: '0 0 24px',
        textAlign: 'left' as const,
        textTransform: 'uppercase' as const,
        ...style,
      }}
    >
      {children}
    </Heading>
  );
};

// H2 - Secondary Headings (Title Case)
export const H2 = ({ children, style }: TypographyProps) => {
  return (
    <Heading
      style={{
        color: EMAIL_COLORS.BONE,
        fontFamily: EMAIL_FONTS.body,
        fontSize: '24px',
        fontWeight: '400',
        letterSpacing: '1.5px',
        lineHeight: '1.2',
        margin: '0 0 16px',
        textAlign: 'left' as const,
        ...style,
      }}
    >
      {children}
    </Heading>
  );
};

// H3 - Tertiary Headings
export const H3 = ({ children, style }: TypographyProps) => {
  return (
    <Heading
      style={{
        color: EMAIL_COLORS.BONE,
        fontFamily: EMAIL_FONTS.body,
        fontSize: '18px',
        fontWeight: '500',
        letterSpacing: '1px',
        lineHeight: '1.3',
        margin: '0 0 12px',
        textAlign: 'left' as const,
        ...style,
      }}
    >
      {children}
    </Heading>
  );
};

// Body Text
export const Text = ({ children, style }: TypographyProps) => {
  return (
    <ReactEmailText
      style={{
        color: EMAIL_COLORS.BONE,
        fontFamily: EMAIL_FONTS.body,
        fontSize: '16px',
        fontWeight: '400',
        letterSpacing: '0.5px',
        lineHeight: '1.6',
        margin: '0 0 16px',
        ...style,
      }}
    >
      {children}
    </ReactEmailText>
  );
};

// Caption/Small Text
export const Caption = ({ children, style }: TypographyProps) => {
  return (
    <ReactEmailText
      style={{
        color: EMAIL_COLORS.SANCTUM,
        fontFamily: EMAIL_FONTS.body,
        fontSize: '14px',
        fontWeight: '400',
        letterSpacing: '1.5px',
        lineHeight: '1.4',
        margin: '0 0 12px',
        textTransform: 'uppercase' as const,
        ...style,
      }}
    >
      {children}
    </ReactEmailText>
  );
};

// Declaration - italic, serif font for special statements
export const Declaration = ({ children, style }: TypographyProps) => {
  return (
    <ReactEmailText
      style={{
        color: EMAIL_COLORS.BONE,
        fontFamily: EMAIL_FONTS.display,
        fontSize: '16px',
        fontStyle: 'italic' as const,
        lineHeight: '1.6',
        margin: '24px 0',
        ...style,
      }}
    >
      {children}
    </ReactEmailText>
  );
};
