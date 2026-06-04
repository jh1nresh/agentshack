import { NextRequest, NextResponse } from "next/server";
import { validateAgentPackManifest } from "@/lib/agent-pack-manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 128 * 1024;

async function readBoundedJson(req: NextRequest): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; error: string }
> {
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const byteLength = Number(contentLength);
    if (Number.isFinite(byteLength) && byteLength > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: "Request body too large" };
    }
  }

  if (!req.body) {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: "Request body too large" };
    }
    chunks.push(value);
  }

  try {
    const bodyText = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : Buffer.concat(chunks),
    );
    return { ok: true, body: JSON.parse(bodyText) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }
}

/**
 * POST /api/agent-packs/validate
 *
 * Stateless Agent Pack Manifest validation. This does not publish, install,
 * execute, bill, or store anything.
 */
export async function POST(req: NextRequest) {
  const parsed = await readBoundedJson(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = validateAgentPackManifest(parsed.body);
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
