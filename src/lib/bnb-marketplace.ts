export const BNB_AGENT_CATEGORIES = [
  {
    slug: "rebalancing",
    name: "Rebalancing",
    action: "Manage liquidity",
    description: "Keep a liquidity position inside a price range you choose.",
  },
  {
    slug: "grid-trading",
    name: "Grid Trading",
    action: "Run grid trades",
    description: "Place buy and sell orders inside a price band you choose.",
  },
  {
    slug: "yield-optimisation",
    name: "Yield Optimisation",
    action: "Improve yield",
    description: "Route funds toward stronger available returns.",
  },
  {
    slug: "health-factor-monitoring",
    name: "Health Factor Monitoring",
    action: "Protect borrowing",
    description: "Watch a loan and respond before liquidation risk rises.",
  },
] as const;

export type BnbAgentCategorySlug = (typeof BNB_AGENT_CATEGORIES)[number]["slug"];

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
  dailyLimitUsd: number;
  defaultDurationDays: number;
  controls: readonly string[];
};

/**
 * UI fixtures only. These records are deliberately not presented as live,
 * verified, or registered BSC agents until a real registry source is wired in.
 */
export const BNB_MARKETPLACE_AGENTS: readonly BnbMarketplaceAgent[] = [
  {
    slug: "rangekeeper",
    initials: "RK",
    name: "RangeKeeper",
    category: "rebalancing",
    protocol: "PancakeSwap v3",
    summary: "Keeps your liquidity position inside your chosen price range.",
    task: "Manage one liquidity position",
    cannotDo: "Swap tokens or use another protocol.",
    risk: "Medium",
    dailyLimitUsd: 5000,
    defaultDurationDays: 30,
    controls: ["Rebalance the selected position", "Pause automatically at the daily limit", "Stop when permission expires"],
  },
  {
    slug: "gridpilot",
    initials: "GP",
    name: "GridPilot",
    category: "grid-trading",
    protocol: "PancakeSwap",
    summary: "Places grid orders inside the price band and budget you approve.",
    task: "Manage one grid strategy",
    cannotDo: "Trade outside the selected pair or price band.",
    risk: "Medium",
    dailyLimitUsd: 2500,
    defaultDurationDays: 14,
    controls: ["Place bounded grid orders", "Cancel open grid orders", "Stop when permission expires"],
  },
  {
    slug: "yieldscout",
    initials: "YS",
    name: "YieldScout",
    category: "yield-optimisation",
    protocol: "BNB Chain DeFi",
    summary: "Compares supported pools and routes funds within your approved set.",
    task: "Route funds across approved pools",
    cannotDo: "Use an unapproved protocol or exceed the daily limit.",
    risk: "Medium",
    dailyLimitUsd: 7500,
    defaultDurationDays: 30,
    controls: ["Compare approved yield sources", "Move funds within the allowlist", "Stop when permission expires"],
  },
  {
    slug: "healthguard",
    initials: "HG",
    name: "HealthGuard",
    category: "health-factor-monitoring",
    protocol: "Venus Protocol",
    summary: "Watches a lending position and acts before its health factor becomes unsafe.",
    task: "Protect one lending position",
    cannotDo: "Borrow more funds or move collateral elsewhere.",
    risk: "Low",
    dailyLimitUsd: 1000,
    defaultDurationDays: 30,
    controls: ["Monitor the selected position", "Repay within the approved limit", "Stop when permission expires"],
  },
] as const;

export function getBnbMarketplaceAgent(slug: string) {
  return BNB_MARKETPLACE_AGENTS.find((agent) => agent.slug === slug);
}

export function getBnbAgentCategory(slug: string) {
  return BNB_AGENT_CATEGORIES.find((category) => category.slug === slug);
}
