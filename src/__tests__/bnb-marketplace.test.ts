import { describe, expect, it } from "vitest";
import {
  BNB_AGENT_CATEGORIES,
  BNB_MARKETPLACE_AGENTS,
  getBnbAgentCategory,
  getBnbMarketplaceAgent,
} from "@/lib/bnb-marketplace";

describe("BNB agent marketplace fixtures", () => {
  it("keeps all four official categories first-class", () => {
    expect(BNB_AGENT_CATEGORIES.map((category) => category.name)).toEqual([
      "Rebalancing",
      "Grid Trading",
      "Yield Optimisation",
      "Health Factor Monitoring",
    ]);
    expect(new Set(BNB_AGENT_CATEGORIES.map((category) => category.slug)).size).toBe(4);
  });

  it("provides a bounded demo agent for every category", () => {
    for (const category of BNB_AGENT_CATEGORIES) {
      const agents = BNB_MARKETPLACE_AGENTS.filter((agent) => agent.category === category.slug);
      expect(agents).toHaveLength(1);
      expect(agents[0].cannotDo).toBeTruthy();
      expect(agents[0].dailyLimitUsd).toBeGreaterThan(0);
    }
  });

  it("resolves category and agent routes by slug", () => {
    expect(getBnbAgentCategory("grid-trading")?.name).toBe("Grid Trading");
    expect(getBnbMarketplaceAgent("healthguard")?.name).toBe("HealthGuard");
    expect(getBnbMarketplaceAgent("missing")).toBeUndefined();
  });
});
