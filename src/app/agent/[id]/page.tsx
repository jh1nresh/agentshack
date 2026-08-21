import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AGENT_SERVICE_CARDS } from '@/lib/agent-card-catalog';
import { CatalogAgentPageClient } from './CatalogAgentPageClient';
import AgentPageClient from './AgentPageClient';

export const dynamic = 'force-dynamic';

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catalogAgent = AGENT_SERVICE_CARDS.find(
    (agent) => agent.id === id || agent.slug === id,
  );

  if (catalogAgent) {
    return <CatalogAgentPageClient agent={catalogAgent} />;
  }

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      owner: true,
      skills: { include: { skill: true } },
      reviews: { include: { user: true }, orderBy: { createdAt: 'desc' } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!agent) notFound();

  const avgRating =
    agent.reviews.length > 0
      ? agent.reviews.reduce((a, r) => a + r.rating, 0) / agent.reviews.length
      : 0;

  return (
    <AgentPageClient
      agent={{
        id: agent.id,
        name: agent.name,
        avatar: agent.avatar,
        description: agent.description,
        rank: agent.rank,
        successRate: agent.successRate,
        jobsCompleted: agent.jobsCompleted,
        totalEarnings: agent.totalEarnings,
        earningsCurrency: agent.earningsCurrency,
        owner: { displayName: agent.owner.displayName },
      }}
      skills={agent.skills.map(({ skill }) => ({
        id: skill.id,
        name: skill.name,
        icon: skill.icon,
        category: skill.category,
        rating: skill.rating,
        installs: skill.installs,
        price: skill.price,
      }))}
      jobs={agent.jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        status: j.status,
        payment: j.payment,
        currency: j.currency,
        rating: j.rating,
      }))}
      reviews={agent.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        user: { displayName: r.user.displayName },
      }))}
      avgRating={avgRating}
    />
  );
}
