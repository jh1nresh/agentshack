import type { Prisma } from '@prisma/client';

type EvaluatorEvidence = Record<string, string | number | boolean | null>;

export interface ReceiptProvenanceInput {
  contextRefs?: string[] | null;
  planSummary?: string | null;
  artifactRefs?: string[] | null;
  evaluatorEvidence?: EvaluatorEvidence[] | null;
  skillUpdateSuggested?: boolean | null;
  protocolUpdateSuggested?: boolean | null;
  failurePatchType?: 'skill' | 'protocol' | 'work_order' | 'memory' | null;
  quotedPriceUsdc?: number | null;
  maxPriceUsdc?: number | null;
}

interface RecordWorkflowRunInput {
  skillId: string;
  skillCallId: string;
  sessionId: string;
  buyerAgentId: string;
  requestHash: string;
  responseHash: string | null;
  delivered: boolean;
  validFormat: boolean;
  withinSla: boolean;
  score: number;
  costUsdc: number;
  settlementStatus: string;
  httpStatus?: number | null;
  latencyMs?: number | null;
  failureReason?: string | null;
  provenance?: ReceiptProvenanceInput | null;
}

export interface WorkflowReceiptSummary {
  id: string;
  workflowId: string;
  versionId: string | null;
  settlementStatus: string;
  anchorStatus: string;
  onchainRequestId: string | null;
  swapTxHash: string | null;
  settleTxHash: string | null;
  provenance: {
    contextRefs: string[];
    artifactRefs: string[];
    evaluatorEvidence: EvaluatorEvidence[];
    skillVersion: number | null;
    lineageParentWorkflowId: string | null;
    lineageDepth: number;
  };
}

const MAX_REF_COUNT = 24;
const MAX_REF_LENGTH = 512;
const MAX_PLAN_LENGTH = 2_000;
const MAX_EVIDENCE_COUNT = 16;

function cleanRefs(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, MAX_REF_COUNT)
    .map((value) => value.slice(0, MAX_REF_LENGTH));
}

function cleanPlanSummary(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_PLAN_LENGTH) : null;
}

function cleanEvaluatorEvidence(values: EvaluatorEvidence[] | null | undefined): EvaluatorEvidence[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value))
    .slice(0, MAX_EVIDENCE_COUNT)
    .map((entry) => Object.fromEntries(
      Object.entries(entry).map(([key, value]) => [
        key.slice(0, 64),
        typeof value === 'string' ? value.slice(0, 512) : value,
      ]),
    ));
}

function optionalJsonArray<T>(values: T[]): string | null {
  return values.length > 0 ? JSON.stringify(values) : null;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildDefaultEvaluatorEvidence(input: RecordWorkflowRunInput): EvaluatorEvidence {
  return {
    evaluator: 'dojo-sanity-v1',
    delivered: input.delivered,
    valid_format: input.validFormat,
    within_sla: input.withinSla,
    score: input.score,
    settlement_status: input.settlementStatus,
    cost_usdc: input.costUsdc,
    http_status: input.httpStatus ?? null,
    latency_ms: input.latencyMs ?? null,
    failure_reason: input.failureReason ?? null,
  };
}

async function resolveWorkflowLineage(
  tx: Prisma.TransactionClient,
  workflowId: string,
): Promise<{ lineageParentWorkflowId: string | null; lineageDepth: number }> {
  let childWorkflowId: string | null = workflowId;
  let lineageParentWorkflowId: string | null = null;
  let lineageDepth = 0;
  const visited = new Set<string>();

  while (childWorkflowId && !visited.has(childWorkflowId) && lineageDepth < 32) {
    const currentChildWorkflowId: string = childWorkflowId;
    visited.add(currentChildWorkflowId);
    const fork: { parentWorkflowId: string } | null = await tx.workflowFork.findUnique({
      where: { childWorkflowId: currentChildWorkflowId },
      select: { parentWorkflowId: true },
    });

    if (!fork?.parentWorkflowId) break;
    lineageParentWorkflowId ??= fork.parentWorkflowId;
    lineageDepth += 1;
    childWorkflowId = fork.parentWorkflowId;
  }

  return { lineageParentWorkflowId, lineageDepth };
}

export async function recordWorkflowRun(
  tx: Prisma.TransactionClient,
  input: RecordWorkflowRunInput,
): Promise<WorkflowReceiptSummary | null> {
  const workflow = await tx.workflow.findUnique({
    where: { skillId: input.skillId },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!workflow) return null;

  const latestVersion = workflow.versions[0] ?? null;
  const provenance = input.provenance ?? {};
  const contextRefs = cleanRefs(provenance.contextRefs);
  const artifactRefs = cleanRefs(provenance.artifactRefs);
  const evaluatorEvidence = [
    buildDefaultEvaluatorEvidence(input),
    ...cleanEvaluatorEvidence(provenance.evaluatorEvidence),
  ];
  const { lineageParentWorkflowId, lineageDepth } = await resolveWorkflowLineage(tx, workflow.id);
  const receipt = await tx.workflowRunReceipt.create({
    data: {
      workflowId: workflow.id,
      versionId: latestVersion?.id,
      skillCallId: input.skillCallId,
      sessionId: input.sessionId,
      buyerAgentId: input.buyerAgentId,
      creatorId: workflow.creatorId,
      requestHash: input.requestHash,
      responseHash: input.responseHash,
      delivered: input.delivered,
      validFormat: input.validFormat,
      withinSla: input.withinSla,
      score: input.score,
      costUsdc: input.costUsdc,
      settlementStatus: input.settlementStatus,
      contextRefs: optionalJsonArray(contextRefs),
      planSummary: cleanPlanSummary(provenance.planSummary),
      artifactRefs: optionalJsonArray(artifactRefs),
      evaluatorEvidence: optionalJsonArray(evaluatorEvidence),
      skillVersion: latestVersion?.version ?? null,
      skillUpdateSuggested: provenance.skillUpdateSuggested ?? false,
      protocolUpdateSuggested: provenance.protocolUpdateSuggested ?? false,
      failurePatchType: provenance.failurePatchType ?? null,
      quotedPriceUsdc: finiteNumber(provenance.quotedPriceUsdc),
      maxPriceUsdc: finiteNumber(provenance.maxPriceUsdc),
      lineageParentWorkflowId,
      lineageDepth,
    },
  });

  const nextRunCount = workflow.runCount + 1;
  const nextTrustScore =
    ((workflow.trustScore * workflow.runCount) + (input.score * 100)) / nextRunCount;

  await tx.workflow.update({
    where: { id: workflow.id },
    data: {
      runCount: { increment: 1 },
      trustScore: nextTrustScore,
    },
  });

  return {
    id: receipt.id,
    workflowId: receipt.workflowId,
    versionId: receipt.versionId,
    settlementStatus: receipt.settlementStatus,
    anchorStatus: receipt.anchorStatus,
    onchainRequestId: receipt.onchainRequestId,
    swapTxHash: receipt.swapTxHash,
    settleTxHash: receipt.settleTxHash,
    provenance: {
      contextRefs,
      artifactRefs,
      evaluatorEvidence,
      skillVersion: receipt.skillVersion,
      lineageParentWorkflowId: receipt.lineageParentWorkflowId,
      lineageDepth: receipt.lineageDepth,
    },
  };
}

export async function reconcileSessionReceipts(
  tx: Prisma.TransactionClient,
  sessionId: string,
  settlementStatus: 'paid' | 'refunded',
  anchor?: {
    status?: 'settled' | 'failed';
    settleTxHash?: string | null;
    error?: string | null;
  },
) {
  const anchorData = {
    ...(anchor?.status && { anchorStatus: anchor.status }),
    ...(anchor?.settleTxHash !== undefined && { settleTxHash: anchor.settleTxHash }),
    ...(anchor?.error !== undefined && { anchorError: anchor.error }),
  };

  await tx.workflowRunReceipt.updateMany({
    where: settlementStatus === 'paid'
      ? { sessionId, settlementStatus: 'paid' }
      : { sessionId },
    data: settlementStatus === 'paid'
      ? anchorData
      : { settlementStatus, ...anchorData },
  });
}
