# Maiat Dojo Agent Contract

Maiat Dojo is the app and contract execution layer for scoped agent work,
receipts, settlement, and reputation. AgentShack is a distribution/demo surface
for the same product line, not a second source of protocol truth.

## Required Brief

Before editing, record:

- user or ecosystem outcome
- acceptance criteria and failure fixture
- feature, repeated loop, or maintenance classification
- demand proof, pricing hypothesis, and distribution format, or `N/A`
- app, database, authorization, payment, settlement, and contract boundaries
- verification commands
- actions that require human approval

Do not implement an ambiguous trust claim, payment transition, evaluator rule,
or on-chain authority change.

## Engineering Loop

- Trigger: one scoped brief or GitHub issue.
- Durable state: issue/PR, tests, release-readiness receipt, and deployment
  receipt.
- Input boundary: task-relevant code and redacted fixtures only.
- Maker: engineering agent on an isolated branch.
- Checker: app CI, runtime audit, Foundry build/tests, review, and commit-aware
  production health.
- Feedback: deterministic failure, security finding, contract invariant, or
  production revision mismatch.
- Artifact: one atomic PR, one `maiat-release-readiness.json`, and one
  `maiat-delivery-receipt.json`.
- Convergence: all app and contract checks pass and production reports the
  exact merged commit under the approved release policy.
- Human approval: merge, database migration, production secret, Vercel/Railway
  setting, cron activation, chain switch, contract broadcast/verification,
  signer/role change, transaction, settlement, refund, and fund movement.
- Stop: unresolved auth/payment semantics, unsafe upgrade/admin authority,
  missing invariant test, mainnet placeholder address, unexpected active chain,
  revision mismatch, or three failed repair iterations.

## Verification

App:

```bash
npm ci
npx prisma generate
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run audit:runtime
```

Contracts:

```bash
cd contracts
forge build --sizes
forge test -vv
```

Auth, payment, settlement, wallet, contract, dependency, and public API changes
require a focused security receipt. Raw scanner output is only a lead until the
reachable path is reproduced or regraded.

## Delivery Boundary

CI never broadcasts a contract transaction. The main-branch readiness receipt
records successful app/contract checks and the current release policy. Vercel
may deploy the app independently; the delivery checker performs only
`GET /api/health` and requires the exact commit, approved active chain, and
mainnet-readiness state. It never touches the database, cron, signer, wallet,
chain RPC, or settlement route.

Use `scripts/ship.sh` only with an explicit file list. It opens a PR and cannot
merge. Never deploy, merge, publish, or perform an on-chain action without
explicit user approval at action time.
