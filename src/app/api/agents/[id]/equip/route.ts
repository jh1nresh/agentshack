import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/agents/[id]/equip
 * Equip an owned skill to an agent
 *
 * Body: {
 *   privyId: string;
 *   skillId: string;
 *   unequip?: boolean;   // if true, removes the skill
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const agentId = id;
    const body = await req.json();
    const { privyId, skillId, unequip } = body;

    if (!privyId || !skillId) {
      return NextResponse.json({ error: "Missing privyId or skillId" }, { status: 400 });
    }

    // Resolve user
    const user = await prisma.user.findUnique({ where: { privyId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify agent ownership
    const agent = await prisma.agent.findFirst({ where: { id: agentId, ownerId: user.id } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found or not owned by user" }, { status: 404 });
    }

    if (unequip) {
      await prisma.agentSkill.deleteMany({ where: { agentId, skillId } });
      return NextResponse.json({ unequipped: true, agentId, skillId });
    }

    // Verify user owns skill (via purchase or free)
    const skill = await prisma.skill.findUnique({ where: { id: skillId } });
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const owned =
      skill.price === 0 ||
      (await prisma.purchase.findFirst({
        where: { userId: user.id, skillId, status: "completed" },
      }));

    if (!owned) {
      return NextResponse.json({ error: "Skill not purchased" }, { status: 403 });
    }

    const equipment = await prisma.agentSkill.upsert({
      where: { agentId_skillId: { agentId, skillId } },
      update: {},
      create: { agentId, skillId },
    });

    return NextResponse.json({ equipped: true, equipment });
  } catch (err: unknown) {
    console.error("[POST /api/agents/[id]/equip]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
