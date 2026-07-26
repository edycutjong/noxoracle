import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { TopBar } from '@/components/TopBar';

const TITLE = 'NoxOracle — bet what you know, not who you are';
const DESCRIPTION =
  'Private positions on a real Gnosis Conditional-Tokens prediction market. Direction + size encrypted through settlement; only epoch totals go public. Built on iExec Nox.';

export const metadata: Metadata = {
  metadataBase: new URL('https://noxoracle.edycu.dev'),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://noxoracle.edycu.dev',
    siteName: 'NoxOracle',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'NoxOracle' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-display">
        <div className="grid-floor" aria-hidden />
        <Providers>
          <div className="relative z-10 mx-auto max-w-5xl px-5 pb-24">
            <TopBar />
            {children}
            <footer className="mt-16 border-t border-white/10 py-6 text-center text-xs text-white/50">
              NoxOracle · direction &amp; size encrypted through settlement · iExec Nox · live on
              Ethereum Sepolia · v{process.env.NEXT_PUBLIC_APP_VERSION}
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
