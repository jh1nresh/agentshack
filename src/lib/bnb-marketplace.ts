export const BNB_TESTNET_CHAIN_ID = 97 as const;
export const BNB_TESTNET_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
export const BNB_TESTNET_EXPLORER = "https://testnet.bscscan.com" as const;

export const BNB_AGENT_CATEGORIES = [
  { slug: "rebalancing", name: "Rebalancing", action: "Manage liquidity", description: "Keep a PancakeSwap V3 position inside explicit bounds." },
  { slug: "grid-trading", name: "Grid Trading", action: "Run grid trades", description: "Run one bounded grid step on a fixed PancakeSwap pair." },
  { slug: "yield-optimisation", name: "Yield Optimisation", action: "Improve yield", description: "Allocate a bounded amount to one verified Venus venue." },
  { slug: "health-factor-monitoring", name: "Health Factor Monitoring", action: "Protect borrowing", description: "Read Venus liquidity and shortfall before a bounded repayment." },
] as const;

export type BnbAgentCategorySlug = (typeof BNB_AGENT_CATEGORIES)[number]["slug"];
export type RegistryStatus = "checking" | "live" | "unavailable";

export type BnbMarketplaceAgent = {
  slug: string;
  initials: string;
  name: string;
  category: BnbAgentCategorySlug;
  protocol: string;
  summary: string;
  task: string;
  cannotDo: string;
  risk: "Low" | "Medium";
  controls: readonly string[];
  chainId: typeof BNB_TESTNET_CHAIN_ID;
  agentId: number;
  registryAddress: typeof BNB_TESTNET_REGISTRY;
  agentWallet: `0x${string}`;
  agentCardUrl: string;
  sellerApiBaseUrl: string;
  selector: string;
  feeLabel: string;
  maxFeeAmount: string;
  registryStatus: RegistryStatus;
  endpointStatus: RegistryStatus;
  registryUpdatedAt: string | null;
  createdTxHash: `0x${string}` | null;
};

/** Curated BSC Testnet identities. Runtime checks control activation. */
export const BNB_MARKETPLACE_AGENTS: readonly BnbMarketplaceAgent[] = [
  {
    slug: "studio-desk-rebalancer", initials: "RB", name: "Studio Desk Rebalancer", category: "rebalancing", protocol: "PancakeSwap V3",
    summary: "Proposes a bounded LP range update using the current pool tick and position state.", task: "Prepare one bounded range rebalance",
    cannotDo: "Use another position, pair, policy, or chain.", risk: "Medium",
    controls: ["Read the current pool tick", "Read the selected position", "Return typed rebalance bounds"],
    chainId: BNB_TESTNET_CHAIN_ID, agentId: 1880, registryAddress: BNB_TESTNET_REGISTRY,
    agentWallet: "0x76849Ba8246Ea53FB417c295028c2AA9C6af7eD7",
    agentCardUrl: "https://13.53.65.58.sslip.io/seller/1880/.well-known/agent-card.json",
    sellerApiBaseUrl: "https://13.53.65.58.sslip.io/api/seller/1880", selector: "rebalancePancakeV3", feeLabel: "0.001 $U", maxFeeAmount: "1000000000000000",
    registryStatus: "checking", endpointStatus: "checking", registryUpdatedAt: null, createdTxHash: null,
  },
  {
    slug: "studio-desk-grid", initials: "GD", name: "Studio Desk Grid", category: "grid-trading", protocol: "PancakeSwap",
    summary: "Runs one grid step with a fixed pair, inventory ceiling, cooldown, and minimum output.", task: "Run one bounded grid step",
    cannotDo: "Change the pair or exceed the approved inventory ceiling.", risk: "Medium",
    controls: ["Use the fixed USDT/WBNB pair", "Respect the inventory ceiling", "Enforce cooldown and minimum output"],
    chainId: BNB_TESTNET_CHAIN_ID, agentId: 1881, registryAddress: BNB_TESTNET_REGISTRY,
    agentWallet: "0x2eD7Dc63681D912948C215DCdE4c4FCe9A3F19F8",
    agentCardUrl: "https://13.53.65.58.sslip.io/seller/1881/.well-known/agent-card.json",
    sellerApiBaseUrl: "https://13.53.65.58.sslip.io/api/seller/1881", selector: "gridStep", feeLabel: "0.0012 $U", maxFeeAmount: "1200000000000000",
    registryStatus: "checking", endpointStatus: "checking", registryUpdatedAt: null, createdTxHash: null,
  },
  {
    slug: "studio-desk-yield", initials: "YD", name: "Studio Desk Bounded Yield", category: "yield-optimisation", protocol: "Venus Protocol",
    summary: "Allocates a bounded amount to one allowlisted Venus testnet venue.", task: "Allocate to one verified yield venue",
    cannotDo: "Use another venue or exceed the quoted amount.", risk: "Medium",
    controls: ["Use one verified Venus venue", "Bound the deposit amount", "Bound the withdrawal amount"],
    chainId: BNB_TESTNET_CHAIN_ID, agentId: 1882, registryAddress: BNB_TESTNET_REGISTRY,
    agentWallet: "0x1D7118d1A4A87411FB275046Cb156eCe8e7BD190",
    agentCardUrl: "https://13.53.65.58.sslip.io/seller/1882/.well-known/agent-card.json",
    sellerApiBaseUrl: "https://13.53.65.58.sslip.io/api/seller/1882", selector: "allocateYield", feeLabel: "0.0009 $U", maxFeeAmount: "900000000000000",
    registryStatus: "checking", endpointStatus: "checking", registryUpdatedAt: null, createdTxHash: null,
  },
  {
    slug: "studio-desk-risk", initials: "HF", name: "Studio Desk Risk Protection", category: "health-factor-monitoring", protocol: "Venus Protocol",
    summary: "Reads Venus liquidity and shortfall, then proposes one bounded repayment.", task: "Protect one Venus borrowing position",
    cannotDo: "Borrow more, change the borrower, or exceed the repayment cap.", risk: "Low",
    controls: ["Read account liquidity", "Read account shortfall", "Bound repayBorrowBehalf"],
    chainId: BNB_TESTNET_CHAIN_ID, agentId: 1883, registryAddress: BNB_TESTNET_REGISTRY,
    agentWallet: "0x185BF63291A90eaf9D1b119Cc2c4b70df058BBa0",
    agentCardUrl: "https://13.53.65.58.sslip.io/seller/1883/.well-known/agent-card.json",
    sellerApiBaseUrl: "https://13.53.65.58.sslip.io/api/seller/1883", selector: "protectRepayVenus", feeLabel: "0.0011 $U", maxFeeAmount: "1100000000000000",
    registryStatus: "checking", endpointStatus: "checking", registryUpdatedAt: null, createdTxHash: null,
  },
] as const;

export function getBnbMarketplaceAgent(slug: string) {
  return BNB_MARKETPLACE_AGENTS.find((agent) => agent.slug === slug);
}

export function getBnbMarketplaceAgentById(agentId: number) {
  return BNB_MARKETPLACE_AGENTS.find((agent) => agent.agentId === agentId);
}

export function getBnbAgentCategory(slug: string) {
  return BNB_AGENT_CATEGORIES.find((category) => category.slug === slug);
}
