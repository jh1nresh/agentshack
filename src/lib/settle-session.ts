/**
 * Settlement Pipeline — ERC-8183 closeAndSettle()
 *
 * Reusable module for settling sessions from any caller:
 *   - POST /api/sessions/[id]/close  (Privy JWT auth)
 *   - POST /api/v1/run               (auto-close on budget exhaustion)
 *   - POST /api/v1/close             (API key auth, manual close)
 *
 * Pipeline:
 *   1. Load session + relations
 *   2. Aggregate SkillCall scores → passRate → PASS/FAIL
 *   3. On-chain bind (if onchainJobId null) → createSessionOnChain (with real provider)
 *   4. Gateway-signed closeAndSettle → atomic settlement + attestation + trust
 *   5. DB close → settled | refunded
 *
 * AfterAction hooks (AttestationHook + TrustUpdateHook) fire atomically
 * in the closeAndSettle tx — no separate relayer calls needed.
 */

import { prisma } from '@/lib/prisma';
import { createSessionOnChain, closeAndSettleOnChain, getAcpConfig } from '@/lib/bsc-acp';
import { signEvaluationProof } from '@/lib/gateway-signer';
import { logInfo, logWarn, logError } from '@/lib/logger';
import { reconcileSessionReceipts } from '@/lib/workflow-ledger';
import { aggregateSessionClearing } from '@/lib/run-clearing';

export interface SettleResult {
  success: boolean;
  status: 'settled' | 'refunded' | 'already_terminal';
  passRate: number;
  totalCalls: number;
  onchainJobId: string | null;
  basAttestationUid: string | null;
  error?: string;
}

/**
 * Settle a session end-to-end: score → on-chain bind → closeAndSettle → DB close.
 *
 * Idempotent: returns early if session is already in a terminal state.
 * Graceful degradation: on-chain failures are logged, never thrown.
 */
export async function settleSession(sessionId: string): Promise<SettleResult> {
  // 1. Load session with agent (+ owner) + skill (+ creator)
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      agent: { include: { owner: true } },
      skill: { include: { creator: true } },
    },
  });

  if (!session) {
    return {
      success: false,
      status: 'already_terminal',
      passRate: 0,
      totalCalls: 0,
      onchainJobId: null,
      basAttestationUid: null,
      error: 'Session not found',
    };
  }

  // Idempotency — already terminal
  if (session.status === 'settled' || session.status === 'refunded') {
    return {
      success: true,
      status: 'already_terminal',
      passRate: 0,
      totalCalls: 0,
      onchainJobId: session.onchainJobId,
      basAttestationUid: session.basAttestationUid,
    };
  }

  // State guard — only funded/active sessions can be settled
  if (session.status !== 'funded' && session.status !== 'active') {
    return {
      success: false,
      status: 'already_terminal',
      passRate: 0,
      totalCalls: 0,
      onchainJobId: session.onchainJobId,
      basAttestationUid: null,
      error: `Cannot settle session in status '${session.status}'`,
    };
  }

  // 2. Aggregate SkillCall scores → PASS/FAIL
  const calls = await prisma.skillCall.findMany({
    where: { sessionId: session.id },
    select: { score: true, costUsdc: true },
  });

  const {
    recordedCalls,
    totalCalls,
    passedCalls,
    passRate,
    isPASS,
  } = aggregateSessionClearing(calls);
  const finalScore = passRate;

  logInfo('settle:evaluate', 'score aggregated', {
    sessionId: session.id,
    recordedCalls,
    totalCalls,
    passedCalls,
    passRate,
    isPASS,
  });

  // Resolve real addresses for 3-party separation
  const providerAddress = session.skill?.creator?.walletAddress as `0x${string}` | undefined;

  // 3. On-chain bind (if onchainJobId is null)
  // Budget = amount actually spent (not the pre-funded session budget)
  let onchainJobId = session.onchainJobId;

  if (!onchainJobId && process.env.DOJO_RELAYER_PRIVATE_KEY) {
    const amountSpent = session.budgetTotal - session.budgetRemaining;
    // Only create on-chain job if there was actual spend
    if (amountSpent > 0) {
      try {
        // Convert USDC to 18-decimal bigint (BSC USDC = 18 decimals)
        const budgetUsdc = BigInt(Math.round(amountSpent * 1e18));
        const expiredAt = BigInt(Math.floor(session.expiresAt.getTime() / 1000));

        const bindResult = await createSessionOnChain({
          description: `dojo:${session.id}`,
          expiredAt,
          budgetUsdc,
          provider: providerAddress,
        });

        if (bindResult.success && bindResult.jobId) {
          onchainJobId = bindResult.jobId;
          await prisma.session.update({
            where: { id: session.id },
            data: { onchainJobId },
          });
          logInfo('settle:bind', 'on-chain bind success', { sessionId: session.id, jobId: onchainJobId });
        } else {
          logError('settle:bind', bindResult.error ?? 'unknown', { sessionId: session.id });
        }
      } catch (err) {
        logError('settle:bind', err, { sessionId: session.id });
      }
    }
  } else if (!onchainJobId) {
    logWarn('settle:bind', 'DOJO_RELAYER_PRIVATE_KEY not set — skipping on-chain bind');
  }

  // 4. closeAndSettle — gateway-signed atomic settlement
  // Handles PASS (pay provider 95%, treasury 5%) and FAIL (refund client 100%).
  // AfterAction hooks fire attestation + trust update in the same tx.
  let closeAndSettleTxHash: string | null = null;
  let closeAndSettleError: string | null = null;
  if (onchainJobId && process.env.DOJO_RELAYER_PRIVATE_KEY) {
    try {
      const config = getAcpConfig();
      const jobId = BigInt(onchainJobId);

      const gatewaySignature = await signEvaluationProof({
        chainId: config.chain.id,
        contractAddress: config.acpAddress,
        jobId,
        finalScore,
        callCount: totalCalls,
        passRate,
      });

      const settleResult = await closeAndSettleOnChain({
        jobId,
        finalScore,
        callCount: totalCalls,
        passRate,
        gatewaySignature,
      });

      logInfo('settle:closeAndSettle', 'settlement complete', {
        sessionId: session.id,
        onchainJobId,
        isPASS,
        success: settleResult.success,
        txHash: settleResult.txHash,
        error: settleResult.error,
      });
      if (settleResult.success && settleResult.txHash) {
        closeAndSettleTxHash = settleResult.txHash;
      } else if (settleResult.error) {
        closeAndSettleError = settleResult.error;
      }
    } catch (err) {
      closeAndSettleError = err instanceof Error ? err.message : String(err);
      logError('settle:closeAndSettle', err, { sessionId: session.id, onchainJobId });
    }
  }

  // 5. DB close — PASS→settled, FAIL→refunded
  const now = new Date();
  const newStatus = isPASS ? 'settled' : 'refunded';

  const closeResult = await prisma.$transaction(async (tx) => {
    const result = await tx.session.updateMany({
      where: {
        id: session.id,
        status: { in: ['funded', 'active'] },
      },
      data: {
        status: newStatus,
        settledAt: now,
      },
    });

    if (result.count > 0) {
      await reconcileSessionReceipts(
        tx,
        session.id,
        isPASS ? 'paid' : 'refunded',
        closeAndSettleTxHash
          ? { status: 'settled', settleTxHash: closeAndSettleTxHash, error: null }
          : closeAndSettleError
            ? { status: 'failed', error: closeAndSettleError }
            : undefined,
      );
    }

    return result;
  });

  if (closeResult.count === 0) {
    // Another request won the race — idempotent return
    const current = await prisma.session.findUnique({
      where: { id: session.id },
    });
    return {
      success: true,
      status: 'already_terminal',
      passRate,
      totalCalls,
      onchainJobId: current?.onchainJobId ?? onchainJobId,
      basAttestationUid: current?.basAttestationUid ?? null,
    };
  }

  logInfo('settle:close', 'session closed', {
    sessionId: session.id,
    newStatus,
    isPASS,
    passRate,
    callCount: session.callCount,
  });

  return {
    success: true,
    status: newStatus,
    passRate,
    totalCalls,
    onchainJobId,
    basAttestationUid: null, // Now handled by AttestationHook in closeAndSettle tx
  };
}
