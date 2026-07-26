// Submission readiness — LOCAL, no gas. Confirms the repo has every mandatory deliverable, that the
// contracts compiled, and (drift canary) that any published demo numbers come from the seed fixture.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/nox.mjs';

let fail = 0;
const ok = (label) => console.log(`  ✅ ${label}`);
const bad = (label) => {
  console.log(`  ❌ ${label}`);
  fail++;
};
const has = (rel) => existsSync(join(ROOT, rel));

console.log('NoxOracle — submission readiness\n');

console.log('Docs & disclosure:');
for (const f of ['README.md', 'ARCHITECTURE.md', 'DEMO.md', 'SPEC.md', 'feedback.md', '.env.example', 'deployments.json']) {
  has(f) ? ok(f) : bad(`${f} missing`);
}

console.log('\nContracts (compiled):');
for (const c of ['NoxOraclePool', 'ConfidentialUSD', 'DemoUSD']) {
  has(`artifacts/contracts/${c}.sol/${c}.json`) ? ok(`${c} artifact`) : bad(`${c} not compiled (run npm run compile)`);
}

console.log('\nJudge tooling & package:');
for (const f of [
  'packages/confidential-ctf/src/index.ts',
  'packages/cli/src/index.ts',
  'scripts/verify_epoch.mjs',
  'scripts/check_artifacts.mjs',
  'scripts/seed.mjs',
  'scripts/deploy.mjs',
  'scripts/bench.mjs',
]) {
  has(f) ? ok(f) : bad(`${f} missing`);
}

console.log('\nBrand assets:');
if (has('docs/assets')) {
  const n = readdirSync(join(ROOT, 'docs/assets')).length;
  n >= 5 ? ok(`docs/assets (${n} files)`) : bad(`docs/assets sparse (${n})`);
} else bad('docs/assets missing');

console.log('\nDrift canary (demo numbers ⊆ seed fixture):');
const statePath = join(ROOT, 'fixtures', 'demo-state.json');
if (existsSync(statePath)) {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const readme = has('README.md') ? readFileSync(join(ROOT, 'README.md'), 'utf8') : '';
  const yes = BigInt(state.aggregates?.sumYes || '0') / 1_000_000n;
  const no = BigInt(state.aggregates?.sumNo || '0') / 1_000_000n;
  readme.includes(String(yes)) && readme.includes(String(no))
    ? ok(`README quotes seeded aggregates (YES ${yes} / NO ${no})`)
    : console.log(`  ⚠️  README aggregate numbers not yet reconciled with seed (YES ${yes} / NO ${no})`);
} else {
  console.log('  ⚠️  no demo-state.json yet (run seed on the funded run); README numbers are placeholders until then.');
}

console.log(`\n${fail === 0 ? '✅ READY (offline deliverables complete).' : `❌ ${fail} blocker(s).`}`);
process.exit(fail === 0 ? 0 : 1);
