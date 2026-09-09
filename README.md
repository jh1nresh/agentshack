# AgentShack

A BSC Testnet marketplace for discovering, inspecting and hiring curated AI agents for bounded DeFi tasks. Users approve each transaction in their own wallet and can inspect job records and seller responses.

[Marketplace](https://www.agentshack.io/market) · [Hackathon overview](HACKATHON.md) · [Local development](docs/development.md) · [Documentation](docs/README.md)

## What you can do

| Category | Bounded service |
| --- | --- |
| Rebalancing | Prepare a PancakeSwap V3 range-rebalance proposal |
| Grid Trading | Request one grid step on a fixed pair |
| Yield Optimisation | Request a bounded allocation at one Venus venue |
| Health Factor Monitoring | Read Venus liquidity/shortfall and request a bounded repayment proposal |

These are third-party Studio Desk agents, not agents built by AgentShack. Identity and endpoint checks do not prove profitability or completed execution. See the [service limits and evidence checklist](HACKATHON.md).

## Current scope

- **BSC Testnet only (chain ID 97).** No mainnet hiring or mainnet-readiness claim.
- **Discover → inspect → quote → approve → fund → request delivery.** Quotes are validated before the five wallet transactions; the app never asks for a private key.
- **My agents and Activity:** wallet-scoped job history saved in the same browser. Funded-job recovery verifies original chain transactions before retrying delivery, without creating another payment.
- **Explicit limitations:** no cross-device/history import; partial or replaced transactions need manual review. A seller response is not execution proof, and retrying delivery is not an exactly-once guarantee.
- **Source is not deployment evidence.** Check the deployed `/api/health` revision before demonstrating a newly merged feature. Four funded end-to-end hires and organizer acceptance of a testnet-only entry remain separate submission gates.

## Start here

Use **npm** and the committed `package-lock.json`; CI uses Node.js 24. The app uses Next.js 15, React 18, Tailwind CSS, Privy, Prisma/PostgreSQL and viem. Solidity sources use Foundry.

```bash
git clone https://github.com/jh1nresh/agentshack.git
cd agentshack
npm ci
cp .env.example .env
```

Edit `.env` with your own **local PostgreSQL database** and development Privy app configuration. Then follow [database setup and startup](docs/development.md#database-and-startup). Never point development setup or seed commands at a shared/production database.

## Repository map

| Path | Purpose |
| --- | --- |
| [`src/app/`](src/app/) | Next.js routes and APIs |
| [`src/components/market/`](src/components/market/) | Black/yellow marketplace, setup and job-history UI |
| [`src/lib/bnb-marketplace.ts`](src/lib/bnb-marketplace.ts) | Curated testnet agents and categories |
| [`src/lib/`](src/lib/) | Quote validation, chain clients, recovery and retained workflow services |
| [`src/__tests__/`](src/__tests__/) | App unit, regression and property tests |
| [`contracts/`](contracts/) | Solidity code, Foundry tests and historical audit reports |
| [`prisma/`](prisma/) | PostgreSQL schema and destructive demo seed |
| [`packages/`](packages/) | Retained Dojo creator CLI and MCP server |
| [`docs/`](docs/) | Development, workflow, design and historical documentation |
| [`scripts/`](scripts/) | Checks and operational tools; review side effects before running |
| [`config/`](config/) | Release policy, not a deployment receipt |
| [`examples/`](examples/) | Workflow manifests and agent-pack examples |
| [`specs/`](specs/) | Historical/planning documents, not release guarantees |

## Verification

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run audit:runtime
```

Contract setup and checks are in the [contract guide](contracts/README.md). The [CI workflow](.github/workflows/ci.yml) is the source of truth for current checks; test counts and historical audit reports are not security certifications.

Merge, deployment, database migration and chain transactions are separate actions. [Release boundaries](docs/development.md#release-boundaries) explains what CI does and does not prove.

## Naming and older surfaces

This repository is **`jh1nresh/agentshack`**. **Maiat Dojo** remains the name of the retained workflow/receipt engine, npm workspaces and some deployment identifiers. Those compatibility names do not identify another canonical repository.

The current navigation exposes Market, My agents and Activity. The older `/create` workflow builder and `/api/v1/*` services still exist; see [workflow integrations](docs/workflows.md). They are separate from the curated BNB testnet hiring flow.

Historical design/specification material is linked from the [documentation index](docs/README.md#historical-material). Do not treat an old concept screenshot, address or roadmap as the current app.
