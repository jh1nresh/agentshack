import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/creators/[id]
 * Returns creator info with their skills and aggregate stats
 *
 * Returns:
 *   - User info (id, displayName, avatarUrl, createdAt)
 *   - Their skills (with full details)
 *   - Aggregate stats: total sales, avg rating, total revenue, refund rate
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const creator = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      walletAddress: true,
      createdAt: true,
      createdSkills: {
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          icon: true,
          price: true,
          currency: true,
          rating: true,
          installs: true,
          createdAt: true,
          purchases: {
            select: {
              amount: true,
              status: true,
            },
          },
          _count: {
            select: { reviews: true },
          },
        },
        orderBy: { installs: "desc" },
      },
    },
  });

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Calculate aggregate stats
  const totalSales = creator.createdSkills.reduce(
    (sum, skill) => sum + skill.installs,
    0
  );

  const allRatings = creator.createdSkills
    .filter((s) => s.rating > 0)
    .map((s) => s.rating);
  const avgRating =
    allRatings.length > 0
      ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length
      : 0;

  // Calculate total revenue from completed purchases
  let totalRevenue = 0;
  let completedPurchases = 0;
  let refundedPurchases = 0;

  creator.createdSkills.forEach((skill) => {
    skill.purchases.forEach((purchase) => {
      if (purchase.status === "completed") {
        totalRevenue += purchase.amount;
        completedPurchases++;
      } else if (purchase.status === "refunded") {
        refundedPurchases++;
      }
    });
  });

  const totalPurchases = completedPurchases + refundedPurchases;
  const refundRate =
    totalPurchases > 0 ? (refundedPurchases / totalPurchases) * 100 : 0;

  // Transform skills to remove purchases array (we don't need it in response)
  const skills = creator.createdSkills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    icon: skill.icon,
    price: skill.price,
    currency: skill.currency,
    rating: skill.rating,
    installs: skill.installs,
    reviewCount: skill._count.reviews,
    createdAt: skill.createdAt,
  }));

  return NextResponse.json({
    id: creator.id,
    displayName: creator.displayName,
    avatarUrl: creator.avatarUrl,
    walletAddress: creator.walletAddress,
    memberSince: creator.createdAt,
    stats: {
      totalSales,
      avgRating,
      totalRevenue,
      refundRate,
      skillCount: creator.createdSkills.length,
    },
    skills,
  });
}
