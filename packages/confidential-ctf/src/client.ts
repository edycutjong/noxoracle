// NoxOracleClient — the "add a confidential participation layer to any Gnosis CTF market" surface
// over @iexec-nox/handle + ethers. Framework-agnostic (Node/CLI/scripts). The React app uses the
// same pure helpers (market/verify/amounts) over viem hooks.
import { Contract, ZeroHash, type Signer } from 'ethers';
import {
  NOX_ORACLE_POOL_ABI,
  CONFIDENTIAL_USD_ABI,
  CONDITIONAL_TOKENS_ABI,
  FPMM_ABI,
  DEMO_USD_ABI,
  NOX_PROTOCOL_ABI,
} from './abis.js';
import type { NoxOracleConfig } from './config.js';
import { toBaseUnits } from './amounts.js';
import { dualHandle, readDualHandle, type Side } from './market.js';

const RETRYABLE =
  /not yet computed|not a viewer|access denied|not authorized|does not exist|rpc error|status: 40[34]|fetch failed|network request failed/i;

export async function withRetry<T>(fn: () => Promise<T>, attempts = 18, delayMs = 4000): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test((e as Error)?.message || '')) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export interface HandleClientLike {
  encryptInput(
    value: bigint,
    solidityType: string,
    applicationContract: string,
  ): Promise<{ handle: string; handleProof: string }>;
  decrypt(handle: string): Promise<{ value: bigint; solidityType: string }>;
  publicDecrypt(handle: string): Promise<{ value: bigint; solidityType: string; decryptionProof: string }>;
  viewACL(handle: string): Promise<unknown>;
}

export interface Position {
  yes: bigint;
  no: bigint;
  read: { side: Side; amount: bigint } | null;
}

export class NoxOracleClient {
  readonly signer: Signer;
  readonly handle: HandleClientLike;
  readonly config: NoxOracleConfig;
  readonly pool: Contract;
  readonly cUSD: Contract;
  readonly collateral: Contract;
  readonly ctf: Contract;
  readonly fpmm: Contract;
  readonly nox: Contract;

  constructor(signer: Signer, handle: HandleClientLike, config: NoxOracleConfig) {
    this.signer = signer;
    this.handle = handle;
    this.config = config;
    const c = config.contracts;
    this.pool = new Contract(c.pool, NOX_ORACLE_POOL_ABI as unknown as string[], signer);
    this.cUSD = new Contract(c.confidentialUSD, CONFIDENTIAL_USD_ABI as unknown as string[], signer);
    this.collateral = new Contract(c.collateral, DEMO_USD_ABI as unknown as string[], signer);
    this.ctf = new Contract(c.conditionalTokens, CONDITIONAL_TOKENS_ABI as unknown as string[], signer);
    this.fpmm = new Contract(c.fpmm, FPMM_ABI as unknown as string[], signer);
    this.nox = new Contract(config.network.noxProtocol, NOX_PROTOCOL_ABI as unknown as string[], signer);
  }

  get address(): Promise<string> {
    return this.signer.getAddress();
  }

  /** Wrap `amount` of the underlying ERC-20 into cUSD (approve + wrap). */
  async wrap(amount: string | number): Promise<string> {
    const to = await this.address;
    const units = toBaseUnits(amount);
    await (await this.collateral.approve(this.config.contracts.confidentialUSD, units)).wait();
    const tx = await this.cUSD.wrap(to, units);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Commit a private bet. Builds the direction-hiding pair client-side, encrypts BOTH amounts bound
   * to the pool (2× concurrent), grants the pool a time-bound operator, and commits. Calldata carries
   * only two 32-byte handles — direction never appears in plaintext.
   */
  async commitBet(
    side: Side,
    amount: string | number,
    opts: { operatorUntil?: number } = {},
  ): Promise<string> {
    const poolAddr = this.config.contracts.pool;
    const { amtYes, amtNo } = dualHandle(side, toBaseUnits(amount));
    const [yes, no] = await Promise.all([
      this.handle.encryptInput(amtYes, 'uint256', poolAddr),
      this.handle.encryptInput(amtNo, 'uint256', poolAddr),
    ]);
    const until = opts.operatorUntil ?? Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    await (await this.cUSD.setOperator(poolAddr, until)).wait();
    const tx = await this.pool.commitBet(yes.handle, yes.handleProof, no.handle, no.handleProof);
    await tx.wait();
    return tx.hash;
  }

  /** Decrypt the caller's own position for an epoch (viewer-gated — nobody else can). */
  async myPosition(epochId: number, who?: string): Promise<Position> {
    const addr = who ?? (await this.address);
    const [hYes, hNo] = await this.pool.myStakes(epochId, addr);
    const yes = hYes === ZeroHash ? 0n : (await withRetry(() => this.handle.decrypt(hYes))).value;
    const no = hNo === ZeroHash ? 0n : (await withRetry(() => this.handle.decrypt(hNo))).value;
    return { yes, no, read: readDualHandle(yes, no) };
  }

  /** Publicly decrypt an epoch's two aggregates (available after closeEpoch). */
  async decryptAggregates(epochId: number): Promise<{ sumYes: bigint; sumNo: bigint; handles: { sumYes: string; sumNo: string } }> {
    const [hYes, hNo] = await this.pool.sumHandles(epochId);
    const sumYes = hYes === ZeroHash ? 0n : (await withRetry(() => this.handle.publicDecrypt(hYes))).value;
    const sumNo = hNo === ZeroHash ? 0n : (await withRetry(() => this.handle.publicDecrypt(hNo))).value;
    return { sumYes, sumNo, handles: { sumYes: hYes, sumNo: hNo } };
  }

  async openEpoch(commitWindowSeconds: number): Promise<string> {
    const tx = await this.pool.openEpoch(commitWindowSeconds);
    await tx.wait();
    return tx.hash;
  }
  async closeEpoch(force = false): Promise<string> {
    const tx = await this.pool.closeEpoch(force);
    await tx.wait();
    return tx.hash;
  }
  async executeEpoch(): Promise<string> {
    const tx = await this.pool.executeEpoch();
    await tx.wait();
    return tx.hash;
  }
  async finalizeEpoch(unwrapProof: string, plainYes: bigint, plainNo: bigint, minYes: bigint, minNo: bigint): Promise<string> {
    const tx = await this.pool.finalizeEpoch(unwrapProof, plainYes, plainNo, minYes, minNo);
    await tx.wait();
    return tx.hash;
  }
  async settle(): Promise<string> {
    const tx = await this.pool.settle();
    await tx.wait();
    return tx.hash;
  }
  async claim(epochId: number): Promise<string> {
    const tx = await this.pool.claim(epochId);
    await tx.wait();
    return tx.hash;
  }
  async refundEpoch(epochId: number): Promise<string> {
    const tx = await this.pool.refundEpoch(epochId);
    await tx.wait();
    return tx.hash;
  }

  async currentEpoch(): Promise<number> {
    return Number(await this.pool.currentEpoch());
  }
  async epochInfo(epochId: number) {
    const [state, commitDeadline, participantCount, plainYes, plainNo, boughtYes, boughtNo] =
      await this.pool.epochInfo(epochId);
    return {
      state: Number(state),
      commitDeadline: Number(commitDeadline),
      participantCount: Number(participantCount),
      plainYes: BigInt(plainYes),
      plainNo: BigInt(plainNo),
      boughtYes: BigInt(boughtYes),
      boughtNo: BigInt(boughtNo),
    };
  }

  /** Admin-minimality proof: over the user's own stake handle, expect isAllowed==false && isViewer==true. */
  async adminMinimality(epochId: number, who?: string): Promise<{ isAllowed: boolean; isViewer: boolean; viewerOnly: boolean }> {
    const addr = who ?? (await this.address);
    const [hYes] = await this.pool.myStakes(epochId, addr);
    if (hYes === ZeroHash) return { isAllowed: false, isViewer: false, viewerOnly: false };
    const [isAllowed, isViewer] = await Promise.all([this.nox.isAllowed(hYes, addr), this.nox.isViewer(hYes, addr)]);
    return { isAllowed, isViewer, viewerOnly: !isAllowed && isViewer };
  }
}
