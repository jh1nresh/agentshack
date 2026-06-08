# AgentShack Contract Security Review - 2026-06-07

## Scope

Reviewed the smart contract commerce layer under `contracts/src` plus deployment scripts, specs, and regression tests.

Primary files:

- `DojoJobRegistry.sol`
- `ReputationHub.sol`
- `SkillNFT.sol`
- `SkillRegistry.sol`
- `SkillRunToken.sol`
- `SwapRouter.sol`
- `SkillRoyaltySplitter.sol`

Methods:

- Pashov-style parallel Solidity audit agents
- Codex Security scoped threat model and diff review
- Trail of Bits style differential review
- Foundry build/test
- Slither static analysis

## Threat Model

Assets:

- USDC held for pending SwapRouter requests
- USDC held for pending royalty withdrawals
- SkillRegistry treasuries backing outstanding RUN_TOKEN supply
- RUN_TOKEN execution credits
- Creator/operator/platform/reputation payout accounting
- Gateway authority over request settlement
- Owner authority over router/oracle/emergency operations

Primary attackers:

- Untrusted buyers/agents opening, refunding, or redeeming requests
- Permissionless providers registering skills and setting prices/metadata
- Operators presenting transferable skill tokens as service authorization
- Compromised or delayed off-chain gateway
- Admin key compromise or admin operational mistake
- Non-canonical ERC20 deployment configuration

Critical invariants:

- Accounted escrow and pending withdrawals must be backed by contract USDC balance.
- A buyer should not need an undocumented second approval after buying RUN_TOKEN credits.
- Gateway settlement and user refund paths must not both be able to claim the same request.
- Router rotation must not strand existing token supply or silently unlock new drains.
- Payment token assumptions must match deployment reality.

## Confirmed Fixes Applied

### 1. RUN_TOKEN execution credits required hidden token approval

`SkillRunToken.burn` previously required allowance when the router burned a holder's token. `SwapRouter.executeSkill` and `SwapRouter.redeemRunToken` always call `burn(msg.sender, amount)` from the router, so a buyer could buy RUN_TOKEN credits and then fail to execute or redeem unless they had separately approved the router for RUN_TOKEN.

Fix:

- `SkillRunToken.burn` remains router-only but no longer requires ERC20 allowance.
- `SkillRunToken` now rejects a zero registry in the constructor.
- Tests now prove execution works with zero RUN_TOKEN allowance.

Files:

- `contracts/src/SkillRunToken.sol`
- `contracts/test/SkillRunToken.t.sol`
- `contracts/test/SwapRouter.t.sol`
- `contracts/test/AuditRegression.t.sol`

### 2. SwapRouter emergency rescue could sweep accounted USDC

`SwapRouter.rescueTokens(usdc, ...)` could transfer USDC that backs open requests or deferred pending withdrawals. This was owner-only, but it violated the escrow backing invariant and made an admin mistake or compromised owner materially harmful.

Fix:

- Added `totalEscrowed`.
- Added `totalPendingWithdrawal`.
- `rescueTokens` can rescue only USDC surplus above these liabilities.
- Tests cover open request backing and surplus-only rescue.

Files:

- `contracts/src/SwapRouter.sol`
- `contracts/test/SwapRouter.t.sol`

### 3. SkillRoyaltySplitter emergency rescue could sweep pending withdrawal backing

`SkillRoyaltySplitter.rescueTokens(usdc, ...)` could sweep USDC owed through `pendingWithdrawals`.

Fix:

- Added `totalPendingWithdrawals`.
- `withdraw` decrements aggregate liabilities.
- `rescueTokens` can rescue only USDC surplus above pending withdrawals.
- Tests cover pending withdrawal backing and surplus-only rescue.

Files:

- `contracts/src/SkillRoyaltySplitter.sol`
- `contracts/test/SkillRoyaltySplitter.t.sol`

### 4. SwapRouter timeout refund could race delayed off-chain delivery

`claimRefund` was purely time-based. If the gateway performed work but did not settle within `REQUEST_TTL`, the agent could refund and the later successful settlement would revert.

Fix:

- Added `RequestStatus.Started`.
- Added gateway-only `markStarted(requestId)`.
- `claimRefund` remains available only while a request is `Pending`.
- `settle` accepts both `Pending` and `Started` requests, so the gateway can still settle after it marks execution as started.
- Tests cover started success settlement, started failure refund, non-gateway calls, unknown requests, and timeout refund blocking after start.

Files:

- `contracts/src/SwapRouter.sol`
- `contracts/test/SwapRouter.t.sol`

### 5. Payment token decimals were implicit

The commerce contracts assumed 6-decimal USDC accounting but only deployment conventions enforced that assumption.

Fix:

- `SkillRegistry`, `SwapRouter`, `SkillNFT`, and `SkillRoyaltySplitter` now reject payment tokens whose `IERC20Metadata.decimals()` is not 6.
- Tests cover non-6-decimal constructor rejection.
- Canonical token address remains a deployment/preflight policy rather than an on-chain allowlist.

Files:

- `contracts/src/SkillRegistry.sol`
- `contracts/src/SwapRouter.sol`
- `contracts/src/SkillNFT.sol`
- `contracts/src/SkillRoyaltySplitter.sol`
- `contracts/test/mocks/Mock18DecimalsUSDC.sol`

### 6. Fee rounding dust policy was implicit

Fee division rounds down by default. The previous code did not state who receives the remainder.

Fix:

- Documented the protocol policy in code:
  - `SwapRouter` and `SkillNFT`: platform/reputation round down and creator receives the remainder.
  - `SkillRoyaltySplitter`: operator/creator round down and platform receives the remainder.
- Tests cover the dust recipient in each path.

Files:

- `contracts/src/SwapRouter.sol`
- `contracts/src/SkillNFT.sol`
- `contracts/src/SkillRoyaltySplitter.sol`
- `contracts/test/SwapRouter.t.sol`
- `contracts/test/SkillNFT.t.sol`
- `contracts/test/SkillRoyaltySplitter.t.sol`

## Remaining Findings / Leads

### A. Transferable ERC1155 ownership is the operator authorization primitive

`SkillRoyaltySplitter.pay` authorizes an operator by checking `balanceOf(operator, skillId) > 0`. Since skill NFTs are transferable, this is a transferable license model, not a provider-bound operator registry.

Status:

- Product/security design decision, not fixed here.

Recommended next fix:

- If operators must be approved executors rather than token holders, add provider-signed operator authorization or an operator registry.

## Static Analysis

`slither . --filter-paths 'lib|test|script|out|cache'`

No high-confidence exploitable issue found after fixes.

Remaining Slither output:

- `DojoJobRegistry` strict equality / timestamp existence checks: accepted existence sentinel.
- `ReputationHub.acceptOracle` timestamp timelock: intended delay check.
- `SkillRegistry.getSkill` timestamp detector false positive on address zero sentinel.
- `SkillRunToken` missing inheritance suggestion for local interface: hygiene only.
- Naming convention warnings in existing setter parameters.
- CREATE2 bytecode literal "too many digits" false positive.

## Verification

- `forge build` passed.
- `forge test -vv` passed: 172 tests.
- `git diff --check` passed.
- Slither rerun completed with only low-signal warnings listed above.
