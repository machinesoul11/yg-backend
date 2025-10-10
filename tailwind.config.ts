import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './emails/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // YES GODDESS Brand Colors
        brand: {
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
        },
        // Functional Colors
        success: '#9CAF88',
        warning: '#D4AF37',
        error: '#C89499',
        info: '#E8B4B8',
      },
      fontFamily: {
        // Primary: Playfair Display (elegant, sophisticated)
        display: ['"Playfair Display"', 'serif'],
        // Secondary: Montserrat (clean, modern)
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
        // Mono (for code/technical content)
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        // Display sizes
        'display-xl': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['3rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-sm': ['2.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        // Heading sizes
        'h1': ['2rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h2': ['1.75rem', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '600' }],
        'h3': ['1.5rem', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '600' }],
        'h4': ['1.25rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
        'h5': ['1.125rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
        'h6': ['1rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
        // Body sizes
        'body-lg': ['1.125rem', { lineHeight: '1.7', letterSpacing: '0' }],
        'body': ['1rem', { lineHeight: '1.7', letterSpacing: '0' }],
        'body-sm': ['0.875rem', { lineHeight: '1.6', letterSpacing: '0' }],
        'body-xs': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '26': '6.5rem',
        '30': '7.5rem',
        '34': '8.5rem',
        '38': '9.5rem',
        '42': '10.5rem',
        '46': '11.5rem',
        '50': '12.5rem',
      },
      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.5rem',
        '2xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'medium': '0 4px 16px rgba(0, 0, 0, 0.08)',
        'hard': '0 8px 24px rgba(0, 0, 0, 0.12)',
        'gold': '0 4px 16px rgba(212, 175, 55, 0.25)',
        'gold-lg': '0 8px 32px rgba(212, 175, 55, 0.3)',
      },
      backgroundImage: {
        'gradient-gold': 'linear-gradient(135deg, #D4AF37 0%, #F5E6D3 100%)',
        'gradient-rose': 'linear-gradient(135deg, #E8B4B8 0%, #F5E1E4 100%)',
        'gradient-dark': 'linear-gradient(135deg, #000000 0%, #1A1A1A 100%)',
        'gradient-radial': 'radial-gradient(circle, var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'fade-out': 'fadeOut 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-in-out',
        'slide-out': 'slideOut 0.3s ease-in-out',
        'scale-in': 'scaleIn 0.2s ease-in-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideOut: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-10px)', opacity: '0' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};

export default config;
