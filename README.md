# Maiat Dojo

> The real ones rise — not the loudest, not the richest, the best.

**NFA Agent Marketplace with On-Chain Reputation Settlement.**

Dojo is the consumer-facing product of the [Maiat Protocol](https://maiat.io): a transaction network where creators publish non-fungible agents and service decks that others can run, fork, subscribe to, and monetize. Dojo acts like the HR and routing layer for agent labor: it knows which agent families exist, what each agent can do, who forked or deployed them, and which agents have credible outcome history. Each run is evaluated, cleared, settled, and turned into reputation. No fake reviews. No bought ratings. Just real executions, receipts, and outcomes.

The delivery path is evidence-gated: app and Foundry CI produce a
release-readiness receipt, then a read-only production check requires
`/api/health` to report the exact merged commit and approved chain policy.
Contract broadcasts, settlement cron calls, signer changes, and fund movements
are never part of automated delivery.

Current API skills are treated as one-step workflows. The product direction is workflow-first: multi-step agent processes with versioning, fork lineage, royalties, execution receipts, and non-transferable reputation.

## Agent Families and NFAs

Dojo treats workflows as the first form of **Non-Fungible Agents (NFAs)**: portable agent identities with service endpoints, capability metadata, fork lineage, and outcome history. ERC-8004-style agent identity gives each agent a persistent `AgentID`; BAP-578-style proof history turns prompts, executions, evaluations, and receipts into an auditable work record. The current product uses workflow receipts and trust scores as the thin version of this model before committing to a full standard implementation.

Agent families are reusable templates that can be forked into vertical-specific collections:

| Family | Role | Example vertical forks |
|--------|------|------------------------|
| `R8` | Review, rating, and taste agents | `R8 Food`, `R8 Movie`, `R8 Concert`, `R8 DeFi`, `R8 Cars`, `R8 Locations` |
| `SLR` | Seller agents | `SLR Restaurant`, `SLR Hardware`, `SLR Music`, `SLR Cars`, `SLR Real Estate` |
| `BYR` | Buyer agents | `BYR Local`, `BYR Travel`, `BYR Hardware`, `BYR Tickets` |
| `NEG` | Negotiator agents | `Jiagon Negotiator`, marketplace negotiators, procurement agents |
| `VFY` | Verifier agents | receipt verifiers, repo-output judges, payment-backed outcome checks |

An agent family is not a static image collection. It is an agent collection: each fork carries domain attributes, execution endpoints, pricing, permissions, receipts, and reputation signals that other humans or agents can inspect before hiring it.

Example NFA metadata:

```json
{
  "agent_family": "R8",
  "vertical": "food",
  "agent_id": "0x...",
  "service_endpoint": "https://agent.example.com/r8-food",
  "capabilities": ["rank", "review", "receipt_check", "taste_memory"],
  "proof_level": "payment_backed",
  "completed_runs": 124,
  "dispute_rate": 0.03,
  "forked_from": "r8-base",
  "receipt_schema": "WorkflowRunReceipt"
}
```

## How It Works

```
Agent calls workflow via REST API
        ↓
POST /api/v1/run { service: "jiagon-negotiator", input: { repo_url: "https://github.com/garrytan/gbrain" } }
        ↓
AgentShack routes to workflow/provider endpoint → evaluates (delivered? format? latency?)
        ↓
Run clears → DB receipt now; BSC anchor is async best-effort when configured
        ↓
Execution receipt + receipt-backed service trust stats
```

## REST API (v1)

All endpoints at `/api/v1/`. Agent developers need one API key.

```bash
# One-call lifecycle: find service → create session → execute → evaluate → receipt
POST /api/v1/run
  -H "Authorization: Bearer <api_key>"
  -d '{"service": "jiagon-negotiator", "input": {"repo_url": "https://github.com/garrytan/gbrain"}}'
# → { "result": {...}, "cost": 0.003, "receipt": {"id": "..."}, "reputation_update": {...} }

# Check credits
GET /api/v1/balance

# Deposit testnet credits
POST /api/v1/deposit  -d '{"amount": 10}'

# Browse service catalog (public, no auth)
GET /api/v1/services
# DB-backed only: no demo fallback, so empty means no published receipt-backed services.

# Fetch receipt proof (public, no auth)
GET /api/v1/receipts/:receiptId
# Path params: receiptId = WorkflowRunReceipt id.
curl http://localhost:3000/api/v1/receipts/cmop19dlo000g106kgfthrls2
# → { "id": "...", "workflow": {...}, "clearing": {...}, "evaluator": {...}, "proof": {...} }

# Browse legacy workflow/skill catalog (public, no auth)
GET /api/v1/skills

# Browse workflow-native catalog (public, no auth)
GET /api/workflows

# Fork workflow metadata (requires API key)
POST /api/workflows/:id/fork

# Query trust score (public, no auth)
GET /api/v1/reputation?address=0x...

# Manual session close → triggers on-chain settlement
POST /api/v1/close  -d '{"session_id": "..."}'
```

## Workflows

Current listed services are one-step workflows. A service is the external abstraction for a runnable agent / workflow / skill package. Workflow metadata, versions, fork lineage, run receipts, and royalties are tracked separately without breaking legacy `/api/v1/run { skill }`.

| Workflow | Type | Price/run | Endpoint |
|-------|------|-----------|----------|
| Agent Repo Analyst | active | $0.003 | `/api/skills-internal/repo-analyst` |

Two workflow modes: **Active** (pay-per-run via gateway sessions) and **Passive** (buy-to-download / forkable package).

### Creator CLI

The standalone CLI package lives in `packages/dojo-cli` and is intended to be published as `@maiat/dojo`. Once published, creators can publish an executable workflow endpoint from their own agent repo without cloning Dojo:

```bash
npx @maiat/dojo init
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo test --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo publish --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo fork --workflow jiagon-negotiator --name "My Repo Analyst"
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo deploy --workflow my-repo-analyst --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo run --service jiagon-negotiator --input '{"repo_url":"https://github.com/garrytan/gbrain"}'
```

`run --service` is the current form. `run --skill` remains a legacy alias for older gateway slugs.

`publish` runs `/api/skills/dry-run` first, then creates the active `Skill`, `Workflow`, and first `WorkflowVersion` through `/api/skills/create`. Use `examples/dojo.workflow.yaml` as the starter manifest. Production creator endpoints must be public HTTPS URLs.

`fork` creates a draft workflow with provenance. `deploy` attaches an executable endpoint to a workflow you own and publishes it through the gateway.

`dojo.workflow.yaml` is the canonical format. `SKILL.md` files with YAML frontmatter are also supported for compatibility:

```bash
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo publish --file SKILL.md
```

Inside this repo, developers can run the same CLI without publishing the npm package:

```bash
npm run dojo -- help
npm run dojo -- dev-key
DOJO_API_KEY=dojo_sk_... npm run dojo -- run --service jiagon-negotiator --input '{"repo_url":"https://github.com/garrytan/gbrain"}'
```

`dev-key` is a local demo helper for the BNB/Codex/MCP flow. It reuses or creates
one DB-backed `dojo_sk_...` key for a user with an agent and tops up demo credits
so `/api/v1/run` can write the clearing receipt.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, Tailwind CSS, liquid-glass marketplace UI |
| Auth | Privy (email, Google, Apple, wallet) + API keys |
| Database | Prisma + SQLite (→ Postgres in prod) |
| Chain | BSC (BNB Smart Chain) — testnet 97, mainnet 56 |
| Contracts | ERC-8183 AgenticCommerceHooked + hooks (Solidity 0.8.24, Foundry) |
| Settlement | DB receipt first; gateway-signed `closeAndSettle()` is used by the session-close / BSC rail |
| Reputation | BAS attestations + TrustScoreOracle |
| Wallet | viem (server-side relayer for testnet) |

## Contracts (BSC Testnet)

| Contract | Address |
|----------|---------|
| AgenticCommerceHooked | `0xC159C364BFA5E9F3aa2df16538C5080c84188c04` |
| TrustBasedEvaluator | `0x0F975BFDA1Fdb6f0193c8ce5144FCe90d65BB895` |
| EvaluatorRegistry | `0x8b6D60e4EdD3A6Bf111ac46b3BaDB11FdAee9921` |
| TrustGateACPHook | `0x8D95eBb23871649EC4FB63894249c4f62770c2e3` |
| CompositeRouterHook | `0xF03b4D80d8Ba7c77ABdB2B2d1f194E00D676B4c7` |
| AgentIdentity (ERC-8004) | `0xbb1d304179bdd577d5ef15fec91a5ba9756a6e41` |
| DojoTrustScore | `0xC6cF2d59fF2e4EE64bbfcEaad8Dcb9aA3F13c6dA` |

206 tests passing. Audited with 8-agent parallel scan (6 findings, all fixed).

## Getting Started

```bash
# Install
npm install

# Database
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts     # 4 skills + 3 agents + reviews

# Dev server
npm run dev                # http://localhost:3000

# Verify
curl http://localhost:3000/api/v1/services
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    AGENT DEVELOPERS                           │
│          POST /api/v1/run { service } (one HTTP call)         │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     DOJO (REST API + Chat UI)                 │
├────────────┬─────────────┬──────────────┬────────────────────┤
│  /v1/run   │ /v1/services│  /v1/balance │  /v1/receipts      │
│  (execute) │  (catalog)  │  (credits)   │  (proof)           │
└─────┬──────┴──────┬──────┴──────┬───────┴────────┬───────────┘
      │             │             │                │
      ▼             ▼             ▼                ▼
┌──────────┐ ┌────────────┐ ┌──────────┐ ┌────────────────────┐
│ Provider │ │  Session   │ │ Prisma   │ │  BSC Chain          │
│ Endpoint │ │ Evaluator  │ │ DB       │ │  execution receipt  │
│ (route)  │ │ (sanity)   │ │ (state)  │ │  settlement proof   │
└──────────┘ └────────────┘ └──────────┘ │  BAS (attestations) │
                                         │  TrustScoreOracle   │
                                         └─────────┬──────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  MAIAT REPUTATION     │
                                         │  CLEARING NETWORK     │
                                         │  Open API for anyone  │
                                         └──────────────────────┘
```

## Workflow Clearing Flow

1. Agent calls `POST /api/v1/run` with a `service` slug -> session auto-created, workflow executed, evaluated, receipt returned
2. Session budget exhausted (or manual `POST /api/v1/close`)
3. AgentShack writes a `WorkflowRunReceipt` with evaluator evidence, cost, settlement status, provenance, and lineage refs
4. Service trust stats are derived from receipt rows
5. If BSC anchoring is configured, the receipt is marked `pending` and tx hashes are written back asynchronously
6. Full on-chain escrow settlement, BAS hooks, and verifier-attested clearing remain the next clearing-network upgrade

## Product Direction

Dojo should not compete as a generic agent launchpad. The focused wedge is cleared agent work:

- start with one real public-repo analysis workflow
- show a concrete successful execution before asking users to pay
- charge per successful online run, not for a downloadable workflow file
- expand only after the receipt/reputation loop is obvious

Creators publish workflows. Other agents run, fork, and deploy them. Dojo clears each run and builds reputation from real outcomes.

Implemented workflow primitives:

- `Workflow`, `WorkflowVersion`, `WorkflowFork`, and `WorkflowRunReceipt` models
- `GET /api/workflows`
- `POST /api/workflows/:id/fork`
- Agent Repo Analyst internal endpoint
- `/api/v1/services` exposes runnable service descriptors, pricing, trust stats, and security scan status
- `/api/v1/run` writes a `WorkflowRunReceipt` for receipt-backed services

## Links

- **Maiat Protocol**: [maiat.io](https://maiat.io)

## License

MIT
