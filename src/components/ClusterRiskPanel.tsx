import type { DumpRiskAssessment, OutsiderVolumeResult } from '@/types';

function riskColor(score: number): string {
  if (score >= 60) return 'text-insider'; // red
  if (score >= 30) return 'text-bonding'; // amber
  return 'text-outsider'; // green
}

export function ClusterRiskPanel({
  risk,
  outsiderVolume,
}: {
  risk: DumpRiskAssessment | null;
  outsiderVolume: OutsiderVolumeResult;
}) {
  return (
    <div className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Outsider Volume Ratio</h3>
        <p className="text-2xl font-semibold">
          {(outsiderVolume.outsiderRatio * 100).toFixed(1)}%
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {outsiderVolume.trueOutsiderVolumeSol.toFixed(2)} true outsider SOL of{' '}
          {outsiderVolume.totalPoolSol.toFixed(2)} total pool SOL
          {' '}({outsiderVolume.insiderTaggedSol.toFixed(2)} insider,{' '}
          {outsiderVolume.mevBotTaggedSol.toFixed(2)} MEV/bot)
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Dump-Risk Score</h3>
        {risk ? (
          <>
            <p className={`text-2xl font-semibold ${riskColor(risk.riskScore)}`}>
              {risk.riskScore}/100
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {risk.signals.map((s) => (
                <li
                  key={s.key}
                  className={s.triggered ? 'text-zinc-200' : 'text-zinc-600'}
                >
                  {s.triggered ? '⚠' : '·'} {s.description}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-zinc-500">Risk assessment unavailable.</p>
        )}
      </div>
    </div>
  );
}
