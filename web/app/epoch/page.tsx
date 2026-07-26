'use client';

import { useState } from 'react';
import { formatWhole, minWithSlippage } from '@noxoracle/confidential-ctf';
import { SealedPill } from '@/components/SealedPill';
import { CAST, AGG } from '@/lib/demo';

const STEPS = ['Commit', 'Close', 'Execute', 'Resolve'];

export default function EpochPage() {
  const [revealed, setRevealed] = useState(false);
  const minYes = minWithSlippage(1020n, 300);
  const minNo = minWithSlippage(1240n, 300);

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Epoch #1</h1>
        <button
          onClick={() => setRevealed((v) => !v)}
          className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary-bright"
        >
          {revealed ? 'Re-seal aggregates' : 'Close epoch → reveal aggregates'}
        </button>
      </div>

      {/* Timeline */}
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs ${i <= (revealed ? 2 : 0) ? 'chip-amber' : 'border border-white/10 text-mid'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-white/10" />}
          </div>
        ))}
      </div>

      {/* Four identical commitments */}
      <section className="card p-6">
        <div className="mb-3 text-sm font-semibold text-mid">4 commitments — identical on-chain shapes</div>
        <div className="space-y-2">
          {CAST.map((c) => (
            <div key={c.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="w-28 text-sm text-hi">{c.name}</div>
              <SealedPill label="YES" />
              <SealedPill label="NO" />
              <span className="ml-auto text-[11px] text-mid">two sealed handles</span>
            </div>
          ))}
        </div>
      </section>

      {/* Aggregate reveal */}
      <section className={`card p-6 ${revealed ? 'ring-1 ring-primary/40' : ''}`}>
        <div className="mb-3 text-sm font-semibold text-mid">Aggregates {revealed ? '(revealed — sums only)' : '(sealed)'}</div>
        <div className="flex flex-wrap gap-4">
          <SealedPill label="Σ YES" revealed={revealed} value={revealed ? formatWhole(AGG.yes * 1_000_000n) : undefined} />
          <SealedPill label="Σ NO" revealed={revealed} value={revealed ? formatWhole(AGG.no * 1_000_000n) : undefined} />
        </div>
        <div className="mt-2 text-[11px] text-mid">
          Exactly two handles become publicly decryptable (invariant I2). Individual rows stay sealed — through and after settlement.
        </div>
      </section>

      {/* FPMM execution */}
      {revealed && (
        <section className="card animate-unseal p-6">
          <div className="mb-3 text-sm font-semibold text-mid">Routed into the REAL FixedProductMarketMaker</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
              <span>FPMM buy YES · <span className="tnum text-primary-bright">{formatWhole(AGG.yes * 1_000_000n)}</span> cUSD</span>
              <span className="text-[11px] text-mid">slippage guard: min {minYes.toString()} tokens</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3">
              <span>FPMM buy NO · <span className="tnum text-primary-bright">{formatWhole(AGG.no * 1_000_000n)}</span> cUSD</span>
              <span className="text-[11px] text-mid">slippage guard: min {minNo.toString()} tokens</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-mid">The pool holds all outcome tokens — nothing position-shaped in any user wallet.</div>
        </section>
      )}
    </main>
  );
}
