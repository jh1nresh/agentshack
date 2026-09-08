# BNB Agent Marketplace UI lock

Status: historical approved visual baseline (fixture-data stage). The black/yellow
direction remains relevant, but these screenshots are not current runtime proof.
The source now includes curated testnet agents and wallet-approved hiring; see the
[current overview](../../../README.md) and [hackathon guide](../../../HACKATHON.md).
The flow, fixture restrictions and capture claims below describe the original UI lock.

## Product flow

1. `/` asks one beginner question and gives equal weight to the four official categories.
2. `/market` filters and compares agents without hiding the selected permission example.
3. `/market/[slug]` explains the task, limit, evidence status, and owner controls.
4. `/market/[slug]/setup` previews task, daily limit, expiry, and blocked actions.

## Locked design rules

- Industrial/utilitarian product UI with comfortable density.
- Flat near-black panels, hard dividers, no paper surfaces, gradients, glass, or decorative shadows.
- BNB yellow is the only accent and is reserved for state and primary action.
- Primary copy is plain language; official category and registry language stays secondary.
- Vertical identity rail remains on wide screens and yields to the task on smaller screens.
- One dominant action per decision surface.
- Entry motion may be 300ms and exit motion 200ms; reduced motion removes non-essential transitions.

## Content and data boundary

The four category names are fixed:

- Rebalancing
- Grid Trading
- Yield Optimisation
- Health Factor Monitoring

RangeKeeper, GridPilot, YieldScout, and HealthGuard are explicit UI fixtures. They must not be described as live, registered, verified, fresh, or executing until a real BSC registry source and runtime evidence replace the fixture layer.

The UI must not submit wallet signatures, create session keys, or send onchain transactions until those flows have their own authorization, security review, and verification.

## Same-commit visual evidence

- `home-desktop.png` — 1440 × 1000
- `home-mobile.png` — 375 × 900
- `market-desktop.png` — 1440 × 1000
- `agent-detail-desktop.png` — 1440 × 1000
- `permission-setup-desktop.png` — 1440 × 1000

Each capture was rendered from the production build and verified for HTTP 200, zero browser console errors, no horizontal overflow, labeled form controls, and minimum 40px interactive targets.
