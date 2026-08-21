import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  buildWorkflowFeedingEvent,
  buildWorkflowSpiritProfile,
} from '@/lib/workflow-spirit';

export const dynamic = 'force-dynamic';

function safeJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/v1/receipts/:receiptId
 *
 * Public proof endpoint for cleared workflow runs.
 * Used by MCP / CLI / external agents to inspect the receipt behind /r/:id.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await params;
  const receipt = await prisma.workflowRunReceipt.findUnique({
    where: { id: receiptId },
    include: {
      workflow: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          trustScore: true,
          runCount: true,
          forkCount: true,
          royaltyBps: true,
          creatorId: true,
        },
      },
      version: {
        select: {
          id: true,
          version: true,
          title: true,
          evaluatorPolicy: true,
          slaMs: true,
        },
      },
      skillCall: {
        select: {
          id: true,
          nonce: true,
          status: true,
          httpStatus: true,
          latencyMs: true,
          createdAt: true,
        },
      },
      session: {
        select: {
          id: true,
          status: true,
          onchainJobId: true,
          basAttestationUid: true,
          skill: {
            select: {
              id: true,
              name: true,
              gatewaySlug: true,
            },
          },
        },
      },
      buyerAgent: {
        select: {
          id: true,
          name: true,
          walletAddress: true,
          trustScore: true,
        },
      },
      creator: {
        select: {
          id: true,
          displayName: true,
          walletAddress: true,
        },
      },
    },
  });

  if (!receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  }

  const spirit = buildWorkflowSpiritProfile({
    workflowId: receipt.workflow.id,
    slug: receipt.workflow.slug,
    name: receipt.workflow.name,
    category: receipt.workflow.category,
    creatorId: receipt.workflow.creatorId,
    creatorName: receipt.creator.displayName,
    runCount: receipt.workflow.runCount,
    forkCount: receipt.workflow.forkCount,
    trustScore: receipt.workflow.trustScore,
    royaltyBps: receipt.workflow.royaltyBps,
  });

  return NextResponse.json({
    id: receipt.id,
    url: `/r/${receipt.id}`,
    workflow: {
      id: receipt.workflow.id,
      slug: receipt.workflow.slug,
      name: receipt.workflow.name,
      trust_score: receipt.workflow.trustScore,
      run_count: receipt.workflow.runCount,
      fork_count: receipt.workflow.forkCount,
      spirit,
    },
    version: receipt.version
      ? {
          id: receipt.version.id,
          version: receipt.version.version,
          title: receipt.version.title,
          evaluator_policy: receipt.version.evaluatorPolicy,
          sla_ms: receipt.version.slaMs,
        }
      : null,
    skill: {
      id: receipt.session.skill.id,
      name: receipt.session.skill.name,
      gateway_slug: receipt.session.skill.gatewaySlug,
    },
    clearing: {
      result: receipt.score > 0 && receipt.settlementStatus === 'paid' ? 'PASS' : 'FAIL',
      score: receipt.score,
      settlement_status: receipt.settlementStatus,
      cost_usdc: receipt.costUsdc,
      quoted_price_usdc: receipt.quotedPriceUsdc,
      max_price_usdc: receipt.maxPriceUsdc,
      creator_received_usdc: receipt.settlementStatus === 'paid'
        ? Math.max(0, receipt.costUsdc * 0.9)
        : 0,
      platform_fee_usdc: receipt.settlementStatus === 'paid' ? receipt.costUsdc * 0.05 : 0,
      reputation_pool_usdc: receipt.settlementStatus === 'paid' ? receipt.costUsdc * 0.05 : 0,
    },
    evaluator: {
      name: receipt.evaluator,
      delivered: receipt.delivered,
      valid_format: receipt.validFormat,
      within_sla: receipt.withinSla,
      latency_ms: receipt.skillCall?.latencyMs ?? null,
      http_status: receipt.skillCall?.httpStatus ?? null,
      evidence: safeJsonArray(receipt.evaluatorEvidence),
    },
    provenance: {
      context_refs: safeJsonArray(receipt.contextRefs),
      plan_summary: receipt.planSummary,
      artifact_refs: safeJsonArray(receipt.artifactRefs),
      evaluator_evidence: safeJsonArray(receipt.evaluatorEvidence),
      skill_version: receipt.skillVersion,
      skill_update_suggested: receipt.skillUpdateSuggested,
      protocol_update_suggested: receipt.protocolUpdateSuggested,
      failure_patch_type: receipt.failurePatchType,
      lineage_parent_workflow_id: receipt.lineageParentWorkflowId,
      lineage_depth: receipt.lineageDepth,
    },
    proof: {
      request_hash: receipt.requestHash,
      response_hash: receipt.responseHash,
      attestation_uid: receipt.attestationUid ?? receipt.session.basAttestationUid,
      anchor_status: receipt.anchorStatus,
      onchain_request_id: receipt.onchainRequestId,
      swap_tx_hash: receipt.swapTxHash,
      settle_tx_hash: receipt.settleTxHash,
      anchor_error: receipt.anchorError,
    },
    participants: {
      buyer_agent: receipt.buyerAgent,
      creator: receipt.creator,
    },
    session: {
      id: receipt.session.id,
      status: receipt.session.status,
      onchain_job_id: receipt.session.onchainJobId,
    },
    feeding_event: buildWorkflowFeedingEvent({
      receiptId: receipt.id,
      score: receipt.score,
      settlementStatus: receipt.settlementStatus,
      spirit,
    }),
    created_at: receipt.createdAt.toISOString(),
  });
}
