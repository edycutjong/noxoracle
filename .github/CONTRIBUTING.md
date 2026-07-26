# Contributing

Thanks for your interest in improving NoxOracle! 🎉

NoxOracle is an npm-workspaces monorepo: Hardhat contracts + the
`@noxoracle/confidential-ctf` SDK live at the repo root, and the Next.js dApp
lives in `web/`.

## Getting Started
1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install dependencies (all workspaces): `npm install`
3. Copy the env template: `cp .env.example .env` (Sepolia only — never mainnet)
4. Compile + test: `npm run compile && npm run test:all`
5. Run the dApp: `npm run dev --workspace @noxoracle/web`

## Before You Open a PR
- `npm test` passes (134 pure-logic tests, vitest).
- `npm run test:contracts` passes (44 Hardhat tests — the full confidential cycle + I1–I5).
- `npm run lint --workspace @noxoracle/web` and `npm run typecheck --workspace @noxoracle/web` pass.
- `npm run e2e --workspace @noxoracle/web` passes (Playwright, demo mode — no wallet).
- Add or update tests for any behavior change.
- Keep commits conventional (`feat:`, `fix:`, `docs:`, `chore:`).

## Reporting Bugs / Requesting Features
Open an issue using the provided templates. Include repro steps, expected vs.
actual behavior, and environment details.
