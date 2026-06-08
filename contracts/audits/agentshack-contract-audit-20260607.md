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

## Remaining Findings / Leads

### A. SwapRouter timeout refund can race delayed off-chain settlement

`claimRefund` is purely time-based. If the gateway performs or exposes work but does not settle within `REQUEST_TTL`, the agent can refund and the later successful settlement reverts.

Status:

- Not fixed in this patch because a correct fix changes the gateway lifecycle protocol.

Recommended next fix:

- Add an execution lifecycle state such as `Started`, set by gateway before delivery, or require gateway-signed refund authorization after TTL.
- Alternatively, settle on-chain before exposing the artifact to the requester.

### B. Payment token assumptions depend on canonical USDC

`SkillRegistry`, `SwapRouter`, `SkillNFT`, and `SkillRoyaltySplitter` assume standard non-deflationary USDC semantics. A fee-on-transfer or rebasing token would break nominal-amount accounting.

Status:

- Deployment scripts default to BSC testnet USDC and tests use 6-decimal mocks.
- No generic token support should be claimed.

Recommended next fix:

- Enforce canonical USDC addresses per chain or require `IERC20Metadata.decimals() == 6` where that is the intended unit.
- Add deployment preflight checks for token decimals and canonical addresses.

### C. Fee rounding dust goes to creator

For low prices that are not divisible cleanly by basis points, platform and reputation shares round down and the remainder goes to creator.

Status:

- Low impact at current USDC base-unit scale.
- Treat as protocol policy unless the product wants every dust unit to favor the platform/reputation pool.

Recommended next fix:

- Explicitly document dust-to-creator policy or switch fee calculations to protocol-favoring rounding.

### D. Transferable ERC1155 ownership is the operator authorization primitive

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
- `forge test -vv` passed: 160 tests.
- `git diff --check` passed.
- Slither rerun completed with only low-signal warnings listed above.

