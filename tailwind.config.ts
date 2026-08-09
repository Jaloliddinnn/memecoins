import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Wallet tag color coding used consistently across the holder table,
        // cluster panel, and dump-risk badges.
        insider: '#ef4444', // red — insider/creator-controlled supply
        outsider: '#22c55e', // green — real external buyers
        mevbot: '#a855f7', // purple — MEV/sniper/volume bots
        bonding: '#f59e0b', // amber — pre-migration bonding curve
        dumped: '#71717a', // zinc — confirmed dumped-to-zero
      },
    },
  },
  plugins: [],
};

export default config;
