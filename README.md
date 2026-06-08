# heyanon-zap-contracts

Generic on-chain zap router for executing multi-step DeFi operations (swap, add liquidity, deposit/stake) in a single atomic transaction.

## About

AnonZapRouter is a universal step executor contract that allows combining arbitrary on-chain calls into one transaction. The off-chain layer builds a sequence of steps (swap via aggregator, provide liquidity, deposit into protocol), and the router executes them sequentially with dynamic balance patching between steps.

Key features:
- **Generic execution** — not tied to any specific protocol; supports any target contract
- **Balance patching** — injects actual token balances into calldata at runtime, enabling composable multi-step flows
- **Slippage protection** — enforces minimum output amounts on-chain
- **Separated approvals** — users approve a dedicated TokenManager, so router upgrades don't require re-approvals
- **Pausable** — owner can pause execution in case of emergency

## Testing

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
```

### Environment variables

Copy `.env.example` to `.env` and fill in the RPC URLs for fork testing:

```
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Test structure

```
test/
├── unit/           # Local network tests (no RPC needed)
│   └── AnonZapRouter.ts
└── fork/
    ├── mainnet/    # Ethereum mainnet fork tests
    └── base/       # Base mainnet fork tests
```
