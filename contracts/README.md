# NoxOracle — Contracts

Solidity sources for NoxOracle, compiled with **solc 0.8.35** via Hardhat. A confidential participation
layer over a **byte-for-byte unmodified** Gnosis Conditional-Tokens prediction market, using the audited
[iExec Nox](https://docs.iex.ec) confidential-token library. The market contracts are deployed straight
from the official npm artifacts and **CI hash-checked** — this layer touches them only through their
public `buy` / `redeemPositions` surface.

Live and source-verified on **Ethereum Sepolia** (chainId `11155111`):

| Contract | File | Sepolia address | Role |
|---|---|---|---|
| **NoxOraclePool** | [`NoxOraclePool.sol`](./NoxOraclePool.sol) | [`0xfFba95…4a2E`](https://sepolia.etherscan.io/address/0xfFba9520699EC4161f41F9bD220e6ce7083d4a2E#code) | confidential participation pool (the novel surface) |
| **ConfidentialUSD** (cUSD) | [`ConfidentialUSD.sol`](./ConfidentialUSD.sol) | [`0x82C281…8991`](https://sepolia.etherscan.io/address/0x82C281D7403e44d61968c2F49751a56877468991#code) | 1:1 confidential ERC-7984 wrapper (shared) |
| **DemoUSD** (dUSD) | [`DemoUSD.sol`](./DemoUSD.sol) | [`0x486c4B…735C`](https://sepolia.etherscan.io/address/0x486c4B8009ACf0BfE26268512F27200e48BD735C#code) | unmodified underlying ERC-20 (shared) |

The real, unmodified market (hash-checked against the npm artifacts):

| Gnosis contract | Version | Sepolia address |
|---|---|---|
| ConditionalTokens | 1.0.3 | [`0xCd316D…734a5`](https://sepolia.etherscan.io/address/0xCd316D0655989fBcedb818b59B7374f62eA734a5) |
| FPMM Factory | 1.8.1 | [`0x5c496C…7359`](https://sepolia.etherscan.io/address/0x5c496C1CD31bdfcaD8278E2Af8dE93a6f3Fa7359) |
| FPMM instance | 1.8.1 | [`0xBf4900…4cc3`](https://sepolia.etherscan.io/address/0xBf4900df1Da779836DFC03a746307fAFBEEf4cc3) |

`ConfidentialUSD.sol` / `DemoUSD.sol` are the ERC-7984 wrapper + demo ERC-20 skeleton ([`./ConfidentialUSD.sol`](./ConfidentialUSD.sol) · [`./DemoUSD.sol`](./DemoUSD.sol)). [`./interfaces/`](./interfaces) holds the thin `IMarket.sol` interfaces to the Gnosis contracts; [`./test/`](./test) holds Solidity test helpers. The novel surface is **`NoxOraclePool.sol`**.

---

## NoxOraclePool.sol — the novel contract

A confidential layer that keeps bet **direction and size** hidden through and after settlement.

### Why direction never leaks
A bet is committed as **two** encrypted amounts `(amtYes, amtNo)` — one an encrypted zero — so a side bit
never exists in plaintext: not in calldata, not in storage, not as a boolean. Both sides are
**client-encrypted external inputs**; the empty side is a gateway-encrypted private zero, **never** a
contract-side `toEuint256(0)` (which would be a publicly-readable zero and leak the direction). Every
commit is identically shaped: two 32-byte handles.

### Custody & aggregation
Stakes pool here in confidential cUSD under per-user encrypted ledgers (`allowThis` + `addViewer(user)` —
the user always decrypts their own position, nobody else). The pool is the **sole admin** of every stake
handle and deliberately never `Nox.allow`s a user — **admin-minimality** as a security property, provable
live (`isAllowed(handle,user)==false` while `isViewer==true`). At epoch close, **exactly two** handles per
epoch become public — the YES sum and the NO sum (invariant I2); nothing user-shaped is ever
`allowPublicDecryption`'d.

### Epoch state machine
```
OPEN → AWAITING_DECRYPT → AWAITING_UNWRAP → EXECUTED → SETTLED   (+ REFUNDING escape hatch)
openEpoch → commitBet* → closeEpoch → executeEpoch → finalizeEpoch → settle → claim
```
- `closeEpoch(force)` reverts below **k-anonymity** (`K_MIN = 3`) so sub-k epochs never leak near-individual
  sums (the honesty limitation made an on-chain invariant; `force` only stages the deliberately-bad k=1
  demo exhibit).
- `executeEpoch` burns the pool's **own** pooled cUSD all-or-nothing (`unwrap`); `finalizeEpoch` releases
  it against the decryption proof and routes the plaintext aggregates through the **real FPMM** in one
  batch, asserting `plainYes + plainNo == released` — the hard on-chain spend bound. The pool holds all
  outcome tokens, so nothing position-shaped ever hits a user wallet.
- `settle` redeems all outcome tokens to a USDC pot after the oracle resolves, then fixes a **public**
  payout rate (`pot / winning-pool`) and re-wraps the pot to cUSD.
- `claim` pays winners `stakeWin * rateNum / rateDen` as **encrypted × public scalar** (`mul` then `div`
  on a trivially-encrypted rate — sidestepping FHE division-by-ciphertext). Your win stays yours to
  disclose. `refundEpoch` is the pre-execution escape hatch (rate = 1), sharing the same machinery.

### Notes
- `oracle` is a disclosed demo resolver (reality.eth is the production path).
- `kAnonymitySatisfied` demonstrates the k-gate as an encrypted `Nox.le` comparison + public `ebool`.
- ERC-1155 receiver hooks let the pool receive outcome tokens from `fpmm.buy`.

---

## Build & verify

```bash
npm run compile          # solc 0.8.35 — our contract only (CTF/FPMM are deployed, not recompiled)
npm run test:contracts   # 44 Hardhat tests — full confidential cycle + invariants I1–I5
npm run check-artifacts  # protocol-purity bytecode hash-check (I5) vs official artifacts
# Etherscan source-verify (NoxOraclePool has no npm verify script — verify directly):
npx hardhat verify --network sepolia 0xfFba9520699EC4161f41F9bD220e6ce7083d4a2E \
  <cUSD> <ConditionalTokens> <FPMM> <questionId> <oracleEOA>
```

License: MIT.
