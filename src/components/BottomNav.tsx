'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Signal', glyph: '◎' },
  { href: '/scan', label: 'Holders', glyph: '◍' },
  { href: '/coins', label: 'Saved', glyph: '≡' },
  { href: '/tags', label: 'Wallets', glyph: '⊙' },
] as const;

/**
 * Bottom tab bar on phones; a top bar on laptops, where a thumb-reach bar at
 * the bottom of a 15-inch screen makes no sense.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Phone: fixed bottom */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t hairline backdrop-blur-xl lg:hidden"
        style={{
          background: 'rgba(10,10,12,0.86)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="mx-auto grid max-w-[430px] grid-cols-4">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 transition-colors"
                style={{ color: active ? 'var(--blue)' : 'var(--text-dim)' }}
              >
                <span className="text-[17px] leading-none">{tab.glyph}</span>
                <span className="text-[10.5px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Laptop: sticky top */}
      <nav
        className="sticky top-0 z-40 hidden border-b hairline backdrop-blur-xl lg:block"
        style={{ background: 'rgba(10,10,12,0.86)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-2.5">
          <span className="mr-4 text-[15px] font-bold tracking-[-0.01em]">Soltracker</span>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className="rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors"
                style={{
                  color: active ? 'var(--blue)' : 'var(--text-dim)',
                  background: active ? 'rgba(10,132,255,0.12)' : 'transparent',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
