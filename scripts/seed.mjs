// Deterministic full-cycle replay on Sepolia: the 4-bettor cast (Alice/Bob/Carol YES herd + Dana the
// secret NO dissenter) → close → execute → finalize (real FPMM buys) → oracle resolves NO → Dana
// claims a sealed payout. Emits fixtures/demo-state.json (handles, aggregate values, tx hashes, rate)
// — the single source of truth for the video/README/verify-epoch.
//
// ⛔ SPENDS GAS (many txs across 5 funded actors). Gated: refuses to run unless CONFIRM_SPEND=yes.
import { ethers } from 'ethers';
import {
  provider, deployer, handleClient, demoActors, readDeployments, writeFixture,
  publicDecryptWithRetry, usd, fmtUsd, etherscanTx,
} from './lib/nox.mjs';
import { NoxOracleClient } from '../packages/confidential-ctf/src/client.js';
import { minWithSlippage } from '../packages/confidential-ctf/src/market.js';

const CONFIRMED = process.env.CONFIRM_SPEND === 'yes';
const COMMIT_WINDOW = 240; // seconds — only the 4 commit txs run inside it (wrap happens before open)

function configFrom(d) {
  const net = {
    chainId: 11155111, name: 'sepolia', rpcUrl: '', gatewayUrl: '', subgraphUrl: '',
    noxProtocol: d.noxProtocol, explorer: 'https://sepolia.etherscan.io',
  };
  return {
    network: net,
    contracts: {
      pool: d.contracts.NoxOraclePool.address,
      confidentialUSD: d.contracts.ConfidentialUSD.address,
      collateral: d.contracts.DemoUSD.address,
      conditionalTokens: d.contracts.ConditionalTokens.address,
      fpmm: d.contracts.FixedProductMarketMaker.address,
    },
    market: d.market,
  };
}

async function pollUntilDeadline(p, pool, epochId) {
  const info = await pool.epochInfo(epochId);
  const deadline = Number(info.commitDeadline);
  for (;;) {
    const blk = await p.getBlock('latest');
    if (blk.timestamp >= deadline) return;
    process.stdout.write(`    (waiting for commit window: ${deadline - blk.timestamp}s left)   \r`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

async function main() {
  const d = readDeployments();
  if (!d.contracts?.NoxOraclePool?.address?.startsWith?.('0x')) throw new Error('Deploy first (npm run deploy).');
  const p = provider();
  const cfg = configFrom(d);

  const bank = deployer(p);
  const actors = demoActors(p);
  const cast = [
    { name: 'Alice', w: actors.alice, side: 'yes', amt: 1000 },
    { name: 'Bob', w: actors.bob, side: 'yes', amt: 500 },
    { name: 'Carol', w: actors.carol, side: 'yes', amt: 200 },
    { name: 'Dana', w: actors.dana, side: 'no', amt: 500 },
  ];

  console.log('Seed cast (deterministic, from a private demo mnemonic):');
  for (const c of cast) console.log(`  ${c.name}  ${c.side.toUpperCase()} ${c.amt}  ${c.w.address}`);

  if (!CONFIRMED) {
    console.log('\n⛔ GATED: set CONFIRM_SPEND=yes to broadcast the full cycle. No transactions sent. Zero gas.');
    console.log('   Sequence: fund+wrap actors → open epoch → 4 commits → close → execute → finalize (FPMM buys)');
    console.log('             → oracle reportPayouts([0,1]) → settle → Dana claim → write demo-state.json');
    return;
  }

  const demo = new ethers.Contract(cfg.contracts.collateral, ['function mint(address,uint256)'], bank);

  // 1. Fund each actor with ETH (gas) + DemoUSD, and WRAP to cUSD — all BEFORE opening the epoch,
  //    so the timed commit window only has to cover the 4 commit txs.
  console.log('\nFunding + wrapping actors…');
  for (const c of cast) {
    await (await bank.sendTransaction({ to: c.w.address, value: ethers.parseEther('0.05') })).wait();
    await (await demo.mint(c.w.address, usd(c.amt))).wait();
    c.client = new NoxOracleClient(c.w, await handleClient(c.w), cfg);
    await c.client.wrap(c.amt);
    console.log(`  ${c.name} funded + wrapped ${c.amt} cUSD`);
  }

  const tx = {};

  // 2. Open the epoch (keeper = bank).
  const keeper = new NoxOracleClient(bank, await handleClient(bank), cfg);
  tx.openEpoch = await keeper.openEpoch(COMMIT_WINDOW);
  const epochId = await keeper.currentEpoch();
  console.log(`Opened epoch #${epochId} (commit window ${COMMIT_WINDOW}s)`);

  // 3. Each actor commits privately (setOperator + dual-handle commit).
  const stakeHandles = [];
  tx.commits = {};
  const until = Math.floor(Date.now() / 1000) + COMMIT_WINDOW + 3600;
  for (const c of cast) {
    tx.commits[c.name] = await c.client.commitBet(c.side, c.amt, { operatorUntil: until });
    console.log(`  ${c.name} committed ${etherscanTx(tx.commits[c.name])}`);
    const [y, n] = await keeper.pool.myStakes(epochId, c.w.address);
    stakeHandles.push(y, n);
  }
  const info = await keeper.pool.epochInfo(epochId);
  const kCount = Number(info.participantCount);

  // 4. Wait out the commit window, then close (k=4 ≥ 3 → reveals aggregates).
  await pollUntilDeadline(p, keeper.pool, epochId);
  tx.closeEpoch = await keeper.closeEpoch(false);
  const agg = await keeper.decryptAggregates(epochId);
  console.log(`\n  aggregates (public): YES ${fmtUsd(agg.sumYes)} / NO ${fmtUsd(agg.sumNo)}  (k=${kCount})`);

  // 5. Execute: burn pooled cUSD; keeper reads the public unwrap id + its decryption proof.
  tx.executeEpoch = await keeper.executeEpoch();
  const unwrapH = await keeper.pool.unwrapId(epochId);
  const unwrapPub = await publicDecryptWithRetry(await handleClient(bank), unwrapH);

  // 6. Finalize: route the plaintext aggregates into the real FPMM with slippage guards.
  const minYes = agg.sumYes > 0n ? minWithSlippage(await keeper.fpmm.calcBuyAmount(agg.sumYes, 0), 500) : 0n;
  const minNo = agg.sumNo > 0n ? minWithSlippage(await keeper.fpmm.calcBuyAmount(agg.sumNo, 1), 500) : 0n;
  tx.finalizeEpoch = await keeper.finalizeEpoch(unwrapPub.decryptionProof, agg.sumYes, agg.sumNo, minYes, minNo);
  const exInfo = await keeper.pool.epochInfo(epochId);
  console.log(`  executed real FPMM buys (YES tokens ${exInfo.boughtYes}, NO tokens ${exInfo.boughtNo})`);

  // 7. Oracle (the disclosed demo EOA = deployer) resolves NO wins.
  const ctf = new ethers.Contract(cfg.contracts.conditionalTokens, ['function reportPayouts(bytes32,uint256[])'], bank);
  const rp = await (await ctf.reportPayouts(cfg.market.questionId, [0, 1])).wait();
  tx.reportPayouts = rp.hash;

  // 8. Settle + Dana claims a sealed payout (encrypted stake × public scalar rate).
  tx.settle = await keeper.settle();
  const pot = BigInt(await keeper.pool.poolRateNum());
  const den = BigInt(await keeper.pool.poolRateDen());
  const dana = cast.find((c) => c.name === 'Dana');
  const balBefore = await danaBalance(dana.client, dana.w.address);
  tx.claim = await dana.client.claim(epochId);
  const balAfter = await danaBalance(dana.client, dana.w.address);
  console.log(`  Dana claimed sealed payout ${etherscanTx(tx.claim)}  (cUSD ${fmtUsd(balBefore)} → ${fmtUsd(balAfter)})`);

  const demoState = {
    epochId: Number(epochId),
    aggregates: { sumYes: agg.sumYes.toString(), sumNo: agg.sumNo.toString() },
    aggregateHandles: agg.handles,
    unwrapId: unwrapH,
    userStakes: cast.map((c) => ({
      address: c.w.address,
      yes: (c.side === 'yes' ? usd(c.amt) : 0n).toString(),
      no: (c.side === 'no' ? usd(c.amt) : 0n).toString(),
    })),
    stakeHandles,
    rate: { num: pot.toString(), den: den.toString() },
    payouts: [pot.toString()],
    winner: 'no',
  };
  writeFixture('demo-state.json', demoState);

  const bal = await p.getBalance(bank.address);
  writeFixture('e2e-result.json', {
    network: 'sepolia',
    pool: cfg.contracts.pool,
    market: cfg.market,
    epochId: Number(epochId),
    kAnonymity: { count: kCount, kMin: 3, private: kCount >= 3 },
    aggregates: { sumYes: agg.sumYes.toString(), sumNo: agg.sumNo.toString() },
    danaClaim: { before: balBefore.toString(), after: balAfter.toString(), pot: pot.toString(), rateDen: den.toString() },
    txHashes: tx,
    deployerBalanceEth: ethers.formatEther(bal),
    completedAt: new Date().toISOString(),
  });
  console.log(`\n✅ demo-state.json + e2e-result.json written. pot=${fmtUsd(pot)} cUSD. Run \`npm run verify-epoch ${epochId}\`.`);
}

async function danaBalance(client, addr) {
  const h = await client.cUSD.confidentialBalanceOf(addr);
  if (h === ethers.ZeroHash) return 0n;
  try {
    return (await client.handle.decrypt(h)).value;
  } catch {
    return 0n;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
