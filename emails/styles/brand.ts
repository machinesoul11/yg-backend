/**
 * YES GODDESS Email Brand Styles
 * Aligned with brand guidelines - docs/brand/guidelines.md
 */

export const EMAIL_COLORS = {
  // Primary Brand Colors (from guidelines.md)
  VOID: '#0A0A0A',       // Obsidian Black - primary backgrounds, text on light
  BONE: '#F8F6F3',       // Alabaster White - primary backgrounds (editorial), text on dark
  ALTAR: '#B8A888',      // Muted Gold - accent only, CTAs, sacred moments
  SANCTUM: '#C4C0B8',    // Stone Gray - secondary text, borders, disabled states
  
  // Extended Palette
  SHADOW: '#1A1A1A',     // Deep Charcoal - elevated surfaces on VOID
  WHISPER: '#FDFCFA',    // Warm White - highlighted text, hover states
  
  // Functional Colors (system only)
  AFFIRM: '#7A9B76',     // Trust Green - success states
  CAUTION: '#C4956C',    // Ember Orange - warnings
  DENY: '#A67C73',       // Rust Red - errors
  
  // Legacy aliases for backwards compatibility
  gold: '#B8A888',       // Maps to ALTAR
  goldLight: '#E8E4DF',
  goldDark: '#9A8A70',
  black: '#0A0A0A',      // Maps to VOID
  blackSoft: '#1A1A1A',  // Maps to SHADOW
  white: '#FFFFFF',
  whiteWarm: '#FAF8F5',
  rose: '#E8B4B8',
  roseLight: '#F5E1E4',
  sage: '#9CAF88',
  cream: '#F5E6D3',
  
  // Functional aliases
  text: '#0A0A0A',       // VOID
  textMuted: '#C4C0B8',  // SANCTUM
  border: '#E5E5E5',
  error: '#A67C73',      // DENY
  success: '#7A9B76',    // AFFIRM
  warning: '#C4956C',    // CAUTION
};

export const EMAIL_FONTS = {
  // Per brand guidelines: Montserrat for body, Playfair Display for display text
  display: '"Playfair Display", Georgia, serif',
  body: 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "Courier New", monospace',
};

// Common email component styles aligned with brand guidelines
export const emailStyles = {
  // Typography - following brand guidelines hierarchy
  h1: {
    color: EMAIL_COLORS.BONE,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '32px',
    fontWeight: '400',
    letterSpacing: '2px',      // +200 tracking per guidelines
    lineHeight: '1.1',
    margin: '0 0 24px',
    textAlign: 'left' as const,
    textTransform: 'uppercase' as const,
  },
  
  h2: {
    color: EMAIL_COLORS.BONE,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '24px',
    fontWeight: '400',
    letterSpacing: '1.5px',    // +150 tracking per guidelines
    lineHeight: '1.2',
    margin: '0 0 16px',
  },
  
  h3: {
    color: EMAIL_COLORS.BONE,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '18px',
    fontWeight: '500',
    letterSpacing: '1px',      // +100 tracking per guidelines
    lineHeight: '1.3',
    margin: '0 0 12px',
  },
  
  text: {
    color: EMAIL_COLORS.BONE,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '16px',
    fontWeight: '400',
    letterSpacing: '0.5px',    // +25 to +50 tracking per guidelines
    lineHeight: '1.6',
    margin: '0 0 16px',
  },
  
  textSmall: {
    color: EMAIL_COLORS.SANCTUM,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '14px',
    fontWeight: '400',
    letterSpacing: '1.5px',    // +150 tracking for captions
    lineHeight: '1.4',
    margin: '0 0 12px',
  },
  
  declaration: {
    color: EMAIL_COLORS.BONE,
    fontFamily: EMAIL_FONTS.display,
    fontSize: '16px',
    fontStyle: 'italic' as const,
    lineHeight: '1.6',
    margin: '24px 0',
  },
  
  // Buttons - following brand guidelines
  buttonPrimary: {
    backgroundColor: EMAIL_COLORS.ALTAR,
    borderRadius: '2px',       // Minimal radius per brand aesthetic
    color: EMAIL_COLORS.VOID,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '1px',      // +100 tracking for buttons
    lineHeight: '1.5',
    padding: '14px 32px',
    textAlign: 'center' as const,
    textDecoration: 'none',
    textTransform: 'uppercase' as const,
  },
  
  buttonSecondary: {
    backgroundColor: 'transparent',
    border: `2px solid ${EMAIL_COLORS.ALTAR}`,
    borderRadius: '2px',
    color: EMAIL_COLORS.ALTAR,
    fontFamily: EMAIL_FONTS.body,
    fontSize: '16px',
    fontWeight: '600',
    letterSpacing: '1px',
    lineHeight: '1.5',
    padding: '12px 30px',
    textAlign: 'center' as const,
    textDecoration: 'none',
    textTransform: 'uppercase' as const,
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
