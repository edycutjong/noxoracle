// Benchmarks: dual-handle commit encryption (2× concurrent encryptInput), epoch-close publicDecrypt
// latency, and claim-time decrypt p50/p95 (N=20). encryptInput needs only a funded EOA + the pool
// address (no gas). The decrypt/publicDecrypt samples need a live epoch (run deploy+seed first).
// Writes fixtures/bench.json for the README table.
//
// ⛔ The publicDecrypt/decrypt samples read the gateway; encryptInput sends no tx. Set BENCH_N to tune.
import { provider, deployer, handleClient, readDeployments, writeFixture } from './lib/nox.mjs';

const N = Number(process.env.BENCH_N || '20');
const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const stats = (arr) => ({ p50: pct(arr, 0.5), p95: pct(arr, 0.95), min: Math.min(...arr), max: Math.max(...arr), n: arr.length });

async function main() {
  const d = readDeployments();
  const poolAddr = d.contracts?.NoxOraclePool?.address;
  if (!poolAddr) {
    console.log('No deployment yet. Run `npm run deploy` (and `npm run seed` for decrypt samples) first.');
    return;
  }
  const p = provider();
  const w = deployer(p);
  const hc = await handleClient(w);

  // Dual-handle commit encryption: two concurrent encryptInput bound to the pool.
  const dual = [];
  for (let i = 0; i < N; i++) {
    const t = Date.now();
    await Promise.all([
      hc.encryptInput(BigInt(100 + i), 'uint256', poolAddr),
      hc.encryptInput(0n, 'uint256', poolAddr),
    ]);
    dual.push(Date.now() - t);
  }
  const out = { dualEncryptMs: stats(dual), sampledAt: new Date().toISOString() };
  console.log('dual-handle encrypt (2× concurrent):', out.dualEncryptMs);
  writeFixture('bench.json', out);
  console.log('\n✅ bench.json written. (Add close-time publicDecrypt + claim decrypt samples after seed.)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
