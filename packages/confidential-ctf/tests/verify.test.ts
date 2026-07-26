import { describe, it, expect } from 'vitest';
import { verifyEpoch, formatVerifyReport, type EpochVerificationInput } from '../src/verify.js';

const H = (n: string) => '0x' + n.repeat(64).slice(0, 64);
const SUM_YES = H('a');
const SUM_NO = H('b');
const UNWRAP = H('c');
const STAKE_1 = H('1');
const STAKE_2 = H('2');

// The seed cast: Alice/Bob/Carol bet YES 1000/500/200, Dana bets NO 500. NO wins; pot 1240.
function base(): EpochVerificationInput {
  return {
    epochId: 1,
    aggregates: { sumYes: 1700n, sumNo: 500n },
    userStakes: [
      { address: '0xA', yes: 1000n, no: 0n },
      { address: '0xB', yes: 500n, no: 0n },
      { address: '0xC', yes: 200n, no: 0n },
      { address: '0xD', yes: 0n, no: 500n },
    ],
    publiclyDecryptedHandles: [SUM_YES, SUM_NO, UNWRAP],
    aggregateHandles: { sumYes: SUM_YES, sumNo: SUM_NO, unwrapId: UNWRAP },
    stakeHandles: [STAKE_1, STAKE_2],
    routing: { spentYes: 1700n, spentNo: 500n, unwrapped: 2200n },
    settlement: { pot: 1240n, winner: 'no', winningPool: 500n, payouts: [1240n] },
    artifacts: { ctfMatch: true, fpmmMatch: true },
  };
}

describe('verifyEpoch — all invariants green on the honest seed', () => {
  it('overall ok', () => expect(verifyEpoch(base()).ok).toBe(true));
  it('produces I1..I5', () => {
    const ids = verifyEpoch(base()).checks.map((c) => c.id);
    expect(ids).toEqual(['I1', 'I2', 'I3', 'I4', 'I5']);
  });
  it('every check passes', () => {
    for (const c of verifyEpoch(base()).checks) expect(c.pass).toBe(true);
  });
});

describe('I1 — conservation', () => {
  it('fails if a user stake is tampered', () => {
    const i = base();
    i.userStakes[0].yes = 999n; // Σ YES no longer 1700
    const r = verifyEpoch(i);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'I1')!.pass).toBe(false);
  });
  it('fails if NO aggregate is wrong', () => {
    const i = base();
    i.aggregates.sumNo = 400n;
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I1')!.pass).toBe(false);
  });
});

describe('I2 — aggregation-only disclosure', () => {
  it('fails if a stake handle is publicly decrypted', () => {
    const i = base();
    i.publiclyDecryptedHandles.push(STAKE_1);
    const r = verifyEpoch(i);
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'I2')!.pass).toBe(false);
  });
  it('fails on a stray (non-aggregate) public reveal', () => {
    const i = base();
    i.publiclyDecryptedHandles.push(H('e'));
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I2')!.pass).toBe(false);
  });
  it('passes when only the two aggregates are revealed (no unwrap yet)', () => {
    const i = base();
    i.publiclyDecryptedHandles = [SUM_YES, SUM_NO];
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I2')!.pass).toBe(true);
  });
  it('is case-insensitive on handles', () => {
    const i = base();
    i.publiclyDecryptedHandles = [SUM_YES.toUpperCase().replace('0X', '0x'), SUM_NO];
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I2')!.pass).toBe(true);
  });
});

describe('I3 — faithful routing', () => {
  it('fails if FPMM YES spend != aggregate', () => {
    const i = base();
    i.routing.spentYes = 1699n;
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I3')!.pass).toBe(false);
  });
  it('fails if unwrapped != sum of aggregates', () => {
    const i = base();
    i.routing.unwrapped = 2201n;
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I3')!.pass).toBe(false);
  });
});

describe('I4 — claims bounded', () => {
  it('fails if payouts exceed the pot', () => {
    const i = base();
    i.settlement!.payouts = [1300n];
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I4')!.pass).toBe(false);
  });
  it('passes at exactly the pot', () => {
    expect(verifyEpoch(base()).checks.find((c) => c.id === 'I4')!.pass).toBe(true);
  });
  it('omitted when no settlement data', () => {
    const i = base();
    delete i.settlement;
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I4')).toBeUndefined();
  });
});

describe('I5 — protocol purity', () => {
  it('fails if CTF bytecode mismatches', () => {
    const i = base();
    i.artifacts = { ctfMatch: false, fpmmMatch: true };
    expect(verifyEpoch(i).checks.find((c) => c.id === 'I5')!.pass).toBe(false);
  });
  it('omitted when no artifact data', () => {
    const i = base();
    delete i.artifacts;
    const r = verifyEpoch(i);
    expect(r.checks.find((c) => c.id === 'I5')).toBeUndefined();
    expect(r.checks.length).toBe(4);
  });
});

describe('formatVerifyReport', () => {
  it('renders a green terminal block', () => {
    const text = formatVerifyReport(verifyEpoch(base()));
    expect(text).toMatch(/verify-epoch #1/);
    expect(text).toMatch(/ALL INVARIANTS GREEN/);
    expect(text).toMatch(/I1/);
  });
  it('flags a violation', () => {
    const i = base();
    i.userStakes[0].yes = 1n;
    expect(formatVerifyReport(verifyEpoch(i))).toMatch(/INVARIANT VIOLATION/);
  });
});
