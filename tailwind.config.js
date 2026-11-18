/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#000000',
        paper: '#FFFFFF',
        mist: '#F7F7F7',
        line: '#EAEAEA',
        stone: '#888888',
        // #888 on white is 3.5:1; small secondary text uses this AA-compliant step (4.5:1).
        muted: '#767676',
        graphite: '#333333',
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', '"Neue Haas Grotesk Display Pro"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      transitionTimingFunction: {
        sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
