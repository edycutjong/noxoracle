# DEMO.md — runbook & video script

## Reproduce locally (no gas, ~2 min)

```bash
npm install
npm run compile
npm test                 # 134 pure-logic tests
npm run test:contracts   # 44 Solidity tests — full confidential cycle + I1–I5
npm run check-artifacts  # CTF/FPMM bytecode hash baseline (I5)
cd web && npm run dev     # the dApp at http://localhost:3000
```

The Hardhat suite runs the ENTIRE flow — 4 bettors commit privately, the epoch closes and reveals only
`YES 1,700 / NO 500`, the pool unwraps and buys on the real Gnosis FPMM, the oracle resolves NO, and
Dana claims a sealed payout — against the real cUSD wrapper + real CTF/FPMM on a transparent local Nox
mock. `test/Artifacts.test.js` proves the CTF/FPMM bytecode is byte-for-byte the official npm artifacts.

## Funded run (Sepolia — gated; NoxOracle ships last)

```bash
CONFIRM_SPEND=yes npm run deploy    # NoxOraclePool + unmodified CTF/FPMM (reuses live DemoUSD/cUSD)
CONFIRM_SPEND=yes npm run seed      # the 4-bettor cycle -> fixtures/demo-state.json
npm run verify-epoch 1              # recompute I1–I5 from chain data alone (read-only)
npm run bench                       # dual-encrypt / publicDecrypt / claim p50/p95
```

Estimated first-deploy cost ≈ 0.02 ETH (CTF ~2.5M + factory ~3.3M + pool ~2.2M + market/fund ~1M gas);
the seed cycle adds ≈ 0.01 ETH across the 5 funded actors. Every gas-spending script refuses to run
without `CONFIRM_SPEND=yes` and prints its plan otherwise.

## Video script (hard cap 4:00)

> **What's load-bearing:** the proof is the on-chain evidence — the four identical `commitBet` txs on Etherscan (calldata = two 32-byte handles each) and `noxoracle verify-epoch 1` recomputing I1–I5 from chain. The web bet-slip / position card / k-meter beats are the **illustrative preview** (the real confidential cycle runs via CLI + chain, not the browser). Show the UI for narrative, but cut to Etherscan + the CLI for every claim of proof.

- **0:00–0:30 Hook.** Four identical `commitBet` txs on Etherscan. "One of these four just bet against
  the crowd with size. Find them. You can't."
- **0:30–1:10 Market.** Real CTF/FPMM with the hash badges. Dana's slip: NO 500 → two sealed envelopes
  → commit. Calldata shows two 32-byte handles.
- **1:10–1:50 Epoch close.** Aggregates unseal (1,700 / 500); the four individual rows stay locked. Real
  FPMM buys execute (hashes on screen) with slippage guards.
- **1:50–2:30 Position + honesty.** Dana decrypts her own NO 500 (nobody else can). k-meter shown; the
  epoch-#0 exhibit — "here's when this is NOT private; we tell you."
- **2:30–3:10 Settle + claim.** Oracle resolves NO; the public rate is pot / winning-pool =
  1,626.13 / 500 → 3.25×; Dana claims — **1,626.13 cUSD, exactly the pot** (she was the only NO) —
  and it lands sealed in cUSD. Direction and size stayed hidden through and after settlement.
- **3:10–4:00 Verify.** `noxoracle verify-epoch 1` live: I1–I5 green. "Real market. Real privacy.
  Provably unmodified." Thanks + repo.

## Screens (web/)

`/` market + private bet slip (dual-handle → two sealed envelopes) · `/position` decrypt-your-own +
sealed claim · `/epoch` timeline, 4 identical commitments, aggregate reveal, FPMM buys · `/verify`
aggregate handles, verify-epoch block, CTF/FPMM hash badges, epoch-#0 exhibit, bench tiles.
