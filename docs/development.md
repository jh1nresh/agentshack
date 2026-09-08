# Local development

[Overview](../README.md) · [Documentation index](README.md)

## Requirements

- Node.js 24 matches app CI; `package.json` permits Node.js >=20.9.0.
- npm (the repository declares npm 10.9.2) and `package-lock.json`.
- A disposable local PostgreSQL database. The Prisma provider is **PostgreSQL**, not SQLite.
- Your own development Privy app configuration for the wallet/auth UI. Without an app ID, the provider is disabled; do not treat a successful build as proof that connected screens work.
- Foundry only when working with the [Solidity sources](../contracts/README.md).

## Environment

After `npm ci`, copy the root [`.env.example`](../.env.example) to `.env` and replace its placeholders. `.env` is used here so both Prisma CLI and Next.js can load it.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Your disposable local PostgreSQL connection |
| `NEXT_PUBLIC_APP_URL` | Local application URL, normally `http://localhost:3000` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Public ID of your development Privy app |
| `PRIVY_APP_SECRET` | Private server credential for routes that verify Privy tokens; never expose it with a `NEXT_PUBLIC_` prefix |

Do not copy production credentials, relayer keys, settlement flags or another developer's `.env`. The marketplace targets are curated in source; changing a general RPC or contract environment variable does not configure a new supported marketplace chain.

`npm run dev` runs [`scripts/check-env.sh`](../scripts/check-env.sh) first. It checks `.env.local` before `.env`; if you already have both, inspect their configuration for conflicts. Do not bypass a database/configuration warning to force startup.

## Database and startup

Create the empty PostgreSQL database named in your local `DATABASE_URL` using your existing PostgreSQL installation. Confirm the URL points only to that disposable database before schema setup:

```bash
npx prisma generate
npx prisma db push
npm run dev
```

`db push` changes the configured database schema. It is not a production migration procedure. Open `http://localhost:3000/market`; wallet features need the development Privy configuration, and live cards/quotes need access to BSC Testnet RPC and the configured seller endpoints.

**Do not seed by default.** [`prisma/seed.ts`](../prisma/seed.ts) deletes existing users, agents, sessions, jobs, workflows, receipts and related records before creating the old demo catalog. `npm run seed` is only for a disposable demo database that you explicitly intend to replace. The curated BNB marketplace list is source-defined and does not require this seed.

My agents and Activity use wallet-scoped browser storage, not the old demo database. They do not import past transactions or other devices' history. Interrupted or uncertain transactions require inspection rather than automatic payment replay.

## Checks

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run audit:runtime
```

Focused marketplace checks:

```bash
npm test -- --run src/__tests__/bnb-marketplace-journal.test.ts src/__tests__/marketplace-navigation.test.ts
```

The runtime audit uses an existing advisory baseline; passing it does not mean zero vulnerabilities. CI runs its own install and Prisma generation. No real wallet login, funded transaction or live seller delivery is proved by unit/property tests.

## Repository conventions

- Keep root entry points short; current how-to guides belong in `docs/` and dated reference material in `docs/archive/`.
- Preserve `maiat-dojo`, `@maiat/dojo` and `@maiat/dojo-mcp` identifiers unless doing a separately scoped compatibility migration.
- Use npm; do not mix lockfile regeneration into unrelated work.
- Inspect scripts before running them. `seed`, mint/backfill, settlement, trust-setting and broadcast scripts can change data or chain state; they are not ordinary setup checks.
- Follow [AGENTS.md](../AGENTS.md) and keep unrelated work out of a PR.

## Release boundaries

1. Pull-request CI checks app and contracts. It does not deploy, sign or broadcast transactions.
2. Main-branch CI also creates `maiat-release-readiness.json` for an exact commit. This is a readiness record, not a production receipt.
3. An authorized deployment must be followed by a read-only `/api/health` check of the expected revision, active chain and mainnet-readiness state. See [delivery workflow](../.github/workflows/delivery.yml) and [release policy](../config/maiat-release-policy.json).

The health payload and some deployment identifiers still say Maiat Dojo. The configured delivery-policy URL may differ from a public AgentShack alias; verify the intended host and revision explicitly. Do not assume a merged commit automatically updated `www.agentshack.io`.

Mainnet placeholders, a testnet-only policy, or missing funded-job evidence are not resolved by a documentation change. Database migration, deployment, chain broadcast and settlement each need their own authorization.
