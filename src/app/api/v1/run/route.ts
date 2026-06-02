import { NextRequest, NextResponse } from 'next/server';
import { evaluateCall } from '@/lib/session-evaluator';
import { settleSession } from '@/lib/settle-session';
import {
  anchorExecutionAsync,
  PHASE2_ADDRESSES,
  skillIdForSlug,
} from '@/lib/swap-router';
import { prisma } from '@/lib/prisma';
import { parseBody, v1RunInput } from '@/lib/validators';
import { logError } from '@/lib/logger';
import { recordWorkflowRun, type WorkflowReceiptSummary } from '@/lib/workflow-ledger';
import { readCreatorResponseText } from '@/lib/creator-response';
import { isLegacyWorkflowSlug } from '@/lib/legacy-workflow-slugs';
import {
  findServiceSkill,
  receiptRollupsByWorkflowId,
  serviceDescriptor,
  serviceRouterDescriptor,
  serviceSlugFromSkill,
  validateRuntimeServiceEndpoint,
} from '@/lib/service-gateway';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/run
 *
 * Dead-simple REST wrapper for agent developers.
 * One HTTP call = find service → find/create session → execute → evaluate → receipt.
 *
 * Auth: Bearer API key (not Privy JWT).
 * Agent developers never see sessions, nonces, or escrow.
 *
 * Request:
 *   { "service": "sll-r/refund-negotiator", "input": { "order_id": "ord_123" } }
 *
 * Legacy request:
 *   { "skill": "jiagon-negotiator", "input": { "repo_url": "https://github.com/garrytan/gbrain" } }
 *
 * Response:
 *   { "result": { ... }, "cost": 0.003, "balance": 9.997, "score": 1.0, "session_id": "..." }
 */
export async function POST(req: NextRequest) {
  // --- Auth: Bearer API key ---
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing Authorization: Bearer <api_key>' },
      { status: 401 },
    );
  }
  const apiKey = auth.slice(7).trim();

  const user = await prisma.user.findUnique({ where: { apiKey } });
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // --- Parse body ---
  const parsed = await parseBody(req, v1RunInput);
  if (!parsed.success) return parsed.response;
  const { input, provenance } = parsed.data;
  const requestedService = (parsed.data.service ?? parsed.data.skill ?? parsed.data.workflow)!;

  // --- Resolve external service to executable skill ---
  const skill = await findServiceSkill(requestedService);
  if (!skill) {
    return NextResponse.json(
      {
        error: `Service "${requestedService}" not found`,
        router: serviceRouterDescriptor(requestedService, null),
      },
      { status: 404 },
    );
  }

  const matchedService = serviceSlugFromSkill(skill);
  const skillSlug = skill.gatewaySlug;
  const endpointUrl = skill.endpointUrl;
  if (!skillSlug) {
    return NextResponse.json(
      {
        error: `Service "${requestedService}" is missing a gateway slug`,
        router: serviceRouterDescriptor(requestedService, matchedService),
      },
      { status: 409 },
    );
  }

  if (!endpointUrl) {
    return NextResponse.json(
      {
        error: `Service "${requestedService}" is missing an endpoint`,
        router: serviceRouterDescriptor(requestedService, matchedService),
      },
      { status: 409 },
    );
  }

  if (!skill.workflow || isLegacyWorkflowSlug(skillSlug) || isLegacyWorkflowSlug(skill.workflow.slug)) {
    return NextResponse.json(
      {
        error: `Service "${requestedService}" is not receipt-backed`,
        code: 'SERVICE_RECEIPT_REQUIRED',
        router: serviceRouterDescriptor(requestedService, matchedService),
        receipt_policy: {
          guaranteed: false,
          required: true,
          reason: 'AgentShack services must have a published workflow wrapper before paid run-once execution.',
        },
      },
      { status: 409 },
    );
  }

  const pricePerCall = skill.pricePerCall ?? 0;
  const onchainSkillId = skill.gatewaySlug ? skillIdForSlug(skill.gatewaySlug) : null;
  const endpointError = await validateRuntimeServiceEndpoint(endpointUrl);
  if (endpointError) {
    return NextResponse.json(
      {
        error: endpointError,
        code: 'SERVICE_ENDPOINT_BLOCKED',
        router: serviceRouterDescriptor(requestedService, matchedService),
      },
      { status: 409 },
    );
  }

  // --- Balance check ---
  if (user.creditBalance < pricePerCall) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        balance: user.creditBalance,
        required: pricePerCall,
        service: matchedService,
        authorization: {
          type: 'api_key',
          balance_required_usdc: pricePerCall,
          balance_available_usdc: user.creditBalance,
        },
      },
      { status: 402 },
    );
  }

  // --- Find or create session for this user+skill ---
  // Reuse an open session if available; otherwise create one.
  const agent = await prisma.agent.findFirst({
    where: { ownerId: user.id },
  });

  if (!agent) {
    return NextResponse.json(
      { error: 'No agent found. Create an agent first.' },
      { status: 400 },
    );
  }

  let session = await prisma.session.findFirst({
    where: {
      payerAgentId: agent.id,
      skillId: skill.id,
      status: { in: ['funded', 'active'] },
      expiresAt: { gt: new Date() },
      budgetRemaining: { gte: pricePerCall },
    },
    orderBy: { openedAt: 'desc' },
  });

  if (!session) {
    // Auto-create a session with budget = user's full credit balance
    const budget = Math.min(user.creditBalance, 100); // cap at $100 per session
    session = await prisma.session.create({
      data: {
        payerAgentId: agent.id,
        skillId: skill.id,
        budgetTotal: budget,
        budgetRemaining: budget,
        pricePerCall,
        status: 'funded',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        // TODO(F6): Phase 2 — bind session to BSC on-chain job via AgenticCommerceHooked.
        // onchainJobId is intentionally null here; REST API sessions are off-chain only.
        // On-chain binding requires: agent wallet + createJob + setBudget + fund (see bsc-acp.ts).
      },
    });
  }

  // --- Compute nonce (max existing + 1) ---
  const lastCall = await prisma.skillCall.findFirst({
    where: { sessionId: session.id },
    orderBy: { nonce: 'desc' },
    select: { nonce: true },
  });
  const nonce = (lastCall?.nonce ?? 0) + 1;

  // --- Forward to skill endpoint ---
  const rawBody = JSON.stringify(input ?? {});
  const start = Date.now();
  let creatorStatus = 0;
  let creatorBody = '';
  let failed = false;
  let failureReason = '';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Dojo-SkillSlug': skillSlug,
    };
    if (skill.creatorHmacSecret) {
      // HMAC auth for creator endpoint
      const { createHmac } = await import('crypto');
      headers['X-Dojo-HMAC'] = createHmac('sha256', skill.creatorHmacSecret)
        .update(rawBody)
        .digest('hex');
    }

    // Re-resolve immediately before fetch to narrow DNS rebinding TOCTOU.
    // Residual gap: fetch performs its own lookup; a pinned-IP dispatcher would
    // eliminate that final race while keeping redirect: 'error'.
    const fetchEndpointError = await validateRuntimeServiceEndpoint(endpointUrl);
    if (fetchEndpointError) {
      return NextResponse.json(
        {
          error: fetchEndpointError,
          code: 'SERVICE_ENDPOINT_BLOCKED',
          router: serviceRouterDescriptor(requestedService, matchedService),
        },
        { status: 409 },
      );
    }

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });

    creatorStatus = res.status;
    const read = await readCreatorResponseText(res);
    if (read.ok) {
      creatorBody = read.text;
    } else {
      failed = true;
      failureReason = read.error;
    }
  } catch (err) {
    failed = true;
    failureReason = err instanceof Error ? err.message : 'Skill endpoint unreachable or timed out';
  }

  const latencyMs = Date.now() - start;

  // --- Evaluate ---
  const requestHash = `nonce:${nonce}:${session.id}`;
  const evalResult = evaluateCall(creatorStatus, creatorBody, latencyMs, failed);

  // --- Write SkillCall + decrement budget atomically ---
  const shouldCharge = !failed && creatorStatus > 0;
  const cost = shouldCharge ? pricePerCall : 0;
  let workflowReceipt: WorkflowReceiptSummary | null = null;
  let postTransactionBalance = user.creditBalance;

  try {
    await prisma.$transaction(async (tx) => {
      const skillCall = await tx.skillCall.create({
        data: {
          sessionId: session!.id,
          nonce,
          requestHash,
          status: failed ? 'gateway_error' : creatorStatus < 400 ? 'success' : 'creator_error',
          httpStatus: creatorStatus,
          latencyMs,
          costUsdc: cost,
          responseHash: evalResult.responseHash,
          delivered: evalResult.delivered,
          validFormat: evalResult.validFormat,
          withinSla: evalResult.withinSla,
          score: evalResult.score,
        },
      });

      workflowReceipt = await recordWorkflowRun(tx, {
        skillId: skill.id,
        skillCallId: skillCall.id,
        sessionId: session!.id,
        buyerAgentId: agent.id,
        requestHash,
        responseHash: evalResult.responseHash,
        delivered: evalResult.delivered,
        validFormat: evalResult.validFormat,
        withinSla: evalResult.withinSla,
        score: evalResult.score,
        costUsdc: cost,
        settlementStatus: shouldCharge ? 'paid' : 'refunded',
        httpStatus: creatorStatus,
        latencyMs,
        failureReason: failureReason || null,
        provenance: {
          contextRefs: [
            'api:/api/v1/run',
            `service:${matchedService}`,
            `skill:${skillSlug}`,
            `session:${session!.id}`,
            `nonce:${nonce}`,
            ...(provenance?.contextRefs ?? []),
          ],
          planSummary: provenance?.planSummary ?? `Run ${skillSlug} through the REST clearing path.`,
          artifactRefs: provenance?.artifactRefs ?? (
            evalResult.responseHash ? [`response:${evalResult.responseHash}`] : []
          ),
          evaluatorEvidence: provenance?.evaluatorEvidence,
          skillUpdateSuggested: provenance?.skillUpdateSuggested ?? (!evalResult.delivered || !evalResult.validFormat),
          protocolUpdateSuggested: provenance?.protocolUpdateSuggested ?? failed,
          failurePatchType: provenance?.failurePatchType ?? (failed ? 'protocol' : null),
          quotedPriceUsdc: provenance?.quotedPriceUsdc ?? pricePerCall,
          maxPriceUsdc: provenance?.maxPriceUsdc ?? pricePerCall,
        },
      });

      if (shouldCharge) {
        // Decrement session budget
        const updated = await tx.session.updateMany({
          where: {
            id: session!.id,
            status: { in: ['funded', 'active'] },
            budgetRemaining: { gte: pricePerCall },
          },
          data: {
            budgetRemaining: { decrement: pricePerCall },
            callCount: { increment: 1 },
            status: 'active',
          },
        });

        if (updated.count === 0) {
          throw new Error('SESSION_CLOSED_OR_EXHAUSTED');
        }

        // Decrement user credit balance — guard prevents negative balance under concurrency (F3)
        const userUpdated = await tx.user.updateMany({
          where: { id: user.id, creditBalance: { gte: pricePerCall } },
          data: { creditBalance: { decrement: pricePerCall } },
        });

        if (userUpdated.count === 0) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
      }

      const updatedUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { creditBalance: true },
      });
      postTransactionBalance = updatedUser?.creditBalance ?? postTransactionBalance;
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Transaction failed';
    if (msg === 'SESSION_CLOSED_OR_EXHAUSTED') {
      return NextResponse.json(
        { error: 'Session exhausted during call. Retry.' },
        { status: 409 },
      );
    }
    if (msg === 'INSUFFICIENT_BALANCE') {
      return NextResponse.json(
        { error: 'Insufficient credits — concurrent call drained balance.' },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // --- Auto-close: settle session when budget exhausted ---
  // Re-read after transaction to get the actual post-decrement value.
  // session.budgetRemaining is a pre-transaction snapshot that doesn't reflect
  // concurrent decrements — using it would miss auto-settle under concurrency.
  let settleTriggered = false;
  if (shouldCharge) {
    const latest = await prisma.session.findUnique({
      where: { id: session.id },
      select: { budgetRemaining: true },
    });
    if (latest && latest.budgetRemaining < pricePerCall) {
      settleTriggered = true;
      // Fire-and-forget: settle session in background (idempotent)
      void settleSession(session.id).catch((err) => {
        logError('v1/run:settle', err, { sessionId: session.id });
      });
    }
  }

  // --- Parse creator response ---
  let result: unknown = creatorBody;
  try {
    result = JSON.parse(creatorBody);
  } catch {
    // keep as string
  }
  const receiptForResponse = workflowReceipt as WorkflowReceiptSummary | null;
  const serviceRollups = await receiptRollupsByWorkflowId([skill.workflow.id]);
  const serviceSummary = serviceDescriptor(skill, serviceRollups.get(skill.workflow.id));
  const router = serviceRouterDescriptor(requestedService, matchedService);
  const buildReceiptResponse = () => (
    receiptForResponse
      ? {
          id: receiptForResponse.id,
          url: `/r/${receiptForResponse.id}`,
          workflow_id: receiptForResponse.workflowId,
          version_id: receiptForResponse.versionId,
          settlement_status: receiptForResponse.settlementStatus,
          anchor_status: receiptForResponse.anchorStatus,
          onchain_request_id: receiptForResponse.onchainRequestId,
          swap_tx_hash: receiptForResponse.swapTxHash,
          settle_tx_hash: receiptForResponse.settleTxHash,
          provenance: receiptForResponse.provenance,
        }
      : null
  );

  // --- Response ---
  if (failed) {
    const receiptResponse = buildReceiptResponse();
    return NextResponse.json(
      {
        error: 'Skill endpoint unreachable or timed out',
        reason: failureReason || undefined,
        service: serviceSummary,
        router,
        cost: 0,
        balance: postTransactionBalance,
        session_id: session.id,
        receipt: receiptResponse,
        workflow_receipt: receiptResponse,
      },
      { status: 502 },
    );
  }

  // --- Phase 2 on-chain anchor (fire-and-forget) ---
  // Anchor successful executions to BSC via SwapRouter best-effort. The DB receipt
  // is the Phase 1 proof; tx hashes are written back asynchronously when available.
  let onchainPromise: Promise<void> | null = null;
  if (shouldCharge && onchainSkillId) {
    if (receiptForResponse) {
      receiptForResponse.anchorStatus = 'pending';
      void prisma.workflowRunReceipt.update({
        where: { id: receiptForResponse.id },
        data: { anchorStatus: 'pending', anchorError: null },
      }).catch((err) => logError('v1/run:anchor-pending', err, { receiptId: receiptForResponse.id }));
    }
    onchainPromise = anchorExecutionAsync(
      onchainSkillId,
      !failed,
      evalResult.responseHash,
      provenance?.maxPriceUsdc ?? pricePerCall,
    )
      .then(async (r) => {
        if (receiptForResponse) {
          receiptForResponse.anchorStatus = r.ok ? 'settled' : 'failed';
          receiptForResponse.onchainRequestId = r.requestId ?? null;
          receiptForResponse.swapTxHash = r.swapTxHash ?? null;
          receiptForResponse.settleTxHash = r.settleTxHash ?? null;
          await prisma.workflowRunReceipt.update({
            where: { id: receiptForResponse.id },
            data: {
              anchorStatus: r.ok ? 'settled' : 'failed',
              onchainRequestId: r.requestId ?? null,
              swapTxHash: r.swapTxHash ?? null,
              settleTxHash: r.settleTxHash ?? null,
              anchorError: r.error ?? null,
            },
          });
        }
        if (r.ok) {
          console.log('[v1/run] anchored', {
            skill: skillSlug,
            requestId: r.requestId,
            swap: r.swapTxHash,
            settle: r.settleTxHash,
          });
        } else {
          console.warn('[v1/run] anchor failed', {
            skill: skillSlug,
            receiptId: receiptForResponse?.id,
            error: r.error,
          });
        }
      })
      .catch(async (err) => {
        if (receiptForResponse) {
          await prisma.workflowRunReceipt.update({
            where: { id: receiptForResponse.id },
            data: {
              anchorStatus: 'failed',
              anchorError: err instanceof Error ? err.message : String(err),
            },
          }).catch((updateErr) => logError('v1/run:anchor-update-failed', updateErr, {
            receiptId: receiptForResponse.id,
          }));
        }
        logError('v1/run:anchor', err, { skill: skillSlug });
      });
  }
  const receiptResponse = buildReceiptResponse();

  return NextResponse.json({
    result,
    service: serviceSummary,
    router,
    mode: 'run_once',
    cost,
    balance: postTransactionBalance,
    score: evalResult.score,
    session_id: session.id,
    receipt: receiptResponse,
    workflow_receipt: receiptResponse,
    reputation_update: receiptForResponse
      ? {
          service: matchedService,
          receipt_id: receiptForResponse.id,
          workflow_id: receiptForResponse.workflowId,
          score: evalResult.score,
          settlement_status: receiptForResponse.settlementStatus,
        }
      : null,
    latency_ms: latencyMs,
    ...(settleTriggered && { settle_triggered: true }),
    ...(onchainPromise && {
      onchain: {
        chain: 'bsc-testnet',
        router: PHASE2_ADDRESSES.swapRouter,
        anchored: 'pending',
        workflow_receipt_id: receiptForResponse?.id,
      },
    }),
  });
}
