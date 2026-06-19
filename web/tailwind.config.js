/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f5f8',
        ink: {
          DEFAULT: '#1a1d26',
          secondary: '#5c6370',
          tertiary: '#8b919a',
        },
        line: '#e8eaef',
        brand: {
          DEFAULT: '#5e6ad2',
          hover: '#4f5abf',
          soft: '#eef0fb',
        },
        health: {
          green: '#0d9488',
          amber: '#d97706',
          red: '#dc2626',
          muted: '#8b919a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};
