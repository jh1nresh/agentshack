import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { rating, comment, userId } = await req.json();
  if (!rating || !comment || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const review = await prisma.review.create({
    data: { rating: Number(rating), comment, userId, agentId: id },
    include: { user: true },
  });
  return NextResponse.json(review, { status: 201 });
}
