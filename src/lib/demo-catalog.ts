export type DemoSkill = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  category: string;
  icon: string;
  price: number;
  pricePerCall: number;
  gatewaySlug: string;
  endpointPath: string;
  tags: string;
  estLatencyMs: number;
  inputShape: string;
  outputShape: string;
  inputSchema: string;
  outputSchema: string;
  exampleInput: unknown;
  exampleOutput: unknown;
  trustScore: number;
  callCount: number;
  workflowId: string;
  workflowSlug: string;
  workflowRunCount: number;
  workflowForkCount: number;
  royaltyBps: number;
};

export type DemoWorkflow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  price_per_run: number;
  royalty_bps: number;
  runs: number;
  forks: number;
  trust_score: number;
  creator: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  executable_skill: {
    id: string;
    gatewaySlug: string;
    pricePerCall: number;
  };
  version: {
    id: string;
    version: number;
    summary: string;
    slaMs: number;
  };
};

const CREATOR = {
  id: "demo-creator-maiat-dojo",
  displayName: "AgentShack",
  avatarUrl: null,
};

export const AGENT_REPO_ANALYST_INPUT = {
  repo_url: "https://github.com/garrytan/gbrain",
  question: "Is this useful for building persistent-memory agents?",
};

export const AGENT_REPO_ANALYST_OUTPUT = {
  workflow: "jiagon-negotiator",
  repo: "https://github.com/garrytan/gbrain",
  verdict: "strong_fit_for_agent_memory",
  fit_score: 0.91,
  summary:
    "GBrain packages persistent knowledge, skills, MCP access, ingestion, and maintenance loops for AI agents.",
  signals: [
    "MCP-compatible agent memory surface",
    "workflow encoded as reusable skills",
    "recurring autonomous maintenance loop",
  ],
  sources: [
    {
      title: "garrytan/gbrain README",
      url: "https://github.com/garrytan/gbrain",
    },
  ],
};

export const DEMO_SKILLS: DemoSkill[] = [
  {
    id: "demo-skill-jiagon-negotiator",
    name: "Agent Repo Analyst",
    description:
      "Analyzes a public agent repository and returns architecture summary, install path, fit score, risks, and source-backed evidence. Demo input uses Garry Tan's public GBrain repo.",
    longDescription:
      "A public-repo analysis workflow for agent builders. It reads a GitHub README, extracts architecture and install signals, and returns a source-backed fit brief for agent-memory or MCP use cases.",
    category: "Agent Research",
    icon: "GitBranch",
    price: 0.003,
    pricePerCall: 0.003,
    gatewaySlug: "jiagon-negotiator",
    endpointPath: "/api/skills-internal/repo-analyst",
    tags: "agent,research,github,gbrain,mcp,workflow",
    estLatencyMs: 3000,
    inputShape: "form",
    outputShape: "json",
    inputSchema: JSON.stringify({
      type: "object",
      required: ["repo_url"],
      properties: {
        repo_url: {
          type: "string",
          title: "Public GitHub Repository",
          description: "github.com owner/repo URL to analyze",
          default: AGENT_REPO_ANALYST_INPUT.repo_url,
        },
        question: {
          type: "string",
          title: "Question",
          description: "What should the analyst focus on?",
          default: AGENT_REPO_ANALYST_INPUT.question,
        },
      },
    }),
    outputSchema: JSON.stringify({
      type: "object",
      required: ["workflow", "repo", "verdict", "fit_score", "summary", "sources"],
      properties: {
        workflow: { type: "string" },
        repo: { type: "string" },
        verdict: { type: "string" },
        fit_score: { type: "number" },
        summary: { type: "string" },
        signals: { type: "array", items: { type: "string" } },
        install_path: { type: "string" },
        risks: { type: "array", items: { type: "string" } },
        sources: { type: "array" },
      },
    }),
    exampleInput: AGENT_REPO_ANALYST_INPUT,
    exampleOutput: AGENT_REPO_ANALYST_OUTPUT,
    trustScore: 100,
    callCount: 1,
    workflowId: "demo-workflow-jiagon-negotiator",
    workflowSlug: "jiagon-negotiator",
    workflowRunCount: 1,
    workflowForkCount: 0,
    royaltyBps: 500,
  },
  {
    id: "demo-skill-raposa-coffee-agent",
    name: "Market Hotspot Brief",
    description:
      "Turns a crypto news topic into a concise market brief with catalysts, sentiment, watchlist tokens, and source links.",
    longDescription:
      "A crypto intelligence workflow for agents that need a fast briefing before writing, trading, or preparing research. It produces a structured brief instead of a raw search dump.",
    category: "Market Intelligence",
    icon: "Flame",
    price: 0.004,
    pricePerCall: 0.004,
    gatewaySlug: "raposa-coffee-agent",
    endpointPath: "/api/skills-internal/search",
    tags: "crypto,market,news,hotspot,research,binance",
    estLatencyMs: 4200,
    inputShape: "form",
    outputShape: "json",
    inputSchema: JSON.stringify({
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          title: "Market query",
          description: "Narrative, token, sector, or event to brief",
          default: "BNB Chain AI agents",
        },
        horizon: {
          type: "string",
          title: "Time horizon",
          enum: ["today", "this_week", "this_month"],
          default: "today",
        },
      },
    }),
    outputSchema: JSON.stringify({
      type: "object",
      required: ["brief", "catalysts", "watchlist"],
      properties: {
        brief: { type: "string" },
        sentiment: { type: "string" },
        catalysts: { type: "array", items: { type: "string" } },
        watchlist: { type: "array", items: { type: "string" } },
        sources: { type: "array" },
      },
    }),
    exampleInput: {
      query: "BNB Chain AI agents",
      horizon: "today",
    },
    exampleOutput: {
      workflow: "raposa-coffee-agent",
      brief:
        "AI-agent infrastructure on BNB Chain is drawing attention around skill marketplaces, agent wallets, and paid execution receipts.",
      sentiment: "constructive_but_early",
      catalysts: [
        "Exchange skill marketplaces are training users to install and run agent skills",
        "Creators need distribution and monetization beyond GitHub stars",
        "Receipt-backed execution can separate useful skills from copied prompts",
      ],
      watchlist: ["BNB", "AI agent infra", "skill marketplaces"],
      sources: [
        { title: "OKX Agent TradeKit skills", url: "https://okx.com/zh-hans/agent-tradekit/skills" },
      ],
    },
    trustScore: 86,
    callCount: 0,
    workflowId: "demo-workflow-raposa-coffee-agent",
    workflowSlug: "raposa-coffee-agent",
    workflowRunCount: 0,
    workflowForkCount: 0,
    royaltyBps: 500,
  },
  {
    id: "demo-skill-kline-indicator-analysis",
    name: "Kline Indicator Analysis",
    description:
      "Reads token, interval, and indicator settings and returns a compact technical-analysis brief for crypto agents.",
    longDescription:
      "A Binance-compatible market-analysis workflow inspired by exchange skill squares. It is useful for agents that need a structured indicator read before producing a trading plan.",
    category: "Trading Strategy",
    icon: "LineChart",
    price: 0.005,
    pricePerCall: 0.005,
    gatewaySlug: "kline-indicator-analysis",
    endpointPath: "/api/skills-internal/price",
    tags: "kline,indicator,technical-analysis,trading,crypto,binance",
    estLatencyMs: 1800,
    inputShape: "form",
    outputShape: "json",
    inputSchema: JSON.stringify({
      type: "object",
      required: ["token", "interval"],
      properties: {
        token: {
          type: "string",
          title: "Token",
          description: "Token or pair to analyze",
          default: "BNB",
        },
        interval: {
          type: "string",
          title: "Interval",
          enum: ["15m", "1h", "4h", "1d"],
          default: "1h",
        },
        indicators: {
          type: "string",
          title: "Indicators",
          description: "Comma-separated indicators",
          default: "RSI,MACD,EMA",
        },
      },
    }),
    outputSchema: JSON.stringify({
      type: "object",
      required: ["symbol", "bias", "signals", "risk_note"],
      properties: {
        symbol: { type: "string" },
        interval: { type: "string" },
        bias: { type: "string" },
        signals: { type: "array", items: { type: "string" } },
        risk_note: { type: "string" },
      },
    }),
    exampleInput: {
      token: "BNB",
      interval: "1h",
      indicators: "RSI,MACD,EMA",
    },
    exampleOutput: {
      workflow: "kline-indicator-analysis",
      symbol: "BNB",
      interval: "1h",
      bias: "neutral_to_constructive",
      signals: [
        "RSI sits below overbought territory",
        "EMA trend requires confirmation from volume",
        "MACD momentum is improving but not a standalone entry signal",
      ],
      risk_note: "Use as analysis context only; execution requires a separate risk policy.",
    },
    trustScore: 82,
    callCount: 0,
    workflowId: "demo-workflow-kline-indicator-analysis",
    workflowSlug: "kline-indicator-analysis",
    workflowRunCount: 0,
    workflowForkCount: 0,
    royaltyBps: 500,
  },
  {
    id: "demo-skill-binance-square-sync",
    name: "Binance Square Sync",
    description:
      "Formats a crypto thread into a Binance Square-ready post draft with tags, disclosure, and duplicate checks.",
    longDescription:
      "A creator automation workflow for turning X/Twitter market posts into Binance Square drafts. It is listed as a workflow pattern, not an official Binance integration.",
    category: "Content Automation",
    icon: "Repeat",
    price: 0.004,
    pricePerCall: 0.004,
    gatewaySlug: "binance-square-sync",
    endpointPath: "/api/skills-internal/echo",
    tags: "binance-square,twitter,x,content,sync,creator",
    estLatencyMs: 1400,
    inputShape: "form",
    outputShape: "json",
    inputSchema: JSON.stringify({
      type: "object",
      required: ["post_url"],
      properties: {
        post_url: {
          type: "string",
          title: "Source post URL",
          description: "X/Twitter post or thread URL",
          default: "https://x.com/example/status/123",
        },
        tone: {
          type: "string",
          title: "Tone",
          enum: ["neutral", "educational", "trader"],
          default: "educational",
        },
      },
    }),
    outputSchema: JSON.stringify({
      type: "object",
      required: ["draft", "tags", "checks"],
      properties: {
        draft: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        checks: { type: "array", items: { type: "string" } },
      },
    }),
    exampleInput: {
      post_url: "https://x.com/example/status/123",
      tone: "educational",
    },
    exampleOutput: {
      workflow: "binance-square-sync",
      draft:
        "AI agent skills are becoming a new distribution layer for crypto workflows. The next step is paid execution with receipts and reputation.",
      tags: ["AI", "BNBChain", "Agents", "Skill"],
      checks: ["source URL captured", "duplicate check required before publish", "not financial advice disclosure added"],
    },
    trustScore: 78,
    callCount: 0,
    workflowId: "demo-workflow-binance-square-sync",
    workflowSlug: "binance-square-sync",
    workflowRunCount: 0,
    workflowForkCount: 0,
    royaltyBps: 500,
  },
  {
    id: "demo-skill-solyd-commerce-agent",
    name: "Token Risk Check",
    description:
      "Produces a quick token risk brief with contract surface, liquidity, holder, and governance checks for agent workflows.",
    longDescription:
      "A lightweight risk-screening workflow for crypto agents before they summarize, route, or recommend a token. It is not a full audit, but it gives agents a safer first pass.",
    category: "Risk Check",
    icon: "ShieldAlert",
    price: 0.006,
    pricePerCall: 0.006,
    gatewaySlug: "solyd-commerce-agent",
    endpointPath: "/api/skills-internal/quick-audit",
    tags: "token,risk,audit,security,defi,crypto",
    estLatencyMs: 2400,
    inputShape: "form",
    outputShape: "json",
    inputSchema: JSON.stringify({
      type: "object",
      required: ["target"],
      properties: {
        target: {
          type: "string",
          title: "Token or contract",
          description: "Symbol, contract address, or project URL",
          default: "BNB token risk profile",
        },
        chain: {
          type: "string",
          title: "Chain",
          enum: ["bsc", "ethereum", "base", "solana"],
          default: "bsc",
        },
      },
    }),
    outputSchema: JSON.stringify({
      type: "object",
      required: ["verdict", "risk_score", "findings"],
      properties: {
        verdict: { type: "string" },
        risk_score: { type: "number" },
        findings: { type: "array" },
        next_actions: { type: "array", items: { type: "string" } },
      },
    }),
    exampleInput: {
      target: "upgradeable ERC20 token",
      chain: "bsc",
    },
    exampleOutput: {
      workflow: "solyd-commerce-agent",
      target: "upgradeable ERC20 token",
      chain: "bsc",
      verdict: "medium_risk",
      risk_score: 73,
      findings: [
        { severity: "high", title: "Upgradeable surface detected" },
        { severity: "medium", title: "Token mechanics need abuse-path review" },
      ],
      next_actions: ["Review admin controls", "Check pause and blacklist paths", "Run invariant tests"],
    },
    trustScore: 84,
    callCount: 0,
    workflowId: "demo-workflow-solyd-commerce-agent",
    workflowSlug: "solyd-commerce-agent",
    workflowRunCount: 0,
    workflowForkCount: 0,
    royaltyBps: 500,
  },
];

export const DEMO_WORKFLOWS: DemoWorkflow[] = DEMO_SKILLS.map((skill) => ({
  id: skill.workflowId,
  slug: skill.workflowSlug,
  name: skill.name,
  description: skill.description,
  category: skill.category,
  icon: skill.icon,
  price_per_run: skill.pricePerCall,
  royalty_bps: skill.royaltyBps,
  runs: skill.workflowRunCount,
  forks: skill.workflowForkCount,
  trust_score: skill.trustScore,
  creator: CREATOR,
  executable_skill: {
    id: skill.id,
    gatewaySlug: skill.gatewaySlug,
    pricePerCall: skill.pricePerCall,
  },
  version: {
    id: `${skill.workflowId}-v1`,
    version: 1,
    summary: skill.description,
    slaMs: skill.estLatencyMs,
  },
}));

export function getDemoSkillById(id: string) {
  return DEMO_SKILLS.find((skill) => skill.id === id) ?? null;
}

export function getDemoSkillByWorkflowId(id: string) {
  return (
    DEMO_SKILLS.find(
      (skill) => skill.workflowId === id || skill.workflowSlug === id || skill.id === id,
    ) ?? null
  );
}

export function filterDemoSkills({
  q,
  category,
  freeOnly,
  limit,
  offset = 0,
}: {
  q?: string;
  category?: string;
  freeOnly?: boolean;
  limit: number;
  offset?: number;
}) {
  const normalizedQ = q?.trim().toLowerCase();
  const rows = DEMO_SKILLS.filter((skill) => {
    const matchesCategory = !category || skill.category === category;
    const matchesFree = !freeOnly || skill.pricePerCall === 0;
    const matchesQuery =
      !normalizedQ ||
      skill.name.toLowerCase().includes(normalizedQ) ||
      skill.description.toLowerCase().includes(normalizedQ) ||
      skill.tags.toLowerCase().includes(normalizedQ);
    return matchesCategory && matchesFree && matchesQuery;
  });

  return {
    total: rows.length,
    skills: rows.slice(offset, offset + limit),
  };
}

export function filterDemoWorkflows({
  q,
  category,
  limit,
}: {
  q?: string;
  category?: string;
  limit: number;
}) {
  const normalizedQ = q?.trim().toLowerCase();
  return DEMO_WORKFLOWS.filter((workflow) => {
    const matchesCategory = !category || workflow.category === category;
    const matchesQuery =
      !normalizedQ ||
      workflow.name.toLowerCase().includes(normalizedQ) ||
      workflow.description.toLowerCase().includes(normalizedQ) ||
      workflow.slug.toLowerCase().includes(normalizedQ);
    return matchesCategory && matchesQuery;
  }).slice(0, limit);
}

export function toPublicSkill(skill: DemoSkill) {
  return {
    ...skill,
    creator: CREATOR,
    rating: 5,
    installs: skill.workflowRunCount,
    evaluationScore: skill.trustScore,
    evaluationPassed: skill.trustScore >= 80,
    skillType: "active",
    endpointUrl: skill.endpointPath,
    executionKind: "sync",
    inputShape: skill.inputShape,
    outputShape: skill.outputShape,
    estLatencyMs: skill.estLatencyMs,
    sandboxable: true,
    authRequired: false,
    inputSchema: skill.inputSchema,
    outputSchema: skill.outputSchema,
    exampleInput: JSON.stringify(skill.exampleInput),
    exampleOutput: JSON.stringify(skill.exampleOutput),
    longDescription: skill.longDescription,
    fileContent: null,
    workflowVersion: {
      id: `${skill.workflowId}-v1`,
      version: 1,
      summary: skill.description,
      slaMs: skill.estLatencyMs,
    },
  };
}

export function toV1Skill(skill: DemoSkill) {
  return {
    skill: skill.gatewaySlug,
    name: skill.name,
    description: skill.description,
    price_per_call: skill.pricePerCall,
    category: skill.category,
    tags: skill.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    icon: skill.icon,
    latency_ms: skill.estLatencyMs,
    input_shape: skill.inputShape,
    output_shape: skill.outputShape,
    example_input: skill.exampleInput,
    example_output: skill.exampleOutput,
    workflow: {
      id: skill.workflowId,
      slug: skill.workflowSlug,
      runs: skill.workflowRunCount,
      forks: skill.workflowForkCount,
      royalty_bps: skill.royaltyBps,
      version: {
        version: 1,
        summary: skill.description,
        slaMs: skill.estLatencyMs,
      },
    },
  };
}

export function runDemoSkill(skill: DemoSkill, input: Record<string, unknown>) {
  const base = typeof skill.exampleOutput === "object" && skill.exampleOutput !== null
    ? { ...(skill.exampleOutput as Record<string, unknown>) }
    : { result: skill.exampleOutput };

  if (skill.gatewaySlug === "jiagon-negotiator") {
    return {
      ...AGENT_REPO_ANALYST_OUTPUT,
      workflow: skill.gatewaySlug,
      repo: input.repo_url ?? input.repo ?? AGENT_REPO_ANALYST_INPUT.repo_url,
      question: input.question ?? AGENT_REPO_ANALYST_INPUT.question,
      receipt: {
        workflow_id: skill.workflowId,
        trust_signal: "+1 successful public repo analysis",
        generated_at: new Date().toISOString(),
      },
    };
  }

  return {
    ...base,
    workflow: skill.gatewaySlug,
    input,
    receipt: {
      workflow_id: skill.workflowId,
      mode: "demo_sample",
      generated_at: new Date().toISOString(),
    },
  };
}
