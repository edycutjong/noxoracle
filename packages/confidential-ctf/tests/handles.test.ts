import { describe, it, expect } from 'vitest';
import {
  isHandle, isZeroHandle, handleVersion, handleChainId, handleType, handleAttribute,
  isUniqueHandle, isPublicHandle, describeHandle, SOLIDITY_TYPES,
} from '../src/handles.js';

// Build a handle: [0]=version [1-4]=chainId [5]=type [6]=attrs [7-31]=pre-handle
function build(version: number, chainId: number, typeCode: number, attrs: number, nonce = 0): string {
  const v = version.toString(16).padStart(2, '0');
  const c = chainId.toString(16).padStart(8, '0');
  const t = typeCode.toString(16).padStart(2, '0');
  const a = attrs.toString(16).padStart(2, '0');
  const pre = nonce.toString(16).padStart(50, '0');
  return `0x${v}${c}${t}${a}${pre}`;
}

const UINT256 = SOLIDITY_TYPES.indexOf('uint256'); // 35
const BOOL = SOLIDITY_TYPES.indexOf('bool'); // 0
const SEPOLIA = 11155111;

const uniqueUint = build(1, SEPOLIA, UINT256, 0x01, 7);
const publicUint = build(1, SEPOLIA, UINT256, 0x00, 0);
const boolHandle = build(1, SEPOLIA, BOOL, 0x01, 3);
const ZERO = '0x' + '0'.repeat(64);

describe('isHandle', () => {
  it('accepts 32-byte hex', () => expect(isHandle(uniqueUint)).toBe(true));
  it('rejects short', () => expect(isHandle('0x1234')).toBe(false));
  it('rejects non-hex', () => expect(isHandle('hello')).toBe(false));
});

describe('isZeroHandle', () => {
  it('true for all-zero', () => expect(isZeroHandle(ZERO)).toBe(true));
  it('false for real handle', () => expect(isZeroHandle(uniqueUint)).toBe(false));
});

describe('decoding', () => {
  it('version', () => expect(handleVersion(uniqueUint)).toBe(1));
  it('chainId = Sepolia', () => expect(handleChainId(uniqueUint)).toBe(SEPOLIA));
  it('type uint256', () => expect(handleType(uniqueUint)).toBe('uint256'));
  it('type bool', () => expect(handleType(boolHandle)).toBe('bool'));
  it('attribute', () => expect(handleAttribute(uniqueUint)).toBe(1));
});

describe('public vs unique (ACL short-circuit predicate)', () => {
  it('attr bit 1 => unique, not public', () => {
    expect(isUniqueHandle(uniqueUint)).toBe(true);
    expect(isPublicHandle(uniqueUint)).toBe(false);
  });
  it('attr bit 0 => public, not unique', () => {
    expect(isUniqueHandle(publicUint)).toBe(false);
    expect(isPublicHandle(publicUint)).toBe(true);
  });
  it('unique and public are exclusive', () => {
    for (const h of [uniqueUint, publicUint, boolHandle]) {
      expect(isUniqueHandle(h)).toBe(!isPublicHandle(h));
    }
  });
});

describe('describeHandle', () => {
  it('full description of a unique uint256', () => {
    expect(describeHandle(uniqueUint)).toEqual({
      version: 1, chainId: SEPOLIA, type: 'uint256', attribute: 1, unique: true, public: false,
    });
  });
  it('public bool', () => {
    const d = describeHandle(build(1, SEPOLIA, BOOL, 0x00));
    expect(d.type).toBe('bool');
    expect(d.public).toBe(true);
  });
});

describe('error paths', () => {
  it('handleType rejects bad hex', () => expect(() => handleType('0xzz')).toThrow());
  it('handleVersion rejects short', () => expect(() => handleVersion('0x00')).toThrow(/Invalid handle/));
});
