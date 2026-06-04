import { describe, expect, it } from "vitest";
import prPreflightPack from "../../examples/agent-pack.pr-preflight.json";
import {
  buildAgentPackCapabilityDiff,
  validateAgentPackManifest,
} from "@/lib/agent-pack-manifest";

describe("agent pack manifest", () => {
  it("validates an AgentShack agent pack and builds a capability diff", () => {
    const result = validateAgentPackManifest(prPreflightPack);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.errors.join(", "));
    expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.capabilityDiff.tools.map((tool) => tool.tool)).toContain("github_read");
    expect(result.capabilityDiff.writes).toContain("agentshack.workflow_receipts");
    expect(result.warnings).toContain("Agent pack is not listed yet.");
  });

  it("rejects packs without a technical failure refund path", () => {
    const result = validateAgentPackManifest({
      ...prPreflightPack,
      refundRules: [
        {
          trigger: "buyer changed mind",
          outcome: "no_refund",
          notes: "No refund after work starts.",
        },
      ],
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("Expected invalid manifest");
    expect(result.errors.join("\n")).toContain("technical failure");
  });

  it("keeps approval-required actions separate from all requested tools", () => {
    const result = validateAgentPackManifest(prPreflightPack);
    if (!result.valid) throw new Error(result.errors.join(", "));

    const diff = buildAgentPackCapabilityDiff(result.manifest);
    expect(diff.tools.length).toBe(3);
    expect(diff.approvalRequiredActions).toEqual(["github_read", "shell_readonly"]);
  });
});
