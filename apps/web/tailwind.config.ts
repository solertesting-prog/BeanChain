import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#F7F3EE',
        ink: '#2A1C15',
        muted: '#6B5A4E',
        line: '#E2D8CD',
        track: '#EDE6DE',
        cacao: { DEFAULT: '#5B3A26', light: '#EFE4DA', text: '#5B2C14', cream: '#F1E6DA' },
        leaf: { DEFAULT: '#2E6A4B', dark: '#1F4A34', light: '#E3EFE7', bright: '#9FDCB8' },
        amber: { soft: '#FBEBD3', text: '#6E3F07' },
        danger: { soft: '#FBE4E1', text: '#8A2416' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
