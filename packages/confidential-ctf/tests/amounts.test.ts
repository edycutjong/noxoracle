import { describe, it, expect } from 'vitest';
import { toBaseUnits, fromBaseUnits, formatDisplay, formatWhole, CUSD_DECIMALS } from '../src/amounts.js';

describe('CUSD_DECIMALS', () => {
  it('is 6 (mirrors USDC)', () => expect(CUSD_DECIMALS).toBe(6));
});

describe('toBaseUnits', () => {
  it('whole number', () => expect(toBaseUnits('500')).toBe(500_000_000n));
  it('numeric input', () => expect(toBaseUnits(1850)).toBe(1_850_000_000n));
  it('strips thousands separators', () => expect(toBaseUnits('1,700')).toBe(1_700_000_000n));
  it('handles decimals', () => expect(toBaseUnits('1.5')).toBe(1_500_000n));
  it('max 6 decimals exact', () => expect(toBaseUnits('0.000001')).toBe(1n));
  it('zero', () => expect(toBaseUnits('0')).toBe(0n));
  it('rejects too many decimals', () => expect(() => toBaseUnits('1.1234567')).toThrow(/decimals/i));
  it('rejects garbage', () => expect(() => toBaseUnits('abc')).toThrow(/Invalid amount/));
  it('rejects lone dot', () => expect(() => toBaseUnits('.')).toThrow(/Invalid amount/));
  it('rejects empty', () => expect(() => toBaseUnits('')).toThrow(/Invalid amount/));
});

describe('fromBaseUnits', () => {
  it('round-trips whole', () => expect(fromBaseUnits(500_000_000n)).toBe('500.000000'));
  it('round-trips fractional', () => expect(fromBaseUnits(1_500_000n)).toBe('1.500000'));
  it('zero', () => expect(fromBaseUnits(0n)).toBe('0.000000'));
  it('negative', () => expect(fromBaseUnits(-1_000_000n)).toBe('-1.000000'));
});

describe('formatDisplay', () => {
  it('adds separators + symbol', () => expect(formatDisplay(1_700_000_000n)).toBe('1,700.000000 cUSD'));
  it('custom symbol', () => expect(formatDisplay(500_000_000n, 'USDC')).toBe('500.000000 USDC'));
});

describe('formatWhole', () => {
  it('whole-token count with separators', () => expect(formatWhole(1_700_000_000n)).toBe('1,700'));
  it('floors fractional', () => expect(formatWhole(1_234_567_890n)).toBe('1,234'));
  it('zero', () => expect(formatWhole(0n)).toBe('0'));
});

describe('round-trip property', () => {
  for (const v of ['0', '1', '500', '1700.5', '0.123456', '999999']) {
    it(`toBaseUnits∘fromBaseUnits preserves ${v}`, () => {
      expect(fromBaseUnits(toBaseUnits(v))).toBe(Number(v).toFixed(6));
    });
  }
});
