import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Memecoin Holder Tracker & Anti-Scam Dashboard',
  description:
    'Solana Pump.fun / PumpSwap holder tracking, insider wallet tagging, and cluster-based dump-risk scoring.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
