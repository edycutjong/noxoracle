import { describe, it, expect } from 'vitest';
import {
  dualHandle, readDualHandle, kAnonymity, K_MIN_DEFAULT, fpmmPrices, impliedProbability,
  payoutAtRate, rateFraction, minWithSlippage, computeConditionId, questionIdFromText,
  YES_INDEX, NO_INDEX, YES_INDEX_SET, NO_INDEX_SET,
} from '../src/market.js';

describe('index conventions', () => {
  it('binary market indices + index sets', () => {
    expect([YES_INDEX, NO_INDEX]).toEqual([0, 1]);
    expect([YES_INDEX_SET, NO_INDEX_SET]).toEqual([1, 2]);
  });
});

describe('dualHandle — direction hiding', () => {
  it('YES => (amount, 0)', () => expect(dualHandle('yes', 500n)).toEqual({ amtYes: 500n, amtNo: 0n }));
  it('NO => (0, amount)', () => expect(dualHandle('no', 500n)).toEqual({ amtYes: 0n, amtNo: 500n }));
  it('the two sides are identically shaped (both fields always present)', () => {
    const y = dualHandle('yes', 300n);
    const n = dualHandle('no', 300n);
    expect(Object.keys(y).sort()).toEqual(Object.keys(n).sort());
  });
  it('rejects zero', () => expect(() => dualHandle('yes', 0n)).toThrow(/positive/));
  it('rejects negative', () => expect(() => dualHandle('no', -5n)).toThrow(/positive/));
  it('rejects bad side', () => expect(() => dualHandle('maybe' as any, 5n)).toThrow(/Invalid side/));
});

describe('readDualHandle — only the owner reconstructs side+size', () => {
  it('reads YES', () => expect(readDualHandle(500n, 0n)).toEqual({ side: 'yes', amount: 500n }));
  it('reads NO', () => expect(readDualHandle(0n, 500n)).toEqual({ side: 'no', amount: 500n }));
  it('no position => null', () => expect(readDualHandle(0n, 0n)).toBeNull());
  it('hedged => net direction', () => expect(readDualHandle(300n, 700n)).toEqual({ side: 'no', amount: 700n }));
  it('round-trips a committed YES bet', () => {
    const { amtYes, amtNo } = dualHandle('yes', 1000n);
    expect(readDualHandle(amtYes, amtNo)).toEqual({ side: 'yes', amount: 1000n });
  });
});

describe('kAnonymity meter', () => {
  it('default k is 3', () => expect(K_MIN_DEFAULT).toBe(3));
  it('k=1 is exposed (aggregates == individuals)', () => {
    const k = kAnonymity(1);
    expect(k.level).toBe('exposed');
    expect(k.private).toBe(false);
    expect(k.label).toMatch(/NOT private/i);
  });
  it('k=2 is weak', () => {
    const k = kAnonymity(2);
    expect(k.level).toBe('weak');
    expect(k.private).toBe(false);
  });
  it('k=3 is private', () => {
    const k = kAnonymity(3);
    expect(k.level).toBe('private');
    expect(k.private).toBe(true);
  });
  it('k=4 (the seed cast) is private', () => expect(kAnonymity(4).private).toBe(true));
  it('respects a custom kMin', () => expect(kAnonymity(4, 5).private).toBe(false));
  it('k=0 is exposed', () => expect(kAnonymity(0).level).toBe('exposed'));
});

describe('fpmmPrices — odds from AMM balances', () => {
  it('equal reserves => 50/50', () => expect(fpmmPrices([1000n, 1000n])).toEqual([0.5, 0.5]));
  it('scarcer YES reserve => higher YES price (0.63/0.37)', () => {
    const [pYes, pNo] = fpmmPrices([370n, 630n]);
    expect(pYes).toBeCloseTo(0.63, 2);
    expect(pNo).toBeCloseTo(0.37, 2);
  });
  it('prices sum to ~1', () => {
    const p = fpmmPrices([250n, 750n]);
    expect(p[0] + p[1]).toBeCloseTo(1, 5);
  });
  it('impliedProbability picks an outcome', () => {
    expect(impliedProbability([370n, 630n], YES_INDEX)).toBeCloseTo(0.63, 2);
  });
  it('rejects <2 outcomes', () => expect(() => fpmmPrices([1n])).toThrow(/two/));
});

describe('payoutAtRate — encrypted × public scalar (mirrors on-chain)', () => {
  it('NO wins: 500 stake at 1240/500 = 1240', () => {
    expect(payoutAtRate(500n, 1240n, 500n)).toBe(1240n);
  });
  it('proportional split among winners', () => {
    // pot 1200 over winning pool 600: a 200 stake gets 400.
    expect(payoutAtRate(200n, 1200n, 600n)).toBe(400n);
  });
  it('floors like integer division', () => expect(payoutAtRate(3n, 10n, 7n)).toBe(4n));
  it('den 0 => 0 (no winners guard)', () => expect(payoutAtRate(500n, 1240n, 0n)).toBe(0n));
  it('sum of payouts never exceeds pot (conservation)', () => {
    const pot = 1240n, pool = 1700n;
    const stakes = [1000n, 500n, 200n];
    const paid = stakes.reduce((a, s) => a + payoutAtRate(s, pot, pool), 0n);
    expect(paid).toBeLessThanOrEqual(pot);
  });
});

describe('rateFraction', () => {
  it('2.48x for pot 1240 / pool 500', () => {
    const r = rateFraction(1240n, 500n);
    expect(r.multiple).toBe('2.48');
    expect(r.num).toBe(1240n);
    expect(r.den).toBe(500n);
  });
  it('1.00x break-even', () => expect(rateFraction(500n, 500n).multiple).toBe('1.00'));
  it('den 0 => 0.00', () => expect(rateFraction(100n, 0n).multiple).toBe('0.00'));
});

describe('minWithSlippage — FPMM guard', () => {
  it('2% slippage', () => expect(minWithSlippage(1000n, 200)).toBe(980n));
  it('0% => unchanged', () => expect(minWithSlippage(1000n, 0)).toBe(1000n));
  it('rejects out-of-range bps', () => expect(() => minWithSlippage(1n, 10001)).toThrow(/range/));
});

describe('computeConditionId / questionIdFromText', () => {
  const oracle = '0x000000000000000000000000000000000000dEaD';
  it('conditionId is 32-byte hex', () => {
    const id = computeConditionId(oracle, questionIdFromText('Will ETH close above $5,000 on Aug 15, 2026?'));
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    const q = questionIdFromText('same question');
    expect(computeConditionId(oracle, q)).toBe(computeConditionId(oracle, q));
  });
  it('different questions => different conditionIds', () => {
    expect(computeConditionId(oracle, questionIdFromText('A'))).not.toBe(
      computeConditionId(oracle, questionIdFromText('B')),
    );
  });
});
