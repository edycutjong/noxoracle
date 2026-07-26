'use client';

import { useState } from 'react';
import { rateFraction, payoutAtRate, formatWhole } from '@noxoracle/confidential-ctf';
import { LockIcon, SealedPill } from '@/components/SealedPill';
import { POT, WINNING_POOL } from '@/lib/demo';

// Dana (the secret dissenter) decrypts her own NO 500 — nobody else can, ever.
export default function PositionPage() {
  const [revealed, setRevealed] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const rate = rateFraction(POT, WINNING_POOL);
  const payout = payoutAtRate(500n, POT, WINNING_POOL);

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-bold">Your position</h1>

      <section className="card space-y-5 p-6">
        <div className="text-sm text-mid">Epoch #1 · you can decrypt your own stakes; nobody else can, forever.</div>
        <div className="flex flex-wrap items-center gap-3">
          <SealedPill label="YES" revealed={revealed} value={revealed ? '0' : undefined} />
          <SealedPill label="NO" revealed={revealed} value={revealed ? '500' : undefined} />
          {!revealed && (
            <button
              onClick={() => setRevealed(true)}
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-bright"
            >
              Decrypt with wallet
            </button>
          )}
        </div>
        {revealed && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-mid">
            You bet <span className="font-semibold text-primary-bright">NO 500</span> among a YES herd. The chain shows
            two identical handles; the epoch shows only sums. Admin-minimality: over your stake handle{' '}
            <code className="text-hi">isAllowed(you)=false</code>, <code className="text-hi">isViewer(you)=true</code>.
          </div>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settlement</h2>
          <span className="chip-amber rounded-full px-2 py-0.5 text-xs">Oracle reported: NO wins</span>
        </div>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-xs text-mid">public rate (pot / winning pool)</div>
            <div className="tnum text-2xl font-bold text-primary-bright">
              {formatWhole(rate.num * 1_000_000n)} / {formatWhole(rate.den * 1_000_000n)} → {rate.multiple}×
            </div>
          </div>
          <div>
            <div className="text-xs text-mid">your sealed payout</div>
            <SealedPill label="cUSD" revealed={claimed} value={claimed ? formatWhole(payout * 1_000_000n) : undefined} tone="emerald" />
          </div>
          {!claimed && (
            <button
              onClick={() => setClaimed(true)}
              className="ml-auto rounded-xl bg-emerald px-5 py-2.5 font-semibold text-black"
            >
              Claim payout
            </button>
          )}
        </div>
        {claimed && (
          <div className="text-sm text-emerald-bright">Payout sent — sealed cUSD <LockIcon className="inline align-[-0.1em]" /> · your win is yours to disclose.</div>
        )}
      </section>
    </main>
  );
}
