import { describe, expect, it } from "vitest";
import {
  BNB_AGENT_CATEGORIES,
  BNB_MARKETPLACE_AGENTS,
  getBnbAgentCategory,
  getBnbMarketplaceAgent,
} from "@/lib/bnb-marketplace";

describe("BNB agent marketplace", () => {
  it("keeps all four official categories first-class", () => {
    expect(BNB_AGENT_CATEGORIES.map((category) => category.name)).toEqual([
      "Rebalancing",
      "Grid Trading",
      "Yield Optimisation",
      "Health Factor Monitoring",
    ]);
    expect(new Set(BNB_AGENT_CATEGORIES.map((category) => category.slug)).size).toBe(4);
  });

  it("provides one bounded BSC Testnet agent for every category", () => {
    for (const category of BNB_AGENT_CATEGORIES) {
      const agents = BNB_MARKETPLACE_AGENTS.filter((agent) => agent.category === category.slug);
      expect(agents).toHaveLength(1);
      expect(agents[0].cannotDo).toBeTruthy();
      expect(agents[0].chainId).toBe(97);
      expect(agents[0].agentId).toBeGreaterThan(0);
      expect(agents[0].agentCardUrl).toMatch(/^https:\/\//);
      expect(BigInt(agents[0].maxFeeAmount)).toBeGreaterThan(0n);
    }
  });

  it("resolves category and agent routes by slug", () => {
    expect(getBnbAgentCategory("grid-trading")?.name).toBe("Grid Trading");
    expect(getBnbMarketplaceAgent("studio-desk-risk")?.name).toBe("Studio Desk Risk Protection");
    expect(getBnbMarketplaceAgent("missing")).toBeUndefined();
  });

  it("does not include a mainnet or caller-controlled activation target", () => {
    for (const agent of BNB_MARKETPLACE_AGENTS) {
      expect(agent.chainId).toBe(97);
      expect(agent.sellerApiBaseUrl).toMatch(/^https:\/\/desk\.rouma\.online\/api\/seller\/\d+$/);
      expect(agent.registryStatus).toBe("checking");
    }
  });
});
