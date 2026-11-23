/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        criticalLow: '#DC2626',   // <54
        low: '#F97316',           // 54-69
        target: '#16A34A',        // 70-180
        high: '#F59E0B',          // 181-250
        criticalHigh: '#B91C1C',  // >250
        stale: '#6B7280',         // >15m
      }
    },
  },
  plugins: [],
}
