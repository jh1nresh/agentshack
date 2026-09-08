# Legacy Dojo Base Contracts — Historical Notes

> Archived original documentation. Base addresses, broadcast commands, test counts
> and audit claims below are historical and are not verified current instructions.
> Do not execute the deployment examples for the BNB marketplace. Use the
> [current contract guide](../../contracts/README.md) instead.

On-chain contracts for the Maiat Dojo — Agent Skill Marketplace.

## Contracts

| Contract | Description |
|----------|-------------|
| **SkillNFT** | ERC-1155 skill tokens with USDC auto-split (85% creator / 10% platform / 5% reputation pool) |
| **SkillRoyaltySplitter** | Agent Services payment split (80% operator / 15% creator / 5% platform) |
| **ISkillNFT** | Shared interface for cross-contract reads |

## Deployments

### Base Sepolia (Testnet)

| Contract | Address |
|----------|---------|
| SkillNFT | [`0x52635F45b087c1059B3a997fb089bae5Db095B74`](https://sepolia.basescan.org/address/0x52635F45b087c1059B3a997fb089bae5Db095B74) |
| SkillRoyaltySplitter | [`0x98D34100F6030DFDc1370fB45dFa1Ad7980D4bD8`](https://sepolia.basescan.org/address/0x98D34100F6030DFDc1370fB45dFa1Ad7980D4bD8) |
| USDC (Circle testnet) | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

### Base Mainnet

TBD — deploy after testnet validation.

## Build & Test

```bash
cd contracts
forge build       # compile
forge test        # 56 tests (43 unit + 13 fuzz)
forge test -vvv   # verbose output
```

## Deploy

```bash
# Base Sepolia
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast

# Base Mainnet
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url base --broadcast
```

Optional: set `BASESCAN_API_KEY` in env and uncomment `[etherscan]` in `foundry.toml` for contract verification.

## Architecture

```
SkillNFT (ERC-1155 + ERC-2981 + ISkillNFT)
├── createSkill()     — Owner lists a skill (price, creator, royaltyBps, URI)
├── buySkill()        — Anyone pays USDC → auto-split → mint NFT
├── setSkillActive()  — Owner activates/deactivates
├── setFees()         — Atomic fee update (platform + reputation pool)
└── rescueTokens()    — Emergency fund recovery

SkillRoyaltySplitter
├── pay()             — Service payment → 80/15/5 split (operator/creator/platform)
│   ├── Operator must hold skill NFT (M-3)
│   ├── Skill must be active (L-4)
│   ├── Pull-then-push pattern (M-2)
│   └── MIN_AMOUNT enforced (Lead)
├── setFeeSplit()     — Adjust split (operator ≥ 50%)
└── rescueTokens()    — Emergency fund recovery
```

## Security

- **Audited** by Jensen (Slither + Trail of Bits skills) + Patrick (Pashov parallel 8-agent audit)
- 5 findings resolved (3 Medium + 2 Low) + 6 leads addressed
- Full audit reports: [`contracts/audits/`](../../contracts/audits/)
- ReentrancyGuard on all payment functions
- Pull-then-push pattern prevents USDC blacklist DoS
- Operator NFT ownership verified on every service payment

## Key Design Decisions

- **USDC only** — no native ETH, no oracle dependency, minimal attack surface
- **No funds held** — contract distributes immediately, nothing to steal
- **Atomic fee updates** — prevents non-atomic misconfiguration
- **MIN_PRICE / MIN_AMOUNT** — prevents dust/spam transactions
- **royaltyBps** is ERC-2981 only (secondary market); Agent Services uses global split
