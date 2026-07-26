// verify-epoch — independent recomputation of the protocol invariants from chain data alone.
// The judge runs `noxoracle verify-epoch <id>`; the script reads events/handles from the chain,
// decrypts the (public) aggregates, and feeds this pure function, which recomputes I1–I5. Keeping
// the logic pure makes the invariants themselves unit-testable (no chain needed for the math).

export interface UserStake {
  address: string;
  yes: bigint;
  no: bigint;
}

export interface EpochVerificationInput {
  epochId: number;
  /** Publicly-decrypted epoch aggregates (from `publicDecrypt` of the two sum handles). */
  aggregates: { sumYes: bigint; sumNo: bigint };
  /** Per-user decrypted stakes (each decrypted by its owner, or reconstructed from the seed cast). */
  userStakes: UserStake[];
  /** The exact handles that were passed to `allowPublicDecryption` (from on-chain events/log). */
  publiclyDecryptedHandles: string[];
  /** The handles that are ALLOWED to be public — the two aggregates (+ the pool's unwrap burn id). */
  aggregateHandles: { sumYes: string; sumNo: string; unwrapId?: string };
  /** Per-user stake handles that must NEVER be public (invariant I2). */
  stakeHandles: string[];
  /** What the pool actually spent on the real FPMM per side, and what it unwrapped. */
  routing: { spentYes: bigint; spentNo: bigint; unwrapped: bigint };
  /** Optional settlement facts (enables I4). */
  settlement?: { pot: bigint; winner: 'yes' | 'no'; winningPool: bigint; payouts: bigint[] };
  /** Optional protocol-purity results from the bytecode hash-check (enables I5). */
  artifacts?: { ctfMatch: boolean; fpmmMatch: boolean };
}

export interface InvariantCheck {
  id: 'I1' | 'I2' | 'I3' | 'I4' | 'I5';
  label: string;
  pass: boolean;
  detail: string;
}

export interface VerificationResult {
  epochId: number;
  ok: boolean;
  checks: InvariantCheck[];
}

const norm = (h: string) => h.toLowerCase();

export function verifyEpoch(input: EpochVerificationInput): VerificationResult {
  const checks: InvariantCheck[] = [];

  // I1 — conservation: Σ user stakes ≡ epoch aggregates.
  const totalYes = input.userStakes.reduce((a, s) => a + s.yes, 0n);
  const totalNo = input.userStakes.reduce((a, s) => a + s.no, 0n);
  const i1 = totalYes === input.aggregates.sumYes && totalNo === input.aggregates.sumNo;
  checks.push({
    id: 'I1',
    label: 'Conservation: Σ user stakes ≡ epoch aggregates',
    pass: i1,
    detail: `Σ YES ${totalYes} vs sumYes ${input.aggregates.sumYes}; Σ NO ${totalNo} vs sumNo ${input.aggregates.sumNo}`,
  });

  // I2 — aggregation-only disclosure: only aggregate handles are ever public; no stake handle is.
  const allowedPublic = new Set(
    [input.aggregateHandles.sumYes, input.aggregateHandles.sumNo, input.aggregateHandles.unwrapId]
      .filter(Boolean)
      .map((h) => norm(h as string)),
  );
  const stakeSet = new Set(input.stakeHandles.map(norm));
  const revealed = input.publiclyDecryptedHandles.map(norm);
  const strayReveals = revealed.filter((h) => !allowedPublic.has(h));
  const leakedStakes = revealed.filter((h) => stakeSet.has(h));
  const i2 = strayReveals.length === 0 && leakedStakes.length === 0;
  checks.push({
    id: 'I2',
    label: 'Aggregation-only: only sumYes/sumNo (+unwrap) are publicly decryptable',
    pass: i2,
    detail: i2
      ? `${revealed.length} public reveal(s), all aggregate handles; 0 stake handles leaked`
      : `stray public reveals: ${strayReveals.length}; leaked stake handles: ${leakedStakes.length}`,
  });

  // I3 — faithful routing: FPMM spend ≡ decrypted aggregates, and unwrap ≡ their sum.
  const i3 =
    input.routing.spentYes === input.aggregates.sumYes &&
    input.routing.spentNo === input.aggregates.sumNo &&
    input.routing.unwrapped === input.aggregates.sumYes + input.aggregates.sumNo;
  checks.push({
    id: 'I3',
    label: 'Faithful routing: FPMM buys ≡ aggregates; unwrap ≡ their sum',
    pass: i3,
    detail: `spentYES ${input.routing.spentYes}/${input.aggregates.sumYes}, spentNO ${input.routing.spentNo}/${input.aggregates.sumNo}, unwrapped ${input.routing.unwrapped}/${input.aggregates.sumYes + input.aggregates.sumNo}`,
  });

  // I4 — claims bounded: Σ payouts ≤ pot (public-rate scalar math can't over-distribute).
  if (input.settlement) {
    const paid = input.settlement.payouts.reduce((a, p) => a + p, 0n);
    const i4 = paid <= input.settlement.pot;
    checks.push({
      id: 'I4',
      label: 'Claims bounded: Σ payouts ≤ pot',
      pass: i4,
      detail: `Σ payouts ${paid} ≤ pot ${input.settlement.pot}`,
    });
  }

  // I5 — protocol purity: CTF/FPMM bytecode ≡ official npm artifacts.
  if (input.artifacts) {
    const i5 = input.artifacts.ctfMatch && input.artifacts.fpmmMatch;
    checks.push({
      id: 'I5',
      label: 'Protocol purity: CTF/FPMM bytecode ≡ official artifacts',
      pass: i5,
      detail: `CTF ${input.artifacts.ctfMatch ? 'match' : 'MISMATCH'}, FPMM ${input.artifacts.fpmmMatch ? 'match' : 'MISMATCH'}`,
    });
  }

  return { epochId: input.epochId, ok: checks.every((c) => c.pass), checks };
}

/** Render a verification result as a terminal-style block (CLI + /verify page). */
export function formatVerifyReport(result: VerificationResult): string {
  const lines = [`verify-epoch #${result.epochId}`];
  for (const c of result.checks) {
    lines.push(`  ${c.pass ? '✅' : '❌'} ${c.id}  ${c.label}`);
    lines.push(`       ${c.detail}`);
  }
  lines.push(`  → ${result.ok ? 'ALL INVARIANTS GREEN' : 'INVARIANT VIOLATION'}`);
  return lines.join('\n');
}
