import { NextRequest, NextResponse } from "next/server";
import { validateAgentPackManifest } from "@/lib/agent-pack-manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/agent-packs/validate
 *
 * Stateless Agent Pack Manifest validation. This does not publish, install,
 * execute, bill, or store anything.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateAgentPackManifest(body);
  if (!result.valid) {
    return NextResponse.json(
      {
        valid: false,
        errors: result.errors,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    valid: true,
    warnings: result.warnings,
    manifestHash: result.manifestHash,
    capabilityDiff: result.capabilityDiff,
    policyRefs: {
      evaluatorPolicyId: result.manifest.evaluatorPolicyId,
      receiptSchemaId: result.manifest.receiptSchemaId,
      settlementPolicyId: result.manifest.settlementPolicyId,
    },
    runRecordTemplate: {
      agentId: result.manifest.agentId,
      packVersion: result.manifest.version,
      manifestHash: result.manifestHash,
      evaluatorPolicyId: result.manifest.evaluatorPolicyId,
      receiptSchemaId: result.manifest.receiptSchemaId,
      settlementPolicyId: result.manifest.settlementPolicyId,
      receiptStatus: "pending",
      settlementStatus: "not_started",
    },
  });
}
