// Deploy NoxOracle's OWN contracts + the deployment-of-record CTF/FPMM on Sepolia.
// REUSES the already-live DemoUSD + cUSD (does NOT redeploy them).
//
// ⛔ SPENDS GAS. Gated: refuses to run unless CONFIRM_SPEND=yes. Without it, prints the plan and the
//    gas estimate, then exits 0 (zero transactions). This is the "ready to deploy" state.
import { ethers } from 'ethers';
import {
  provider, deployer, artifact, gnosisArtifact, deployFromArtifact, artifactHash, onchainCodeHash,
  writeDeployments, readDeployments, REUSED, NOX_PROTOCOL, etherscanAddr, usd, writeFixture,
} from './lib/nox.mjs';

const CONFIRMED = process.env.CONFIRM_SPEND === 'yes';
const QUESTION = 'Will ETH close above $5,000 on Aug 15, 2026?';
const FEE = 20000000000000000n; // 2% in 1e18 units
const FUND = usd(2000); // 2,000 DemoUSD seed liquidity, 50/50

async function main() {
  const p = provider();
  const wallet = deployer(p);
  const bal = await p.getBalance(wallet.address);
  console.log(`Deployer ${wallet.address}  balance ${ethers.formatEther(bal)} ETH`);
  console.log(`Reusing DemoUSD ${REUSED.demoUSD}`);
  console.log(`Reusing cUSD    ${REUSED.confidentialUSD}`);

  const CTF = gnosisArtifact('@gnosis.pm/conditional-tokens-contracts', 'ConditionalTokens');
  const FAC = gnosisArtifact('@gnosis.pm/conditional-tokens-market-makers', 'FixedProductMarketMakerFactory');
  const FPMM = gnosisArtifact('@gnosis.pm/conditional-tokens-market-makers', 'FixedProductMarketMaker');
  const POOL = artifact('NoxOraclePool');

  const questionId = ethers.keccak256(ethers.toUtf8Bytes(QUESTION));
  const oracle = wallet.address; // disclosed centralized demo oracle (reality.eth = production path)

  console.log('\nPlan (deployment-of-record; unmodified Gnosis artifacts):');
  console.log('  1. ConditionalTokens 1.0.3   (~2.5M gas)');
  console.log('  2. FPMMFactory 1.8.1         (~3.3M gas, incl. implementation master)');
  console.log('  3. prepareCondition(oracle, questionId, 2)   (~0.1M gas)');
  console.log('  4. createFixedProductMarketMaker(...)  (~0.5M gas, EIP-1167 clone)');
  console.log('  5. mint+approve+addFunding 2,000 dUSD  (~0.3M gas)');
  console.log('  6. NoxOraclePool(cUSD, ctf, fpmm, questionId, oracle)  (~2.2M gas)');
  console.log('  → est. ~9M gas total (~0.02 ETH @ 2 gwei)');

  if (!CONFIRMED) {
    console.log('\n⛔ GATED: set CONFIRM_SPEND=yes to broadcast. No transactions sent. Zero gas spent.');
    return;
  }

  console.log('\nBroadcasting…');
  const ctf = await deployFromArtifact(CTF, wallet);
  console.log(`  CTF  ${await ctf.getAddress()}`);
  const factory = await deployFromArtifact(FAC, wallet);
  console.log(`  FPMMFactory ${await factory.getAddress()}`);

  await (await ctf.prepareCondition(oracle, questionId, 2)).wait();
  const conditionId = await ctf.getConditionId(oracle, questionId, 2);
  console.log(`  conditionId ${conditionId}`);

  const rc = await (
    await factory.createFixedProductMarketMaker(await ctf.getAddress(), REUSED.demoUSD, [conditionId], FEE)
  ).wait();
  let fpmmAddr;
  for (const log of rc.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === 'FixedProductMarketMakerCreation') fpmmAddr = parsed.args.fixedProductMarketMaker;
    } catch {}
  }
  console.log(`  FPMM ${fpmmAddr}`);

  const demo = new ethers.Contract(
    REUSED.demoUSD,
    ['function mint(address,uint256)', 'function approve(address,uint256) returns (bool)'],
    wallet,
  );
  await (await demo.mint(wallet.address, FUND)).wait();
  await (await demo.approve(fpmmAddr, FUND)).wait();
  const fpmm = new ethers.Contract(fpmmAddr, ['function addFunding(uint256,uint256[])'], wallet);
  await (await fpmm.addFunding(FUND, [])).wait();
  console.log('  FPMM funded 2,000 dUSD 50/50');

  const pool = await deployFromArtifact(POOL, wallet, [
    REUSED.confidentialUSD, await ctf.getAddress(), fpmmAddr, questionId, oracle,
  ]);
  console.log(`  NoxOraclePool ${await pool.getAddress()}`);

  // Protocol-purity hash-check (I5).
  const ctfMatch = (await onchainCodeHash(p, await ctf.getAddress())) === artifactHash(CTF);
  const master = await factory.implementationMaster();
  const fpmmMatch = (await onchainCodeHash(p, master)) === artifactHash(FPMM);
  console.log(`  hash-check: CTF ${ctfMatch ? 'MATCH' : 'MISMATCH'}, FPMM master ${fpmmMatch ? 'MATCH' : 'MISMATCH'}`);

  const d = readDeployments();
  d.contracts = {
    ...d.contracts,
    DemoUSD: { address: REUSED.demoUSD, reused: true },
    ConfidentialUSD: { address: REUSED.confidentialUSD, reused: true },
    ConditionalTokens: { address: await ctf.getAddress(), version: '1.0.3', hashMatch: ctfMatch },
    FixedProductMarketMakerFactory: { address: await factory.getAddress(), version: '1.8.1' },
    FixedProductMarketMaker: { address: fpmmAddr, version: '1.8.1', implementationHashMatch: fpmmMatch },
    NoxOraclePool: { address: await pool.getAddress() },
  };
  d.market = { question: QUESTION, questionId, conditionId, oracle, outcomeSlotCount: 2 };
  d.noxProtocol = NOX_PROTOCOL;
  d.deployer = wallet.address;
  d.deployedAt = new Date().toISOString();
  writeDeployments(d);
  writeFixture('market.json', d.market);
  console.log('\n✅ deployments.json written.');
  console.log(`   pool: ${etherscanAddr(await pool.getAddress())}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
