import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPrivyAuth } from "@/lib/privy-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/skills/[id]/content
 * Returns skill content if user has purchased it.
 *
 * Authentication: Bearer token in Authorization header (Privy JWT)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const skipAuth =
      process.env.DOJO_SKIP_PRIVY_AUTH === 'true' &&
      process.env.NODE_ENV !== 'production';

    let privyId: string;

    if (skipAuth) {
      const qPrivyId = req.nextUrl.searchParams.get('privyId');
      if (!qPrivyId) {
        return NextResponse.json({ error: 'Missing privyId query param' }, { status: 400 });
      }
      privyId = qPrivyId;
    } else {
      const authHeader = req.headers.get("authorization");
      const authResult = await verifyPrivyAuth(authHeader);
      if (!authResult.success || !authResult.privyId) {
        return NextResponse.json(
          { error: authResult.error || "Authentication required" },
          { status: 401 }
        );
      }
      privyId = authResult.privyId;
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { privyId } });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // Find skill
    const skill = await prisma.skill.findUnique({
      where: { id },
      include: { creator: true },
    });
    if (!skill) {
      return NextResponse.json(
        { error: "Skill not found" },
        { status: 404 }
      );
    }

    // Check if skill is gated
    if (skill.isGated) {
      // Check for completed purchase
      const purchase = await prisma.purchase.findFirst({
        where: {
          userId: user.id,
          skillId: id,
          status: "completed",
        },
      });

      // Also allow creator to access their own content
      const isCreator = skill.creatorId === user.id;

      if (!purchase && !isCreator) {
        return NextResponse.json(
          { error: "Purchase required to access skill content" },
          { status: 403 }
        );
      }
    }

    // Return content
    if (!skill.fileContent) {
      return NextResponse.json(
        { error: "Skill content not available" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      content: skill.fileContent,
      fileType: skill.fileType || "markdown",
      skillId: skill.id,
      skillName: skill.name,
    });
  } catch (err: unknown) {
    console.error("[GET /api/skills/[id]/content]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
