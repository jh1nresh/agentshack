# Maiat Dojo — Historical Spec Index (April 27, 2026)

> Preserved planning snapshot, not current product or release status. Start with the
> [AgentShack README](../../README.md) and [documentation index](../README.md).
> Local `~/brain` references and dated PR statuses below are historical, not public links or current instructions.

---

## Active Product Direction

Dojo is now workflow-first:

> Creators publish agent workflows that others can run, fork, and monetize. Dojo clears each execution with settlement and reputation.

Current skills are one-step workflows. The API remains `/api/v1/run`; product work should move user-facing copy and data modeling toward workflows, fork lineage, execution receipts, and royalties.

| Spec | What | Status |
|---|---|---|
| `2026-04-27-agent-workflow-marketplace.md` | Workflow marketplace pivot: run/fork/monetize agent workflows, with execution reputation | draft |
| `2026-04-16-agent-commerce-protocol.md` | Tokenized capability interface + reputation-gated allocation | locked 2026-04-16 |
| `2026-04-13-reputation-clearing-loop.md` | Every execution produces a verifiable reputation record | draft |

---

## Reference: Phase 1 Foundation

### Trust + Identity (KYA ladder)
| Spec | What | Status |
|---|---|---|
| `2026-04-05-trust-verification-loop.md` | **Spec A.** Signal→Attestation→TrustScore→Discovery closed loop. Context doc. | draft |
| `2026-04-05-kya-onboarding.md` | KYA 0-2 ladder parent spec (high-level) | locked 2026-04-05 |
| `2026-04-05-kya-pr-a-identity-mint.md` | **Spec B (PR A).** KYA-0 eager ERC-8004 mint via Dojo relayer | draft |

### Gateway + Sessions (active skill runtime)
| Spec | What | Status |
|---|---|---|
| `2026-04-05-gateway-architecture.md` | Gateway forwarding architecture (creator endpoint registration, HMAC) | locked 2026-04-05 |
| `2026-04-05-agent-gateway-auth.md` | EIP-712 auth envelope for agent → gateway calls | locked 2026-04-05 |
| `2026-04-05-session-as-job-migration.md` | Session = ERC-8183 job model; prepaid escrow + per-call decrement | locked 2026-04-05 |

---

## Historical Product Specs

| Spec | What |
|---|---|
| `2026-04-04-dojo-business-model.md` | Business model — skill marketplace, Dojo 5% take rate. Superseded as top-level positioning by workflow marketplace. |
| `2026-04-04-dojo-card-ui.md` | Newspaper aesthetic card UI |
| `2026-04-04-dojo-phase1-pipeline.md` | Phase 1 shipping pipeline (may be superseded — check) |
| `2026-04-09-chat-first-ui.md` | Chat-first UI direction, superseded by marketplace landing / workflow surface |

---

## Planned Work

### Workflow Marketplace
- Workflow metadata model (input/output schema, steps, evaluator policy, SLA) — MVP implemented 2026-04-27
- Fork lineage and version history — MVP implemented 2026-04-27
- Workflow execution receipts — MVP implemented 2026-04-27
- Creator royalties on fork-derived runs
- Security workflow starter set — Quick Audit Workflow implemented 2026-04-27

### Reputation / Clearing
- Public reputation API backed by execution receipts
- Reputation-weighted workflow discovery
- Non-zero reputation gates for high-risk workflows

### KYA / Identity
- KYA-1 OAuth social handle binding
- KYA-2 veteran wallet verify
- KYA discovery ranking in catalog

---

## 📚 Related brain decisions (locked)

- `~/brain/wiki/projects/dojo/specs/2026-04-27-agent-workflow-marketplace.md` — workflow marketplace pivot
- `~/brain/wiki/decisions/2026-04-eas-on-chain-reviews.md` — EAS on Base = on-chain reviews
- `~/brain/wiki/decisions/2026-04-maiat-default-evaluator.md` — Maiat = default evaluator Phase 1
- `~/brain/wiki/decisions/2026-04-dojo-micro-evaluator-adapter.md` — session-as-job model
- `~/brain/wiki/decisions/2026-04-dojo-no-nft.md` — no skill NFT buy-once model
- `~/brain/wiki/decisions/2026-04-kya-creator-onboarding.md` — KYA 0-2 Phase 1 ladder
- `~/brain/wiki/projects/maiat/micro-evaluator-spec.md` — MicroEvaluator contract spec

## 🔗 Related PRs (erc-8183/hook-contracts)

- PR #10 — `AttestationHook` (EAS receipts for ACP job outcomes) — OPEN
- PR #14 — `MutualAttestationHook` (bilateral buyer↔seller reviews) — OPEN
- PR #6 — trust-based evaluator + trust gate hook + evaluator registry — OPEN

---

## Maintenance

When adding a spec: append under correct section + 1-line description + status.
When superseding: move entry to a `Superseded` section, link the replacement.
When superseding positioning: keep the old spec as historical, add the replacement under Active Product Direction, and mirror to `brain/wiki/projects/dojo/specs/`.
