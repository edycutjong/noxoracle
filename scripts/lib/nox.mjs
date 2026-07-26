// Shared helpers for the standalone (ESM) NoxOracle scripts.
// Our own contracts are compiled by Hardhat; the UNMODIFIED Gnosis CTF/FPMM are deployed from their
// published npm build artifacts (deployment-of-record). We talk to live Sepolia via ethers.
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ethers } from 'ethers';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');

export const RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
export const CHAIN_ID = 11155111;
// Canonical iExec Nox protocol contract on Sepolia (ACL + proof validation) — fixed infra, not ours.
export const NOX_PROTOCOL = process.env.NOX_PROTOCOL_ADDRESS || '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf';

// Reused-from-NoxSend deployments (our own contracts; do NOT redeploy on the funded run).
// Single source of truth is deployments.json (committed → zero-config); env vars override for local runs.
// (readDeployments is a hoisted function declaration, safe to call here.)
const _deployed = readDeployments().contracts || {};
export const REUSED = {
  demoUSD: process.env.DEMO_USD_ADDRESS || _deployed.DemoUSD?.address,
  confidentialUSD: process.env.CONFIDENTIAL_USD_ADDRESS || _deployed.ConfidentialUSD?.address,
};

const rawPk = process.env.DEPLOYER_PRIVATE_KEY || '';
export const DEPLOYER_PK = rawPk ? (rawPk.startsWith('0x') ? rawPk : '0x' + rawPk) : '';

export function provider() {
  return new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true });
}

export function deployer(p = provider()) {
  if (!DEPLOYER_PK) throw new Error('DEPLOYER_PRIVATE_KEY missing in .env');
  return new ethers.Wallet(DEPLOYER_PK, p);
}

/** Load a Hardhat-compiled artifact (our own contracts). */
export function artifact(name) {
  const path = join(ROOT, 'artifacts', 'contracts', `${name}.sol`, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Load a published Gnosis npm build artifact (Truffle format). */
export function gnosisArtifact(pkg, name) {
  return require(`${pkg}/build/contracts/${name}.json`);
}

/** Deploy from any {abi, bytecode} artifact (used for the unmodified Gnosis contracts). */
export async function deployFromArtifact(art, signer, args = []) {
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, signer);
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  return c;
}

export const artifactHash = (art) => ethers.keccak256(art.deployedBytecode);
export async function onchainCodeHash(p, address) {
  return ethers.keccak256(await p.getCode(address));
}

export function deploymentsPath() {
  return join(ROOT, 'deployments.json');
}
export function readDeployments() {
  const pth = deploymentsPath();
  if (!existsSync(pth)) return { chainId: CHAIN_ID, network: 'sepolia', contracts: {} };
  return JSON.parse(readFileSync(pth, 'utf8'));
}
export function writeDeployments(d) {
  writeFileSync(deploymentsPath(), JSON.stringify(d, null, 2) + '\n');
}

export const etherscanTx = (h) => `https://sepolia.etherscan.io/tx/${h}`;
export const etherscanAddr = (a) => `https://sepolia.etherscan.io/address/${a}`;

/** Lazily import the ESM-only Nox handle SDK (self-serve gateway; funded EOA only). */
export async function handleClient(signer) {
  const { createEthersHandleClient } = await import('@iexec-nox/handle');
  return createEthersHandleClient(signer);
}

export const ZERO_HANDLE = '0x' + '0'.repeat(64);

// The gateway's ACL view lags the chain by a few seconds after a tx; the TEE needs a moment to
// compute a fresh handle. Both surface as retryable errors.
const RETRYABLE =
  /not yet computed|not a viewer|access denied|not authorized|does not exist|rpc error|status: 40[34]|fetch failed|network request failed/i;

export async function decryptWithRetry(client, handle, { label = 'decrypt', attempts = 18, delayMs = 4000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await client.decrypt(handle);
    } catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test(e?.message || '')) throw e;
      process.stdout.write(`    (${label}: gateway/TEE catching up, retry ${i}/${attempts})   \r`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export async function publicDecryptWithRetry(client, handle, { attempts = 18, delayMs = 4000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await client.publicDecrypt(handle);
    } catch (e) {
      last = e;
      if (i === attempts || !RETRYABLE.test(e?.message || '')) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

// Deterministic demo bettors from a DEDICATED throwaway mnemonic (never the public test mnemonic,
// which gets swept on Sepolia). Alice/Bob/Carol = the YES herd; Dana = the secret dissenter.
export function demoActors(p) {
  const phrase = process.env.DEMO_MNEMONIC || 'salmon banner pull inherit obey run shy treat embody joke rubber connect';
  const m = ethers.Mnemonic.fromPhrase(phrase);
  const at = (i) => new ethers.Wallet(ethers.HDNodeWallet.fromMnemonic(m, `m/44'/60'/0'/0/${i}`).privateKey, p);
  return { alice: at(1), bob: at(2), carol: at(3), dana: at(4), keeper: at(5) };
}

export const USDC_DECIMALS = 6;
export const usd = (n) => ethers.parseUnits(String(n), USDC_DECIMALS);
export const fmtUsd = (v) => ethers.formatUnits(v, USDC_DECIMALS);

export function fixturesPath(name) {
  return join(ROOT, 'fixtures', name);
}
export function readFixture(name) {
  const pth = fixturesPath(name);
  return existsSync(pth) ? JSON.parse(readFileSync(pth, 'utf8')) : null;
}
export function writeFixture(name, obj) {
  writeFileSync(fixturesPath(name), JSON.stringify(obj, null, 2) + '\n');
}
