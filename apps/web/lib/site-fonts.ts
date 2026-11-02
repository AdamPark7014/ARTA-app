import localFont from 'next/font/local';

/**
 * Letra del sitio y del panel: Inter Tight para titulares e Inter para leer (licencia SIL OFL), con
 * todos sus pesos. Viven en el repo: no se le pide nada a Google.
 */
const display = localFont({
  src: '../app/fonts/inter-tight-latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-sitio-display',
});

const text = localFont({
  src: '../app/fonts/inter-latin.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-sitio-text',
});

export const siteFontVars = `${display.variable} ${text.variable}`;
