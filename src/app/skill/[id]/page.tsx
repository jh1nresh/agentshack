import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getDemoSkillById, toPublicSkill } from '@/lib/demo-catalog';
import { computeSkillMaturity } from '@/lib/skill-maturity';
import SkillPageClient from './SkillPageClient';

export const dynamic = 'force-dynamic';

const SPARKLINE_WINDOW = 20; // last N settled/refunded sessions
const HEATMAP_DAYS = 7;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export default async function SkillPage({ params }: { params: { id: string } }) {
  let skill = null;
  try {
    skill = await prisma.skill.findUnique({
      where: { id: params.id },
      include: {
        creator: true,
        workflow: {
          select: {
            runCount: true,
            trustScore: true,
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { version: true },
            },
          },
        },
        sessions: {
          where: { status: { in: ['settled', 'refunded'] } },
          orderBy: { settledAt: 'asc' },
          select: {
            id: true,
            status: true,
            callCount: true,
            settledAt: true,
            basAttestationUid: true,
            calls: {
              select: {
                latencyMs: true,
                delivered: true,
                validFormat: true,
                withinSla: true,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.warn('[GET /skill/[id]] falling back to demo catalog:', error);
  }

  if (!skill) {
    const demoSkill = getDemoSkillById(params.id);
    if (!demoSkill) notFound();

    const publicSkill = toPublicSkill(demoSkill);
    const now = new Date().toISOString();
    const maturity = computeSkillMaturity({
      clearedRunCount: demoSkill.workflowRunCount,
      passRate: demoSkill.trustScore,
      version: 1,
    });

    return (
      <SkillPageClient
        skill={{
          id: publicSkill.id,
          name: publicSkill.name,
          description: publicSkill.description,
          longDescription: publicSkill.longDescription,
          category: publicSkill.category,
          pricePerCall: publicSkill.pricePerCall,
          price: publicSkill.price,
          skillType: publicSkill.skillType,
          gatewaySlug: publicSkill.gatewaySlug,
          fileContent: publicSkill.fileContent,
          evaluationScore: publicSkill.evaluationScore,
          securityScanProvider: null,
          securityRiskScore: null,
          securityRiskSeverity: null,
          securityRecommendation: null,
          securityFindingCount: null,
          securityScannedAt: null,
          executionKind: publicSkill.executionKind,
          inputShape: publicSkill.inputShape,
          outputShape: publicSkill.outputShape,
          estLatencyMs: publicSkill.estLatencyMs,
          sandboxable: publicSkill.sandboxable,
          authRequired: publicSkill.authRequired,
          inputSchema: publicSkill.inputSchema,
          outputSchema: publicSkill.outputSchema,
          exampleInput: publicSkill.exampleInput,
          exampleOutput: publicSkill.exampleOutput,
          createdAt: now,
          updatedAt: now,
          creator: {
            id: publicSkill.creator.id,
            displayName: publicSkill.creator.displayName,
            walletAddress: null,
            erc8004TokenId: null,
          },
        }}
        totalCalls={demoSkill.workflowRunCount}
        totalSessions={demoSkill.workflowRunCount}
        passRate={demoSkill.trustScore}
        passedSessions={demoSkill.workflowRunCount}
        failedSessions={Math.max(0, Math.round(demoSkill.workflowRunCount * 0.03))}
        maturity={maturity}
        sparkline={[80, 84, 86, 88, 90, demoSkill.trustScore]}
        medianLatencyMs={demoSkill.estLatencyMs}
        heatmap={Array.from({ length: HEATMAP_DAYS }, (_, i) => ({
          date: new Date(Date.now() - (HEATMAP_DAYS - 1 - i) * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
          count: Math.max(1, Math.round(demoSkill.workflowRunCount / HEATMAP_DAYS / 2)),
        }))}
        attestations={[]}
        reviews={[
          {
            id: `${demoSkill.id}-review-1`,
            rating: 5,
            comment: 'Demo workflow is ready to run, fork, and customize.',
            createdAt: now,
            user: {
              id: 'demo-reviewer',
              displayName: 'Dojo Preview',
              walletAddress: null,
            },
            session: null,
          },
        ]}
      />
    );
  }

  const sessionCallCount = skill.sessions.reduce((sum, s) => sum + s.callCount, 0);
  const workflowRunCount = skill.workflow?.runCount ?? 0;
  const totalCalls = Math.max(sessionCallCount, workflowRunCount);
  const totalSessions = Math.max(skill.sessions.length, workflowRunCount);
  const settledSessionCount = skill.sessions.filter((s) => s.status === 'settled').length;
  const refundedSessionCount = skill.sessions.filter((s) => s.status === 'refunded').length;
  const passedSessions = skill.sessions.length > 0 ? settledSessionCount : workflowRunCount;
  const failedSessions = skill.sessions.length > 0 ? refundedSessionCount : 0;
  const passRate =
    skill.sessions.length > 0
      ? Math.round((passedSessions / skill.sessions.length) * 100)
      : Math.round(skill.workflow?.trustScore ?? 0);
  const workflowVersion = skill.workflow?.versions[0]?.version ?? null;
  const maturity = computeSkillMaturity({
    evaluationPassed: skill.evaluationPassed,
    evaluationScore: skill.evaluationScore,
    clearedRunCount: workflowRunCount,
    passRate,
    version: workflowVersion,
  });

  // Trust sparkline: running pass rate over last N sessions (chronological)
  const recentSessions = skill.sessions.slice(-SPARKLINE_WINDOW);
  const sparkline: number[] = [];
  let runningPass = 0;
  recentSessions.forEach((s, i) => {
    if (s.status === 'settled') runningPass += 1;
    sparkline.push(Math.round((runningPass / (i + 1)) * 100));
  });

  // Median latency across all calls for this skill
  const latencies = skill.sessions
    .flatMap((s) => s.calls)
    .map((c) => c.latencyMs)
    .filter((ms): ms is number => typeof ms === 'number' && ms > 0);
  const medianLatencyMs = median(latencies);

  // 7-day heatmap: sessions per day, aligned to today (index 0 = 6 days ago, 6 = today)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const heatmap: { date: string; count: number }[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const dayKey = day.toISOString().slice(0, 10);
    const count = skill.sessions.filter((s) => {
      if (!s.settledAt) return false;
      return s.settledAt.toISOString().slice(0, 10) === dayKey;
    }).length;
    heatmap.push({ date: dayKey, count });
  }

  // Reviews (public, newest first)
  const reviews = await prisma.review.findMany({
    where: { skillId: params.id },
    orderBy: { createdAt: 'desc' },
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

  // BAS attestations (most recent first, with uid)
  const attestations = skill.sessions
    .filter((s) => !!s.basAttestationUid)
    .slice()
    .reverse()
    .slice(0, 6)
    .map((s) => ({
      sessionId: s.id,
      status: s.status as 'settled' | 'refunded',
      uid: s.basAttestationUid as string,
      settledAt: s.settledAt ? s.settledAt.toISOString() : null,
    }));

  return (
    <SkillPageClient
      skill={{
        id: skill.id,
        name: skill.name,
        description: skill.description,
        longDescription: skill.longDescription,
        category: skill.category,
        pricePerCall: skill.pricePerCall,
        price: skill.price,
        skillType: skill.skillType,
        gatewaySlug: skill.gatewaySlug,
        fileContent: skill.fileContent,
        evaluationScore: skill.evaluationScore ?? skill.workflow?.trustScore ?? null,
        securityScanProvider: skill.securityScanProvider,
        securityRiskScore: skill.securityRiskScore,
        securityRiskSeverity: skill.securityRiskSeverity,
        securityRecommendation: skill.securityRecommendation,
        securityFindingCount: skill.securityFindingCount,
        securityScannedAt: skill.securityScannedAt?.toISOString() ?? null,
        executionKind: skill.executionKind,
        inputShape: skill.inputShape,
        outputShape: skill.outputShape,
        estLatencyMs: skill.estLatencyMs,
        sandboxable: skill.sandboxable,
        authRequired: skill.authRequired,
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
        exampleInput: skill.exampleInput,
        exampleOutput: skill.exampleOutput,
        createdAt: skill.createdAt.toISOString(),
        updatedAt: skill.updatedAt.toISOString(),
        creator: {
          id: skill.creator.id,
          displayName: skill.creator.displayName,
          walletAddress: skill.creator.walletAddress,
          erc8004TokenId: skill.creator.erc8004TokenId
            ? skill.creator.erc8004TokenId.toString()
            : null,
        },
      }}
      totalCalls={totalCalls}
      totalSessions={totalSessions}
      passRate={passRate}
      passedSessions={passedSessions}
      failedSessions={failedSessions}
      maturity={maturity}
      sparkline={sparkline}
      medianLatencyMs={medianLatencyMs}
      heatmap={heatmap}
      attestations={attestations}
      reviews={reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        user: r.user,
        session: r.session
          ? {
              id: r.session.id,
              callCount: r.session.callCount,
              status: r.session.status,
              settledAt: r.session.settledAt?.toISOString() ?? null,
            }
          : null,
      }))}
    />
  );
}
