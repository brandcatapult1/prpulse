/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#2563eb', muted: '#dbeafe' },
        surface: { DEFAULT: '#ffffff', muted: '#f8fafc', border: '#e2e8f0' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
