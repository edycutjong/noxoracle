// Market helpers — the direction-hiding representation, k-anonymity meter, FPMM odds, the
// public-scalar payout math, and slippage guards. All pure and unit-tested; the same functions
// drive the UI preview, the CLI, the seed script and verify-epoch.
import { keccak256, solidityPacked } from 'ethers';

export type Side = 'yes' | 'no';

export const YES_INDEX = 0;
export const NO_INDEX = 1;
export const YES_INDEX_SET = 1; // 0b01
export const NO_INDEX_SET = 2; // 0b10

/**
 * The core privacy primitive: a bet becomes TWO amounts `(amtYes, amtNo)`, one of them zero, so the
 * direction never exists as a plaintext bit. The caller MUST pass BOTH through the gateway's
 * `encryptInput` — INCLUDING the zero side — so the empty side is a PRIVATE encrypted zero. Never
 * let the contract manufacture the empty side with `Nox.toEuint256(0)`: that produces a PUBLIC handle
 * whose zero-ness is on-chain readable, which would leak the direction. On-chain a commit is thus
 * always two identically-shaped private handles. `amount` is in base units (bigint).
 */
export function dualHandle(side: Side, amount: bigint): { amtYes: bigint; amtNo: bigint } {
  if (side !== 'yes' && side !== 'no') throw new Error(`Invalid side: ${side}`);
  if (amount <= 0n) throw new Error('Amount must be positive');
  return side === 'yes' ? { amtYes: amount, amtNo: 0n } : { amtYes: 0n, amtNo: amount };
}

/** Recover the side + size from a decrypted pair (only the bettor can do this, off their own handles). */
export function readDualHandle(amtYes: bigint, amtNo: bigint): { side: Side; amount: bigint } | null {
  if (amtYes > 0n && amtNo === 0n) return { side: 'yes', amount: amtYes };
  if (amtNo > 0n && amtYes === 0n) return { side: 'no', amount: amtNo };
  if (amtYes === 0n && amtNo === 0n) return null; // no position
  // Both non-zero: a hedged position; report the net direction.
  return amtYes >= amtNo ? { side: 'yes', amount: amtYes } : { side: 'no', amount: amtNo };
}

// ------------------------------------------------------------------ k-anonymity

export const K_MIN_DEFAULT = 3;
export type KLevel = 'exposed' | 'weak' | 'private';

export interface KAnonymity {
  count: number;
  kMin: number;
  private: boolean;
  level: KLevel;
  label: string;
}

/**
 * Honest privacy bound: with `count` participants the aggregates approximate individuals when the
 * crowd is tiny. Below `kMin` we are NOT private and say so (the k<3 warning + seeded bad epoch #0).
 */
export function kAnonymity(count: number, kMin = K_MIN_DEFAULT): KAnonymity {
  const level: KLevel = count <= 1 ? 'exposed' : count < kMin ? 'weak' : 'private';
  const isPrivate = count >= kMin;
  const label =
    level === 'exposed'
      ? `k=${count} — aggregates equal individuals; NOT private`
      : level === 'weak'
        ? `k=${count} — below k=${kMin}; weak anonymity`
        : `${count} participants — private (k≥${kMin})`;
  return { count, kMin, private: isPrivate, level, label };
}

// ------------------------------------------------------------------- FPMM odds

/**
 * FPMM outcome prices from the market maker's outcome-token balances. For outcome i the price is
 * proportional to the product of the OTHER balances (the constant-product invariant), normalized to
 * sum to 1. For a binary market this reduces to pYes = balNo/(balYes+balNo).
 */
export function fpmmPrices(balances: bigint[]): number[] {
  if (balances.length < 2) throw new Error('Need at least two outcome balances');
  const weights = balances.map((_, i) =>
    balances.reduce((acc, b, j) => (j === i ? acc : acc * b), 1n),
  );
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n) return balances.map(() => 0);
  // Scale to a float with 6-digit precision without losing the ratio.
  const SCALE = 1_000_000n;
  return weights.map((w) => Number((w * SCALE) / total) / Number(SCALE));
}

export function impliedProbability(balances: bigint[], outcomeIndex: number): number {
  return fpmmPrices(balances)[outcomeIndex] ?? 0;
}

// -------------------------------------------------------- public-scalar payout

/**
 * Payout at a PUBLIC rate: `stakeWin * rateNum / rateDen` (floor). Mirrors the on-chain
 * encrypted-times-public-scalar computation exactly (Nox.mul then Nox.div by trivially-encrypted
 * public constants) — the FHE-division-by-ciphertext trap is avoided because num/den are public.
 */
export function payoutAtRate(stakeWin: bigint, rateNum: bigint, rateDen: bigint): bigint {
  if (rateDen === 0n) return 0n;
  return (stakeWin * rateNum) / rateDen;
}

export interface RateFraction {
  num: bigint;
  den: bigint;
  /** pot/winningPool as a fixed-point string (e.g. "2.48"). */
  multiple: string;
}

export function rateFraction(pot: bigint, winningPool: bigint, decimals = 2): RateFraction {
  if (winningPool === 0n) return { num: pot, den: 0n, multiple: '0.00' };
  const scale = 10n ** BigInt(decimals);
  const scaled = (pot * scale) / winningPool;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(decimals, '0');
  return { num: pot, den: winningPool, multiple: `${whole}.${frac}` };
}

// --------------------------------------------------------------------- slippage

/** Minimum acceptable output given an expected amount and a slippage tolerance in basis points. */
export function minWithSlippage(expected: bigint, bps: number): bigint {
  if (bps < 0 || bps > 10_000) throw new Error('bps out of range');
  return (expected * BigInt(10_000 - bps)) / 10_000n;
}

// ------------------------------------------------------------- condition id (CTF)

/**
 * Compute the CTF conditionId exactly as ConditionalTokens.getConditionId does:
 * keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount)). Pure keccak — useful for the
 * UI/verify without a chain round-trip. (collectionId/positionId need the CTF's EC math on-chain.)
 */
export function computeConditionId(oracle: string, questionId: string, outcomeSlotCount = 2): string {
  return keccak256(solidityPacked(['address', 'bytes32', 'uint256'], [oracle, questionId, outcomeSlotCount]));
}

/** Deterministic questionId from a human market question (demo convenience). */
export function questionIdFromText(question: string): string {
  return keccak256(solidityPacked(['string'], [question]));
}
