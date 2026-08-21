import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPrivyAuth } from '@/lib/privy-server';
import { settleSession } from '@/lib/settle-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sessions/[id]/close
 *
 * Agent owner manually closes an active/funded session early.
 * Auth + ownership validation, then delegates to settleSession().
 *
 * Idempotent: if session is already 'settled' or 'refunded', returns current
 * state with 200 rather than an error.
 *
 * Body: { privyId: string }
 *
 * Response 200: { session: { id, status, budgetTotal, ... } }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sessionId = id;

    // 1. Parse body — require privyId
    const body = await req.json();
    const { privyId } = body as { privyId?: string };

    if (!privyId) {
      return NextResponse.json(
        { error: 'Missing required field: privyId' },
        { status: 400 }
      );
    }

    // 2. Verify JWT; privyId in body must match token subject
    const skipAuth =
      process.env.DOJO_SKIP_PRIVY_AUTH === 'true' &&
      process.env.NODE_ENV !== 'production';

    if (!skipAuth) {
      const authResult = await verifyPrivyAuth(req.headers.get('Authorization'));
      if (!authResult.success || authResult.privyId !== privyId) {
        return NextResponse.json(
          { error: 'Unauthorized — privyId mismatch' },
          { status: 403 }
        );
      }
    }

    // 3. Resolve user
    const user = await prisma.user.findUnique({ where: { privyId } });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found — sync account first' },
        { status: 404 }
      );
    }

    // 4. Resolve session + verify ownership
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: true, skill: true },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.agent.ownerId !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden — not owner of this session' },
        { status: 403 }
      );
    }

    // 5. Idempotency — already terminal, return current state
    if (session.status === 'refunded' || session.status === 'settled') {
      return NextResponse.json({ session: buildResponse(session) });
    }

    // 6. State guard
    if (session.status !== 'funded' && session.status !== 'active') {
      return NextResponse.json(
        {
          error: `Cannot close session in status '${session.status}' — must be 'funded' or 'active'`,
        },
        { status: 409 }
      );
    }

    // 7. Delegate to settleSession — handles on-chain bind + settle + DB close + BAS + trust
    const result = await settleSession(sessionId);

    // Re-read for response shape
    const updated = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { agent: true, skill: true },
    });
    if (!updated) {
      return NextResponse.json({ error: 'Session not found after close' }, { status: 404 });
    }

    console.log('[sessions/close] settled via pipeline:', {
      sessionId,
      status: result.status,
      passRate: result.passRate,
      onchainJobId: result.onchainJobId,
    });

    return NextResponse.json({ session: buildResponse(updated) });
  } catch (err: unknown) {
    console.error('[POST /api/sessions/[id]/close]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Shape matches sessions/open response + adds settledAt and refundedAmount. */
function buildResponse(session: {
  id: string;
  status: string;
  budgetTotal: number;
  budgetRemaining: number;
  pricePerCall: number;
  callCount: number;
  openedAt: Date;
  expiresAt: Date;
  settledAt: Date | null;
  skillId: string;
  payerAgentId: string;
  onchainJobId: string | null;
}) {
  return {
    id: session.id,
    status: session.status,
    budgetTotal: session.budgetTotal,
    budgetRemaining: session.budgetRemaining,
    pricePerCall: session.pricePerCall,
    callCount: session.callCount,
    openedAt: session.openedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    settledAt: session.settledAt?.toISOString() ?? null,
    skillId: session.skillId,
    payerAgentId: session.payerAgentId,
    onchainJobId: session.onchainJobId,
    refundedAmount: session.budgetRemaining,
  };
}
