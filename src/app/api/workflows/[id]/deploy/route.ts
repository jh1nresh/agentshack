import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authenticateWorkflowUser } from '@/lib/workflow-api-auth';
import { ensureSkillRegisteredOnchain, normalizeHexAddress } from '@/lib/swap-router';

export const dynamic = 'force-dynamic';

const deployInput = z.object({
  endpointUrl: z.string().url(),
  pricePerRun: z.number().positive().max(1000),
  inputSchema: z.unknown().optional(),
  outputSchema: z.unknown().optional(),
  exampleInput: z.unknown().optional(),
  exampleOutput: z.unknown().optional(),
  outputShape: z.string().min(1).max(40).default('json'),
  slaMs: z.number().int().min(200).max(60_000).default(5000),
});

function stringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function validateEndpoint(endpointUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return 'endpointUrl is not a valid URL';
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && !isProduction)
  ) {
    return 'endpointUrl must use https';
  }

  if (isProduction) {
    const host = parsed.hostname.toLowerCase();
    const blocked = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fd/,
      /^fe[89ab][0-9a-f]:/i,
    ];
    if (blocked.some((rx) => rx.test(host))) {
      return 'endpointUrl targets a private or internal address';
    }
  }

  return null;
}

/**
 * POST /api/workflows/[id]/deploy
 *
 * Publishes a draft workflow by attaching an executable creator endpoint.
 * If the workflow already has a skill, updates that execution target.
 * Otherwise creates a one-step active skill and links it to the workflow.
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
  const parsed = deployInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid deploy body' }, { status: 400 });
  }

  const endpointError = validateEndpoint(parsed.data.endpointUrl);
  if (endpointError) {
    return NextResponse.json({ error: endpointError }, { status: 400 });
  }

  const workflow = await prisma.workflow.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
    },
    include: {
      skill: true,
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  if (!workflow) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  if (workflow.creatorId !== user.id) {
    return NextResponse.json(
      { error: 'Only the workflow creator can deploy this workflow' },
      { status: 403 },
    );
  }

  const existingSlugOwner = await prisma.skill.findUnique({
    where: { gatewaySlug: workflow.slug },
    select: { id: true },
  });
  if (existingSlugOwner && existingSlugOwner.id !== workflow.skillId) {
    return NextResponse.json(
      { error: 'Workflow slug is already used by another executable skill' },
      { status: 409 },
    );
  }

  const inputSchema = stringify(parsed.data.inputSchema);
  const outputSchema = stringify(parsed.data.outputSchema);
  const exampleInput = stringify(parsed.data.exampleInput);
  const exampleOutput = stringify(parsed.data.exampleOutput);
  const latest = workflow.versions[0] ?? null;
  const nextVersion = (latest?.version ?? 0) + 1;

  const registration = await ensureSkillRegisteredOnchain({
    slug: workflow.slug,
    pricePerCall: parsed.data.pricePerRun,
    creatorAddress: normalizeHexAddress(user.walletAddress),
    metadataURI: `dojo://workflow/${workflow.slug}`,
  });
  if (!registration.ok) {
    return NextResponse.json(
      {
        error: registration.transient
          ? 'BSC SkillRegistry is temporarily unavailable'
          : registration.error ?? 'Failed to register workflow on-chain',
        code: registration.transient
          ? 'ONCHAIN_REGISTRY_UNAVAILABLE'
          : 'ONCHAIN_SKILL_REGISTER_FAILED',
        skill_id: registration.skillId,
        registry: registration.registry,
      },
      { status: registration.transient ? 503 : 409 },
    );
  }

  try {
    const deployed = await prisma.$transaction(async (tx) => {
      const skill = workflow.skill
        ? await tx.skill.update({
            where: { id: workflow.skill.id },
            data: {
              name: workflow.name,
              description: workflow.description,
              category: workflow.category,
              icon: workflow.icon,
              price: parsed.data.pricePerRun,
              isGated: parsed.data.pricePerRun > 0,
              skillType: 'active',
              gatewaySlug: workflow.slug,
              pricePerCall: parsed.data.pricePerRun,
              endpointUrl: parsed.data.endpointUrl,
              creatorHmacSecret:
                workflow.skill.creatorHmacSecret ?? randomBytes(32).toString('hex'),
              executionKind: 'sync',
              inputShape: 'form',
              outputShape: parsed.data.outputShape,
              estLatencyMs: parsed.data.slaMs,
              sandboxable: true,
              authRequired: false,
              inputSchema: inputSchema ?? workflow.skill.inputSchema,
              outputSchema: outputSchema ?? workflow.skill.outputSchema,
              exampleInput: exampleInput ?? workflow.skill.exampleInput,
              exampleOutput: exampleOutput ?? workflow.skill.exampleOutput,
            },
          })
        : await tx.skill.create({
            data: {
              name: workflow.name,
              description: workflow.description,
              longDescription: latest?.summary ?? workflow.description,
              category: workflow.category,
              icon: workflow.icon,
              price: parsed.data.pricePerRun,
              currency: 'USD',
              tags: '',
              isGated: parsed.data.pricePerRun > 0,
              creatorId: user.id,
              skillType: 'active',
              gatewaySlug: workflow.slug,
              pricePerCall: parsed.data.pricePerRun,
              endpointUrl: parsed.data.endpointUrl,
              creatorHmacSecret: randomBytes(32).toString('hex'),
              executionKind: 'sync',
              inputShape: 'form',
              outputShape: parsed.data.outputShape,
              estLatencyMs: parsed.data.slaMs,
              sandboxable: true,
              authRequired: false,
              inputSchema: inputSchema ?? latest?.inputSchema ?? null,
              outputSchema: outputSchema ?? latest?.outputSchema ?? null,
              exampleInput,
              exampleOutput,
            },
          });

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: nextVersion,
          title: workflow.name,
          summary: latest?.summary ?? workflow.description,
          inputSchema: inputSchema ?? latest?.inputSchema ?? null,
          outputSchema: outputSchema ?? latest?.outputSchema ?? null,
          stepGraph: JSON.stringify({
            kind: 'one_step_endpoint',
            skillId: skill.id,
            gatewaySlug: workflow.slug,
            endpointHost: new URL(parsed.data.endpointUrl).hostname,
            previous: latest ? parseJson(latest.stepGraph) : null,
          }),
          evaluatorPolicy: JSON.stringify({
            evaluator: 'dojo-sanity-v1',
            delivered: true,
            validFormat: true,
            withinSla: true,
          }),
          slaMs: parsed.data.slaMs,
        },
      });

      const updatedWorkflow = await tx.workflow.update({
        where: { id: workflow.id },
        data: {
          status: 'published',
          pricePerRun: parsed.data.pricePerRun,
          skillId: skill.id,
        },
      });

      return { workflow: updatedWorkflow, version, skill };
    });

    return NextResponse.json({
      workflow: deployed.workflow,
      version: deployed.version,
      skill: {
        id: deployed.skill.id,
        gatewaySlug: deployed.skill.gatewaySlug,
        endpointUrl: deployed.skill.endpointUrl,
      },
      runUrl: `/workflow/${deployed.workflow.id}/run`,
      gateway: `/api/gateway/skills/${deployed.skill.gatewaySlug}/run`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deploy failed';
    if (message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Workflow executable already exists or slug is taken' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
