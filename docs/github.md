# GitHub Workflow

## Branch Model

We use a simplified two-branch model:

- **`main`** — production-ready code. Deployed contracts and audited versions live here. Only accepts merges from `dev` via pull request with at least 1 approval.
- **`dev`** — active development. Feature branches merge here via pull request with CI checks passing.

Feature branches follow the naming convention `feature/<short-description>` (e.g. `feature/add-withdraw-flow`).

### Why this model

Smart contracts are deployed infrequently and require high confidence. A stable `main` branch provides:
- A clear reference point for auditors
- A reliable source for deployment scripts
- Protection against accidental broken code reaching production

We intentionally skip `release/*` and `hotfix/*` branches (full Gitflow) because:
- The team is small (1-3 developers)
- Releases are manual and infrequent (contract deployments)
- The overhead of full Gitflow doesn't justify itself at this scale

### When to revisit

- **3+ active developers** — add required approvals on `dev`
- **Multiple deployed versions** — consider `release/*` branches
- **Frequent hotfixes needed** — add `hotfix/*` branching from `main`

## Pull Request Rules

### PRs to `dev`
- CI must pass (compile, lint, format, tests)
- No approval required (velocity for small team)
- Squash merge preferred (clean history)

### PRs to `main`
- CI must pass
- 1 approval required
- Stale approvals dismissed on new commits
- Squash merge only (linear history)
- Branch must be up-to-date with `main`

### PR title conventions

Use imperative mood describing what the PR does:
- `Add withdraw flow to AnonZapRouter`
- `Fix slippage calculation in multi-step routes`
- `Update Convex interfaces for new pool types`

## CI Pipeline

Defined in `.github/workflows/ci.yml`. Runs on every push to `main`/`dev` and on every PR targeting those branches.

### Steps

| Step | Command | Purpose |
|------|---------|---------|
| Compile | `npm run compile` | Verify contracts compile with solc 0.8.28 |
| Lint | `npm run lint` | Solhint checks for security patterns and gas optimizations |
| Format | `npm run format:check` | Prettier ensures consistent code style |
| Test | `npm run test` | Unit tests (local network, no RPC needed) |

### What blocks merge

A failed CI job blocks the PR from merging. All four steps must pass.

### Fork tests

Fork tests (`npm run test:fork`) are NOT part of CI because they require a mainnet RPC URL which would need a secret. They run locally by developers before major PRs to `main`.

## Code Quality Standards

### Solhint

Linter for Solidity. Configured in `.solhint.json` with `solhint:recommended` extended ruleset.

**Why solhint:**
- Catches common security anti-patterns (reentrancy, unchecked low-level calls)
- Gas optimization suggestions
- Lightweight, no external dependencies

**What we suppress:**
- `use-natspec` — too noisy for interfaces; will enable for core contracts in future
- `func-name-mixedcase` / `var-name-mixedcase` — external interfaces (Curve) use snake_case
- `no-inline-assembly` — required for balance patching mechanism
- `gas-strict-inequalities` — not always applicable

### Prettier + prettier-plugin-solidity

Auto-formatter. Configured in `.prettierrc`. Ensures uniform code style without manual effort.

**Settings:**
- 100 char line width
- 4 space indent
- No tabs

Run `npm run format` to auto-fix, `npm run format:check` to verify.

## Critical Analysis and Trade-offs

### What we intentionally skip

| Tool/Practice | Why skipped | When to add |
|---------------|-------------|-------------|
| **Slither** (static analysis) | Requires Python/Docker, complex CI setup | Before audit |
| **ESLint** for .ts test files | Tests are simple, low noise value | If test complexity grows |
| **Required approvals on `dev`** | Solo/small team, blocks velocity | At 3+ developers |
| **Gas reports in CI** | Adds time, not critical pre-audit | Before mainnet deployment |
| **Coverage enforcement** | Can add `hardhat coverage` later | Before audit |
| **Dependabot / Renovate** | Small dependency surface | When deps grow |

### Known risks of current setup

1. **No approval on `dev`** — a developer can merge broken code. Mitigated by CI checks.
2. **No fork tests in CI** — mainnet integration bugs won't be caught automatically. Mitigated by local testing discipline.
3. **Solhint warnings not errors** — gas optimizations are suggestions. Core security rules are errors.

### Security tooling roadmap

1. Current: Solhint (basic patterns)
2. Pre-audit: Add Slither, add coverage, add gas reports
3. Post-audit: Consider formal verification for core `_executeSteps` logic

## Onboarding for New Contributors

1. Clone the repo and install dependencies:
   ```bash
   git clone git@github.com:RealWagmi/heyanon-zap-contracts.git
   cd heyanon-zap-contracts
   npm install
   ```

2. Verify everything works:
   ```bash
   npm run compile
   npm run lint
   npm run format:check
   npm run test
   ```

3. Create a feature branch from `dev`:
   ```bash
   git checkout dev
   git pull
   git checkout -b feature/my-feature
   ```

4. Make changes, ensure CI passes locally, then push and create PR to `dev`.

5. For fork tests, create `.env` from `.env.example` and set your RPC URL:
   ```bash
   cp .env.example .env
   # edit .env with your Alchemy/Infura key
   npm run test:fork
   ```
