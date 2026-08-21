import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getDemoSkillByWorkflowId, toPublicSkill } from '@/lib/demo-catalog';
import { authenticateWorkflowUser } from '@/lib/workflow-api-auth';
import { buildWorkflowSpiritProfile } from '@/lib/workflow-spirit';

export const dynamic = 'force-dynamic';

const forkInput = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().min(1).max(1000).optional(),
  changeNote: z.string().max(2000).optional(),
});

function defaultForkSlug(parentSlug: string) {
  return `${parentSlug}-fork-${Date.now().toString(36)}`;
}

function parseStepGraph(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * POST /api/workflows/[id]/fork
 *
 * Creates fork metadata. It does not deploy execution infra yet; that is the
 * next step after the creator edits prompts/tools/API keys.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authenticateWorkflowUser(req);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const raw = await req.json().catch(() => ({}));
  const parsed = forkInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid fork body' }, { status: 400 });
  }

  const dbParent = await prisma.workflow.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
    },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });
  const demoParent = dbParent ? null : getDemoSkillByWorkflowId(id);
  if (!dbParent && !demoParent) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  const publicDemo = demoParent ? toPublicSkill(demoParent) : null;
  const parent = dbParent ?? {
    id: demoParent!.workflowId,
    slug: demoParent!.workflowSlug,
    name: demoParent!.name,
    description: demoParent!.description,
    category: demoParent!.category,
    icon: demoParent!.icon,
    pricePerRun: demoParent!.pricePerCall,
    royaltyBps: demoParent!.royaltyBps,
    versions: [{
      summary: `${demoParent!.name} demo workflow`,
      inputSchema: publicDemo!.inputSchema,
      outputSchema: publicDemo!.outputSchema,
      stepGraph: JSON.stringify({
        kind: 'demo_template',
        skillId: demoParent!.id,
        gatewaySlug: demoParent!.gatewaySlug,
      }),
      evaluatorPolicy: JSON.stringify({ evaluator: 'dojo-sanity-v1' }),
      slaMs: demoParent!.estLatencyMs,
    }],
  };

  const latest = parent.versions[0];
  if (!latest) {
    return NextResponse.json({ error: 'Workflow has no version to fork' }, { status: 409 });
  }

  const childSlug = parsed.data.slug ?? defaultForkSlug(parent.slug);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const child = await tx.workflow.create({
        data: {
          slug: childSlug,
          name: parsed.data.name ?? `${parent.name} Fork`,
          description: parsed.data.description ?? parent.description,
          category: parent.category,
          icon: parent.icon,
          status: 'draft',
          pricePerRun: parent.pricePerRun,
          royaltyBps: parent.royaltyBps,
          creatorId: user.id,
        },
      });

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: child.id,
          version: 1,
          title: child.name,
          summary: latest.summary,
          inputSchema: latest.inputSchema,
          outputSchema: latest.outputSchema,
          stepGraph: JSON.stringify({
            inherited: parseStepGraph(latest.stepGraph),
            changeNote: parsed.data.changeNote ?? null,
          }),
          evaluatorPolicy: latest.evaluatorPolicy,
          slaMs: latest.slaMs,
        },
      });

      const fork = dbParent
        ? await tx.workflowFork.create({
            data: {
              parentWorkflowId: dbParent.id,
              childWorkflowId: child.id,
              creatorId: user.id,
              royaltyBps: dbParent.royaltyBps,
            },
          })
        : null;

      if (dbParent) {
        await tx.workflow.update({
          where: { id: dbParent.id },
          data: { forkCount: { increment: 1 } },
        });
      }

      return { child, version, fork };
    });

    const childSpirit = buildWorkflowSpiritProfile({
      workflowId: result.child.id,
      slug: result.child.slug,
      name: result.child.name,
      category: result.child.category,
      creatorId: result.child.creatorId,
      creatorName: user.displayName,
      runCount: result.child.runCount,
      forkCount: result.child.forkCount,
      trustScore: result.child.trustScore,
      royaltyBps: result.child.royaltyBps,
    });

    return NextResponse.json(
      {
        workflow: {
          ...result.child,
          spirit: childSpirit,
        },
        version: result.version,
        fork: result.fork,
        offspring: {
          kind: 'offspring',
          parent_workflow_id: dbParent?.id ?? demoParent?.workflowId ?? id,
          child_workflow_id: result.child.id,
          style_branch: childSpirit.pattern,
          inherited_royalty_bps: result.child.royaltyBps,
          spirit: childSpirit,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fork failed';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Workflow slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
