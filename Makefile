.PHONY: help install compile test test-contracts test-all lint typecheck build e2e lighthouse security-scan verify-epoch

help:
	@echo "NoxOracle — make targets"
	@echo "  install        Install all workspaces (npm ci)"
	@echo "  compile        Compile contracts (Hardhat, solc 0.8.35)"
	@echo "  test           Pure-logic tests (@noxoracle/confidential-ctf, vitest)"
	@echo "  test-contracts Solidity tests — full confidential cycle + I1-I5 (Hardhat)"
	@echo "  test-all       vitest + Hardhat"
	@echo "  lint           ESLint the web dApp"
	@echo "  typecheck      tsc --noEmit on the web dApp"
	@echo "  build          Next.js production build (web)"
	@echo "  e2e            Playwright E2E (demo mode — no wallet, no env)"
	@echo "  lighthouse     Lighthouse CI audit (web)"
	@echo "  security-scan  npm audit + license check"
	@echo "  verify-epoch   Recompute I1-I5 from chain data (read-only)"

install:
	npm ci

compile:
	npm run compile

test:
	npm test

test-contracts:
	npm run test:contracts

test-all:
	npm run test:all

lint:
	npm run lint --workspace @noxoracle/web

typecheck:
	npm run typecheck --workspace @noxoracle/web

build:
	npm run build --workspace @noxoracle/web

# ── Advanced Testing & Security ─────────────────────────────
e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	npm run e2e --workspace @noxoracle/web

lighthouse:
	@echo "🔦 Running Lighthouse CI audit..."
	npm run lighthouse --workspace @noxoracle/web

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

verify-epoch:
	npm run verify-epoch 1
