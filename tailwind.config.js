/**
 * Aristotle POS - Tailwind CSS v3 Static Build Config
 * Pindahan 1:1 dari konfigurasi inline Play CDN (dulu di index.html).
 * Build: npm run build:css  →  css/tailwind.css (di-commit agar dev server & APK langsung jalan).
 *
 * ATURAN: nama kelas Tailwind harus tertulis UTUH di source (index.html / js/**).
 * Jangan merakit nama kelas dinamis (mis. `bg-${warna}`) — scanner tidak akan
 * menemukannya dan stylenya diam-diam hilang. Perkecualian didaftar di safelist.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          amber: '#F59E0B',           // Primary Honey Amber
          amberHover: '#D97706',      // Darker Amber for hover
          amberLight: '#FEF3C7',      // Soft Amber Container
          espresso: '#1C1917',        // Deep Warm Espresso
          espressoLight: '#292524',   // Espresso light surface
          orange: '#EA580C',          // Secondary Warm Cinnamon
          orangeLight: '#FFEDD5',     // Light Orange
          cream: '#FFFBEB',           // Soft Cream Background
          surface: '#FAFAF9',         // Warm Neutral Surface
          cardBorder: '#E7E5E4'       // Stone Border
        }
      }
    },
  },
  plugins: [],
};
