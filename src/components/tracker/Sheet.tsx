'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Bottom sheet on phones, centred dialog on laptops. One primitive so every
 * panel behaves the same on both.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center lg:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className={`rise relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t hairline bg-[var(--surface)] lg:max-h-[86vh] lg:rounded-3xl lg:border ${
          wide ? 'lg:max-w-3xl' : 'lg:max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 lg:px-6 lg:pt-5">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-dim)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2.5 py-1 text-[20px] leading-none text-[var(--text-dim)] active:opacity-60"
          >
            ×
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 lg:px-6"
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
