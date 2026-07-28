import type { Config } from 'tailwindcss';

// "Cipher Noir", tinted to NoxOracle: signal amber/gold (the market — odds, stakes, wins)
// + cyan (live odds / probability) as the family accent, with sealed violet reserved
// EXCLUSIVELY for encrypted state, and emerald for settled wins — on a midnight navy-purple grid.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0E1A',
        deep: '#0A0015',
        panel: '#0B1220',
        grid: '#7C3AED',
        ink: '#07040F',
        primary: { DEFAULT: '#F59E0B', bright: '#FBBF24', soft: '#FDE68A', deep: '#D97706' },
        // cyan — the odds/markets accent that gives NoxOracle its identity within the family
        cyan: { DEFAULT: '#22D3EE', bright: '#67E8F9', deep: '#06B6D4' },
        accent: { DEFAULT: '#8B5CF6', bright: '#A78BFA' },
        emerald: { DEFAULT: '#10B981', bright: '#34D399' },
        hi: '#F8FAFC',
        mid: '#94A3B8',
        low: '#475569',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Manrope', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(245,158,11,0.30), 0 0 90px rgba(0,0,0,0.5)',
        'glow-cyan': '0 0 40px rgba(34,211,238,0.28), 0 0 90px rgba(0,0,0,0.5)',
        sealed: '0 0 32px rgba(139,92,246,0.35)',
      },
      keyframes: {
        shimmer: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        unseal: { '0%': { filter: 'blur(7px)', opacity: '0.25' }, '100%': { filter: 'blur(0)', opacity: '1' } },
      },
      animation: {
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        unseal: 'unseal 500ms ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
