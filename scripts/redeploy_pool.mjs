// Redeploy ONLY NoxOraclePool, reusing the already-live + funded CTF/FPMM/condition (the pool bug
// fix doesn't touch the market). ⛔ SPENDS GAS. Gated: refuses to run unless CONFIRM_SPEND=yes.
import { ethers } from 'ethers';
import { provider, deployer, artifact, deployFromArtifact, readDeployments, writeDeployments, REUSED, etherscanAddr } from './lib/nox.mjs';

const CONFIRMED = process.env.CONFIRM_SPEND === 'yes';

async function main() {
  const d = readDeployments();
  const ctf = d.contracts?.ConditionalTokens?.address;
  const fpmm = d.contracts?.FixedProductMarketMaker?.address;
  const { questionId, oracle } = d.market || {};
  if (!ctf?.startsWith('0x') || !fpmm?.startsWith('0x') || !questionId) {
    throw new Error('Need existing CTF/FPMM/market in deployments.json (run deploy first).');
  }
  const p = provider();
  const wallet = deployer(p);
  console.log(`Redeploying NoxOraclePool only. Reusing:`);
  console.log(`  cUSD ${REUSED.confidentialUSD}\n  CTF  ${ctf}\n  FPMM ${fpmm}\n  oracle ${oracle}`);
  console.log(`  balance ${ethers.formatEther(await p.getBalance(wallet.address))} ETH`);

  if (!CONFIRMED) {
    console.log('\n⛔ GATED: set CONFIRM_SPEND=yes to broadcast. No transactions sent. Zero gas.');
    return;
  }

  const POOL = artifact('NoxOraclePool');
  const pool = await deployFromArtifact(POOL, wallet, [REUSED.confidentialUSD, ctf, fpmm, questionId, oracle]);
  const addr = await pool.getAddress();
  console.log(`\n✅ NoxOraclePool ${addr}`);
  console.log(`   ${etherscanAddr(addr)}`);

  d.contracts.NoxOraclePool = { address: addr, note: 'redeployed with the executeEpoch allowTransient fix' };
  d.redeployedAt = new Date().toISOString();
  writeDeployments(d);
  console.log('   deployments.json updated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
