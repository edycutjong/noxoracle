// Minimal Sepolia smoke: one bettor wraps, commits a private YES bet, and decrypts their own
// position back — proving the gateway + cUSD + pool wire end-to-end on live Sepolia with the real
// TEE (the full 4-bettor cycle lives in seed.mjs).
//
// ⛔ SPENDS GAS. Gated: refuses to run unless CONFIRM_SPEND=yes.
import { ethers } from 'ethers';
import { provider, deployer, handleClient, readDeployments, fmtUsd, etherscanTx } from './lib/nox.mjs';
import { NoxOracleClient } from '../packages/confidential-ctf/src/client.js';

const CONFIRMED = process.env.CONFIRM_SPEND === 'yes';

async function main() {
  const d = readDeployments();
  if (!d.contracts?.NoxOraclePool?.address?.startsWith?.('0x')) {
    console.log('No deployment yet (NoxOraclePool address is PENDING). Run `npm run deploy` first.');
    return;
  }
  if (!CONFIRMED) {
    console.log('⛔ GATED: set CONFIRM_SPEND=yes to broadcast the smoke. No transactions sent. Zero gas.');
    console.log('   Sequence: openEpoch → wrap 100 → commitBet(yes, 100) → decrypt own position');
    return;
  }
  const p = provider();
  const w = deployer(p);
  const net = { chainId: 11155111, name: 'sepolia', rpcUrl: '', gatewayUrl: '', subgraphUrl: '', noxProtocol: d.noxProtocol, explorer: 'https://sepolia.etherscan.io' };
  const cfg = {
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
  const client = new NoxOracleClient(w, await handleClient(w), cfg);
  await client.openEpoch(600);
  const epoch = await client.currentEpoch();
  await client.wrap(100);
  const tx = await client.commitBet('yes', 100);
  console.log(`committed ${etherscanTx(tx)}`);
  const pos = await client.myPosition(epoch);
  console.log(`decrypted own position: YES ${fmtUsd(pos.yes)} / NO ${fmtUsd(pos.no)}  read=${JSON.stringify(pos.read, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
