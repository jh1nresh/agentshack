# Contracts

[AgentShack overview](../README.md) · [Documentation](../docs/README.md)

Solidity sources and Foundry tests retained by AgentShack / Maiat Dojo. This directory is **not** the source of every third-party contract used by the BNB marketplace.

## Three distinct boundaries

| Surface | Configuration / source |
| --- | --- |
| Curated BNB marketplace | [`bnb-marketplace.ts`](../src/lib/bnb-marketplace.ts) and [`bnb-marketplace-activation.ts`](../src/lib/bnb-marketplace-activation.ts); chain 97, third-party registry/seller/commerce integration |
| Dojo receipt and settlement engine | [`contracts.ts`](../src/lib/contracts.ts); separate addresses and mainnet placeholders |
| Local Solidity code | [`src/`](src/): registry, job, reputation, token, royalty and swap components retained across product iterations |

Do not interchange these contract addresses. The [hackathon guide](../HACKATHON.md#testnet-contracts) documents the marketplace targets; source configuration remains authoritative.

## Build and test (no transactions)

Install Foundry and the exact dependency revisions pinned by the [CI workflow](../.github/workflows/ci.yml). In a fresh checkout, from the repository root:

```bash
git clone https://github.com/foundry-rs/forge-std.git contracts/lib/forge-std
git -C contracts/lib/forge-std checkout --detach 0844d7e1fc5e60d77b68e469bff60265f236c398
git clone https://github.com/OpenZeppelin/openzeppelin-contracts.git contracts/lib/openzeppelin-contracts
git -C contracts/lib/openzeppelin-contracts checkout --detach 5fd1781b1454fd1ef8e722282f86f9293cacf256
cd contracts
forge build --sizes
forge test -vv
```

If dependencies already exist, inspect their revisions and changes rather than overwriting them. `forge build` and this test suite are verification commands, not a deployment procedure. Use CI logs for current test counts.

## Deployment and operational safety

- [`foundry.toml`](foundry.toml) currently defines `bsc` and `bsc_testnet` RPC aliases.
- The root [Makefile](../Makefile) still has legacy Base deploy/interaction targets. They are not supported instructions for this marketplace.
- [`script/`](script/) contains state-changing deployment and seed scripts. No broadcast, signer/role change or settlement is authorized by following this README.
- Marketplace hires are approved by the user's BSC Testnet wallet. Mainnet entries in the retained Dojo configuration include zero-address placeholders and must not be presented as ready.
- The [release policy](../config/maiat-release-policy.json) separates app readiness from contract broadcast and chain writes.

## Security and historical references

[`audits/`](audits/) contains dated reports for specific code and review scopes. Their presence is not a current security certification, a formal third-party audit of the marketplace, or an audit of Studio Desk sellers.

The former Base deployment table, SkillNFT split descriptions and original audit claims are preserved in [legacy Base contract notes](../docs/archive/legacy-base-contracts.md), clearly separated from current setup.
