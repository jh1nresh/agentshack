import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import CreatorPageClient from './CreatorPageClient';

export const dynamic = 'force-dynamic';

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
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
          rating: true,
          installs: true,
          purchases: {
            select: {
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { installs: 'desc' },
      },
    },
  });

  if (!creator) notFound();

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

  let totalRevenue = 0;
  let completedPurchases = 0;
  let refundedPurchases = 0;

  creator.createdSkills.forEach((skill) => {
    skill.purchases.forEach((purchase) => {
      if (purchase.status === 'completed') {
        totalRevenue += purchase.amount;
        completedPurchases++;
      } else if (purchase.status === 'refunded') {
        refundedPurchases++;
      }
    });
  });

  const totalPurchases = completedPurchases + refundedPurchases;
  const refundRate =
    totalPurchases > 0 ? (refundedPurchases / totalPurchases) * 100 : 0;

  const memberSince = new Date(creator.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  return (
    <CreatorPageClient
      creator={{
        id: creator.id,
        displayName: creator.displayName,
        walletAddress: creator.walletAddress,
        memberSince,
        skills: creator.createdSkills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          icon: s.icon,
          price: s.price,
          rating: s.rating,
          installs: s.installs,
        })),
      }}
      totalSales={totalSales}
      avgRating={avgRating}
      totalRevenue={totalRevenue}
      refundRate={refundRate}
    />
  );
}
