/**
 * POST /api/gateway/skills/[slug]/run
 *
 * Core Dojo Gateway endpoint. Agents call this to invoke a creator's active
 * skill. The request must carry an EIP-712 signed auth envelope in headers.
 *
 * Flow:
 *  1. Parse + validate all required headers
 *  2. Check expiresAt window (5-min max, must be future)
 *  3. Resolve skill by gatewaySlug (must be active)
 *  4. Verify requestHash = keccak256(rawBody)
 *  5. EIP-712 sig verify against BSC AgentIdentity; guarded by DOJO_GATEWAY_SKIP_SIG_CHECK in dev
 *  6. Resolve Session bound to (onchainJobId, skillId)
 *  7. Validate session state + expiry + budget
 *  8. Forward request to creator endpoint with HMAC header (30s timeout)
 *  9. Write SkillCall + decrement budgetRemaining atomically (P2002 → 409 replay)
 * 10. Return creator response with X-Dojo-* metadata headers
 *
 * Specs:
 *   specs/2026-04-05-agent-gateway-auth.md
 *   specs/2026-04-05-gateway-architecture.md
 *   specs/2026-04-05-session-as-job-migration.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { keccak256, toHex } from 'viem';
import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { evaluateCall } from '@/lib/session-evaluator';
import { decideRunClearing } from '@/lib/run-clearing';
import { generateX402Headers } from '@/lib/x402';
import { verifyGatewayAuth } from '@/lib/gateway-auth';
import { recordWorkflowRun } from '@/lib/workflow-ledger';
import { readCreatorResponseText } from '@/lib/creator-response';
import {
  validateRegisteredWorkflowSlug,
} from '@/lib/swap-router';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorJson(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

function isPrismaP2002(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

async function requireRegisteredWorkflow(gatewaySlug: string): Promise<NextResponse | null> {
  const registry = await validateRegisteredWorkflowSlug(gatewaySlug);
  if (registry.ok) return null;
  if (registry.status === 503) {
    return NextResponse.json(
      {
        error: registry.error,
        code: registry.code,
        skill: gatewaySlug,
        skill_id: registry.skillId,
        registry: registry.registry,
        reason: registry.reason,
      },
      { status: registry.status },
    );
  }

  return NextResponse.json(
    {
      error: registry.error,
      code: registry.code,
      skill: gatewaySlug,
      skill_id: registry.skillId,
      registry: registry.registry,
      active: registry.active,
      reason: registry.reason,
    },
    { status: registry.status },
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const gatewaySlug = slug;

    // -------------------------------------------------------------------------
    // 1. Parse headers — all required
    // -------------------------------------------------------------------------
    const authSig       = req.headers.get('X-Dojo-Auth');
    const jobIdHeader   = req.headers.get('X-Dojo-JobId');
    const tokenIdHeader = req.headers.get('X-Dojo-AgentTokenId');
    const nonceHeader   = req.headers.get('X-Dojo-Nonce');
    const expiresHeader = req.headers.get('X-Dojo-ExpiresAt');
    const hashHeader    = req.headers.get('X-Dojo-RequestHash');

    // If no Dojo session headers at all → return 402 + x402 payment discovery headers.
    // This is the x402 flow: agent hits gateway, gets 402 telling it how to pay.
    const hasAnyHeader = authSig || jobIdHeader || tokenIdHeader || nonceHeader || expiresHeader || hashHeader;
    if (!hasAnyHeader) {
      const skill = await prisma.skill.findUnique({
        where: { gatewaySlug },
        include: { creator: true },
      });
      if (!skill) {
        return errorJson('skill-not-found', `No skill found for gateway slug: ${gatewaySlug}`, 404);
      }
      const registryError = await requireRegisteredWorkflow(gatewaySlug);
      if (registryError) return registryError;
      const creatorAddress = (skill.creator.walletAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
      const x402Headers = generateX402Headers(skill, creatorAddress);
      return NextResponse.json(
        {
          error: 'Payment required — fund an ERC-8183 escrow session to call this skill.',
          code: 'payment-required',
          skill: { id: skill.id, name: skill.name, slug: skill.gatewaySlug, pricePerCall: skill.pricePerCall },
        },
        {
          status: 402,
          headers: x402Headers,
        }
      );
    }

    if (
      !authSig ||
      !jobIdHeader ||
      !tokenIdHeader ||
      !nonceHeader ||
      !expiresHeader ||
      !hashHeader
    ) {
      return errorJson(
        'missing-headers',
        'Missing required headers: X-Dojo-Auth, X-Dojo-JobId, X-Dojo-AgentTokenId, X-Dojo-Nonce, X-Dojo-ExpiresAt, X-Dojo-RequestHash',
        400
      );
    }

    if (!/^\d+$/.test(nonceHeader) || !/^\d+$/.test(expiresHeader) || !/^\d+$/.test(tokenIdHeader)) {
      return errorJson(
        'missing-headers',
        'X-Dojo-Nonce, X-Dojo-ExpiresAt, and X-Dojo-AgentTokenId must be decimal integers',
        400
      );
    }

    const nonce = Number(nonceHeader);
    const expiresAt = Number(expiresHeader);
    let agentTokenId: bigint;
    try {
      agentTokenId = BigInt(tokenIdHeader);
    } catch {
      return errorJson(
        'missing-headers',
        'X-Dojo-AgentTokenId must be a valid uint256',
        400
      );
    }

    if (
      !Number.isSafeInteger(nonce) ||
      !Number.isSafeInteger(expiresAt) ||
      nonce <= 0 ||
      nonce > 2_147_483_647 ||
      expiresAt <= 0 ||
      agentTokenId <= 0n
    ) {
      return errorJson(
        'missing-headers',
        'X-Dojo-Nonce, X-Dojo-ExpiresAt, and X-Dojo-AgentTokenId must be positive bounded integers',
        400
      );
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(hashHeader)) {
      return errorJson(
        'missing-headers',
        'X-Dojo-RequestHash must be a bytes32 hex string',
        400
      );
    }

    // -------------------------------------------------------------------------
    // 2. expiresAt check — must be now < exp <= now+300
    // -------------------------------------------------------------------------
    const nowSec = Math.floor(Date.now() / 1000);

    if (expiresAt <= nowSec) {
      return errorJson('expired', 'X-Dojo-ExpiresAt is in the past', 401);
    }

    if (expiresAt > nowSec + 300) {
      return errorJson(
        'expiry-too-far',
        'X-Dojo-ExpiresAt must not exceed now + 300 seconds',
        401
      );
    }

    // -------------------------------------------------------------------------
    // 3. Slug lookup — skill must exist + be active type
    // -------------------------------------------------------------------------
    const skill = await prisma.skill.findUnique({
      where: { gatewaySlug },
      select: {
        id: true,
        name: true,
        skillType: true,
        endpointUrl: true,
        fileContent: true,
        creatorHmacSecret: true,
      },
    });

    if (!skill) {
      return errorJson(
        'skill-not-found',
        `No skill found for gateway slug: ${gatewaySlug}`,
        404
      );
    }

    const registryError = await requireRegisteredWorkflow(gatewaySlug);
    if (registryError) return registryError;

    // -------------------------------------------------------------------------
    // 4. requestHash check — keccak256(rawBody) must match header
    //    MUST read body as raw text so the hash matches what the agent hashed.
    // -------------------------------------------------------------------------
    const rawBody = await req.text();
    const computedHash = keccak256(toHex(rawBody));

    if (computedHash.toLowerCase() !== hashHeader.toLowerCase()) {
      return errorJson(
        'body-tamper',
        'X-Dojo-RequestHash does not match keccak256(body)',
        400
      );
    }

    // -------------------------------------------------------------------------
    // 5. EIP-712 signature verify.
    // AgentIdentity is not ERC-721; validate recovered signer via agentIdOf(signer).
    // -------------------------------------------------------------------------
    const skipSigCheck =
      process.env.DOJO_GATEWAY_SKIP_SIG_CHECK === 'true' &&
      process.env.NODE_ENV !== 'production';

    let verifiedSigner: `0x${string}` | null = null;
    if (!skipSigCheck) {
      const auth = await verifyGatewayAuth({
        signature: authSig,
        jobId: jobIdHeader,
        agentTokenId,
        nonce: BigInt(nonce),
        expiresAt: BigInt(expiresAt),
        requestHash: hashHeader as `0x${string}`,
        skill: gatewaySlug,
      });
      if (!auth.ok) {
        return errorJson(auth.code, auth.error, 401);
      }
      verifiedSigner = auth.signer;
    } else {
      console.log(
        '[POST /api/gateway/skills/[slug]/run] DOJO_GATEWAY_SKIP_SIG_CHECK=true — ' +
          'skipping EIP-712 sig verify in dev mode'
      );
    }

    // -------------------------------------------------------------------------
    // 6. Session lookup — bound to (onchainJobId, skillId)
    //    Fallback: also match by session.id for testnet/dev where onchainJobId
    //    may not be set yet (BSC binding is fire-and-forget, can lag behind).
    // -------------------------------------------------------------------------
    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { onchainJobId: jobIdHeader, skillId: skill.id },
          { id: jobIdHeader, skillId: skill.id },
        ],
      },
      include: {
        agent: {
          select: {
            walletAddress: true,
          },
        },
      },
    });

    if (!session) {
      return errorJson(
        'session-not-bound',
        `No session found for jobId=${jobIdHeader} bound to skill ${gatewaySlug}`,
        403
      );
    }

    if (!skipSigCheck) {
      if (!session.agent.walletAddress) {
        return errorJson(
          'session-agent-wallet-missing',
          'Session payer agent has no wallet address bound',
          403
        );
      }
      if (verifiedSigner?.toLowerCase() !== session.agent.walletAddress.toLowerCase()) {
        return errorJson(
          'signer-session-mismatch',
          'EIP-712 signer does not match the session payer agent wallet',
          403
        );
      }
    }

    // -------------------------------------------------------------------------
    // 7a. Session state — must be 'funded' or 'active'
    // -------------------------------------------------------------------------
    if (session.status !== 'funded' && session.status !== 'active') {
      return errorJson(
        'session-invalid-state',
        `Session is in state '${session.status}' — only 'funded' or 'active' sessions can be used`,
        403
      );
    }

    // -------------------------------------------------------------------------
    // 7b. Session expiry
    // -------------------------------------------------------------------------
    if (session.expiresAt <= new Date()) {
      return errorJson(
        'session-expired',
        'Session has expired. Open a new session to continue.',
        403
      );
    }

    // -------------------------------------------------------------------------
    // 7c. Budget check — must have at least pricePerCall remaining
    // -------------------------------------------------------------------------
    if (session.budgetRemaining < session.pricePerCall) {
      return errorJson(
        'insufficient-escrow',
        `Session budget exhausted: ${session.budgetRemaining} USDC remaining, pricePerCall=${session.pricePerCall} USDC`,
        402
      );
    }

    // -------------------------------------------------------------------------
    // 8. Passive skill — return fileContent directly, skip creator forward
    // -------------------------------------------------------------------------
    if (skill.skillType === 'passive') {
      const content = skill.fileContent ?? '(no content)';
      const evalResult = evaluateCall(200, content, 0, false);
      let workflowReceiptId: string | null = null;

      try {
        await prisma.$transaction(async (tx) => {
          const skillCall = await tx.skillCall.create({
            data: {
              sessionId: session.id,
              nonce,
              requestHash: hashHeader,
              status: 'success',
              httpStatus: 200,
              latencyMs: 0,
              costUsdc: session.pricePerCall,
              responseHash: evalResult.responseHash,
              delivered: evalResult.delivered,
              validFormat: evalResult.validFormat,
              withinSla: evalResult.withinSla,
              score: evalResult.score,
            },
          });
          const receipt = await recordWorkflowRun(tx, {
            skillId: skill.id,
            skillCallId: skillCall.id,
            sessionId: session.id,
            buyerAgentId: session.payerAgentId,
            requestHash: hashHeader,
            responseHash: evalResult.responseHash,
            delivered: evalResult.delivered,
            validFormat: evalResult.validFormat,
            withinSla: evalResult.withinSla,
            score: evalResult.score,
            costUsdc: session.pricePerCall,
            settlementStatus: 'paid',
            httpStatus: 200,
            latencyMs: 0,
            provenance: {
              contextRefs: [
                `gateway:${gatewaySlug}`,
                `session:${session.id}`,
                `nonce:${nonce}`,
                `job:${jobIdHeader}`,
                `agent_token:${tokenIdHeader}`,
                'mode:passive',
              ],
              planSummary: `Run passive workflow ${gatewaySlug} through funded gateway session.`,
              artifactRefs: evalResult.responseHash ? [`response:${evalResult.responseHash}`] : [],
              quotedPriceUsdc: session.pricePerCall,
              maxPriceUsdc: session.pricePerCall,
            },
          });
          workflowReceiptId = receipt?.id ?? null;
          const updateResult = await tx.session.updateMany({
            where: {
              id: session.id,
              status: { in: ['funded', 'active'] },
              budgetRemaining: { gte: session.pricePerCall },
            },
            data: {
              budgetRemaining: { decrement: session.pricePerCall },
              callCount: { increment: 1 },
              status: 'active',
            },
          });

          if (updateResult.count === 0) {
            throw new Error('SESSION_CLOSED_OR_EXHAUSTED');
          }
        });
      } catch (txErr: unknown) {
        if (txErr instanceof Error && txErr.message === 'SESSION_CLOSED_OR_EXHAUSTED') {
          return errorJson(
            'session-closed',
            'Session was closed or budget exhausted during request processing',
            409
          );
        }
        if (isPrismaP2002(txErr)) {
          return errorJson(
            'replay',
            `Nonce ${nonce} already used for this session — replay detected`,
            409
          );
        }
        console.error('[POST /api/gateway/skills/[slug]/run] passive DB transaction failed:', txErr);
        return errorJson('gateway-error', 'Failed to write call log', 500);
      }

      const budgetAfter = Math.max(0, session.budgetRemaining - session.pricePerCall);
      const responseHeaders = new Headers({
        'Content-Type': 'application/json',
        'X-Dojo-SessionId': session.id,
        'X-Dojo-BudgetRemaining': String(budgetAfter),
        'X-Dojo-CallCount': String(session.callCount + 1),
      });
      if (workflowReceiptId) {
        responseHeaders.set('X-Dojo-WorkflowReceiptId', workflowReceiptId);
      }
      return new NextResponse(JSON.stringify({ content }), {
        status: 200,
        headers: responseHeaders,
      });
    }

    // -------------------------------------------------------------------------
    // 9. Forward to creator endpoint
    //    - Add X-Dojo-HMAC: hmac-sha256(rawBody, creatorHmacSecret)
    //    - Pass original body verbatim
    //    - 30s timeout via AbortController
    // -------------------------------------------------------------------------
    if (!skill.endpointUrl) {
      return errorJson(
        'gateway-error',
        'Skill has no endpointUrl configured — creator has not published endpoint',
        500
      );
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 30_000);

    const t0 = Date.now();
    let creatorRes: Response | null = null;
    let forwardError: unknown = null;
    let latencyMs = 0;
    let responseTooLarge = false;
    let responseReadError = '';

    // Only sign and forward HMAC when the skill has a secret configured.
    // Sending HMAC-SHA256(body, '') is forgeable by any caller — skip entirely.
    const forwardHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Dojo-JobId': jobIdHeader,
      'X-Dojo-AgentTokenId': tokenIdHeader,
      'X-Dojo-SkillSlug': gatewaySlug,
    };
    if (skill.creatorHmacSecret) {
      forwardHeaders['X-Dojo-HMAC'] = createHmac('sha256', skill.creatorHmacSecret)
        .update(rawBody)
        .digest('hex');
    }

    try {
      creatorRes = await fetch(skill.endpointUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: rawBody,
        signal: abortController.signal,
      });
      latencyMs = Date.now() - t0;
    } catch (err: unknown) {
      latencyMs = Date.now() - t0;
      forwardError = err;
    } finally {
      clearTimeout(timeoutId);
    }

    // -------------------------------------------------------------------------
    // 8.5. Read response body + run sanity-check evaluation
    //      Must read body here (before SkillCall write) — streams are single-use.
    // -------------------------------------------------------------------------
    const timedOut =
      forwardError instanceof Error && (forwardError as Error).name === 'AbortError';
    let creatorBodyText = '';
    if (creatorRes !== null) {
      const read = await readCreatorResponseText(creatorRes).catch((bodyErr) => {
        const message = bodyErr instanceof Error ? bodyErr.message : String(bodyErr);
        console.warn('[gateway] body read failed — scoring 0.0:', message);
        return { ok: false as const, text: '' as const, error: message };
      });
      if (read.ok) {
        creatorBodyText = read.text;
      } else {
        responseTooLarge = true;
        responseReadError = read.error;
      }
    }
    const evalResult = evaluateCall(
      creatorRes?.status ?? 0,
      creatorBodyText,
      latencyMs,
      timedOut || creatorRes === null || responseTooLarge
    );
    const clearing = decideRunClearing(evalResult, session.pricePerCall);

    // -------------------------------------------------------------------------
    // 9. Write SkillCall + (conditionally) decrement budget — atomic transaction
    //
    // Budget decrement policy:
    //   - Evaluator PASS → decrement and write a paid receipt
    //   - Evaluator FAIL → preserve budget and write a refunded receipt
    //
    // The @@unique([sessionId, nonce]) constraint catches replays → P2002 → 409
    // -------------------------------------------------------------------------
    const creatorFailed = creatorRes === null || responseTooLarge; // network/timeout/body-cap failure

    let skillCallStatus: string;
    let httpStatus: number;

    // creatorRes is non-null when creatorFailed is false; assert for TS control flow
    const successRes = creatorFailed ? null : (creatorRes as Response);

    if (creatorFailed) {
      skillCallStatus = 'gateway_error';
      httpStatus = 0;
    } else if (successRes!.ok) {
      skillCallStatus = 'success';
      httpStatus = successRes!.status;
    } else {
      skillCallStatus = 'creator_error';
      httpStatus = successRes!.status;
    }

    let workflowReceiptId: string | null = null;
    try {
      if (!clearing.shouldCharge) {
        // Evaluator failures preserve budget but still write the final ledger.
        await prisma.$transaction(async (tx) => {
          const skillCall = await tx.skillCall.create({
            data: {
              sessionId: session.id,
              nonce,
              requestHash: hashHeader,
              status: skillCallStatus,
              httpStatus,
              latencyMs,
              costUsdc: clearing.costUsdc,
              responseHash: evalResult.responseHash,
              delivered: evalResult.delivered,
              validFormat: evalResult.validFormat,
              withinSla: evalResult.withinSla,
              score: evalResult.score,
            },
          });
          const receipt = await recordWorkflowRun(tx, {
            skillId: skill.id,
            skillCallId: skillCall.id,
            sessionId: session.id,
            buyerAgentId: session.payerAgentId,
            requestHash: hashHeader,
            responseHash: evalResult.responseHash,
            delivered: evalResult.delivered,
            validFormat: evalResult.validFormat,
            withinSla: evalResult.withinSla,
            score: evalResult.score,
            costUsdc: clearing.costUsdc,
            settlementStatus: clearing.settlementStatus,
            httpStatus,
            latencyMs,
            failureReason: responseReadError
              || (forwardError instanceof Error ? forwardError.message : null)
              || clearing.failureReason,
            provenance: {
              contextRefs: [
                `gateway:${gatewaySlug}`,
                `session:${session.id}`,
                `nonce:${nonce}`,
                `job:${jobIdHeader}`,
                `agent_token:${tokenIdHeader}`,
                'mode:active',
              ],
              planSummary: `Run active workflow ${gatewaySlug} through funded gateway session.`,
              artifactRefs: evalResult.responseHash ? [`response:${evalResult.responseHash}`] : [],
              skillUpdateSuggested: !creatorFailed,
              protocolUpdateSuggested: creatorFailed,
              failurePatchType: creatorFailed ? 'protocol' : 'skill',
              quotedPriceUsdc: session.pricePerCall,
              maxPriceUsdc: session.pricePerCall,
            },
          });
          workflowReceiptId = receipt?.id ?? null;
        });
      } else {
        // Evaluator passed — charge the call atomically.
        await prisma.$transaction(async (tx) => {
          const skillCall = await tx.skillCall.create({
            data: {
              sessionId: session.id,
              nonce,
              requestHash: hashHeader,
              status: skillCallStatus,
              httpStatus,
              latencyMs,
              costUsdc: clearing.costUsdc,
              responseHash: evalResult.responseHash,
              delivered: evalResult.delivered,
              validFormat: evalResult.validFormat,
              withinSla: evalResult.withinSla,
              score: evalResult.score,
            },
          });
          const receipt = await recordWorkflowRun(tx, {
            skillId: skill.id,
            skillCallId: skillCall.id,
            sessionId: session.id,
            buyerAgentId: session.payerAgentId,
            requestHash: hashHeader,
            responseHash: evalResult.responseHash,
            delivered: evalResult.delivered,
            validFormat: evalResult.validFormat,
            withinSla: evalResult.withinSla,
            score: evalResult.score,
            costUsdc: clearing.costUsdc,
            settlementStatus: clearing.settlementStatus,
            httpStatus,
            latencyMs,
            provenance: {
              contextRefs: [
                `gateway:${gatewaySlug}`,
                `session:${session.id}`,
                `nonce:${nonce}`,
                `job:${jobIdHeader}`,
                `agent_token:${tokenIdHeader}`,
                'mode:active',
              ],
              planSummary: `Run active workflow ${gatewaySlug} through funded gateway session.`,
              artifactRefs: evalResult.responseHash ? [`response:${evalResult.responseHash}`] : [],
              skillUpdateSuggested: !evalResult.delivered || !evalResult.validFormat || !evalResult.withinSla,
              failurePatchType: successRes!.ok ? null : 'skill',
              quotedPriceUsdc: session.pricePerCall,
              maxPriceUsdc: session.pricePerCall,
            },
          });
          workflowReceiptId = receipt?.id ?? null;

          const updateResult = await tx.session.updateMany({
            where: {
              id: session.id,
              status: { in: ['funded', 'active'] },
              budgetRemaining: { gte: session.pricePerCall },
            },
            data: {
              budgetRemaining: { decrement: session.pricePerCall },
              callCount: { increment: 1 },
              status: 'active',
            },
          });

          if (updateResult.count === 0) {
            // Session was closed or exhausted between our read and write — abort.
            throw new Error('SESSION_CLOSED_OR_EXHAUSTED');
          }
        });
      }
    } catch (txErr: unknown) {
      if (txErr instanceof Error && txErr.message === 'SESSION_CLOSED_OR_EXHAUSTED') {
        return errorJson(
          'session-closed',
          'Session was closed or budget exhausted during request processing',
          409
        );
      }
      if (isPrismaP2002(txErr)) {
        return errorJson(
          'replay',
          `Nonce ${nonce} already used for this session — replay detected`,
          409
        );
      }
      // Any other DB error
      console.error('[POST /api/gateway/skills/[slug]/run] DB transaction failed:', txErr);
      return errorJson('gateway-error', 'Failed to write call log', 500);
    }

    // -------------------------------------------------------------------------
    // Handle gateway-layer failure (network / timeout)
    // -------------------------------------------------------------------------
    if (creatorFailed) {
      const isTimeout =
        forwardError instanceof Error &&
        forwardError.name === 'AbortError';
      console.error(
        '[POST /api/gateway/skills/[slug]/run] Creator forward failed:',
        { slug: gatewaySlug, timeout: isTimeout, error: forwardError }
      );
      return errorJson(
        'creator-error',
        responseTooLarge
          ? responseReadError || 'Creator response too large'
          : isTimeout
            ? 'Creator endpoint timed out after 30 seconds'
            : 'Creator endpoint unreachable',
        502
      );
    }

    // -------------------------------------------------------------------------
    // Handle creator non-2xx
    // -------------------------------------------------------------------------
    if (!creatorRes!.ok) {
      console.warn(
        '[POST /api/gateway/skills/[slug]/run] Creator returned non-2xx:',
        { slug: gatewaySlug, httpStatus: creatorRes!.status }
      );
      const creatorBody = creatorBodyText;
      const budgetAfter = clearing.shouldCharge
        ? Math.max(0, session.budgetRemaining - session.pricePerCall)
        : session.budgetRemaining;
      const callCountAfter = clearing.shouldCharge
        ? session.callCount + 1
        : session.callCount;
      const responseHeaders = new Headers({
        'Content-Type': creatorRes!.headers.get('Content-Type') ?? 'application/json',
        'X-Dojo-SessionId': session.id,
        'X-Dojo-BudgetRemaining': String(budgetAfter),
        'X-Dojo-CallCount': String(callCountAfter),
        'X-Dojo-CreatorHttpStatus': String(creatorRes!.status),
        'X-Dojo-ClearingResult': clearing.result,
        'X-Dojo-SettlementStatus': clearing.settlementStatus,
      });
      if (workflowReceiptId) {
        responseHeaders.set('X-Dojo-WorkflowReceiptId', workflowReceiptId);
      }
      return new NextResponse(creatorBody, {
        status: 502,
        headers: responseHeaders,
      });
    }

    // -------------------------------------------------------------------------
    // 10. Return creator response — pass through status + body + add X-Dojo-* headers
    // -------------------------------------------------------------------------
    const creatorBody = creatorBodyText;
    const budgetAfter = clearing.shouldCharge
      ? Math.max(0, session.budgetRemaining - session.pricePerCall)
      : session.budgetRemaining;
    const callCountAfter = clearing.shouldCharge
      ? session.callCount + 1
      : session.callCount;

    console.log('[POST /api/gateway/skills/[slug]/run] Call succeeded:', {
      slug: gatewaySlug,
      sessionId: session.id,
      nonce,
      httpStatus: creatorRes!.status,
      latencyMs,
      budgetAfter,
      callCountAfter,
      score: evalResult.score,
      delivered: evalResult.delivered,
      withinSla: evalResult.withinSla,
    });

    const responseHeaders = new Headers({
      'Content-Type': creatorRes!.headers.get('Content-Type') ?? 'application/json',
      'X-Dojo-SessionId': session.id,
      'X-Dojo-BudgetRemaining': String(budgetAfter),
      'X-Dojo-CallCount': String(callCountAfter),
      'X-Dojo-ClearingResult': clearing.result,
      'X-Dojo-SettlementStatus': clearing.settlementStatus,
    });
    if (workflowReceiptId) {
      responseHeaders.set('X-Dojo-WorkflowReceiptId', workflowReceiptId);
    }

    return new NextResponse(creatorBody, {
      status: creatorRes!.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    console.error('[POST /api/gateway/skills/[slug]/run]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorJson('gateway-error', message, 500);
  }
}
