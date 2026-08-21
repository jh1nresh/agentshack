import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPrivyAuth } from '@/lib/privy-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sessions/[id]
 *
 * Returns session status + recent call log. Caller must be the session's
 * payer agent owner (via Privy JWT → User → Agent.ownerId).
 *
 * See: specs/2026-04-05-session-as-job-migration.md
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const sessionId = id;

    const authResult = await verifyPrivyAuth(req.headers.get('Authorization'));
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        agent: { select: { id: true, name: true, ownerId: true } },
        skill: { select: { id: true, name: true, gatewaySlug: true } },
        calls: {
          orderBy: { nonce: 'desc' },
          take: 50,
          select: {
            id: true,
            nonce: true,
            status: true,
            httpStatus: true,
            latencyMs: true,
            costUsdc: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({
      where: { privyId: authResult.privyId },
    });
    if (!user || user.id !== session.agent.ownerId) {
      return NextResponse.json(
        { error: 'Not authorized to view this session' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        budgetTotal: session.budgetTotal,
        budgetRemaining: session.budgetRemaining,
        pricePerCall: session.pricePerCall,
        callCount: session.callCount,
        openedAt: session.openedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        settledAt: session.settledAt?.toISOString() ?? null,
        onchainJobId: session.onchainJobId,
        agent: session.agent,
        skill: session.skill,
        recentCalls: session.calls.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    });
  } catch (err: unknown) {
    console.error('[GET /api/sessions/[id]]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
