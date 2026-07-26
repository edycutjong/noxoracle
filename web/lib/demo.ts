// Deterministic demo state (the seed cast from SEED_DATA / scripts/seed.mjs), so every screen quotes
// the SAME numbers the funded seed run produces. All amounts in whole cUSD for display.
import type { EpochVerificationInput } from '@noxoracle/confidential-ctf';

export const CAST = [
  { name: 'Alice', side: 'yes' as const, amount: 1000, role: 'the YES herd' },
  { name: 'Bob', side: 'yes' as const, amount: 500, role: 'the YES herd' },
  { name: 'Carol', side: 'yes' as const, amount: 200, role: 'the YES herd' },
  { name: 'Dana', side: 'no' as const, amount: 500, role: 'the secret dissenter' },
];

export const AGG = { yes: 1700n, no: 500n };
// Real on-chain settlement (Sepolia epoch #1 — fixtures/demo-state.json rate.num/den, e2e-result.json
// danaClaim.pot): NO wins; the pot is 1,626.1277 cUSD, paid in full to Dana (the sole NO staker).
// Displayed in whole cUSD per this file's convention; the precise figure is in the fixtures + README.
export const POT = 1626n;
export const WINNING_POOL = 500n;

// The REAL handles from the live seed run (fixtures/demo-state.json) — the /verify page runs the real
// verifyEpoch over them, so the judge dashboard quotes on-chain data, not placeholders.
const AGG_YES_HANDLE = '0x0000aa36a723017ac73ba8722322b53895e5b5626b7081c9bd1c0b256a9e0183';
const AGG_NO_HANDLE = '0x0000aa36a723010c0a512754a15eec26f5a951a555d405b3d29bb33e6a398603';
const UNWRAP_HANDLE = '0x0000aa36a723016be3a0ea448e4dbe30a760bd3879fae9defd9b36d01fdafc76';
const STAKE_HANDLES = [
  '0x0000aa36a723017a68a4996afebcfbd3c733ee4c2f370071b7ff289105fa8fab',
  '0x0000aa36a72301f7b22c0c359a5b95159153f0209df523bb5617754c73d69a58',
  '0x0000aa36a72301d5c344cad0ea552d609220b4ea769d66915dc184d01c56dfb6',
  '0x0000aa36a72301efde102fe8e7fb4182ada58992f8026e4ff75eb6afd4ec00d2',
  '0x0000aa36a72301043ecd799dea09468a1c420aeade3b756963f56f1c13c3001e',
  '0x0000aa36a72301748483d34a3c84b4056a718d5fde0d3cd7a6f089abe63eec2d',
  '0x0000aa36a72301feab5fa4a0ce49a3c6085bcae6925d30286a62f62ef1847442',
  '0x0000aa36a72301bb50130a50282a0c4afddea1a69a94ac0ce72b94340bae04cd',
];

// A verify-epoch input matching the honest seed; the /verify page runs the real verifyEpoch on it.
export const VERIFY_INPUT: EpochVerificationInput = {
  epochId: 1,
  aggregates: { sumYes: 1700n, sumNo: 500n },
  userStakes: CAST.map((c, i) => ({
    address: '0x' + String(i + 1).repeat(40).slice(0, 40),
    yes: c.side === 'yes' ? BigInt(c.amount) : 0n,
    no: c.side === 'no' ? BigInt(c.amount) : 0n,
  })),
  publiclyDecryptedHandles: [AGG_YES_HANDLE, AGG_NO_HANDLE, UNWRAP_HANDLE],
  aggregateHandles: { sumYes: AGG_YES_HANDLE, sumNo: AGG_NO_HANDLE, unwrapId: UNWRAP_HANDLE },
  stakeHandles: STAKE_HANDLES,
  routing: { spentYes: 1700n, spentNo: 500n, unwrapped: 2200n },
  settlement: { pot: 1626n, winner: 'no', winningPool: 500n, payouts: [1626n] },
  artifacts: { ctfMatch: true, fpmmMatch: true },
};

export const BENCH = {
  dualEncryptMs: { p50: 640, p95: 910 },
  publicDecryptMs: { p50: 1180, p95: 1720 },
  claimDecryptMs: { p50: 720, p95: 1030 },
  note: 'illustrative; scripts/bench.mjs pins real p50/p95 (N=20) on the funded run',
};
