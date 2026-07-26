// verify-epoch — the judge's tool. READ-ONLY (publicDecrypt via the gateway is free; no gas).
// Recomputes invariants I1–I5 for an epoch from CHAIN DATA ALONE: reads the pool events, publicly
// decrypts the two aggregates + the unwrap id, pulls the seed cast's stakes from demo-state.json,
// reads the FPMM spend from the EpochExecuted event, and re-runs the pure `verifyEpoch`.
//
//   node scripts/verify_epoch.mjs <epochId>
import { ethers } from 'ethers';
import { provider, handleClient, publicDecryptWithRetry, readDeployments, readFixture, gnosisArtifact, artifactHash, onchainCodeHash } from './lib/nox.mjs';
import { NOX_ORACLE_POOL_ABI } from '../packages/confidential-ctf/src/abis.js';
import { verifyEpoch, formatVerifyReport } from '../packages/confidential-ctf/src/verify.js';

async function main() {
  const epochId = Number(process.argv[2] || '1');
  const d = readDeployments();
  const poolAddr = d.contracts?.NoxOraclePool?.address;
  if (!poolAddr || !poolAddr.startsWith('0x')) {
    console.log('No deployment yet (NoxOraclePool address is PENDING). Run `npm run deploy` then `npm run seed`, then re-run verify-epoch.');
    return;
  }
  const p = provider();
  const pool = new ethers.Contract(poolAddr, NOX_ORACLE_POOL_ABI, p);
  const hc = await handleClient(p);

  const [sumYesH, sumNoH] = await pool.sumHandles(epochId);
  const unwrapH = await pool.unwrapId(epochId);
  const sumYes = (await publicDecryptWithRetry(hc, sumYesH)).value;
  const sumNo = (await publicDecryptWithRetry(hc, sumNoH)).value;

  // Bound the log query to a small, non-archive window: anchor on the closeEpoch tx block if we have
  // it (from the seed's e2e-result.json), else fall back to a modest recent lookback.
  const latest = await p.getBlockNumber();
  let FROM = Math.max(0, latest - 800);
  const e2e = readFixture('e2e-result.json');
  const refHash = e2e?.txHashes?.closeEpoch || e2e?.txHashes?.openEpoch;
  if (refHash) {
    const rc = await p.getTransactionReceipt(refHash);
    if (rc) FROM = Math.max(0, rc.blockNumber - 2);
  }

  // FPMM spend + bought tokens from the on-chain EpochExecuted event.
  const exec = (await pool.queryFilter(pool.filters.EpochExecuted(epochId), FROM, 'latest')).at(-1);
  const spentYes = exec ? BigInt(exec.args.plainYes) : 0n;
  const spentNo = exec ? BigInt(exec.args.plainNo) : 0n;

  const state = readFixture('demo-state.json') || {};
  const userStakes = state.userStakes || [];
  const stakeHandles = state.stakeHandles || [];
  const publiclyDecryptedHandles = (await pool.queryFilter(pool.filters.AggregatesRevealed(epochId), FROM, 'latest'))
    .flatMap((e) => [e.args.sumYes, e.args.sumNo])
    .concat(unwrapH && unwrapH !== ethers.ZeroHash ? [unwrapH] : []);

  // I5 inputs.
  const CTF = gnosisArtifact('@gnosis.pm/conditional-tokens-contracts', 'ConditionalTokens');
  const FPMM = gnosisArtifact('@gnosis.pm/conditional-tokens-market-makers', 'FixedProductMarketMaker');
  const ctfAddr = d.contracts?.ConditionalTokens?.address;
  const facAddr = d.contracts?.FixedProductMarketMakerFactory?.address;
  let ctfMatch = false, fpmmMatch = false;
  if (ctfAddr) ctfMatch = (await onchainCodeHash(p, ctfAddr)) === artifactHash(CTF);
  if (facAddr) {
    const factory = new ethers.Contract(facAddr, ['function implementationMaster() view returns (address)'], p);
    fpmmMatch = (await onchainCodeHash(p, await factory.implementationMaster())) === artifactHash(FPMM);
  }

  const settled = await pool.marketSettled();
  const settlement = settled
    ? {
        pot: BigInt(await pool.poolRateNum()),
        winner: Number(await pool.winner()) === 0 ? 'yes' : 'no',
        winningPool: BigInt(await pool.poolRateDen()),
        payouts: state.payouts?.map(BigInt) || [],
      }
    : undefined;

  const result = verifyEpoch({
    epochId,
    aggregates: { sumYes, sumNo },
    userStakes: userStakes.map((s) => ({ address: s.address, yes: BigInt(s.yes), no: BigInt(s.no) })),
    publiclyDecryptedHandles,
    aggregateHandles: { sumYes: sumYesH, sumNo: sumNoH, unwrapId: unwrapH },
    stakeHandles,
    routing: { spentYes, spentNo, unwrapped: sumYes + sumNo },
    settlement,
    artifacts: { ctfMatch, fpmmMatch },
  });

  console.log(formatVerifyReport(result));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
