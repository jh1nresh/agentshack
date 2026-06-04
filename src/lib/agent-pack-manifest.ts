import { createHash } from "crypto";
import { z } from "zod";

const jsonObjectSchema = z.record(z.unknown());

const toolPermissionSchema = z.object({
  tool: z.string().min(1),
  purpose: z.string().min(1),
  required: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  userApprovalRequired: z.boolean(),
});

const toolPermissionsSchema = z.array(toolPermissionSchema).superRefine((tools, ctx) => {
  const seen = new Map<string, number>();

  tools.forEach((permission, index) => {
    const firstIndex = seen.get(permission.tool);
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "tool"],
        message: `duplicate required tool "${permission.tool}" also appears at requiredTools.${firstIndex}.tool`,
      });
      return;
    }

    seen.set(permission.tool, index);
  });
});

const pricingPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("free") }),
  z.object({
    mode: z.literal("credits"),
    creditsPerRun: z.number().positive(),
    packageHint: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal("fixed"),
    amount: z.number().positive(),
    currency: z.enum(["USD", "USDC"]),
  }),
  z.object({ mode: z.literal("quote_required") }),
]);

const refundRuleSchema = z.object({
  trigger: z.string().min(1),
  outcome: z.enum(["refund", "partial", "manual_review", "no_refund"]),
  notes: z.string().min(1),
});

const exampleRunRefSchema = z.object({
  id: z.string().min(1),
  receiptId: z.string().min(1).optional(),
  artifactRefs: z.array(z.string().min(1)).default([]),
}).passthrough();

const privacyPolicySchema = z.object({
  defaultReceiptVisibility: z.enum(["private", "public_sanitized"]),
  rawEvidenceStoredBy: z.enum(["provider_app", "agentshack", "not_stored"]),
  publicFieldsAllowed: z.array(z.string().min(1)),
  privateFieldsNeverPublished: z.array(z.string().min(1)),
  onchainDefault: z.enum(["none", "batch_hash_only", "per_run_opt_in"]),
});

export const agentPackManifestSchema = z.object({
  schemaVersion: z.literal("agentshack.agent-pack.v0"),
  agentId: z.string().min(1),
  name: z.string().min(1),
  providerId: z.string().min(1),
  job: z.string().min(1),
  activationCriteria: z.array(z.string().min(1)).min(1),
  nonActivationCriteria: z.array(z.string().min(1)).min(1),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema,
  requiredTools: toolPermissionsSchema,
  writeScopes: z.array(z.string().min(1)),
  externalSideEffects: z.array(z.string().min(1)),
  contextBundleRefs: z.array(z.string().min(1)),
  evaluatorPolicyId: z.string().min(1),
  receiptSchemaId: z.string().min(1),
  settlementPolicyId: z.string().min(1),
  pricing: pricingPolicySchema,
  refundRules: z.array(refundRuleSchema).min(1),
  exampleRuns: z.array(exampleRunRefSchema),
  privacyPolicy: privacyPolicySchema,
  version: z.string().min(1),
  status: z.enum(["draft", "review", "listed", "deprecated"]),
}).superRefine((manifest, ctx) => {
  const hasTechnicalFailureRefund = manifest.refundRules.some(
    (rule) => /technical|tool|fetch|timeout|failure|failed/i.test(rule.trigger) &&
      ["refund", "partial", "manual_review"].includes(rule.outcome),
  );
  if (!hasTechnicalFailureRefund) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refundRules"],
      message: "at least one refund rule must cover technical failure",
    });
  }

  if (manifest.status === "listed" && manifest.exampleRuns.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exampleRuns"],
      message: "listed agent packs require at least one example run",
    });
  }

  const privateFields = new Set(manifest.privacyPolicy.privateFieldsNeverPublished);
  const publicPrivateOverlap = manifest.privacyPolicy.publicFieldsAllowed.filter((field) =>
    privateFields.has(field),
  );
  if (publicPrivateOverlap.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["privacyPolicy", "publicFieldsAllowed"],
      message: `public fields include private-only fields: ${publicPrivateOverlap.join(", ")}`,
    });
  }
});

export type AgentPackManifest = z.infer<typeof agentPackManifestSchema>;
export type ToolPermission = z.infer<typeof toolPermissionSchema>;

export type AgentPackCapabilityDiff = {
  tools: Array<{
    tool: string;
    purpose: string;
    riskLevel: ToolPermission["riskLevel"];
    required: boolean;
    userApprovalRequired: boolean;
  }>;
  writes: string[];
  externalSideEffects: string[];
  approvalRequiredActions: string[];
  privateDataFieldsTouched: string[];
  onchainBehavior: string;
};

export type AgentPackValidationResult =
  | {
      valid: true;
      manifest: AgentPackManifest;
      manifestHash: string;
      warnings: string[];
      capabilityDiff: AgentPackCapabilityDiff;
    }
  | {
      valid: false;
      errors: string[];
    };

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

export function hashAgentPackManifest(manifest: AgentPackManifest): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(manifest)))
    .digest("hex");
}

export function buildAgentPackCapabilityDiff(
  manifest: AgentPackManifest,
): AgentPackCapabilityDiff {
  return {
    tools: manifest.requiredTools.map((tool) => ({
      tool: tool.tool,
      purpose: tool.purpose,
      riskLevel: tool.riskLevel,
      required: tool.required,
      userApprovalRequired: tool.userApprovalRequired,
    })),
    writes: manifest.writeScopes,
    externalSideEffects: manifest.externalSideEffects,
    approvalRequiredActions: manifest.requiredTools
      .filter((tool) => tool.userApprovalRequired)
      .map((tool) => tool.tool),
    privateDataFieldsTouched: manifest.privacyPolicy.privateFieldsNeverPublished,
    onchainBehavior: manifest.privacyPolicy.onchainDefault,
  };
}

export function validateAgentPackManifest(raw: unknown): AgentPackValidationResult {
  const result = agentPackManifestSchema.safeParse(raw);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map((issue) => {
        const field = issue.path.length > 0 ? issue.path.join(".") : "body";
        return `${field}: ${issue.message}`;
      }),
    };
  }

  const manifest = result.data;
  const warnings: string[] = [];

  if (manifest.status !== "listed") {
    warnings.push("Agent pack is not listed yet.");
  }
  if (manifest.exampleRuns.length === 0) {
    warnings.push("No public example receipt attached yet.");
  }
  if (manifest.externalSideEffects.length > 0) {
    warnings.push("External side effects require explicit user approval before run or install.");
  }
  if (manifest.privacyPolicy.defaultReceiptVisibility === "public_sanitized") {
    warnings.push("Public receipts must be sanitized before publication.");
  }
  if (manifest.requiredTools.some((tool) => tool.riskLevel === "high")) {
    warnings.push("High-risk tools require manual review before listing.");
  }

  return {
    valid: true,
    manifest,
    manifestHash: hashAgentPackManifest(manifest),
    warnings,
    capabilityDiff: buildAgentPackCapabilityDiff(manifest),
  };
}
