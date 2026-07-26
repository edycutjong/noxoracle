# SPEC.md — NoxOracle protocol invariants

The confidential layer is only as trustworthy as the properties you can independently recompute.
These five invariants are enforced in the contract and/or checked by `scripts/verify_epoch.mjs`
(pure logic in `@noxoracle/confidential-ctf`'s `verifyEpoch`, unit-tested in `tests/verify.test.ts`).
`noxoracle verify-epoch <id>` recomputes I1–I5 from **chain data alone**.

| # | Invariant | Statement | How it's guaranteed / checked |
|---|-----------|-----------|-------------------------------|
| **I1** | Conservation | Σ (per-user encrypted stakes) ≡ epoch aggregates `sumYes`/`sumNo`. | Aggregates are accumulated with the same `Nox.add` as the per-user ledgers in `commitBet`. Recomputed post-decryption in `verifyEpoch`. |
| **I2** | Aggregation-only disclosure | `allowPublicDecryption` is called on EXACTLY the two aggregate handles (+ the pool's own unwrap burn id). NO per-user stake handle is ever made public. | Only `closeEpoch` (sums) and the wrapper's `_unwrap` (pool burn) call it; greppable + enforced. Locally the `MockNoxCompute` records every public-decryption in a log that the I2 test asserts against. |
| **I3** | Faithful routing | The pool's real `fpmm.buy` amounts ≡ the decrypted aggregates, and the unwrapped USDC ≡ their sum. | `finalizeEpoch` requires `plainYes + plainNo == released` (the truly-burnt amount) before any buy; on-chain comparable. |
| **I4** | Claims bounded | Σ payouts ≤ pot. | Payout = `stakeWin × rateNum / rateDen` where `(rateNum,rateDen) = (pot, winningPool)` are public aggregates; the scalar rate can't over-distribute. |
| **I5** | Protocol purity | Deployed CTF/FPMM bytecode ≡ official npm artifacts, byte-for-byte. | `scripts/check_artifacts.mjs` hashes on-chain runtime vs the package `deployedBytecode` (CTF instance; FPMM `implementationMaster`). Proven locally in `test/Artifacts.test.js`. |

## The two-layer trust model for `executeEpoch`/`finalizeEpoch`

1. **Hard on-chain bound.** The pool unwraps its OWN pooled cUSD via the internal-handle
   `unwrap(euint256)` — an all-or-nothing ERC-7984 burn. A keeper cannot make the pool spend more than
   it actually holds, and `finalizeUnwrap`'s decryption proof releases *exactly* the burnt amount.
   `finalizeEpoch` then requires `plainYes + plainNo == released` before touching the FPMM.
2. **Public auditability.** `sumYes`/`sumNo` are `allowPublicDecryption`'d, so anyone (and
   `verify_epoch.mjs`) can `publicDecrypt` them and prove the keeper's plaintext inputs honest. A
   mismatch is publicly demonstrable and the epoch refundable.

## Direction-hiding depends on a client-encrypted zero (verified)

`commitBet` takes TWO external handles and never manufactures the empty side. The zero side is a
GATEWAY-`encryptInput` **private** zero, not a contract-side `Nox.toEuint256(0)` — the latter is a
PUBLIC handle whose zero-ness is on-chain readable, which would make "staked 0 on side X" provable and
leak the direction. Epoch/stake accumulators start default-uninitialized and become confidential + sole
-admin-pool-owned right after the first `Nox.add` + `allowThis` (start-public-then-confidential).
`Nox.toEuint256` is used ONLY for intentionally-public values (k-gate count/`K_MIN`; payout rate
`num`/`den`). See `feedback.md` #15.

## Residual risks (stated, not hidden)

- **k-anonymity** — tiny epochs approximate individuals. On-chain k-gate (`closeEpoch` reverts below
  `K_MIN=3`) + in-product meter + a deliberately-bad epoch #0 exhibit. Membership is inherently public
  (commit tx sender); only sizes/direction are hidden.
- **Commit→execute FPMM price drift** — batching trades latency for privacy; slippage guards (`minYes`/
  `minNo`) bound it.
- **Demo oracle** is a disclosed centralized EOA; the CTF is oracle-agnostic (reality.eth = production
  path, Tier B roadmap).
- **Wrap boundary + addresses** are public, as in the sibling NoxSend/NoxSafe entries.
