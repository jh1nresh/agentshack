import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPrivyAuth } from "@/lib/privy-server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { rating, comment, sessionId, userId: bodyUserId } = body;
  if (!rating || !comment) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required — complete a session first" }, { status: 400 });
  }

  // Auth — resolve userId from JWT, not from body
  const skipAuth =
    process.env.DOJO_SKIP_PRIVY_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production';

  let userId: string;

  if (skipAuth) {
    // Dev: accept userId from body
    if (!bodyUserId) {
      return NextResponse.json({ error: "userId required in dev mode" }, { status: 400 });
    }
    userId = bodyUserId;
  } else {
    const authResult = await verifyPrivyAuth(req.headers.get('Authorization'));
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { privyId: authResult.privyId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }
    userId = user.id;
  }

  // Verify session exists, belongs to this user's agent, targets this skill, and is settled/refunded
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { agent: true },
  });
  if (
    !session ||
    session.skillId !== id ||
    session.agent.ownerId !== userId ||
    !["settled", "refunded"].includes(session.status)
  ) {
    return NextResponse.json(
      { error: "No settled session receipt for this skill" },
      { status: 403 }
    );
  }

  const receipt = await prisma.workflowRunReceipt.findFirst({
    where: {
      sessionId,
      skillCall: {
        session: {
          skillId: id,
        },
      },
      settlementStatus: { in: ["paid", "refunded", "disputed"] },
    },
    select: { id: true },
  });
  if (!receipt) {
    return NextResponse.json(
      { error: "No final receipt for this session" },
      { status: 403 }
    );
  }

  // Check duplicate review for same session
  const existing = await prisma.review.findUnique({
    where: { userId_skillId_sessionId: { userId, skillId: id, sessionId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already reviewed this session" }, { status: 409 });
  }

  const review = await prisma.review.create({
    data: { rating: Number(rating), comment, userId, skillId: id, sessionId },
    include: { user: true },
  });

  // Update skill average rating
  const agg = await prisma.review.aggregate({ where: { skillId: id }, _avg: { rating: true } });
  if (agg._avg.rating) {
    await prisma.skill.update({ where: { id }, data: { rating: agg._avg.rating } });
  }

  return NextResponse.json(review, { status: 201 });
}
