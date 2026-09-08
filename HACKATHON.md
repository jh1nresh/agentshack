# AgentShack — The Smart Money Era

A BSC Testnet marketplace for discovering, inspecting and hiring curated BNB Agent Studio agents across all four main-track categories.

- Track: Main Track — Build the BNB Agent Studio Marketplace.
- Repository: https://github.com/jh1nresh/agentshack
- Public marketplace: https://www.agentshack.io/market
- Homepage: https://www.agentshack.io
- Network: BSC Testnet, chain ID 97. No mainnet hiring is offered.
- Rules: https://www.bnbchain.org/en/hackathons/smart-money-era
- Registration: https://forms.gle/9g9XPNFwnYaHAz9L8
- Official form build deadline: September 9, 2026, 12:00 UTC (20:00 Taiwan).
- Judging: September 9–23, 2026.

## Four categories, with explicit service limits

| Category | Agent / ERC-8004 ID | Available service | Limitation |
| --- | --- | --- | --- |
| Rebalancing | Studio Desk Rebalancer / 1880 | Reads PancakeSwap V3 pool and position data; returns a bounded rebalance proposal | No best-range, fee-return or continuous management guarantee |
| Grid Trading | Studio Desk Grid / 1881 | One bounded step on a fixed Pancake pair, with inventory and minimum-output limits | No profitability guarantee or claim of a measured trading track record |
| Yield Optimisation | Studio Desk Bounded Yield / 1882 | Bounded deposit/withdrawal at one verified Venus venue | Not a highest-APR search or cross-venue optimiser |
| Health Factor Monitoring | Studio Desk Risk Protection / 1883 | Venus liquidity/shortfall reads and a bounded repayment proposal | Liquidity/shortfall is not presented as a computed health-factor metric |

The marketplace lists third-party Studio Desk services. The descriptions above do not claim that AgentShack built those agents, that an agent card proves execution, or that receiving a proposal proves a DeFi transaction occurred.

## User journey

1. Open the homepage and select one of the four categories.
2. Search/select an agent, inspect its service, fee and limitations.
3. Open its setup page and connect a BSC Testnet wallet.
4. Request a signed quote. The server checks its canonical hash, signer, chain, agent, commerce contract, policy, fee token, selector and fee cap.
5. Approve the five wallet transactions: create job, register policy, set budget, approve exact fee, fund.
6. Request delivery. Retrying after confirmed funding only repeats the delivery notification in the current page session.
7. Inspect the seller response and transaction links. Record delivery and actual execution evidence separately.

The wallet needs testnet BNB for gas and the seller's quoted test $U token. The four currently listed fees total 0.0042 test $U, excluding gas. The app does not acquire tokens or send a private key to a server.

## Data and security

The server reads `getAgentWallet` and `tokenURI` directly from the fixed BSC Testnet ERC-8004 registry. For these curated data-URI identities, it verifies the chain, wallet, identity metadata and exact A2A/HTTP endpoints before fetching the agent card from `desk.rouma.online`. An unavailable indexer is not an activation dependency. Unknown identity, changed endpoint, malformed metadata or failed RPC reads disable activation.

Seller quotes use v1 flat JSON terms with lexicographically sorted keys, keccak256, and an EIP-191 signature over the raw hash. All four real signed responses are retained as public regression fixtures in `src/__tests__/fixtures/bnb-seller-quotes.json`.

External agent-card and seller-response bodies have a 100 KB streaming limit. Curated URLs are server-owned, redirects are rejected, and requests time out. No caller-supplied URL is accepted.

Identity and card liveness are not performance scores. No fabricated APR, win rate, transaction count, or delivery record is shown.

## Testnet contracts

| Role | Address |
| --- | --- |
| ERC-8004 registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Commerce | `0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE` |
| Router | `0xD7d36D66d2F1B608A0F943f722D27e3744f66F25` |
| Policy | `0xd6a4217588f6b1f5657a92a3e94e6422ad771cea` |
| Test $U | `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565` |

Use https://testnet.bscscan.com to inspect these addresses and each transaction.

## Verification and evidence status — September 8, 2026

- Direct onchain wallet/metadata reads: all four identities matched the curated configuration.
- Canonical agent cards: all four responded successfully.
- Real seller quotes: all four passed local schema, hash, signature, target and fee validation.
- Unit/property tests cover changed identities, endpoint paths, wrong chain/payment targets, modified quote terms, invalid signatures, fee bounds, malformed payloads, oversized streams and funded-job retry decisions.
- Funded-hire evidence: pending selection of the buyer wallet and its signatures. No new funded job or delivery is claimed by this document.
- Deployment must be confirmed against `/api/health` and the deployed commit; a successful build alone is not deployment evidence.
- Registration/submission confirmation: not found in the checked inbox. Confirm an existing response before submitting again.

For each category, record buyer address, job ID, quote hash, all five transaction hashes, seller response, and any resulting execution transaction. A response saying accepted/pending is not completed execution.

## Remaining submission boundaries

The official main-track eligibility says surfaced agents must be live on BSC; it does not explicitly settle whether a testnet-only entry qualifies. Ask the organizer to confirm. All four categories must also have enough functional depth for judging; the bounded services above are intentionally disclosed.

No Altana bounty qualification or TermiX Agent Advantage Report is claimed. The project does not claim official BNB adoption, a security audit, profitable trading, or mainnet readiness.

Before marking this entry submission-ready: verify the public deployment, complete and capture all four funded jobs, confirm main-track testnet acceptance, and retain the registration/submission confirmation.
