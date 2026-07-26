# feedback.md — building NoxOracle on iExec Nox (beta.13) + 2019 Gnosis artifacts

Dated findings from wiring a 2026 confidential layer (`@iexec-nox/handle` `0.1.0-beta.13`,
`nox-protocol-contracts` 0.2.4, `nox-confidential-contracts` 0.2.2, solc 0.8.35) onto the
**unmodified** Gnosis Conditional Tokens (1.0.3, solc 0.5.10) + FixedProductMarketMaker (1.8.1).
Everything below was verified against source in `node_modules` and exercised on a local Hardhat
harness (178 tests green). Ordered roughly by usefulness to the Nox team.

## Nox SDK / Solidity library

1. **The internal-handle `unwrap(euint256)` overload EXISTS and is the right primitive for pooled
   custody.** `ERC20ToERC7984WrapperBase` has both `unwrap(from,to,externalEuint256,proof)` and
   `unwrap(from,to,euint256)`. Our spec hedged that only the external-input form was documented and
   designed a keeper-re-encrypt path around it. The internal form let the pool unwrap a handle it
   already computed (`Nox.add(sumYes,sumNo)`) with just `allowThis` — no owner/app-binding gymnastics,
   and the burn is bounded by the pool's real balance. **Ask:** document the internal-handle overload
   prominently; it's strictly better for contract-held balances.

2. **`Nox.mul`/`Nox.div` are `euint × euint` only — there is no `× public uint` scalar overload.** The
   "encrypted × public scalar" pattern (our claim math) is done by trivially-encrypting the public
   value first: `Nox.div(Nox.mul(stake, Nox.toEuint256(num)), Nox.toEuint256(den))`. This works and
   still sidesteps division-by-ciphertext (num/den are public constants), but the naming invites the
   assumption of a scalar overload. **Ask:** add `mul(euint256, uint256)` / `div(euint256, uint256)`
   convenience overloads, or note the `toEuint256` idiom in the docs.

3. **`Nox.div` returns `MAX_UintN` on divide-by-zero** (per INoxCompute). Silent, not a revert — a
   confidential contract that divides by a possibly-zero ciphertext can produce a garbage-but-valid
   handle. We avoid it entirely (public rate, guarded `den>0` off-chain), but it's a sharp edge.

4. **Handle ACL hinges on one bit:** `HandleUtils.isPublicHandle(h) == (h[6] & 0x01 == 0)`. Public
   handles bypass *every* ACL check (`isAllowed`/`isViewer`/`allowTransient` short-circuit). So a
   compute result that must carry ACL (our epoch aggregates, the k-anon `ebool`) must be a *unique*
   (attr-bit-set) handle. Getting this wrong silently disables access control. Worth a bold callout.

5. **`confidentialTransferFrom(from,to,euint256)` (no-proof form) requires the caller to be
   `isAllowed` on the amount handle *and* `isOperator(from)`.** For pooled operator-pull custody the
   pool must `Nox.allowThis(total)` before the pull; miss it and you get `UnauthorizedUseOfEncrypted
   Amount`, not an operator error — mildly misleading. Documented the exact sequence in the pool.

6. **The optimized `_update` burn path does not `allowThis` the returned `transferred` handle, yet
   `_unwrap` immediately `allowPublicDecryption`s it.** On real Nox this works (proven by the sibling
   NoxSend cycle on Sepolia); it implies `allowPublicDecryption` doesn't hard-require persistent
   caller access on a freshly-produced handle, or `select`/`burn` grants transient rights. Either way
   the invariant "you can only make public what you can access" has a subtle exception around fresh
   burn outputs. Worth documenting precisely — it affected how we wrote the local test double.

7. **The two-step unwrap cannot be a single on-chain tx.** `unwrap` emits a publicly-decryptable
   burn handle; `finalizeUnwrap` needs the *gateway's* decryption proof for it. So an epoch's
   "execute" is necessarily split: `executeEpoch` (burn) → off-chain `publicDecrypt` → `finalizeEpoch`
   (finalize + FPMM buys). Fine once understood, but the async boundary should be called out in the
   wrapper docs.

8. **`Nox.noxComputeContract()` supports chainId 31337 (local Hardhat) and returns a fixed address.**
   This is the single most useful thing for testing: we placed a transparent `MockNoxCompute` at that
   address via `hardhat_setCode` and ran the *entire* confidential flow (real wrapper + real pool +
   real Gnosis CTF/FPMM) locally, no gateway. **Ask:** ship an official local mock/precompile — every
   integrator will want one, and hand-rolling INoxCompute is error-prone (see #4, #6).

9. **`hardhat_setCode` preserves storage.** Reinstalling the mock between fixtures kept its
   `publicDecryptionLog` — our invariant-I2 assertion needed an explicit `resetLog()`. Not a Nox
   issue, but a gotcha for anyone testing against a fixed-address mock.

## Gnosis CTF/FPMM interop (2019 artifacts × 2026 toolchain)

10. **The published Gnosis artifacts ship fully-linked 0.5.10 bytecode — no library placeholders.**
    `ConditionalTokens`, the FPMM factory, and the FPMM implementation have zero `__CTHelpers__`-style
    link refs, so deployment-of-record is a plain `new ContractFactory(abi, bytecode)` with no manual
    linking. Their on-chain runtime hashes match the artifacts byte-for-byte (our I5 hash-check).

11. **`FixedProductMarketMakerFactory.createFixedProductMarketMaker` returns an EIP-1167 minimal
    proxy, not a full copy.** A naive "instance bytecode == FPMM artifact" hash-check fails. The
    correct purity proof is: factory bytecode == factory artifact, `factory.implementationMaster()`
    bytecode == FPMM artifact, and the proxy embeds the master address. We fixed our check accordingly.

12. **CTF `getCollectionId` uses the alt_bn128 (`0x06`) precompile** and runs fine on the local
    Hardhat EVM (paris target). Good to know the 2019 EC-based position algebra needs no shims in 2026.

## Toolchain

13. **solc 0.8.35 with `viaIR: true` is required** to compile the wrapper + pool without stack-too-deep,
    and Hardhat warns "0.8.35 is not fully supported yet" (stack traces degrade) but compiles cleanly.
    Pinned 0.8.35 to match the Nox library pragma `^0.8.35`.

14. **Participation is inherently public**, so the k-anonymity *count* can't be secret (each commit tx
    reveals its sender). We enforce the k-gate in plaintext (honest: the count is already on-chain) and
    additionally expose an encrypted `le(K_MIN, count)` path as a capability demo. Framing this as
    "sizes are hidden, membership is not" avoids over-claiming — a distinction the SDK docs could make
    for anyone building anonymity-set features.

15. **`Nox.toEuint256(0)` (a contract-side encrypted-zero literal) returns a PUBLIC handle** — its
    zero-ness is on-chain readable and `allowThis` on it would be a no-op (silently skipped by the
    library's `_allowIfNotPublic`; the raw `allow` reverts `PublicHandleACLForbidden`). Two
    consequences we designed around, verified against `Nox.sol`/`ACL.sol` (cross-checked with the
    sibling NoxSafe build): **(a)** the dual-handle empty side (amtNo=0 when betting YES, and vice
    versa) MUST be a CLIENT-`encryptInput` private zero — NEVER a contract `toEuint256(0)` — or "this
    bettor staked 0 on side X" becomes publicly provable and the direction leaks. NoxOracle takes BOTH
    sides as external handles and never manufactures a zero. **(b)** Epoch/stake accumulators are left
    default-uninitialized (`bytes32(0)`, resolved to the public zero-handle only INSIDE the first
    `Nox.add`) and become confidential + pool-owned immediately after that first `add` + `allowThis` —
    the "start-public-then-confidential" pattern. We use `toEuint256` ONLY for values that are meant to
    be public: the k-gate `count`/`K_MIN` and the public payout-rate `num`/`den`. **Ask:** the SDK docs
    should flag `toEuint256(0)` as public loudly — it's an easy, silent, privacy-critical footgun.

16. **The wrapper's internal-handle `unwrap(euint256)` needs the CALLER to grant the wrapper transient
    access to the burn-amount handle — not just `allowThis`.** Caught on the live Sepolia run (the
    permissive local mock hid it): `executeEpoch` did `Nox.allowThis(e.total)` then
    `cUSD.unwrap(pool,pool,e.total)`, and the tx reverted `NotAllowed(e.total, cUSD)` (`0xb87a12a9`).
    Reason: the internal-handle unwrap's own `require(Nox.isAllowed(amount, msg.sender=pool))` passes,
    but `_burn` → `Nox.burn(poolBalance, e.total, totalSupply)` calls NoxCompute *as the cUSD contract*,
    and the cUSD isn't allowed on `e.total`. Fix: add `Nox.allowTransient(e.total, address(cUSD))`
    before the unwrap — the exact operator-pull ACL pattern already used for `confidentialTransferFrom`
    (commit) and `confidentialTransfer` (claim/refund). **Lesson for integrators:** any pool-owned
    handle you hand to a token method must be `allowTransient`'d to that token, because the token
    re-enters NoxCompute under its own identity. A faithful local mock (or the official one from #8)
    would have surfaced this offline; ours was deliberately permissive on ACL and didn't.

## Net

The confidential-layer-over-unmodified-protocol pattern is genuinely clean once the ACL model and the
two-step unwrap click. The single biggest DX win would be an official local NoxCompute mock (#8) plus
scalar arithmetic overloads (#2). Nothing here blocked the build; every item is now handled in-repo.
