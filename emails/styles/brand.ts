/**
 * YES GODDESS Email Brand Styles
 * Shared styling constants for email templates
 */

export const EMAIL_COLORS = {
  // Primary
  gold: '#D4AF37',
  goldLight: '#F5E6D3',
  goldDark: '#B8941F',
  
  // Neutrals
  black: '#000000',
  blackSoft: '#1A1A1A',
  white: '#FFFFFF',
  whiteWarm: '#FAF8F5',
  
  // Accents
  rose: '#E8B4B8',
  roseLight: '#F5E1E4',
  sage: '#9CAF88',
  cream: '#F5E6D3',
  
  // Functional
  text: '#000000',
  textMuted: '#6B7280',
  border: '#E5E5E5',
  error: '#C89499',
  success: '#9CAF88',
  warning: '#D4AF37',
};

export const EMAIL_FONTS = {
  display: '"Playfair Display", Georgia, serif',
  body: 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Courier New", monospace',
};

// Common email component styles
export const emailStyles = {
  // Typography
  h1: {
    color: EMAIL_COLORS.gold,
    fontFamily: EMAIL_FONTS.display,
    fontSize: '32px',
    fontWeight: '700',
    letterSpacing: '-0.01em',
    lineHeight: '1.2',
    margin: '0 0 24px',
    textAlign: 'center' as const,
  },
  
  h2: {
    color: EMAIL_COLORS.black,
    fontFamily: EMAIL_FONTS.display,
    fontSize: '24px',
    fontWeight: '600',
    letterSpacing: '-0.005em',
    lineHeight: '1.3',
    margin: '0 0 16px',
  },
  
  h3: {
    color: EMAIL_COLORS.black,
    fontFamily: EMAIL_FONTS.display,
    fontSize: '20px',
    fontWeight: '600',
    lineHeight: '1.4',
    margin: '0 0 12px',
  },
  
  text: {
    color: EMAIL_COLORS.text,
    fontSize: '16px',
    lineHeight: '1.7',
    margin: '0 0 16px',
  },
  
  textSmall: {
    color: EMAIL_COLORS.textMuted,
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0 0 12px',
  },
  
  // Buttons
  buttonPrimary: {
    backgroundColor: EMAIL_COLORS.gold,
    borderRadius: '8px',
    color: EMAIL_COLORS.white,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0',
    lineHeight: '1.5',
    padding: '14px 32px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  
  buttonSecondary: {
    backgroundColor: EMAIL_COLORS.black,
    borderRadius: '8px',
    color: EMAIL_COLORS.white,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0',
    lineHeight: '1.5',
    padding: '14px 32px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  
  buttonOutline: {
    backgroundColor: 'transparent',
    border: `2px solid ${EMAIL_COLORS.gold}`,
    borderRadius: '8px',
    color: EMAIL_COLORS.gold,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '0',
    lineHeight: '1.5',
    padding: '12px 30px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  
  // Containers
  card: {
    backgroundColor: EMAIL_COLORS.whiteWarm,
    borderRadius: '8px',
    padding: '24px',
    margin: '16px 0',
    border: `1px solid ${EMAIL_COLORS.border}`,
  },
  
  cardGold: {
    backgroundColor: EMAIL_COLORS.goldLight,
    borderRadius: '8px',
    padding: '24px',
    margin: '16px 0',
    border: `1px solid ${EMAIL_COLORS.gold}`,
  },
  
  // Dividers
  divider: {
    borderTop: `1px solid ${EMAIL_COLORS.border}`,
    margin: '24px 0',
  },
  
  dividerGold: {
    borderTop: `2px solid ${EMAIL_COLORS.gold}`,
    margin: '32px 0',
  },
  
  // Links
  link: {
    color: EMAIL_COLORS.gold,
    textDecoration: 'none',
  },
  
  linkMuted: {
    color: EMAIL_COLORS.textMuted,
    textDecoration: 'none',
  },
  
  // Tables
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  
  tableHeader: {
    backgroundColor: EMAIL_COLORS.cream,
    color: EMAIL_COLORS.black,
    fontSize: '14px',
    fontWeight: '600',
    padding: '12px',
    textAlign: 'left' as const,
    borderBottom: `2px solid ${EMAIL_COLORS.gold}`,
  },
  
  tableCell: {
    color: EMAIL_COLORS.text,
    fontSize: '14px',
    padding: '12px',
    borderBottom: `1px solid ${EMAIL_COLORS.border}`,
  },
  
  // Status badges (for use in tables/lists)
  badgeSuccess: {
    backgroundColor: '#D4E0C8',
    color: '#7A926A',
    borderRadius: '12px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  
  badgeWarning: {
    backgroundColor: EMAIL_COLORS.goldLight,
    color: EMAIL_COLORS.goldDark,
    borderRadius: '12px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
  
  badgeError: {
    backgroundColor: EMAIL_COLORS.roseLight,
    color: '#C89499',
    borderRadius: '12px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: '600',
    display: 'inline-block',
  },
};

export default emailStyles;
