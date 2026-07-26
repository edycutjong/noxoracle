#!/usr/bin/env tsx
// noxoracle CLI — the judge-facing surface over @noxoracle/confidential-ctf.
//   noxoracle market                 — show the live market + odds
//   noxoracle bet <yes|no> <amount>  — commit a private bet (dual-handle)
//   noxoracle position [epoch]       — decrypt YOUR own position (nobody else can)
//   noxoracle aggregates <epoch>     — publicDecrypt the two epoch sums
//   noxoracle claim <epoch>          — claim a sealed payout at the public rate
//   noxoracle verify-epoch <epoch>   — recompute invariants I1–I5 from chain data
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import {
  NoxOracleClient, SEPOLIA, fromBaseUnits, fpmmPrices, kAnonymity,
  type NoxOracleConfig,
} from '@noxoracle/confidential-ctf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function loadConfig(): NoxOracleConfig {
  const path = join(ROOT, 'deployments.json');
  if (!existsSync(path)) throw new Error('No deployments.json — run `npm run deploy` first.');
  const d = JSON.parse(readFileSync(path, 'utf8'));
  if (!d.contracts?.NoxOraclePool?.address?.startsWith?.('0x'))
    throw new Error('NoxOraclePool not deployed yet (address is PENDING). Run `npm run deploy` first.');
  return {
    network: SEPOLIA,
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

async function makeClient() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY missing in .env');
  const provider = new ethers.JsonRpcProvider(SEPOLIA.rpcUrl, SEPOLIA.chainId, { staticNetwork: true });
  const signer = new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk, provider);
  const { createEthersHandleClient } = await import('@iexec-nox/handle');
  const handle = await createEthersHandleClient(signer);
  return new NoxOracleClient(signer, handle as any, loadConfig());
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'market': {
      const cfg = loadConfig();
      console.log(`Market:  ${cfg.market.question}`);
      console.log(`  conditionId ${cfg.market.conditionId}`);
      console.log(`  oracle ${cfg.market.oracle} (disclosed demo EOA; reality.eth = production path)`);
      break;
    }
    case 'bet': {
      const side = args[0];
      const amount = args[1];
      if (side !== 'yes' && side !== 'no') throw new Error('usage: noxoracle bet <yes|no> <amount>');
      const c = await makeClient();
      const tx = await c.commitBet(side, amount);
      console.log(`Committed a private ${side.toUpperCase()} bet of ${amount}. tx ${tx}`);
      console.log('On-chain: two identical sealed handles — direction is invisible.');
      break;
    }
    case 'position': {
      const c = await makeClient();
      const epoch = args[0] ? Number(args[0]) : await c.currentEpoch();
      const pos = await c.myPosition(epoch);
      console.log(`Your position (epoch #${epoch}):`);
      console.log(`  YES ${fromBaseUnits(pos.yes)}   NO ${fromBaseUnits(pos.no)}`);
      console.log(pos.read ? `  → ${pos.read.side.toUpperCase()} ${fromBaseUnits(pos.read.amount)}` : '  → no position');
      break;
    }
    case 'aggregates': {
      const c = await makeClient();
      const epoch = Number(args[0] || '1');
      const agg = await c.decryptAggregates(epoch);
      console.log(`Epoch #${epoch} aggregates (public):  YES ${fromBaseUnits(agg.sumYes)} / NO ${fromBaseUnits(agg.sumNo)}`);
      break;
    }
    case 'claim': {
      const c = await makeClient();
      const epoch = Number(args[0] || '1');
      const tx = await c.claim(epoch);
      console.log(`Claimed sealed payout for epoch #${epoch}. tx ${tx}`);
      break;
    }
    case 'verify-epoch': {
      console.log('Run: npm run verify-epoch ' + (args[0] || '1'));
      break;
    }
    default:
      console.log('noxoracle <market|bet|position|aggregates|claim|verify-epoch>');
  }
}

main().catch((e) => {
  console.error('error:', e.message || e);
  process.exit(1);
});
