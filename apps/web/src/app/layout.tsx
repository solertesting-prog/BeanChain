import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans } from 'next/font/google';
import { AuthProvider } from '@/lib/auth';
import { Footer, Header } from '@/components/header';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], weight: ['500'], variable: '--font-display', display: 'swap' });
const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'BeanChain · Cosechas de cacao y café tokenizadas', template: '%s · BeanChain' },
  description:
    'Financia cosechas de cacao y café de origen y recibe una parte de los ingresos de su venta a través de un token regulado ERC-3643.',
};

export const viewport: Viewport = {
  themeColor: '#F7F3EE',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body>
        <AuthProvider>
          <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
            Saltar al contenido
          </a>
          <Header />
          <main id="contenido" className="mx-auto max-w-6xl px-4 py-6 md:py-10">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
