'use client';

import { useMemo, useState } from 'react';
import { dualHandle, fpmmPrices, formatWhole } from '@noxoracle/confidential-ctf';
import { MARKET, short } from '@/lib/config';
import { LockIcon, SealedPill } from '@/components/SealedPill';
import { KMeter } from '@/components/KMeter';

const RESERVES = [370n, 630n]; // AMM outcome-token reserves -> YES 0.63 / NO 0.37

export default function MarketPage() {
  const [side, setSide] = useState<'yes' | 'no'>('no');
  const [amount, setAmount] = useState('500');
  const [committed, setCommitted] = useState(false);
  const prices = useMemo(() => fpmmPrices(RESERVES), []);
  const amt = BigInt(Math.max(0, Math.floor(Number(amount) || 0)));
  const pair = amt > 0n ? dualHandle(side, amt) : { amtYes: 0n, amtNo: 0n };

  return (
    <main className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold leading-tight">
          Take a position <span className="text-primary">nobody can trace back to you</span>.
        </h1>
        <p className="max-w-2xl text-mid">
          A real Gnosis Conditional-Tokens market. Your direction and size are encrypted through settlement —
          only epoch totals ever go public. Four identical transactions; one dissenter; unfindable.
        </p>
      </section>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-mid">
        <strong className="text-hi">Illustrative preview.</strong> Committing here walks through the flow — the real
        confidential cycle (commit → aggregate → FPMM buy → sealed claim) runs on-chain and is recomputable from chain
        with <code className="text-hi">noxoracle verify-epoch 1</code>. Live contracts + tx hashes are on the verify page.
      </div>

      <div className="grid gap-6 md:grid-cols-5">
        {/* Market card */}
        <section className="card space-y-5 p-6 md:col-span-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="chip-amber rounded-full px-2 py-0.5">PREVIEW · Sepolia</span>
            <span className="text-mid">CTF condition {short(MARKET.conditionId)}</span>
          </div>
          <h2 className="text-xl font-semibold">{MARKET.question}</h2>
          <div className="flex gap-3">
            {(['yes', 'no'] as const).map((s, i) => (
              <div key={s} className={`flex-1 rounded-xl border p-4 ${s === 'yes' ? 'border-primary/30' : 'border-accent/30'}`}>
                <div className="text-xs uppercase tracking-wide text-mid">{s}</div>
                <div className="tnum text-2xl font-bold text-primary-bright">{prices[i].toFixed(2)}</div>
                <div className="text-[11px] text-mid">implied probability</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm">
            <span className="text-mid">commit window closes in <span className="tnum text-hi">02:14:09</span></span>
            <KMeter count={4} />
          </div>
        </section>

        {/* Bet slip */}
        <section className="card space-y-4 p-6 md:col-span-2">
          <div className="text-sm font-semibold text-mid">Private bet slip</div>
          <div className="grid grid-cols-2 gap-2">
            {(['yes', 'no'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setSide(s); setCommitted(false); }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold uppercase transition ${
                  side === s ? 'border-primary bg-primary/15 text-primary-bright' : 'border-white/10 text-mid'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <label className="block text-xs text-mid">
            Amount (cUSD)
            <input
              value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setCommitted(false); }}
              className="tnum mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-lg text-hi outline-none focus:border-primary/50"
            />
          </label>
          <button
            onClick={() => setCommitted(true)}
            className="w-full rounded-xl bg-primary py-2.5 font-semibold text-black shadow-glow"
          >
            <span className="inline-flex items-center justify-center gap-2">Commit privately <LockIcon /></span>
          </button>

          {/* Dual-handle: the commit becomes TWO sealed envelopes, one carrying an encrypted zero. */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-mid">
              on-chain: two sealed handles {committed && '· committed'}
            </div>
            <div className="flex flex-wrap gap-2">
              <SealedPill label="YES" revealed={false} />
              <SealedPill label="NO" revealed={false} />
            </div>
            <div className="mt-3 text-[11px] text-mid">
              You encrypt <span className="tnum text-hi">{formatWhole(pair.amtYes * 1_000_000n)} YES</span> and{' '}
              <span className="tnum text-hi">{formatWhole(pair.amtNo * 1_000_000n)} NO</span> — one is an encrypted zero.
              Nothing on-chain says which.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
