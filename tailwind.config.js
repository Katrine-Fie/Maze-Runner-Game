/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        card: '0 18px 45px rgba(15,23,42,0.55)'
      }
    }
  },
  plugins: []
};

