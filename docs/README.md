# Documentation

[AgentShack overview](../README.md) is the public starting point. This index separates the current marketplace from the retained workflow engine and historical plans.

## Current guides

| Guide | Use it for |
| --- | --- |
| [Hackathon overview](../HACKATHON.md) | Four categories, service limits, testnet addresses and outstanding evidence |
| [Local development](development.md) | npm, PostgreSQL, Privy, checks and release boundaries |
| [Workflow integrations](workflows.md) | Older REST, creator CLI and MCP surfaces |
| [Contracts](../contracts/README.md) | Source boundaries, read-only Foundry verification and legacy deployment warnings |
| [Creator CLI](../packages/dojo-cli/README.md) | Local workflow manifest commands |
| [MCP server](../packages/dojo-mcp/README.md) | Local stdio tools and configuration |

## Configuration sources

- [Curated agents](../src/lib/bnb-marketplace.ts) and [seller quote targets](../src/lib/bnb-marketplace-activation.ts) define the marketplace's testnet integration.
- [Dojo chain configuration](../src/lib/contracts.ts) belongs to the retained receipt/settlement engine; do not substitute its commerce addresses into marketplace quotes.
- [Prisma schema](../prisma/schema.prisma), [package scripts](../package.json), [CI](../.github/workflows/ci.yml) and [release policy](../config/maiat-release-policy.json) define runtime/setup behavior.
- [Agent instructions](../AGENTS.md) and the [PR template](../.github/pull_request_template.md) describe engineering boundaries.

## Historical material

- [Marketplace visual baseline](design/agentshack-marketplace/README.md): approved black/yellow direction, with older fixture-based screenshots; not current runtime evidence.
- [April 2026 spec index](archive/spec-index-2026-04-27.md): preserved planning snapshot, including references to local-only notes.
- [Legacy Base contracts](archive/legacy-base-contracts.md): original deployment/architecture notes; not BSC instructions or current deployment proof.
- [Tracked specifications](../specs/) and [changelog](../CHANGELOG.md): historical plans and release notes. Check implementation and commit-bound evidence before treating claims as current.
- [Contract audit reports](../contracts/audits/): dated, scoped reports, not certification of the current marketplace or third-party sellers.

## Compatibility files retained

`package.json` and CI select npm. The older `pnpm-lock.yaml` is retained for history, not a second supported install procedure. This documentation change does not regenerate dependencies.

The root `Makefile` still contains legacy Base broadcast targets, while current Foundry aliases are BSC. Use the explicit read-only checks in the contract guide; do not use those deploy targets for the BNB marketplace.

Some `specs/` files were committed before that directory was ignored. Existing tracked files remain in Git; an ignore rule is not a privacy boundary. No local-only notes are imported by this documentation cleanup.
