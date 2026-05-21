export type AgentServicePricing = {
  setupFeeUsd: number;
  monthlyUsd: number;
  perClearedCaseUsd: number;
  successFeeBps: number;
  royaltyBps: number;
};

export type AgentServiceLineage = {
  root: string;
  parent?: string;
  forks?: string[];
  generation: number;
  royaltyTo?: string;
};

export type AgentServiceReputation = {
  receiptsCleared: number;
  successRate: number;
  savedAmountUsd: number;
  verifiedVolumeUsd: number;
  disputes: number;
  creditScore: number;
};

export type AgentServiceReceipt = {
  id: string;
  label: string;
  amountUsd: number;
  status: "cleared" | "refunded" | "disputed";
};

export type AgentFamilyCode = "NEG" | "R8" | "SLR" | "BYR" | "VFY";

export type AgentProofLevel = "identity" | "execution" | "clearing" | "settlement";

export type AgentFamily = {
  code: AgentFamilyCode;
  name: string;
  role: string;
};

export type AgentCollection = {
  slug: string;
  code: AgentFamilyCode;
  name: string;
  title: string;
  summary: string;
  creator: string;
  coverSeed: string;
  itemSlugs: string[];
  floorUsd: number;
  volumeUsd: number;
  royaltyBps: number;
};

export type AgentServiceCard = {
  id: string;
  slug: string;
  collectionSlug: string;
  name: string;
  nfaId: string;
  agentId: string;
  familyCode: AgentFamilyCode;
  familyName: string;
  familyRole: string;
  proofLevel: AgentProofLevel;
  proofSummary: string;
  ownerIdentity: string;
  collection: string;
  role: string;
  archetype: string;
  summary: string;
  status: "root-template" | "merchant-fork" | "verified-service";
  category: string;
  avatarSeed: string;
  paymentRails: string[];
  integrations: string[];
  abilities: string[];
  workflowDeck: string[];
  receiptKinds: string[];
  attributes: Array<{ label: string; value: string }>;
  pricing: AgentServicePricing;
  lineage: AgentServiceLineage;
  reputation: AgentServiceReputation;
  receipts: AgentServiceReceipt[];
  detailHref: string;
  runHref: string;
  subscribeHref: string;
  forkHref: string;
  receiptsHref: string;
};

export const AGENT_FAMILIES: AgentFamily[] = [
  {
    code: "NEG",
    name: "Negotiator",
    role: "Resolve orders, refunds, claims, and merchant settlement outcomes.",
  },
  {
    code: "R8",
    name: "Review",
    role: "Rate, review, and turn verified consumption into taste reputation.",
  },
  {
    code: "SLR",
    name: "SLL-R",
    role: "Represent merchant services, order handling, fulfillment, and receipt-backed credit.",
  },
  {
    code: "BYR",
    name: "Buyer",
    role: "Shop, compare, negotiate, and purchase on behalf of a user.",
  },
  {
    code: "VFY",
    name: "Verifier",
    role: "Evaluate work, stake judgment, and clear receipts into reputation.",
  },
];

export const AGENT_COLLECTIONS: AgentCollection[] = [
  {
    slug: "sll-r",
    code: "SLR",
    name: "SLL-R",
    title: "Seller and service agent collection",
    summary: "Merchant-service cards for orders, refunds, and credit.",
    creator: "Jiagon / AgentShack",
    coverSeed: "sll-r-collection",
    itemSlugs: ["sll-r", "sll-r-raposa", "sll-r-solyd"],
    floorUsd: 79,
    volumeUsd: 92800,
    royaltyBps: 750,
  },
  {
    slug: "r8",
    code: "R8",
    name: "R8",
    title: "Review and reputation collection",
    summary: "Review cards that score receipts into portable reputation.",
    creator: "AgentShack",
    coverSeed: "r8-collection",
    itemSlugs: ["r8"],
    floorUsd: 0.5,
    volumeUsd: 21200,
    royaltyBps: 0,
  },
];

export const AGENT_SERVICE_CARDS: AgentServiceCard[] = [
  {
    id: "agent-sll-r",
    slug: "sll-r",
    collectionSlug: "sll-r",
    name: "SLL-R",
    nfaId: "NFA-SLL-R-0001",
    agentId: "erc8004:sll-r:genesis",
    familyCode: "SLR",
    familyName: "SLL-R Agent Family",
    familyRole: "Represent merchant services, order handling, fulfillment, and receipt-backed credit.",
    proofLevel: "clearing",
    proofSummary:
      "Genesis identity, service endpoint, evaluator outcomes, receipt history, and fork lineage are tracked as one portable agent record.",
    ownerIdentity: "Jiagon / AgentShack",
    collection: "SLL-R Genesis",
    role: "Original SLL-R agent for merchant orders, fulfillment, receipts, refunds, and credit signals.",
    archetype: "SLL-R genesis agent card",
    summary:
      "The Genesis SLL-R agent card. It owns the original seller-service abilities that Raposa, SOLYD, and future merchant agents can fork into their own service cards.",
    status: "root-template",
    category: "Merchant Service",
    avatarSeed: "sll-r-genesis",
    paymentRails: ["BNB", "MoonPay", "USDC"],
    integrations: ["MoonPay Commerce", "Telegram", "Merchant receipts"],
    abilities: [
      "Quote order",
      "Verify fulfillment",
      "Negotiate issue/refund",
      "Issue receipt",
      "Build credit signal",
    ],
    workflowDeck: [
      "Base order handling",
      "Receipt claim",
      "Refund negotiation",
      "Credit signal update",
    ],
    receiptKinds: [
      "Cleared orders",
      "Fulfilled claims",
      "Refunds resolved",
    ],
    attributes: [
      { label: "Class", value: "SLL-R" },
      { label: "Generation", value: "Genesis" },
      { label: "Royalty", value: "7.5%" },
      { label: "Credit", value: "A-" },
    ],
    pricing: {
      setupFeeUsd: 299,
      monthlyUsd: 149,
      perClearedCaseUsd: 1.5,
      successFeeBps: 1000,
      royaltyBps: 750,
    },
    lineage: {
      root: "SLL-R",
      forks: ["SLL-R Raposa", "SLL-R SOLYD"],
      generation: 0,
    },
    reputation: {
      receiptsCleared: 128,
      successRate: 0.92,
      savedAmountUsd: 18420,
      verifiedVolumeUsd: 96200,
      disputes: 3,
      creditScore: 84,
    },
    receipts: [
      { id: "rcpt_sllr_128", label: "Refund saved", amountUsd: 84, status: "cleared" },
      { id: "rcpt_sllr_127", label: "Order claim settled", amountUsd: 42, status: "cleared" },
      { id: "rcpt_sllr_126", label: "Discount negotiated", amountUsd: 18, status: "cleared" },
    ],
    detailHref: "/agent/sll-r",
    runHref: "/agent/sll-r?mode=run",
    subscribeHref: "/agent/sll-r?mode=subscribe",
    forkHref: "/agent/sll-r?mode=license",
    receiptsHref: "/leaderboard",
  },
  {
    id: "agent-raposa-coffee",
    slug: "sll-r-raposa",
    collectionSlug: "sll-r",
    name: "SLL-R Raposa",
    nfaId: "NFA-SLL-R-0001-G01",
    agentId: "erc8004:sll-r:raposa",
    familyCode: "SLR",
    familyName: "SLL-R Agent Family",
    familyRole: "Represent merchant services, order handling, fulfillment, and receipt-backed credit.",
    proofLevel: "execution",
    proofSummary:
      "Gen1 fork with merchant-specific workflow deck, cleared pickup receipts, and royalty lineage to SLL-R.",
    ownerIdentity: "Raposa Coffee fork",
    collection: "SLL-R Gen1",
    role: "Coffee-shop order issue agent forked from SLL-R.",
    archetype: "SLL-R Gen1 merchant fork",
    summary:
      "A cafe-specific fork that handles paid pickup issues, refund requests, loyalty make-goods, and claim receipts for Raposa-style merchants.",
    status: "merchant-fork",
    category: "Merchant Service",
    avatarSeed: "raposa-coffee-fork",
    paymentRails: ["BNB", "MoonPay"],
    integrations: ["MoonPay Commerce", "POS receipt", "Telegram"],
    abilities: [
      "Quote order",
      "Negotiate issue/refund",
      "Issue receipt",
      "Build credit signal",
    ],
    workflowDeck: [
      "Raposa order handling",
      "Receipt claim",
      "Refund negotiation",
    ],
    receiptKinds: [
      "Cleared orders",
      "Fulfilled claims",
      "Refunds resolved",
    ],
    attributes: [
      { label: "Class", value: "Cafe fork" },
      { label: "Generation", value: "Gen1" },
      { label: "Parent", value: "SLL-R" },
      { label: "Royalty", value: "3.0%" },
      { label: "Credit", value: "B+" },
    ],
    pricing: {
      setupFeeUsd: 149,
      monthlyUsd: 79,
      perClearedCaseUsd: 0.75,
      successFeeBps: 600,
      royaltyBps: 300,
    },
    lineage: {
      root: "SLL-R",
      parent: "SLL-R",
      forks: ["SLL-R Raposa"],
      generation: 1,
      royaltyTo: "SLL-R",
    },
    reputation: {
      receiptsCleared: 46,
      successRate: 0.89,
      savedAmountUsd: 3260,
      verifiedVolumeUsd: 18400,
      disputes: 1,
      creditScore: 76,
    },
    receipts: [
      { id: "rcpt_rap_046", label: "Pickup claim cleared", amountUsd: 26, status: "cleared" },
      { id: "rcpt_rap_045", label: "Remake approved", amountUsd: 12, status: "cleared" },
      { id: "rcpt_rap_044", label: "Refund avoided", amountUsd: 31, status: "cleared" },
    ],
    detailHref: "/agent/sll-r-raposa",
    runHref: "/agent/sll-r-raposa?mode=run",
    subscribeHref: "/agent/sll-r-raposa?mode=subscribe",
    forkHref: "/agent/sll-r-raposa?mode=license",
    receiptsHref: "/leaderboard",
  },
  {
    id: "agent-solyd-commerce",
    slug: "sll-r-solyd",
    collectionSlug: "sll-r",
    name: "SLL-R SOLYD",
    nfaId: "NFA-SLL-R-0001-G02",
    agentId: "erc8004:sll-r:solyd",
    familyCode: "SLR",
    familyName: "SLL-R Agent Family",
    familyRole: "Represent merchant services, order handling, fulfillment, and receipt-backed credit.",
    proofLevel: "settlement",
    proofSummary:
      "Payment-native fork with wallet evidence, receipt API, settlement routing, and verified commerce volume.",
    ownerIdentity: "SOLYD merchant fork",
    collection: "SLL-R Gen1",
    role: "Onchain settlement assistant for commerce payments and claims.",
    archetype: "SLL-R Gen1 settlement fork",
    summary:
      "A payment-native fork for merchants that need order proofs, customer claims, and chain-backed settlement records before issuing credit.",
    status: "verified-service",
    category: "Payment Clearing",
    avatarSeed: "solyd-commerce-agent",
    paymentRails: ["BNB", "USDC", "Solana evidence"],
    integrations: ["MoonPay Commerce", "Wallet proof", "Receipt API"],
    abilities: [
      "Quote order",
      "Negotiate issue/refund",
      "Issue receipt",
      "Build credit signal",
    ],
    workflowDeck: [
      "SOLYD shipping quote",
      "Receipt claim",
      "Refund negotiation",
    ],
    receiptKinds: [
      "Cleared orders",
      "Fulfilled claims",
      "Refunds resolved",
    ],
    attributes: [
      { label: "Class", value: "Verifier" },
      { label: "Generation", value: "Gen1" },
      { label: "Parent", value: "SLL-R" },
      { label: "Royalty", value: "4.0%" },
      { label: "Credit", value: "A" },
    ],
    pricing: {
      setupFeeUsd: 499,
      monthlyUsd: 249,
      perClearedCaseUsd: 2.25,
      successFeeBps: 800,
      royaltyBps: 400,
    },
    lineage: {
      root: "SLL-R",
      parent: "SLL-R",
      forks: ["SLL-R SOLYD"],
      generation: 1,
      royaltyTo: "SLL-R",
    },
    reputation: {
      receiptsCleared: 73,
      successRate: 0.94,
      savedAmountUsd: 9100,
      verifiedVolumeUsd: 74400,
      disputes: 2,
      creditScore: 88,
    },
    receipts: [
      { id: "rcpt_sld_073", label: "Payment verified", amountUsd: 240, status: "cleared" },
      { id: "rcpt_sld_072", label: "Claim approved", amountUsd: 118, status: "cleared" },
      { id: "rcpt_sld_071", label: "Settlement routed", amountUsd: 360, status: "cleared" },
    ],
    detailHref: "/agent/sll-r-solyd",
    runHref: "/agent/sll-r-solyd?mode=run",
    subscribeHref: "/agent/sll-r-solyd?mode=subscribe",
    forkHref: "/agent/sll-r-solyd?mode=license",
    receiptsHref: "/leaderboard",
  },
  {
    id: "agent-r8",
    slug: "r8",
    collectionSlug: "r8",
    name: "R8",
    nfaId: "NFA-R8-0001",
    agentId: "erc8004:r8:genesis",
    familyCode: "R8",
    familyName: "R8 Agent Family",
    familyRole: "Rate completed work and convert verified consumption into portable reputation.",
    proofLevel: "execution",
    proofSummary:
      "Genesis review identity with execution evidence, scored receipts, and portable rating history.",
    ownerIdentity: "AgentShack",
    collection: "R8 Genesis",
    role: "Genesis review agent for rating receipts, scoring delivery quality, and building reputation.",
    archetype: "R8 genesis agent card",
    summary:
      "The root R8 review family. It reads completed receipts, evaluates outcome quality, and turns verified consumption into reputation that other agents can trust.",
    status: "root-template",
    category: "Review Reputation",
    avatarSeed: "r8-genesis-review",
    paymentRails: ["BNB", "USDC"],
    integrations: ["Receipt API", "Evaluator policy", "Reputation ledger"],
    abilities: [
      "Rate receipt",
      "Score delivery",
      "Review evidence",
      "Build reputation",
    ],
    workflowDeck: [
      "Receipt review",
      "Evaluator scoring",
      "Reputation update",
    ],
    receiptKinds: [
      "Rated receipts",
      "Scored runs",
      "Review-backed claims",
    ],
    attributes: [
      { label: "Class", value: "R8" },
      { label: "Generation", value: "Genesis" },
      { label: "Royalty", value: "0.0%" },
      { label: "Credit", value: "A" },
    ],
    pricing: {
      setupFeeUsd: 0,
      monthlyUsd: 0,
      perClearedCaseUsd: 0.5,
      successFeeBps: 0,
      royaltyBps: 0,
    },
    lineage: {
      root: "R8",
      forks: ["R8 Ronin"],
      generation: 0,
    },
    reputation: {
      receiptsCleared: 64,
      successRate: 0.96,
      savedAmountUsd: 0,
      verifiedVolumeUsd: 21200,
      disputes: 0,
      creditScore: 91,
    },
    receipts: [
      { id: "rcpt_r8_064", label: "Receipt rated", amountUsd: 66, status: "cleared" },
      { id: "rcpt_r8_063", label: "Delivery scored", amountUsd: 128, status: "cleared" },
      { id: "rcpt_r8_062", label: "Review evidence accepted", amountUsd: 44, status: "cleared" },
    ],
    detailHref: "/agent/r8",
    runHref: "/agent/r8?mode=run",
    subscribeHref: "/agent/r8?mode=subscribe",
    forkHref: "/agent/r8?mode=license",
    receiptsHref: "/leaderboard",
  },
];

export function agentFamilyDisplayCode(code: AgentFamilyCode) {
  return code === "SLR" ? "SLL-R" : code;
}

export function agentGenerationLabel(generation: number) {
  return generation === 0 ? "Genesis" : `Gen${generation}`;
}

export function agentCardStatusLabel(status: AgentServiceCard["status"]) {
  if (status === "root-template") return "Root template";
  if (status === "merchant-fork") return "Merchant fork";
  return "Verified service";
}

export function agentProofLevelLabel(level: AgentProofLevel) {
  if (level === "identity") return "Identity";
  if (level === "execution") return "Execution";
  if (level === "clearing") return "Clearing";
  return "Settlement";
}
