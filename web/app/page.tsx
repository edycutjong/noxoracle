'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { dualHandle, fpmmPrices, formatWhole } from '@noxoracle/confidential-ctf';
import { MARKET, NETWORK, CONTRACTS, short } from '@/lib/config';
import { LockIcon, SealedPill } from '@/components/SealedPill';
import { KMeter } from '@/components/KMeter';

const RESERVES = [370n, 630n]; // AMM outcome-token reserves -> YES 0.63 / NO 0.37

// Landing content — every fact below is drawn verbatim from the repo README; nothing invented.
const FLOW_STEPS: { n: string; title: string; sub: string; sealed?: boolean }[] = [
  { n: '1', title: 'Commit private', sub: 'Two sealed handles — direction hidden', sealed: true },
  { n: '2', title: 'Epoch closes', sub: 'Commit window ends' },
  { n: '3', title: 'Aggregates decrypt', sub: 'Only YES / NO totals go public' },
  { n: '4', title: 'Route through FPMM', sub: 'Real Gnosis market, one batch' },
  { n: '5', title: 'Claim private', sub: 'Winnings paid in sealed cUSD' },
];

const PROOF_TILES = [
  { stat: 'Live', unit: 'on Sepolia', note: 'Full confidential cycle run on-chain' },
  { stat: 'Real', unit: 'Gnosis CTF', note: 'Bytecode hash-checked vs npm artifacts' },
  { stat: '197', unit: 'tests', note: '134 pure-logic + 63 Solidity — green' },
  { stat: 'k = 4', unit: 'anonymity', note: 'Epoch-1 set: one dissenter, unfindable' },
] as const;

const FAQ = [
  {
    q: 'Can anyone see who bet which way?',
    a: 'No. A bet is committed as two encrypted amounts (a YES-stake and a NO-stake, one of which is an encrypted zero), so your direction never exists in plaintext — it is an encrypted handle. Individual direction and size stay hidden through and after settlement.',
  },
  {
    q: 'Is the market real, or a simulation?',
    a: 'Real. NoxOracle sits on the official Gnosis Conditional Tokens (1.0.3) + FixedProductMarketMaker (1.8.1), deployed byte-for-byte from the npm artifacts and CI bytecode-hash-checked (invariant I5: CTF MATCH, FPMM master MATCH). Nothing about the underlying market is modified.',
  },
  {
    q: 'What actually becomes public?',
    a: 'Only the epoch aggregates. At epoch close the YES/NO totals are publicly decrypted and routed through the FPMM in one batch. Individual positions are never revealed — the market learns the information without learning the informant.',
  },
  {
    q: 'How are winners paid without leaking stakes?',
    a: 'Winners are paid in confidential cUSD at a public pot/pool rate (a Nox multiply/divide by a public scalar), so the claim reveals nothing about the individual stake. In epoch 1, Dana claimed exactly the pot — 1,626.1277 cUSD.',
  },
  {
    q: 'Is this a mock?',
    a: 'No. The full cycle — commit-private → batch-execute-public-aggregate → claim-private — ran end-to-end on Ethereum Sepolia: 4 private commits (k=4), aggregates decrypting to YES 1,700 / NO 500, real FPMM buys, and Dana’s sealed claim. verify-epoch 1 recomputes it from chain data alone. See the Verify page.',
  },
] as const;

const GITHUB_URL = 'https://github.com/edycutjong/noxoracle';

export default function MarketPage() {
  const [side, setSide] = useState<'yes' | 'no'>('no');
  const [amount, setAmount] = useState('500');
  const [committed, setCommitted] = useState(false);
  const prices = useMemo(() => fpmmPrices(RESERVES), []);

  // Scroll-reveal: animate landing sections into view once, then stop observing.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const els = Array.from(document.querySelectorAll('.reveal'));
    const io = new IntersectionObserver(
      (ents) =>
        ents.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
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

      {/* ── The one flow ─────────────────────────────────────────────── */}
      <section className="space-y-4 pt-6">
        <div className="reveal flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-bold">The one flow</h2>
          <span className="text-sm text-mid">commit-private → public-aggregate → claim-private</span>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW_STEPS.map((step, i) => (
            <li
              key={step.n}
              className="card reveal lift flex flex-col gap-2 p-4"
              style={{ ['--d' as any]: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-2">
                <span className="chip-amber tnum flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold">
                  {step.n}
                </span>
                <span className="font-semibold text-hi">{step.title}</span>
              </div>
              <p className="text-xs text-mid">{step.sub}</p>
              {step.sealed && (
                <div className="mt-auto flex gap-1.5 pt-1">
                  <span className="chip-violet inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold">
                    <LockIcon size={10} /> YES
                  </span>
                  <span className="chip-violet inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold">
                    <LockIcon size={10} /> NO
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* ── Live proof / social proof ────────────────────────────────── */}
      <section className="space-y-4 pt-2">
        <h2 className="reveal text-2xl font-bold">Not a demo — verifiable on-chain</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF_TILES.map((tile, i) => (
            <div
              key={tile.unit}
              className="card reveal lift p-4"
              style={{ ['--d' as any]: `${i * 80}ms` }}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="tnum text-2xl font-bold text-primary-bright">{tile.stat}</span>
                <span className="text-sm text-mid">{tile.unit}</span>
              </div>
              <p className="mt-1 text-xs text-mid">{tile.note}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/verify"
            className="btn-press lift rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black shadow-glow transition hover:brightness-110"
          >
            Open Verify →
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-press lift rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-hi transition hover:bg-white/5"
          >
            View on GitHub
          </a>
          <a
            href="/pitch"
            className="btn-press lift rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-hi transition hover:bg-white/5"
          >
            Pitch deck
          </a>
          <a
            href={`${NETWORK.explorer}/address/${CONTRACTS.pool}#code`}
            target="_blank"
            rel="noreferrer"
            className="btn-press lift rounded-xl border border-accent/40 bg-accent/10 px-4 py-2 font-mono text-xs text-accent-bright transition hover:bg-accent/20"
          >
            Verified contract {short(CONTRACTS.pool)} ↗
          </a>
        </div>
      </section>

      {/* ── How it works / FAQ ───────────────────────────────────────── */}
      <section className="space-y-4 pt-2">
        <h2 className="reveal text-2xl font-bold">How it works</h2>
        <div className="space-y-2">
          {FAQ.map((item) => (
            <details key={item.q} className="faq card reveal px-4 py-3">
              <summary className="flex items-center justify-between gap-3 text-sm font-semibold text-hi">
                {item.q}
                <svg
                  className="faq-chev shrink-0 text-mid"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mid">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
