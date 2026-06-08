# Contract Clearing Hardening

> Status: Implementation spec
> Date: 2026-06-07
> Scope: `contracts/`

## Goal

Close the remaining contract audit leads that are required before mainnet-oriented clearing flows:

- prevent buyer self-refund after the gateway has started off-chain work;
- reject non-6-decimal payment tokens at contract construction;
- document the fee rounding policy explicitly.

## Decisions

### 1. Gateway lifecycle before refund

`SwapRouter` adds a gateway-only started state.

Flow:

```text
swap / executeSkill
  -> Pending
gateway markStarted(requestId)
  -> Started
gateway settle(success=true)
  -> Settled
gateway settle(success=false)
  -> Refunded
```

User `claimRefund` remains available only while the request is still `Pending` after `REQUEST_TTL`.

Rationale:

- Gateway must mark a request started before exposing the off-chain artifact.
- Once work has started, refunds require gateway settlement instead of unilateral buyer timeout.
- This is the smallest on-chain change that prevents "delivered work + timeout refund".

### 2. USDC decimal guard

Contracts that directly account USDC units reject payment tokens whose `decimals()` is not `6`.

In scope:

- `SkillRegistry`
- `SwapRouter`
- `SkillNFT`
- `SkillRoyaltySplitter`

Rationale:

- Prices and minimums are expressed in 6-decimal USDC units.
- Canonical address validation remains a deployment/preflight responsibility because canonical token addresses are chain-specific.

### 3. Fee rounding policy

Fee calculations continue to round platform/reputation/operator/creator basis-point shares down where currently implemented, and residual dust goes to the remainder recipient:

- `SwapRouter`: dust goes to creator.
- `SkillNFT`: dust goes to creator.
- `SkillRoyaltySplitter`: dust goes to platform as the remainder recipient.

Rationale:

- This preserves existing accounting behavior.
- The policy is explicit and covered by tests instead of implicit.

## Acceptance

- `claimRefund` reverts after `markStarted`, even after TTL.
- Gateway can settle a `Started` request as success or failure.
- Non-gateway cannot mark a request started.
- Constructors reject 18-decimal ERC20 mocks.
- Fee-dust policy has explicit tests.
- `forge build` passes.
- `forge test -vv` passes.
- `slither` has no new high-confidence finding.

## Out of Scope

- Operator authorization redesign.
- Chain-specific canonical USDC address allowlist inside contracts.
- Full dispute lifecycle.
- Mainnet deployment.
