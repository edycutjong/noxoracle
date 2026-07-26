'use client';

import { verifyEpoch, formatVerifyReport, kAnonymity } from '@noxoracle/confidential-ctf';
import { HashBadge } from '@/components/HashBadge';
import { VERIFY_INPUT, BENCH } from '@/lib/demo';
import { ARTIFACT_HASHES } from '@/lib/config';

export default function VerifyPage() {
  const result = verifyEpoch(VERIFY_INPUT);
  const report = formatVerifyReport(result);
  const badEpoch = kAnonymity(1);

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Verify — the judge dashboard</h1>
        <p className="text-mid">Recompute the invariants from chain data alone. Run it yourself: <code className="text-hi">noxoracle verify-epoch 1</code>.</p>
      </div>

      {/* Aggregate handles */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ['Σ YES', VERIFY_INPUT.aggregates.sumYes, VERIFY_INPUT.aggregateHandles.sumYes],
          ['Σ NO', VERIFY_INPUT.aggregates.sumNo, VERIFY_INPUT.aggregateHandles.sumNo],
        ].map(([label, val, handle]) => (
          <div key={label as string} className="card min-w-0 p-4">
            <div className="text-xs text-mid">{label as string} · publicDecrypt result</div>
            <div className="tnum text-2xl font-bold text-primary-bright">{(val as bigint).toString()}</div>
            <div className="truncate font-mono text-[11px] text-mid">{handle as string}</div>
          </div>
        ))}
      </div>

      {/* verify-epoch terminal block */}
      <section className="card overflow-hidden">
        <div className="border-b border-white/10 px-4 py-2 text-xs text-mid">verify_epoch.ts — invariants I1–I5</div>
        <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-emerald-bright">{report}</pre>
      </section>

      {/* Protocol-purity hash badges */}
      <div className="grid gap-4 sm:grid-cols-2">
        <HashBadge name="ConditionalTokens" version="1.0.3" hash={ARTIFACT_HASHES.conditionalTokens} />
        <HashBadge name="FixedProductMarketMaker" version="1.8.1" hash={ARTIFACT_HASHES.fpmm} />
      </div>

      {/* Honesty exhibit: epoch #0 */}
      <section className="card border-red-500/30 p-6" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <div className="text-sm font-semibold text-red-400">Epoch #0 — the deliberately-bad exhibit</div>
        <div className="mt-1 text-sm text-mid">{badEpoch.label}. With one bettor, the aggregate IS the individual — don&apos;t do this. The k-gate refuses to reveal sub-k epochs on-chain.</div>
      </section>

      {/* Bench tiles */}
      <section>
        <div className="mb-3 text-sm font-semibold text-mid">Benchmarks (p50 / p95, ms)</div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['dual-handle encrypt (2× concurrent)', BENCH.dualEncryptMs],
            ['epoch-close publicDecrypt', BENCH.publicDecryptMs],
            ['claim decrypt', BENCH.claimDecryptMs],
          ].map(([label, s]) => (
            <div key={label as string} className="card p-4">
              <div className="text-xs text-mid">{label as string}</div>
              <div className="tnum text-xl font-bold text-hi">
                {(s as any).p50} <span className="text-mid">/ {(s as any).p95}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-mid">{BENCH.note}</div>
      </section>
    </main>
  );
}
