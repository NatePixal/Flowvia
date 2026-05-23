import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        flowvia: {
          canvas: {
            light: '#F7F9FC',
            dark: '#0B0F19',
          },
          panel: {
            light: '#FFFFFF',
            dark: '#101827',
            navy: '#111B2E',
            ink: '#0E1726',
          },
          primary: {
            DEFAULT: '#10B981',
            hover: '#059669',
            soft: '#D1FAE5',
            deep: '#047857',
          },
          accent: {
            gold: '#D6A94A',
            cyan: '#38BDF8',
            violet: '#8B5CF6',
          },
          border: {
            light: '#D8E0EA',
            dark: '#273247',
            strong: '#94A3B8',
          },
          text: {
            strong: '#0F172A',
            body: '#334155',
            muted: '#64748B',
            inverse: '#E5EDF7',
            subtle: '#9AA7B8',
          },
          finance: {
            positive: '#16A34A',
            positiveSoft: '#DCFCE7',
            negative: '#DC2626',
            negativeSoft: '#FEE2E2',
            warning: '#F59E0B',
            info: '#2563EB',
          },
        },
        tradeflow: {
          primary: '#0B1F3A',
          primaryHover: '#0F2C5C',
          accent: '#10B981',
          accentHover: '#059669',
          bgLight: '#F7F9FC',
          bgDark: '#0B0F19',
          cardLight: '#FFFFFF',
          cardDark: '#111B2E',
          textPrimary: '#0F172A',
          textSecondary: '#475569',
          textOnDark: '#E5EDF7',
          textMuted: '#94A3B8',
          borderLight: '#D8E0EA',
          borderDark: '#273247',
          success: '#16A34A',
          warning: '#F59E0B',
          error: '#DC2626',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'brand-blue': '#137FEC',
        'navy-deep': '#0B0F19',
        charcoal: '#161D27',
        'slate-accent': '#273247',
      },
      boxShadow: {
        editorialLight: '0 24px 70px rgba(15, 23, 42, 0.10)',
        editorialDark: '0 28px 90px rgba(0, 0, 0, 0.46)',
        fintechGlow: '0 0 0 1px rgba(16, 185, 129, 0.20), 0 18px 50px rgba(16, 185, 129, 0.16)',
        cardLift: '0 18px 36px rgba(15, 23, 42, 0.12)',
        tableDepth: '0 12px 30px rgba(15, 23, 42, 0.08)',
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        financial: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        premium: '14px',
        card: '10px',
        table: '8px',
      },
      letterSpacing: {
        financial: '0',
      },
      animation: {
        'fade-up': 'fadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'metric-pulse': 'metricPulse 2.8s ease-in-out infinite',
        'ledger-verified': 'ledgerVerified 2.6s ease-in-out infinite',
        'dropdown-reveal': 'dropdownReveal 180ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'spring-hover': 'springHover 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
        shimmer: 'backgroundShimmer 9s linear infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'float-slow': 'float 6s ease-in-out infinite',
        'glow-soft': 'glow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        metricPulse: {
          '0%, 100%': { boxShadow: '0 0 0 rgba(16, 185, 129, 0)' },
          '50%': { boxShadow: '0 0 28px rgba(16, 185, 129, 0.22)' },
        },
        ledgerVerified: {
          '0%, 100%': { boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.18)' },
          '50%': { boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.42), 0 0 24px rgba(16, 185, 129, 0.20)' },
        },
        dropdownReveal: {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        springHover: {
          '0%': { transform: 'translateY(0) scale(1)' },
          '100%': { transform: 'translateY(-2px) scale(1.01)' },
        },
        backgroundShimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(16, 185, 129, 0.48)' },
        },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    function financialUtilities({ addUtilities }: { addUtilities: (utilities: Record<string, Record<string, string>>) => void }) {
      addUtilities({
        '.financial-nums': {
          fontVariantNumeric: 'tabular-nums lining-nums',
          letterSpacing: '0',
        },
      });
    },
  ],
} satisfies Config;

export default config;
