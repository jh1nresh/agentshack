import { describe, expect, it } from "vitest";
import codexShippingLoopPack from "../../examples/agent-pack.codex-shipping-loop.json";
import prPreflightPack from "../../examples/agent-pack.pr-preflight.json";
import savePlaceRecoveryPack from "../../examples/agent-pack.save-place-recovery.json";
import { POST } from "@/app/api/agent-packs/validate/route";
import {
  buildAgentPackCapabilityDiff,
  validateAgentPackManifest,
} from "@/lib/agent-pack-manifest";

function makeValidateRequest(body: string, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/agent-packs/validate", {
    method: "POST",
    headers,
    body,
  }) as any;
}

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

  it("keeps manifest hashes stable across object key order permutations", () => {
    const permutedPack = {
      ...prPreflightPack,
      inputSchema: {
        properties: {
          riskMode: { enum: ["quick", "standard"], type: "string" },
          pullRequestUrl: { type: "string" },
        },
        required: prPreflightPack.inputSchema.required,
        type: prPreflightPack.inputSchema.type,
      },
      outputSchema: {
        properties: {
          evidenceRefs: { items: { type: "string" }, type: "array" },
          summary: { type: "string" },
          verdict: { enum: ["pass", "fail", "partial"], type: "string" },
        },
        required: prPreflightPack.outputSchema.required,
        type: prPreflightPack.outputSchema.type,
      },
      privacyPolicy: {
        onchainDefault: prPreflightPack.privacyPolicy.onchainDefault,
        privateFieldsNeverPublished: prPreflightPack.privacyPolicy.privateFieldsNeverPublished,
        publicFieldsAllowed: prPreflightPack.privacyPolicy.publicFieldsAllowed,
        rawEvidenceStoredBy: prPreflightPack.privacyPolicy.rawEvidenceStoredBy,
        defaultReceiptVisibility: prPreflightPack.privacyPolicy.defaultReceiptVisibility,
      },
    };

    const original = validateAgentPackManifest(prPreflightPack);
    const permuted = validateAgentPackManifest(permutedPack);

    expect(original.valid).toBe(true);
    expect(permuted.valid).toBe(true);
    if (!original.valid || !permuted.valid) throw new Error("Expected valid manifests");
    expect(original.manifestHash).toBe(permuted.manifestHash);
  });

  it("rejects duplicate tool permissions", () => {
    const result = validateAgentPackManifest({
      ...prPreflightPack,
      requiredTools: [
        ...prPreflightPack.requiredTools,
        {
          ...prPreflightPack.requiredTools[0],
        },
      ],
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("Expected invalid manifest");
    expect(result.errors.join("\n")).toContain(
      'requiredTools.3.tool: duplicate required tool "github_read" also appears at requiredTools.0.tool',
    );
  });

  it("rejects public receipt fields that overlap private-only fields", () => {
    const result = validateAgentPackManifest({
      ...prPreflightPack,
      privacyPolicy: {
        ...prPreflightPack.privacyPolicy,
        publicFieldsAllowed: [
          ...prPreflightPack.privacyPolicy.publicFieldsAllowed,
          prPreflightPack.privacyPolicy.privateFieldsNeverPublished[0],
        ],
      },
    });

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("Expected invalid manifest");
    expect(result.errors.join("\n")).toContain("public fields include private-only fields");
  });

  it("validates the required AgentShack example packs", () => {
    const saveResult = validateAgentPackManifest(savePlaceRecoveryPack);
    const codexResult = validateAgentPackManifest(codexShippingLoopPack);

    expect(saveResult.valid).toBe(true);
    expect(codexResult.valid).toBe(true);
    if (!saveResult.valid || !codexResult.valid) throw new Error("Expected valid example packs");
    expect(saveResult.manifest.agentId).toBe("save-place-recovery-agent");
    expect(codexResult.manifest.agentId).toBe("codex-shipping-loop-agent");
  });

  it("rejects oversized validation requests before parsing JSON", async () => {
    const response = await POST(
      makeValidateRequest("{", { "content-length": String(129 * 1024) }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });

  it("rejects streamed oversized validation requests without content length", async () => {
    const response = await POST(
      makeValidateRequest(JSON.stringify({ value: "x".repeat(129 * 1024) })),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Request body too large" });
  });

  it("rejects invalid JSON validation requests", async () => {
    const response = await POST(makeValidateRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });
});
