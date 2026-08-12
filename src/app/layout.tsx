import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: 'Migration Check',
  description:
    'Paste a freshly migrated Pump.fun contract, pick the scam group, get a buy / skip verdict from the group-specific on-chain rules.',
  appleWebApp: {
    capable: true,
    title: 'Migration Check',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  /* Allow zoom — locking it out is an accessibility failure. */
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Rendered first so the laptop top bar sits above the page. The phone
            bar is `fixed`, so DOM order does not affect where it lands. */}
        <BottomNav />
        {children}
      </body>
    </html>
  );
}
