import { NextResponse } from 'next/server';
import { listCoins, saveCoin } from '@/lib/tracker/db';
import { getTokenMetadata } from '@/lib/tracker/holders';

export const maxDuration = 60;

export async function GET() {
  try {
    const coins = await listCoins(1000);
    const toRepair = coins.filter(
      (c) => c.name === 'Unknown' || c.symbol === '???' || !c.logoURI || c.logoURI.trim() === ''
    );

    let fixedCount = 0;
    const results = [];

    for (const c of toRepair) {
      // getTokenMetadata returns a new metadata object with the latest details
      const meta = await getTokenMetadata(c.mint);
      
      const isFixed = 
        (meta.name !== 'Unknown' && meta.name !== c.name) || 
        (meta.symbol !== '???' && meta.symbol !== c.symbol) || 
        (!!meta.logoURI && meta.logoURI !== c.logoURI);
        
      if (isFixed) {
        if (meta.name !== 'Unknown') c.name = meta.name;
        if (meta.symbol !== '???') c.symbol = meta.symbol;
        if (meta.logoURI) c.logoURI = meta.logoURI;
        
        await saveCoin(c);
        fixedCount++;
        results.push({ mint: c.mint, name: c.name, symbol: c.symbol, logoURI: c.logoURI });
      }
    }

    return NextResponse.json({
      message: `Checked ${coins.length} coins. Found ${toRepair.length} needing repair. Fixed ${fixedCount}.`,
      fixed: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
