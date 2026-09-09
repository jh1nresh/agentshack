# Retained workflow integrations

[Overview](../README.md) · [Documentation index](README.md)

The repository contains two related surfaces:

- **AgentShack marketplace:** curated BNB agents, signed quotes and user-approved testnet jobs under `/market`. My agents (`/dashboard`) and Activity (`/activity`) use the same-browser journal.
- **Maiat Dojo workflow engine:** creator endpoints, API keys, session credits, workflow versions/forks and receipt-backed execution under `/api/v1/*` and `/api/workflows`.

The older `/create` builder remains available, but is no longer in the main marketplace navigation. Do not confuse a Dojo workflow receipt, browser job record or seller response with completed DeFi execution.

## REST entry points

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/services` | Public DB-backed runnable services; an empty result is not a demo fallback |
| `GET /api/v1/skills` | Older skill catalog |
| `GET /api/workflows` | Workflow-native catalog |
| `POST /api/v1/run` | API-key-authenticated workflow execution |
| `GET /api/v1/receipts/:receiptId` | Public receipt details |
| `GET /api/v1/balance` | Authenticated session-credit balance |
| `POST /api/workflows/:id/fork` | Authenticated draft fork with provenance |

Example read-only local catalog request:

```bash
curl http://localhost:3000/api/v1/services
```

Execution, publishing and forking are state-changing operations. The REST run API accepts a `service` slug; legacy `skill` input remains supported. Database receipts and optional asynchronous BSC anchoring are separate states, not an unconditional onchain-settlement guarantee.

## Creator tools

Use the repository's [creator CLI](../packages/dojo-cli/README.md) rather than assuming an npm release is available:

```bash
npm run dojo -- help
```

[`examples/dojo.workflow.yaml`](../examples/dojo.workflow.yaml) is the starter manifest. Markdown `SKILL.md` manifests with YAML frontmatter remain compatible. Production creator endpoints must be public HTTPS URLs.

`dev-key` creates/reuses a database API key and tops up demo credits; use it only with an intentionally disposable local database. Publishing, deployment and running a service may contact configured providers and write records. Check `DOJO_BASE_URL` and the manifest before running those commands.

The [MCP package](../packages/dojo-mcp/README.md) exposes service listing, execution and receipt tools over local stdio. Use a path to your own checkout; no maintainer-specific absolute path is required.

## Source pointers

- [`src/app/api/v1/`](../src/app/api/v1/) — gateway endpoints.
- [`src/app/api/workflows/`](../src/app/api/workflows/) — workflow discovery and mutations.
- [`prisma/schema.prisma`](../prisma/schema.prisma) — persistent models.
- [`src/lib/contracts.ts`](../src/lib/contracts.ts) — retained Dojo chain configuration, distinct from curated marketplace seller targets.

Historical NFA families, royalties and clearing-network proposals are design context, not promises that every described capability is live. See the [historical index](README.md#historical-material).
