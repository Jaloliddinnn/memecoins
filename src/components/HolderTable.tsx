'use client';

import type { HolderTableResponse, TagType } from '@/types';
import { TagToggle } from './TagToggle';

const TAG_DOT: Record<TagType, string> = {
  INSIDER: 'bg-insider',
  OUTSIDER: 'bg-outsider',
  MEV_BOT: 'bg-mevbot',
};

function shorten(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function HolderTable({ data }: { data: HolderTableResponse }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2 font-medium">Wallet</th>
            <th className="px-3 py-2 font-medium">% Supply</th>
            <th className="px-3 py-2 font-medium">Cluster</th>
            <th className="px-3 py-2 font-medium">Tag</th>
          </tr>
        </thead>
        <tbody>
          {data.holders.map((h) => (
            <tr key={h.walletAddress} className="border-t border-zinc-800 hover:bg-zinc-900/50">
              <td className="px-3 py-2 font-mono">
                <span className="flex items-center gap-2">
                  {h.tagType && <span className={`h-2 w-2 rounded-full ${TAG_DOT[h.tagType]}`} />}
                  <a
                    href={`https://solscan.io/account/${h.walletAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {shorten(h.walletAddress)}
                  </a>
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums">{h.percentOfSupply.toFixed(2)}%</td>
              <td className="px-3 py-2 text-zinc-400">{h.clusterLabel ?? '—'}</td>
              <td className="px-3 py-2">
                <TagToggle walletAddress={h.walletAddress} currentTag={h.tagType} />
              </td>
            </tr>
          ))}
          {data.holders.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                No holders found for this mint / time window.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
