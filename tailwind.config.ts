import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        naija: {
          900: '#002215',
          800: '#004D29',
          700: '#1A613D',
          600: '#2A7C52',
          500: '#3F955E',
          400: '#6AA976',
          300: '#92C591',
          200: '#C9A84C',
        },
      },
      boxShadow: {
        glow: '0 24px 80px rgba(0, 77, 41, 0.12)',
      },
      fontFamily: {
        heading: ['Syne', 'ui-serif', 'Georgia', 'Times', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
