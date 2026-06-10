# AnonZapRouter

![CI](https://img.shields.io/github/actions/workflow/status/RealWagmi/heyanon-zap-contracts/ci.yml?label=CI&logo=github)
![Solidity](https://img.shields.io/badge/Solidity-^0.8.28-363636?logo=solidity)
![Hardhat](https://img.shields.io/badge/Hardhat-3-f0d000?logo=hardhat)
![License](https://img.shields.io/badge/License-MIT-blue)
![Node](https://img.shields.io/badge/Node.js-≥20-339933?logo=node.js)

Universal on-chain zap router for executing multi-step DeFi operations in a single atomic transaction.

## Overview

AnonZapRouter is a generic step executor contract. The off-chain layer builds a sequence of steps — swap via DEX aggregator, provide liquidity to Curve/Balancer, deposit into Convex/Pendle — and the router executes them sequentially with dynamic balance patching between steps.

**Why?** Users interact with multiple DeFi protocols in one click: enter any token, get staked position. No manual multi-tx flows, no leftover dust, no partial failures.

**Key features:**
- **Generic execution** — not tied to any specific protocol; supports any target contract
- **Balance patching** — injects actual token balances into calldata at runtime via `StepToken`
- **Slippage protection** — enforces minimum output amounts on-chain
- **Separated approvals** — users approve a dedicated TokenManager; router upgrades don't require re-approvals
- **Pausable** — owner can pause execution in case of emergency

## Architecture

| Contract | Role |
|----------|------|
| **AnonZapRouter** | Receives `Order` + `Step[]`, executes steps sequentially, patches balances, enforces outputs |
| **AnonTokenManager** | Holds user approvals, pulls tokens into router on `executeOrder`. Immutable — deployed once by router's constructor |

## Deployed Contracts

### Ethereum

| Contract | Address | Explorer | Verification |
|----------|---------|----------|--------------|
| AnonZapRouter | `0x92fFfC66eA61104DFFb98F81096b937142E755e4` | [Etherscan](https://etherscan.io/address/0x92fFfC66eA61104DFFb98F81096b937142E755e4) | [Etherscan](https://etherscan.io/address/0x92fFfC66eA61104DFFb98F81096b937142E755e4#code) · [Blockscout](https://eth.blockscout.com/address/0x92fFfC66eA61104DFFb98F81096b937142E755e4#code) · [Sourcify](https://sourcify.dev/server/repo-ui/1/0x92fFfC66eA61104DFFb98F81096b937142E755e4) |
| AnonTokenManager | `0xd744a1f3F21889D121e74A3afF713BD051249634` | [Etherscan](https://etherscan.io/address/0xd744a1f3F21889D121e74A3afF713BD051249634) | [Etherscan](https://etherscan.io/address/0xd744a1f3F21889D121e74A3afF713BD051249634#code) · [Blockscout](https://eth.blockscout.com/address/0xd744a1f3F21889D121e74A3afF713BD051249634#code) · [Sourcify](https://sourcify.dev/server/repo-ui/1/0xd744a1f3F21889D121e74A3afF713BD051249634) |

### Base

TBD

## Development

```bash
# Install dependencies
pnpm install

# Compile contracts
pnpm compile

# Run unit tests
pnpm test

# Run fork tests (requires RPC URLs in .env)
pnpm test:fork:mainnet
pnpm test:fork:base

# Deploy
DEPLOY_RPC=https://... npm run deploy
```

### Environment

Copy `.env.example` to `.env` and fill in:

```bash
# ─── Fork ───────────────────────────────────────────────────
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# ─── Deployment ─────────────────────────────────────────────
DEPLOY_RPC=
DEPLOYER_PRIVATE_KEY=
DEPLOY_OWNER=

# ─── Verification ──────────────────────────────────────────
ETHERSCAN_API_KEY=
```

### Project structure

```
contracts/
├── AnonZapRouter.sol       # Main router contract
├── AnonTokenManager.sol    # Approval manager (deployed by router)
├── interfaces/             # Contract interfaces
└── mocks/                  # Test helpers

scripts/
├── deploy.mjs              # Deploy to any EVM chain
├── start-fork.mjs          # Start local fork with contracts
├── build-report.mjs        # CI build report generator
└── coverage-report.mjs     # CI coverage report generator

test/
├── unit/                   # Local network tests
└── fork/                   # Mainnet fork tests
```
