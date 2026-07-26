#!/usr/bin/env node
// Coverage GATE — fails (non-zero exit) if any OWN, shipped contract is below 100% on ANY metric
// (statements / branches / functions / lines). Run after `hardhat coverage` via `npm run coverage:check`.
//
// "Own contracts" = the deliverables under contracts/ EXCLUDING test scaffolding (contracts/test/*).
// This picks up NoxOraclePool.sol, ConfidentialUSD.sol, DemoUSD.sol and contracts/interfaces/*.sol,
// while excluding mocks like contracts/test/MockNoxCompute.sol.
//
// Parses solidity-coverage's Istanbul-format report (coverage.json at the repo root — the same data
// that backs coverage/coverage-final.json and the printed table). A genuinely empty metric (0/0,
// e.g. a file with no branches) counts as 100% (pass).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Prefer the root coverage.json; fall back to coverage/coverage-final.json (same Istanbul schema).
const CANDIDATES = [join(ROOT, 'coverage.json'), join(ROOT, 'coverage', 'coverage-final.json')];
const covPath = CANDIDATES.find((p) => existsSync(p));
if (!covPath) {
  console.error(
    `\n[coverage:check] FATAL: no coverage report found.\n` +
      `  Looked for:\n${CANDIDATES.map((p) => `    - ${p}`).join('\n')}\n` +
      `  Run \`npm run coverage\` (or \`npm run coverage:check\`) first.\n`,
  );
  process.exit(2);
}

let report;
try {
  report = JSON.parse(readFileSync(covPath, 'utf8'));
} catch (err) {
  console.error(`\n[coverage:check] FATAL: could not parse ${covPath}: ${err.message}\n`);
  process.exit(2);
}

// Own, shipped contract = under contracts/ but NOT under contracts/test/.
const isOwn = (key) => {
  const k = key.replaceAll('\\', '/');
  const rel = k.includes('/contracts/') ? k.slice(k.indexOf('/contracts/') + 1) : k;
  if (!rel.startsWith('contracts/')) return false;
  if (rel.startsWith('contracts/test/')) return false;
  return rel.endsWith('.sol');
};

// pct with the 0/0 => 100 convention.
const pct = (covered, total) => (total === 0 ? 100 : (covered / total) * 100);

// Compute statements / functions / branches / lines from an Istanbul file entry.
function metrics(f) {
  const s = f.s || {};
  const fn = f.f || {};
  const b = f.b || {};
  const statementMap = f.statementMap || {};

  const sTotal = Object.keys(s).length;
  const sCov = Object.values(s).filter((n) => n > 0).length;

  const fTotal = Object.keys(fn).length;
  const fCov = Object.values(fn).filter((n) => n > 0).length;

  let bTotal = 0;
  let bCov = 0;
  for (const arr of Object.values(b)) {
    for (const hits of arr) {
      bTotal += 1;
      if (hits > 0) bCov += 1;
    }
  }

  // Lines: fold statement hit-counts onto their source line (a line is covered if any statement on
  // it ran) — matches how solidity-coverage derives its "% Lines" column.
  const lineHits = new Map();
  for (const [id, loc] of Object.entries(statementMap)) {
    const line = loc?.start?.line;
    if (line == null) continue;
    const cur = lineHits.get(line) || 0;
    lineHits.set(line, Math.max(cur, s[id] || 0));
  }
  const lTotal = lineHits.size;
  let lCov = 0;
  for (const h of lineHits.values()) if (h > 0) lCov += 1;

  return {
    statements: { covered: sCov, total: sTotal, pct: pct(sCov, sTotal) },
    branches: { covered: bCov, total: bTotal, pct: pct(bCov, bTotal) },
    functions: { covered: fCov, total: fTotal, pct: pct(fCov, fTotal) },
    lines: { covered: lCov, total: lTotal, pct: pct(lCov, lTotal) },
  };
}

const ownKeys = Object.keys(report).filter(isOwn).sort();
if (ownKeys.length === 0) {
  console.error(
    `\n[coverage:check] FATAL: no own contracts found in ${covPath}.\n` +
      `  This almost certainly means the coverage run did not instrument the project.\n`,
  );
  process.exit(2);
}

const shortName = (key) => key.replaceAll('\\', '/').replace(/^.*\/contracts\//, 'contracts/').replace(/^contracts\//, '');

const rows = [];
let failed = false;
const fmt = (m) => `${m.pct.toFixed(2).padStart(6)}% (${m.covered}/${m.total})`;

for (const key of ownKeys) {
  const m = metrics(report[key]);
  const below = ['statements', 'branches', 'functions', 'lines'].filter((k) => m[k].pct < 100);
  if (below.length) failed = true;
  rows.push({ name: shortName(key), m, below });
}

// ---- Print a clear per-file table ----
const nameW = Math.max(12, ...rows.map((r) => r.name.length));
const head =
  'File'.padEnd(nameW) +
  ' | ' +
  ['% Stmts', '% Branch', '% Funcs', '% Lines'].map((h) => h.padStart(16)).join(' | ');
const rule = '-'.repeat(head.length);

console.log('\nCoverage gate — OWN (shipped) contracts must be 100% on every metric');
console.log(`  source: ${covPath}`);
console.log('\n' + head);
console.log(rule);
for (const r of rows) {
  console.log(
    r.name.padEnd(nameW) +
      ' | ' +
      [r.m.statements, r.m.branches, r.m.functions, r.m.lines].map((x) => fmt(x).padStart(16)).join(' | ') +
      (r.below.length ? `   <-- BELOW 100%: ${r.below.join(', ')}` : ''),
  );
}
console.log(rule);
console.log('Excluded (test scaffolding, not gated): contracts/test/*  (e.g. MockNoxCompute.sol)\n');

if (failed) {
  console.error('RESULT: FAIL — one or more own contracts are below 100% coverage.\n');
  process.exit(1);
}
console.log(`RESULT: PASS — all ${rows.length} own contracts at 100% (stmts/branch/funcs/lines).\n`);
process.exit(0);
