import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const skill = await prisma.skill.findUnique({
    where: { id },
    include: {
      creator: true,
      reviews: { include: { user: true }, orderBy: { createdAt: "desc" } },
      equippedBy: { include: { agent: true } },
    },
  });
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(skill);
}
