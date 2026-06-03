# AgentShack Allowance-Backed Work Orders

> Status: Proposed product primitive
> Date: 2026-06-02
> Owner: JhiNResH
> Related: `2026-05-25-permissioned-workflow-install.md`, `2026-05-12-base-batches-reputation-clearing-network.md`, `2026-05-13-agent-family-schema.md`
> Sources: Solana Subscriptions & Allowances docs, Solana Subscriptions announcement, BNB Chain AI Agent Solutions

## PM Gate

Title: AgentShack Allowance-Backed Work Orders
Repo: `/Users/jhinresh/maiat-dojo`
Problem: Solana native Subscriptions & Allowances is a useful signal for AgentShack, but the product should not pivot into a Solana subscription marketplace.
Goal: Define the AgentShack primitive behind the signal: capped, revocable workflow budgets where each spend must clear through a receipt, evaluator verdict, and reputation update.
Acceptance criteria:
- The spec centers `Allowance-backed Work Orders`, not Solana integration.
- `Run once` maps to a capped one-time work budget.
- `Subscribe` maps to a capped recurring work budget.
- Every chargeable run requires receipt + evaluation.
- Solana is described as an optional future rail, not an MVP dependency.
- AgentShack/Maiat still owns work order, evaluator, receipt, refund/dispute, and reputation.
Verification: docs review plus `git diff --check`.
Harness: docs-only spec, no runtime harness.
State surface: repo spec + brain mirror.
Execution surface: no code execution path changed.
Feedback signals: consistency with existing AgentShack README/specs and Solana/BNB public docs.
Convergence condition: spec can guide future UI/API implementation without changing DB, contracts, or payment API today.
Human boundary: do not submit Solana incubator forms, deploy contracts, create credentials, or move funds.
Risk: treating a payment primitive as the whole product direction.
Security scan receipt: N/A, docs-only.
Skillification route: N/A for v0.
Out of scope: DB schema, Prisma migration, contracts, payment API implementation, wallet UX, chain deployment, verifier network.
Do not touch: existing BNB/BSC clearing code, ERC-8183 contracts, production payment rails.
Suggested labels: `spec`, `agentshack`, `payments`, `work-orders`.
Owner: JhiNResH.
Follow-up worker: implementation worker after product approval.

## Decision

AgentShack should absorb the Solana signal as a product primitive:

```text
Allowance-backed Work Orders
```

Not:

```text
Solana subscription marketplace
```

The key idea is that a buyer can grant a trusted agent workflow a capped, revocable work budget. The agent/workflow may operate inside that budget, but each chargeable run must produce:

```text
work order -> execution trace -> evaluator verdict -> receipt -> settlement outcome -> reputation update
```

This preserves the AgentShack/Maiat thesis:

```text
Allowances let agents spend.
Maiat makes them accountable.
```

## Why This Matters

Plain subscriptions sell access:

```text
monthly charge -> access
```

Agent workflows do work on behalf of the buyer. That requires a stronger loop:

```text
monthly budget authorization
-> workflow executes
-> delivery is evaluated
-> PASS creates cleared receipt
-> settlement/reputation updates
-> bad outcomes can refund, dispute, or auto-pause
```

This is the difference between SaaS billing and agent-native commerce.

## Core Primitive

```ts
type AllowanceBackedWorkOrder = {
  allowanceId: string;
  buyerId: string;
  workflowId: string;
  operatorId: string;
  budgetCap: number;
  period: "once" | "daily" | "weekly" | "monthly";
  perRunMax: number;
  requiredEvaluatorPolicy: string;
  settlementRule: "pay_on_pass" | "reserve_then_refund" | "manual_review";
  autoPauseRule?: "pause_after_1_failure" | "pause_after_2_failures" | "manual_only";
};
```

The moat is not the allowance itself. The moat is deciding:

- who deserved to get paid;
- which workflow kept passing;
- which operator failed;
- which allowance should pause;
- which workflow earned better reputation or pricing.

## Flow 1: Run Once With Cap

Use case:

```text
"Run this PR review once, max $10, pay only if evaluator passes."
```

Lifecycle:

```text
1. Buyer selects an AgentShack service.
2. AgentShack shows capability manifest, expected artifact, evaluator policy, and max cost.
3. Buyer grants a one-time budget cap.
4. AgentShack creates a work order.
5. Agent/service executes the task.
6. Evaluator checks artifact, delivery, format, SLA, and risk policy.
7. AgentShack writes a receipt:
   - allowanceId
   - budgetCap
   - perRunMax
   - actualCost
   - evaluatorVerdict
   - artifactRefs
   - clearingStatus
8. PASS can settle under the cap.
9. FAIL creates no-charge, refund, dispute, or manual-review state.
10. Reputation updates from the evaluated receipt, not from the payment alone.
```

Product copy:

```text
Run once with a spending cap.
The agent only earns payment if the work clears evaluation.
```

## Flow 2: Recurring Evaluated Work

Use case:

```text
"Every week, spend up to $50 on lead research; pause after two failed runs."
```

Examples:

- weekly lead research up to $50;
- monthly GitHub PR reviews up to $200;
- bounty search where each qualified bounty pays $5;
- merchant support workflow where only evaluator-PASS work orders settle.

Lifecycle:

```text
1. Buyer starts with a successful run-once receipt.
2. Buyer upgrades the workflow to a recurring allowance.
3. AgentShack records:
   - budget cap
   - period
   - per-run max
   - evaluator policy
   - settlement rule
   - auto-pause rule
4. Each run creates a new work order.
5. Each completed run creates a receipt.
6. PASS can settle inside the allowance.
7. FAIL can refund, dispute, or count toward auto-pause.
8. Reputation is derived from cleared receipts, not from subscription existence.
```

Product copy:

```text
Set a recurring budget for trusted agent work.
Every spend still needs a receipt and evaluator verdict.
```

## Run-Once To Recurring Upgrade

The default AgentShack path should be:

```text
Run once
-> inspect receipt
-> trust workflow
-> grant limited recurring budget
-> receipts compound reputation
```

Do not ask users to subscribe before they see a successful cleared run.

## What AgentShack Owns

AgentShack/Maiat must own:

- service discovery;
- permission/capability manifest;
- work order creation;
- endpoint/service routing;
- evaluator policy;
- execution trace and artifact refs;
- receipt guarantee;
- refund/dispute semantics;
- reputation rollups;
- auto-pause rules;
- lineage and royalty accounting for fork/license flows.

Without these, AgentShack becomes a payment wrapper instead of a clearing layer.

## What Payment Rails Own

Payment rails only provide authorization and settlement evidence:

- offchain credits;
- Base/EVM authorization;
- Stripe/manual billing;
- BNB/x402/ERC-8183 settlement;
- Solana fixed delegation;
- Solana recurring delegation;
- Solana subscription plans.

Do not put evaluator policy, reputation logic, or full clearing semantics into a payment rail in v0.

## Solana Interpretation

Solana's Subscriptions & Allowances are useful because they make this primitive concrete:

```text
user grants capped delegated spend
agent operates within budget
authorization can expire, renew, pause, or revoke
```

But MVP does not require Solana. AgentShack can test the product loop with offchain credits, Base, BNB, Stripe, or manual billing before implementing a Solana adapter.

## BNB Compatibility

BNB remains the first clearing/accountability path:

```text
ERC-8004 = agent identity
ERC-8183 = agent commerce, escrow, delivery verification, evaluator attestation
x402 = per-call autonomous payment
AgentShack = the product surface and receipt/reputation loop
```

Solana improves budget authorization and recurring billing. It does not replace the BNB path.

## Minimum Metadata

Future implementation can add generic allowance metadata first:

```ts
type WorkAllowanceMetadata = {
  allowanceId: string;
  rail: "db_credit" | "stripe" | "base" | "bsc_erc8183" | "solana_fixed_allowance" | "solana_subscription";
  buyerRef: string;
  operatorRef: string;
  budgetCap: string;
  perRunMax: string;
  period: "once" | "day" | "week" | "month" | "year";
  requiredEvaluatorPolicy: string;
  settlementRule: "pay_on_pass" | "reserve_then_refund" | "manual_review";
  autoPauseRule?: string;
  externalAuthorizationRef?: string;
  externalTxRef?: string;
};
```

Receipt linkage:

```text
WorkflowRunReceipt.provenance.externalRefs[]
or a future paymentRail / allowance metadata field
```

## Implementation Plan

Do not start with Solana contracts.

Suggested next PRs:

1. Add service-mode UI copy:
   - `Run once with cap`
   - `Set recurring budget`
   - `Fork / License`
2. Add docs/API labels only:
   - `allowance_backed_work_order`
   - `pay_on_pass`
   - `auto_pause_on_failures`
3. Add demo-only allowance metadata to receipts.
4. Add an API draft for creating an allowance-backed work order.
5. Only after UX is clear, implement a Solana devnet adapter for fixed delegation proof ingestion.

## Non-Goals

- No full Solana clearing network in v0.
- No Solana-only product pivot.
- No subscription marketplace.
- No delegated spending DeFi product.
- No verifier staking system in v0.
- No cross-chain light client.
- No contract deployment.
- No migration away from BNB.
- No hidden recurring billing without explicit user authorization.
- No unlimited agent wallet access.

## Pitch

```text
AgentShack lets buyers grant capped recurring budgets to trusted workflows,
but every spend must clear through Maiat receipts, evaluator verdicts, and reputation.
```

Shorter:

```text
Allowances let agents spend. Maiat makes them accountable.
```

## Open Questions

- Should `pay_on_pass` be the default settlement rule?
- Does recurring billing pay for access, included jobs, or cleared receipts only?
- Which MVP rail should test allowance-backed work orders first: DB credits, Base, BNB, Stripe, or Solana devnet?
- What wallet UX best explains allowance without scaring non-crypto users?
