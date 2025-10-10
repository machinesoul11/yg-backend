/**
 * YES GODDESS Brand System
 * Brand colors, typography, and design tokens
 */

// Logo configuration
export const BRAND_LOGO = {
  path: '/logo/yesgoddesslogo.png',
  alt: 'YES GODDESS',
  sizes: {
    sm: { width: 120, height: 32 },
    md: { width: 180, height: 48 },
    lg: { width: 240, height: 64 },
    xl: { width: 360, height: 96 },
  },
  // For email templates
  email: {
    header: { width: 180, height: 48 },
    footer: { width: 120, height: 32 },
  },
} as const;

export const BRAND_COLORS = {
  // Primary Palette
  gold: {
    DEFAULT: '#D4AF37',
    light: '#F5E6D3',
    dark: '#B8941F',
  },
  black: {
    DEFAULT: '#000000',
    soft: '#1A1A1A',
  },
  white: {
    DEFAULT: '#FFFFFF',
    warm: '#FAF8F5',
  },
  // Secondary/Accent Colors
  rose: {
    DEFAULT: '#E8B4B8',
    light: '#F5E1E4',
    dark: '#C89499',
  },
  sage: {
    DEFAULT: '#9CAF88',
    light: '#D4E0C8',
    dark: '#7A926A',
  },
  cream: {
    DEFAULT: '#F5E6D3',
    light: '#FAF3E9',
    dark: '#E8D4BC',
  },
} as const;

export const BRAND_FONTS = {
  display: '"Playfair Display", serif',
  sans: 'Montserrat, system-ui, sans-serif',
  mono: '"JetBrains Mono", monospace',
} as const;

export const BRAND_GRADIENTS = {
  gold: 'linear-gradient(135deg, #D4AF37 0%, #F5E6D3 100%)',
  rose: 'linear-gradient(135deg, #E8B4B8 0%, #F5E1E4 100%)',
  dark: 'linear-gradient(135deg, #000000 0%, #1A1A1A 100%)',
} as const;

export const BRAND_SPACING = {
  section: {
    mobile: '4rem',
    tablet: '6rem',
    desktop: '8rem',
  },
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
} as const;

export const BRAND_BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const BRAND_SHADOWS = {
  soft: '0 2px 8px rgba(0, 0, 0, 0.06)',
  medium: '0 4px 16px rgba(0, 0, 0, 0.08)',
  hard: '0 8px 24px rgba(0, 0, 0, 0.12)',
  gold: '0 4px 16px rgba(212, 175, 55, 0.25)',
  'gold-lg': '0 8px 32px rgba(212, 175, 55, 0.3)',
} as const;

export const BRAND_ANIMATIONS = {
  duration: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

// Brand voice and messaging
export const BRAND_VOICE = {
  tagline: 'Empowering creators, celebrating talent',
  description:
    'YES GODDESS is a premium digital talent marketplace celebrating and empowering content creators through innovative licensing solutions.',
  keywords: [
    'empowerment',
    'celebration',
    'elegance',
    'sophistication',
    'premium',
    'creator economy',
    'digital licensing',
  ],
} as const;

// Email branding
export const EMAIL_BRANDING = {
  colors: {
    primary: BRAND_COLORS.gold.DEFAULT,
    background: BRAND_COLORS.white.warm,
    text: BRAND_COLORS.black.DEFAULT,
    accent: BRAND_COLORS.rose.DEFAULT,
  },
  header: {
    backgroundColor: BRAND_COLORS.black.DEFAULT,
    textColor: BRAND_COLORS.gold.DEFAULT,
  },
  footer: {
    backgroundColor: BRAND_COLORS.black.soft,
    textColor: BRAND_COLORS.white.DEFAULT,
  },
} as const;

// Component variants
export const BUTTON_VARIANTS = {
  primary: 'bg-brand-gold text-brand-white hover:bg-brand-gold-dark',
  secondary: 'bg-brand-black text-brand-white hover:bg-brand-black-soft',
  outline: 'border-2 border-brand-gold text-brand-gold hover:bg-brand-gold hover:text-brand-white',
  ghost: 'text-brand-black hover:bg-brand-cream',
  rose: 'bg-brand-rose text-brand-white hover:bg-brand-rose-dark',
  sage: 'bg-brand-sage text-brand-white hover:bg-brand-sage-dark',
} as const;

export const CARD_VARIANTS = {
  default: 'bg-brand-white rounded-lg shadow-soft border border-brand-white-warm',
  hover: 'bg-brand-white rounded-lg shadow-soft border border-brand-white-warm hover:shadow-medium',
  gold: 'rounded-lg shadow-soft border border-brand-gold-light bg-gradient-to-br from-brand-white to-brand-cream',
  elevated: 'bg-brand-white rounded-lg shadow-medium border border-gray-100',
} as const;

// Status colors for admin/backend
export const STATUS_COLORS = {
  success: BRAND_COLORS.sage.DEFAULT,
  warning: BRAND_COLORS.gold.DEFAULT,
  error: BRAND_COLORS.rose.dark,
  info: BRAND_COLORS.rose.light,
  pending: BRAND_COLORS.cream.DEFAULT,
  active: BRAND_COLORS.sage.DEFAULT,
  inactive: '#9CA3AF',
} as const;

// Type exports
export type BrandColor = keyof typeof BRAND_COLORS;
export type BrandFont = keyof typeof BRAND_FONTS;
export type BrandGradient = keyof typeof BRAND_GRADIENTS;
export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type CardVariant = keyof typeof CARD_VARIANTS;
export type StatusColor = keyof typeof STATUS_COLORS;
