import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reviews = await prisma.review.findMany({
    where: { skillId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      user: { select: { id: true, displayName: true, walletAddress: true } },
      session: {
        select: {
          id: true,
          callCount: true,
          status: true,
          settledAt: true,
        },
      },
    },
  });

  return NextResponse.json(reviews);
}
