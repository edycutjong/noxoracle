'use client';

/*
  NoxOracle landing — "Cipher Noir".
  Design: editorial display scale + one signature interactive moment (PositionCipher:
  a real market position whose DIRECTION + SIZE scramble into sealed hex handles, with a
  PUBLIC / YOU toggle that dramatizes the killer fact — only epoch totals go public,
  individual positions stay sealed through and after settlement).
  All on-chain / SDK logic lives in lib + @noxoracle/confidential-ctf — untouched here.
*/

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { dualHandle, fpmmPrices, formatWhole } from '@noxoracle/confidential-ctf';
import { MARKET, NETWORK, CONTRACTS, short } from '@/lib/config';
import { AGG } from '@/lib/demo';
import { LockIcon, SealedPill } from '@/components/SealedPill';
import { KMeter } from '@/components/KMeter';

const RESERVES = [370n, 630n]; // AMM outcome-token reserves -> YES 0.63 / NO 0.37
const GITHUB_URL = 'https://github.com/edycutjong/noxoracle';

// Illustrative personal position used only inside the signature preview widget.
const MY_SIDE: 'yes' | 'no' = 'yes';
const MY_SIZE = 250n; // cUSD (whole)

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

const CREDIBILITY = [
  {
    k: 'On real infra',
    t: 'Not a stub',
    b: 'Runs on the official Gnosis Conditional Tokens (1.0.3) + FixedProductMarketMaker (1.8.1), deployed byte-for-byte from npm artifacts and CI bytecode-hash-checked. The full commit → aggregate → FPMM buy → claim cycle ran on Ethereum Sepolia.',
  },
  {
    k: 'On the market',
    t: 'Nothing modified',
    b: 'The underlying Gnosis market is untouched. Privacy lives in a thin confidential layer around it — the market learns the information (epoch totals) without ever learning the informant (your position).',
  },
  {
    k: 'Honest by design',
    t: 'The limits, stated plainly',
    b: 'Below k=3 the k-gate refuses to reveal an epoch — with one bettor the aggregate is the individual. We ship that deliberately-bad exhibit on the Verify page. Amounts are whole-cUSD; a pinned beta Nox SDK + Intel TDX liveness are trusted. No overclaiming.',
  },
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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

export default function MarketPage() {
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

  return (
    <main className="space-y-16 pt-2 sm:space-y-24">
      <Hero />
      <BetSlip />
      <ProofSection />
      <FlowStrip />
      <CredibilityBand />
      <Faq />
      <FinalCta />
    </main>
  );
}

/* ─────────────────── Interactive bet slip (real SDK, no wallet) ─────────────────── */
/* Restored playable demo: compose a private bet → it becomes two sealed handles,
   one an encrypted zero. Logic uses dualHandle()/fpmmPrices() from the real SDK. */
function BetSlip() {
  const [side, setSide] = useState<'yes' | 'no'>('no');
  const [amount, setAmount] = useState('500');
  const [committed, setCommitted] = useState(false);
  const prices = useMemo(() => fpmmPrices(RESERVES), []);
  const amt = BigInt(Math.max(0, Math.floor(Number(amount) || 0)));
  const pair = amt > 0n ? dualHandle(side, amt) : { amtYes: 0n, amtNo: 0n };

  return (
    <section>
      <span className="kicker">Try it — no wallet needed</span>
      <div className="grid gap-5 md:grid-cols-5">
        {/* Market card */}
        <div className="glass space-y-5 p-6 md:col-span-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="chip">PREVIEW · Sepolia</span>
            <span className="text-mid">CTF condition {short(MARKET.conditionId)}</span>
          </div>
          <h3 className="font-display text-xl font-semibold text-hi">{MARKET.question}</h3>
          <div className="flex gap-3">
            {(['yes', 'no'] as const).map((s, i) => (
              <div key={s} className={`flex-1 rounded-xl border p-4 ${s === 'yes' ? 'border-primary/30' : 'border-cyan/30'}`}>
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
        </div>

        {/* Bet slip */}
        <div className="glass space-y-4 p-6 md:col-span-2">
          <div className="eyebrow">Private bet slip</div>
          <div className="grid grid-cols-2 gap-2">
            {(['yes', 'no'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setSide(s); setCommitted(false); }}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold uppercase transition ${
                  side === s ? 'border-primary bg-primary/15 text-primary-bright' : 'border-white/10 text-mid hover:border-white/25'
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
              inputMode="decimal"
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setCommitted(false); }}
              className="tnum mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-lg text-hi outline-none focus:border-primary/50"
            />
          </label>
          <button onClick={() => setCommitted(true)} className="btn btn-primary w-full">
            Commit privately <LockIcon />
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
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
  return (
    <section className="pt-2 sm:pt-6">
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="hero-in flex flex-wrap gap-2" style={{ ['--d' as any]: '0ms' }}>
            <span className="chip chip-live"><span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-bright" /> Live on Sepolia</span>
            <span className="chip">Real Gnosis CTF · FPMM</span>
            <span className="chip">k = 4 anonymity</span>
          </div>

          <h1 className="hero-in mt-5 font-display text-[2.5rem] font-bold leading-[1.03] tracking-tight sm:text-6xl" style={{ ['--d' as any]: '80ms' }}>
            Bet what you <span className="brand-gradient">know</span>,
            <br />
            not <span className="font-mono text-[2rem] text-cyan-bright sm:text-5xl">who you are</span>.
          </h1>

          <p className="hero-in mt-5 max-w-xl text-base leading-relaxed text-mid sm:text-lg" style={{ ['--d' as any]: '180ms' }}>
            Private positions on a real Gnosis Conditional-Tokens prediction market, built on iExec Nox.
            Your <span className="text-hi">direction and size are encrypted through settlement</span> — only
            epoch totals ever go public. Four identical transactions; one dissenter; unfindable.
          </p>

          <div className="hero-in mt-7 flex flex-wrap items-center gap-3" style={{ ['--d' as any]: '300ms' }}>
            <Link href="/verify" className="btn btn-primary btn-lg lift">See it live on-chain →</Link>
            <Link href="/epoch" className="btn btn-ghost btn-lg lift">Watch an epoch settle</Link>
          </div>
          <p className="hero-in mt-3 text-xs text-low" style={{ ['--d' as any]: '360ms' }}>
            Ethereum Sepolia · recomputable from chain with <span className="font-mono text-mid">noxoracle verify-epoch 1</span> · zero mock data
          </p>
        </div>

        <div className="hero-in" style={{ ['--d' as any]: '240ms' }}>
          <PositionCipher />
        </div>
      </div>
    </section>
  );
}

/* The signature interactive: one private position, seen two ways.
   PUBLIC = your direction & size are sealed hex; only the epoch totals are legible.
   YOU    = you decrypt YOUR own direction + size; everyone else stays sealed. */
function PositionCipher() {
  const reduced = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [dirCipher, setDirCipher] = useState('7a·2f');
  const [sizeCipher, setSizeCipher] = useState('c4·9b');
  const userToggled = useRef(false);

  const prices = useMemo(() => fpmmPrices(RESERVES), []);
  // Real SDK: the commit becomes TWO sealed envelopes, one carrying an encrypted zero.
  const pair = useMemo(() => dualHandle(MY_SIDE, MY_SIZE), []);

  // auto-alternate PUBLIC ⇄ YOU until the user takes over
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (!userToggled.current) setRevealed((v) => !v);
    }, 3800);
    return () => clearInterval(id);
  }, [reduced]);

  // live "encryption" scramble on the sealed handle chars while sealed
  useEffect(() => {
    if (reduced || revealed) return;
    const hex = '0123456789abcdef';
    const rnd = (n: number) => Array.from({ length: n }, () => hex[Math.floor(Math.random() * 16)]).join('');
    const id = setInterval(() => {
      setDirCipher(`${rnd(2)}·${rnd(2)}`);
      setSizeCipher(`${rnd(2)}·${rnd(2)}`);
    }, 70);
    return () => clearInterval(id);
  }, [reduced, revealed]);

  const set = (v: boolean) => { userToggled.current = true; setRevealed(v); };

  return (
    <div className="cipher scanline">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="eyebrow">Your position · preview</span>
        <div className="seg" role="tablist" aria-label="Whose view">
          <button role="tab" aria-selected={!revealed} data-on={!revealed} onClick={() => set(false)}>Public</button>
          <button role="tab" aria-selected={revealed} data-on={revealed} onClick={() => set(true)}>You</button>
        </div>
      </div>

      {/* Market + public odds — always legible */}
      <div className="mb-3">
        <div className="text-sm font-semibold text-hi">{MARKET.question}</div>
        <div className="mt-2 flex gap-2">
          <span className="chip"><span className="text-cyan-bright">YES</span> {prices[0].toFixed(2)}</span>
          <span className="chip"><span className="text-primary-bright">NO</span> {prices[1].toFixed(2)}</span>
          <span className="chip">implied odds · public</span>
        </div>
      </div>

      {/* Your direction — sealed hex in Public, decrypted in You */}
      <div className="cipher-row">
        <div className="min-w-0">
          <div className="text-xs text-low">your direction</div>
          <div className="text-[11px] text-mid">on-chain: a 32-byte handle</div>
        </div>
        <div className="text-right">
          {revealed ? (
            <div className="cipher-amt animate-unseal text-cyan-bright">YES</div>
          ) : (
            <div className="cipher-amt text-accent-bright" aria-label="encrypted direction">0x{dirCipher}</div>
          )}
        </div>
      </div>

      {/* Your size — sealed hex in Public, decrypted in You */}
      <div className="cipher-row mt-2">
        <div className="min-w-0">
          <div className="text-xs text-low">your size</div>
          <div className="text-[11px] text-mid">YES {formatWhole(pair.amtYes * 1_000_000n)} · NO {formatWhole(pair.amtNo * 1_000_000n)} — one is an encrypted zero</div>
        </div>
        <div className="text-right">
          {revealed ? (
            <div className="cipher-amt animate-unseal text-hi">250 <span className="text-sm text-mid">cUSD</span></div>
          ) : (
            <div className="cipher-amt text-accent-bright" aria-label="encrypted size">0x{sizeCipher}</div>
          )}
        </div>
      </div>

      {/* Epoch totals — the ONLY thing that ever becomes public */}
      <div className="cipher-row mt-2" style={{ borderColor: 'rgba(103,232,249,0.20)' }}>
        <div className="min-w-0">
          <div className="text-xs text-low">epoch totals · public</div>
          <div className="text-[11px] text-mid">aggregates decrypt at close</div>
        </div>
        <div className="text-right font-mono text-sm tabular-nums text-cyan-bright">
          YES {formatWhole(AGG.yes * 1_000_000n)} · NO {formatWhole(AGG.no * 1_000_000n)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition ${revealed ? 'bg-cyan/15 text-cyan-bright' : 'bg-accent/15 text-accent-bright'}`}>
          <LockIcon />
          {revealed ? 'Decrypted — viewer-gated (only you)' : 'Sealed — the chain sees two identical handles'}
        </span>
        <KMeter count={4} />
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-xs leading-relaxed text-mid">
        Same epoch, two views. The market — and every other bettor — only ever sees the public totals.
        Your direction and size are decryptable solely by you, through and after settlement.
      </p>
    </div>
  );
}

/* ─────────────────────────── Proof (social proof, counted up) ─────────────────────────── */

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(reduced ? to : 0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced) { setN(to); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver((ents) => {
      if (!ents[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const dur = 1100;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(Math.round(to * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, reduced]);
  return <span ref={ref}>{n}{suffix}</span>;
}

function ProofSection() {
  return (
    <section className="glass reveal p-6 sm:p-7">
      <span className="kicker">Not a demo — verifiable on-chain</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PROOF_TILES.map((tile) => {
          const numeric = /^\d+$/.test(tile.stat);
          return (
            <div key={tile.unit} className="stat lift">
              <span className="stat-num">{numeric ? <CountUp to={Number(tile.stat)} /> : tile.stat}</span>
              <span className="text-sm text-hi">{tile.unit}</span>
              <span className="mt-0.5 text-[11px] leading-snug text-mid">{tile.note}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/verify" className="btn btn-primary lift">Open Verify →</Link>
        <a className="btn btn-ghost lift" href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub ↗</a>
        <a className="btn btn-ghost lift" href="/pitch" target="_blank" rel="noreferrer">Pitch deck ↗</a>
        <a
          className="btn btn-ghost lift font-mono text-xs"
          href={`${NETWORK.explorer}/address/${CONTRACTS.pool}#code`}
          target="_blank"
          rel="noreferrer"
        >
          Verified pool {short(CONTRACTS.pool)} ↗
        </a>
      </div>
      <p className="mt-3 text-xs text-mid">
        <span className="font-mono">verify-epoch 1</span> recomputes invariants I1–I5 from chain data alone — aggregates decrypt to
        YES 1,700 / NO 500, real FPMM buys, Dana’s sealed claim of the full pot. Zero mock.
      </p>
    </section>
  );
}

/* ─────────────────────────── The one flow ─────────────────────────── */

function FlowStrip() {
  return (
    <section>
      <span className="kicker reveal">The one flow — commit-private → public-aggregate → claim-private</span>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FLOW_STEPS.map((s, i) => (
          <li key={s.n} className="card reveal lift flex flex-col gap-3 p-5" style={{ ['--d' as any]: `${i * 80}ms` }}>
            <div className="flex items-center gap-3">
              <span className="step-num tnum">{s.n}</span>
              <span className="font-display text-sm font-semibold text-hi">{s.title}</span>
            </div>
            <p className="text-xs leading-relaxed text-mid">{s.sub}</p>
            {s.sealed && (
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
  );
}

/* ─────────────────────────── Credibility (honest, not fake testimonials) ─────────────────────────── */

function CredibilityBand() {
  return (
    <section>
      <span className="kicker reveal">Why judges can trust it</span>
      <div className="grid gap-4 md:grid-cols-3">
        {CREDIBILITY.map((c, i) => (
          <div key={c.t} className="card reveal lift flex flex-col gap-2 p-5" style={{ ['--d' as any]: `${i * 80}ms` }}>
            <span className="eyebrow">{c.k}</span>
            <span className="font-display text-lg font-semibold text-hi">{c.t}</span>
            <p className="text-sm leading-relaxed text-mid">{c.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

function Faq() {
  return (
    <section>
      <span className="kicker reveal">How it works · FAQ</span>
      <div className="grid gap-3">
        {FAQ.map((item, i) => (
          <details key={item.q} className="faq card reveal px-4 py-3" style={{ ['--d' as any]: `${i * 60}ms` }}>
            <summary className="flex items-center justify-between gap-3 text-sm font-semibold text-hi">
              {item.q}
              <svg className="faq-chev shrink-0 text-mid" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mid">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Final CTA ─────────────────────────── */

function FinalCta() {
  return (
    <section className="cta-band reveal">
      <span className="eyebrow justify-center">The market learns the information, not the informant</span>
      <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl">
        Take a position nobody can trace back to you.
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-mid">
        A real Gnosis market, a private commit, and only the epoch totals ever go public.
        Watch the full confidential cycle recompute itself from chain data.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/verify" className="btn btn-primary btn-lg lift">See live proof →</Link>
        <Link href="/position" className="btn btn-ghost btn-lg lift">Open your position</Link>
      </div>
    </section>
  );
}
