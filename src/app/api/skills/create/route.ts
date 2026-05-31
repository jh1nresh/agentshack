import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPrivyAuth } from "@/lib/privy-server";
import { authenticateWorkflowUser } from "@/lib/workflow-api-auth";
import { ensureSkillRegisteredOnchain, normalizeHexAddress } from "@/lib/swap-router";
import { buildWorkflowSpiritProfile } from "@/lib/workflow-spirit";

export const dynamic = "force-dynamic";

type SecurityScanInput = {
  provider?: unknown;
  score?: unknown;
  severity?: unknown;
  recommendation?: unknown;
  findingCount?: unknown;
  scannedAt?: unknown;
};

function normalizeSecurityScan(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const scan = input as SecurityScanInput;
  const score = typeof scan.score === 'number' ? scan.score : null;
  const findingCount = typeof scan.findingCount === 'number' ? scan.findingCount : null;
  const scannedAt =
    typeof scan.scannedAt === 'string'
      ? new Date(scan.scannedAt)
      : null;

  if (score === null || score < 0 || score > 100) {
    return null;
  }

  return {
    securityScanProvider: typeof scan.provider === 'string'
      ? scan.provider.slice(0, 64)
      : 'skillspector',
    securityRiskScore: score,
    securityRiskSeverity: typeof scan.severity === 'string'
      ? scan.severity.slice(0, 32)
      : null,
    securityRecommendation: typeof scan.recommendation === 'string'
      ? scan.recommendation.slice(0, 64)
      : null,
    securityFindingCount:
      findingCount !== null && findingCount >= 0
        ? Math.floor(findingCount)
        : null,
    securityScannedAt:
      scannedAt && !Number.isNaN(scannedAt.getTime())
        ? scannedAt
        : new Date(),
  };
}

/**
 * POST /api/skills/create
 * Create a new skill + upsert user from Privy
 *
 * Body: {
 *   privyId: string;        // from Privy session
 *   email?: string;
 *   walletAddress?: string;
 *   displayName?: string;
 *   name: string;           // skill name
 *   description: string;    // short description
 *   longDescription?: string;
 *   category: string;       // Trading, Security, Content, DeFi, Analytics, Infra, Social
 *   icon?: string;          // emoji (defaults to ⚡)
 *   price: number;          // USD
 *   tags?: string;          // comma-separated
 *   fileContent?: string;   // actual skill content
 *   fileType?: string;      // "markdown" | "json" | "text"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      privyId,
      email,
      walletAddress,
      displayName,
      name,
      description,
      longDescription,
      category,
      icon,
      price,
      tags,
      fileContent,
      fileType,
      skillType,
      gatewaySlug,
      pricePerCall,
      endpointUrl,
      // Wizard profile fields
      executionKind,
      inputShape,
      outputShape,
      estLatencyMs,
      sandboxable,
      authRequired,
      inputSchema,
      outputSchema,
      exampleInput,
      exampleOutput,
      securityScan,
    } = body;

    // Auth — verify caller owns the privyId they're creating skills under
    const skipAuth =
      process.env.DOJO_SKIP_PRIVY_AUTH === 'true' &&
      process.env.NODE_ENV !== 'production';

    let apiKeyUser: User | null = null;
    const bearer = req.headers.get('Authorization') ?? req.headers.get('authorization');
    const isApiKeyAuth = bearer?.startsWith('Bearer dojo_sk_') ?? false;

    if (!skipAuth && isApiKeyAuth) {
      const auth = await authenticateWorkflowUser(req);
      if (!auth.ok) return auth.response;
      apiKeyUser = auth.user;
    } else if (!skipAuth) {
      if (!privyId) {
        return NextResponse.json(
          { error: "Missing required field: privyId" },
          { status: 400 }
        );
      }
      const authResult = await verifyPrivyAuth(req.headers.get('Authorization'));
      if (!authResult.success || authResult.privyId !== privyId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    } else if (!privyId) {
      return NextResponse.json(
        { error: "Missing required field: privyId" },
        { status: 400 }
      );
    }

    if (!name || !description || !category) {
      return NextResponse.json(
        { error: "Missing required fields: name, description, category" },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = ["Trading", "Security", "Content", "DeFi", "Analytics", "Infra", "Social"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate price
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json(
        { error: "Invalid price. Must be a non-negative number." },
        { status: 400 }
      );
    }

    // Upsert user from Privy identity, or use the authenticated API-key owner.
    const user = apiKeyUser ?? await prisma.user.upsert({
      where: { privyId },
      update: {
        ...(email && { email }),
        ...(displayName && { displayName }),
        // walletAddress intentionally excluded — only set at registration,
        // not overridable via skill create (prevents settlement fund redirect attacks)
      },
      create: {
        privyId,
        email: email ?? null,
        walletAddress: walletAddress ?? null,
        displayName: displayName ?? null,
      },
    });

    // Validate fileType if provided
    const validFileTypes = ["markdown", "json", "text"];
    if (fileType && !validFileTypes.includes(fileType)) {
      return NextResponse.json(
        { error: `Invalid fileType. Must be one of: ${validFileTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate active skill requirements.
    // Wizard-created: endpointUrl provided but gatewaySlug not (slug is auto-generated).
    // This is detected server-side from payload shape — no client flag trusted.
    const isWizardCreated = !!endpointUrl && !gatewaySlug;
    const effectiveSkillType = isWizardCreated ? 'active' : (skillType ?? 'passive');

    if (effectiveSkillType === 'active') {
      // Wizard-created skills auto-generate gatewaySlug; manual creation requires it
      if (!isWizardCreated && !gatewaySlug) {
        return NextResponse.json(
          { error: "gatewaySlug is required for active skills" },
          { status: 400 }
        );
      }
      const parsedPricePerCall = Number(pricePerCall);
      if (!pricePerCall || isNaN(parsedPricePerCall) || parsedPricePerCall <= 0) {
        return NextResponse.json(
          { error: "pricePerCall must be > 0 for active skills" },
          { status: 400 }
        );
      }
    }

    // Auto-generate gatewaySlug for wizard-created skills: kebab-case name + 6-char hex
    let finalSlug = gatewaySlug ?? null;
    if (isWizardCreated && !finalSlug) {
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      // Retry up to 3 times on unique constraint collision
      for (let attempt = 0; attempt < 3; attempt++) {
        const suffix = randomBytes(3).toString('hex');
        const candidate = `${base}-${suffix}`;
        const [existingSkill, existingWorkflow] = await Promise.all([
          prisma.skill.findUnique({
            where: { gatewaySlug: candidate },
            select: { id: true },
          }),
          prisma.workflow.findUnique({
            where: { slug: candidate },
            select: { id: true },
          }),
        ]);
        if (!existingSkill && !existingWorkflow) {
          finalSlug = candidate;
          break;
        }
      }
      if (!finalSlug) {
        return NextResponse.json(
          { error: 'Failed to generate unique slug after 3 attempts' },
          { status: 500 }
        );
      }
    }

    // Auto-generate HMAC secret for wizard-created skills
    const finalHmacSecret = isWizardCreated
      ? randomBytes(32).toString('hex')
      : undefined;

    // SSRF guard — reject private/internal addresses at write time.
    // The gateway fires this URL on every agent call; blocking here is
    // defence-in-depth over the per-request check in the gateway/run route.
    if (endpointUrl) {
      let parsedEndpoint: URL;
      try {
        parsedEndpoint = new URL(endpointUrl as string);
      } catch {
        return NextResponse.json(
          { error: 'endpointUrl is not a valid URL' },
          { status: 400 }
        );
      }
      const isProduction = process.env.NODE_ENV === 'production';
      if (
        parsedEndpoint.protocol !== 'https:' &&
        !(parsedEndpoint.protocol === 'http:' && !isProduction)
      ) {
        return NextResponse.json(
          { error: 'endpointUrl must use https' },
          { status: 400 }
        );
      }
      if (isProduction) {
        const h = parsedEndpoint.hostname.toLowerCase();
        const BLOCKED_PATTERNS = [
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
        if (BLOCKED_PATTERNS.some((rx) => rx.test(h))) {
          return NextResponse.json(
            { error: 'endpointUrl targets a private or internal address' },
            { status: 400 }
          );
        }
      }
    }

    // Stringify schema/example fields if passed as objects
    const stringify = (v: unknown): string | null => {
      if (v === undefined || v === null) return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    };

    const inputSchemaText = stringify(inputSchema);
    const outputSchemaText = stringify(outputSchema);
    const exampleInputText = stringify(exampleInput);
    const exampleOutputText = stringify(exampleOutput);
    const effectivePricePerCall = pricePerCall ? Number(pricePerCall) : null;
    const effectiveExecutionKind = executionKind ?? 'sync';
    const effectiveInputShape = inputShape ?? 'form';
    const effectiveOutputShape = outputShape ?? 'json';
    const effectiveSandboxable = sandboxable ?? true;
    const effectiveAuthRequired = authRequired ?? false;
    const normalizedSecurityScan = normalizeSecurityScan(securityScan);

    if (effectiveSkillType === 'active') {
      const [existingSkill, existingWorkflow] = await Promise.all([
        prisma.skill.findUnique({
          where: { gatewaySlug: finalSlug! },
          select: { id: true },
        }),
        prisma.workflow.findUnique({
          where: { slug: finalSlug! },
          select: { id: true },
        }),
      ]);
      if (existingSkill || existingWorkflow) {
        return NextResponse.json(
          { error: 'gatewaySlug is already used by another workflow or skill' },
          { status: 409 },
        );
      }

      const registration = await ensureSkillRegisteredOnchain({
        slug: finalSlug!,
        pricePerCall: effectivePricePerCall!,
        creatorAddress: normalizeHexAddress(user.walletAddress),
        metadataURI: `dojo://workflow/${finalSlug}`,
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
    }

    const created = await prisma.$transaction(async (tx) => {
      const skill = await tx.skill.create({
        data: {
          name,
          description,
          longDescription: longDescription ?? null,
          category,
          icon: icon || "⚡",
          price: parsedPrice,
          currency: "USD",
          tags: tags ?? "",
          fileContent: fileContent ?? null,
          fileType: fileType ?? null,
          isGated: parsedPrice > 0,
          ...normalizedSecurityScan,
          creatorId: user.id,
          skillType: effectiveSkillType,
          gatewaySlug: finalSlug,
          pricePerCall: effectivePricePerCall,
          endpointUrl: endpointUrl ?? null,
          creatorHmacSecret: finalHmacSecret ?? null,
          // Profile fields
          executionKind: effectiveExecutionKind,
          inputShape: effectiveInputShape,
          outputShape: effectiveOutputShape,
          estLatencyMs: estLatencyMs ? Number(estLatencyMs) : undefined,
          sandboxable: effectiveSandboxable,
          authRequired: effectiveAuthRequired,
          inputSchema: inputSchemaText,
          outputSchema: outputSchemaText,
          exampleInput: exampleInputText,
          exampleOutput: exampleOutputText,
        },
        include: {
          creator: true,
        },
      });

      if (effectiveSkillType !== 'active') {
        return { skill, workflow: null };
      }

      if (!finalSlug) {
        throw new Error('gatewaySlug is required to create a workflow');
      }

      const workflow = await tx.workflow.create({
        data: {
          slug: finalSlug,
          name,
          description,
          category,
          icon: icon || "⚡",
          status: 'published',
          pricePerRun: effectivePricePerCall ?? parsedPrice,
          creatorId: user.id,
          skillId: skill.id,
        },
      });

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: 1,
          title: name,
          summary: longDescription ?? description,
          inputSchema: inputSchemaText,
          outputSchema: outputSchemaText,
          stepGraph: JSON.stringify({
            kind: 'one_step_endpoint',
            skillId: skill.id,
            gatewaySlug: finalSlug,
          }),
          evaluatorPolicy: JSON.stringify({
            evaluator: 'dojo-sanity-v1',
            delivered: true,
            validFormat: true,
            withinSla: true,
          }),
          slaMs: estLatencyMs ? Number(estLatencyMs) : 5000,
        },
      });

      return {
        skill,
        workflow: {
          ...workflow,
          latestVersion: version,
          spirit: buildWorkflowSpiritProfile({
            workflowId: workflow.id,
            slug: workflow.slug,
            name: workflow.name,
            category: workflow.category,
            creatorId: workflow.creatorId,
            creatorName: user.displayName,
            runCount: workflow.runCount,
            forkCount: workflow.forkCount,
            trustScore: workflow.trustScore,
            royaltyBps: workflow.royaltyBps,
          }),
        },
      };
    });

    return NextResponse.json(
      { ...created.skill, workflow: created.workflow },
      { status: 201 },
    );
  } catch (err: unknown) {
    console.error("[POST /api/skills/create]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
