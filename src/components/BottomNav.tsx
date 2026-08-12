'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Signal', glyph: '◎' },
  { href: '/scan', label: 'Holders', glyph: '◍' },
  { href: '/coins', label: 'Saved', glyph: '≡' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t hairline backdrop-blur-xl"
      style={{
        background: 'rgba(10,10,12,0.86)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto grid max-w-[430px] grid-cols-3">
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
              <span className="text-[10.5px] font-medium tracking-[0.02em]">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
