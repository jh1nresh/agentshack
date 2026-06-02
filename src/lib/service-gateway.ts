import { prisma } from '@/lib/prisma';
import { isLegacyWorkflowSlug } from '@/lib/legacy-workflow-slugs';
import { publicWorkflowWhere } from '@/lib/public-workflow-filter';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type ServiceSkillRow = Awaited<ReturnType<typeof findServiceSkill>>;

type WorkflowReceiptRollup = {
  total: number;
  paid: number;
  refunded: number;
  disputed: number;
};

export const SERVICE_ROUTER_VERSION = 'explicit-service-v0';
const TERMINAL_SETTLEMENT_STATUSES = ['paid', 'refunded', 'disputed'] as const;

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function tagsFrom(value: string | null | undefined): string[] {
  return value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
}

function emptyRollup(): WorkflowReceiptRollup {
  return { total: 0, paid: 0, refunded: 0, disputed: 0 };
}

function rate(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function stripIpBrackets(hostname: string): string {
  const host = hostname.toLowerCase();
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function ipv4Parts(host: string): [number, number, number, number] | null {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return parts as [number, number, number, number];
}

function isPrivateIpv4(host: string): boolean {
  const parts = ipv4Parts(stripIpBrackets(host));
  if (!parts) return false;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function ipv6Bytes(host: string): number[] | null {
  let normalized = stripIpBrackets(host).split('%')[0].toLowerCase();
  const embeddedIpv4Start = normalized.lastIndexOf(':');
  if (normalized.includes('.') && embeddedIpv4Start >= 0) {
    const parts = ipv4Parts(normalized.slice(embeddedIpv4Start + 1));
    if (!parts) return null;
    normalized = `${normalized.slice(0, embeddedIpv4Start)}:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const groups = halves.length === 2
    ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
    : left;

  if (missing < 0 || groups.length !== 8) return null;

  const words = groups.map((group) => Number.parseInt(group, 16));
  if (words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) {
    return null;
  }

  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

function isPrivateIpv6(host: string): boolean {
  const bytes = ipv6Bytes(host);
  if (!bytes) return false;

  const isMappedIpv4 = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isMappedIpv4) {
    return isPrivateIpv4(bytes.slice(12).join('.'));
  }

  return (
    bytes.every((byte) => byte === 0) ||
    bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1 ||
    (bytes[0] & 0xfe) === 0xfc ||
    (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) ||
    bytes.slice(0, 8).join('.') === '1.0.0.0.0.0.0.0' ||
    (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8)
  );
}

function isBlockedHost(hostname: string): boolean {
  const host = stripIpBrackets(hostname);
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    (isIP(host) === 4 && isPrivateIpv4(host)) ||
    (isIP(host) === 6 && isPrivateIpv6(host))
  );
}

export async function validateRuntimeServiceEndpoint(endpointUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return 'Service endpoint URL is invalid';
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && !isProduction)) {
    return 'Service endpoint must use https';
  }

  if (!isProduction) return null;

  if (isBlockedHost(parsed.hostname)) {
    return 'Service endpoint targets a private or internal address';
  }

  try {
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (addresses.some((entry) => isBlockedHost(entry.address))) {
      return 'Service endpoint resolves to a private or internal address';
    }
  } catch {
    return 'Service endpoint host could not be resolved';
  }

  // Residual TOCTOU: validation re-resolves DNS before each fetch, but undici
  // still performs its own connection lookup. A pinned-IP dispatcher would close
  // that final DNS rebinding gap without relaxing redirect: 'error'.
  return null;
}

export function serviceSlugFromSkill(skill: { gatewaySlug: string | null; workflow?: { slug: string } | null }) {
  return skill.gatewaySlug ?? skill.workflow?.slug ?? null;
}

export async function findServiceSkill(service: string) {
  return prisma.skill.findFirst({
    where: {
      skillType: 'active',
      endpointUrl: { not: null },
      gatewaySlug: { not: null },
      workflow: { is: publicWorkflowWhere() },
      OR: [
        { gatewaySlug: service },
        { workflow: { is: publicWorkflowWhere({ slug: service }) } },
      ],
    },
    include: {
      workflow: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          runCount: true,
          forkCount: true,
          trustScore: true,
          royaltyBps: true,
        },
      },
    },
  });
}

export async function listServiceSkills() {
  return prisma.skill.findMany({
    where: {
      skillType: 'active',
      endpointUrl: { not: null },
      gatewaySlug: { not: null },
      workflow: { is: publicWorkflowWhere() },
    },
    include: {
      workflow: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          runCount: true,
          forkCount: true,
          trustScore: true,
          royaltyBps: true,
        },
      },
    },
    orderBy: [
      { installs: 'desc' },
      { name: 'asc' },
    ],
  });
}

export async function receiptRollupsByWorkflowId(workflowIds: string[]) {
  if (workflowIds.length === 0) return new Map<string, WorkflowReceiptRollup>();

  const rows = await prisma.workflowRunReceipt.groupBy({
    by: ['workflowId', 'settlementStatus'],
    where: {
      workflowId: { in: workflowIds },
      settlementStatus: { in: [...TERMINAL_SETTLEMENT_STATUSES] },
    },
    _count: { _all: true },
  });

  const rollups = new Map<string, WorkflowReceiptRollup>();
  for (const row of rows) {
    const current = rollups.get(row.workflowId) ?? emptyRollup();
    const count = row._count._all;
    current.total += count;
    if (row.settlementStatus === 'paid') current.paid += count;
    else if (row.settlementStatus === 'refunded') current.refunded += count;
    else if (row.settlementStatus === 'disputed') current.disputed += count;
    rollups.set(row.workflowId, current);
  }

  return rollups;
}

export function serviceDescriptor(
  skill: NonNullable<ServiceSkillRow>,
  rollup: WorkflowReceiptRollup = emptyRollup(),
) {
  const service = serviceSlugFromSkill(skill);
  const workflow = skill.workflow;
  const receiptCount = rollup.total;
  const successRate = rate(rollup.paid, rollup.total);

  return {
    service,
    legacy_skill: skill.gatewaySlug,
    kind: 'agent_service',
    name: workflow?.name ?? skill.name,
    description: skill.description,
    category: workflow?.category ?? skill.category,
    tags: tagsFrom(skill.tags),
    run_modes: {
      run_once: 'available',
      subscribe: 'planned',
      fork_license: workflow ? 'available' : 'unavailable',
    },
    pricing: {
      currency: 'USDC',
      per_run: skill.pricePerCall ?? 0,
      refund_policy: 'Unreachable or timed-out endpoints return cost 0; evaluator-gated refund policy is the next clearing upgrade.',
    },
    authorization: {
      type: 'api_key',
      required: true,
      balance_required_usdc: skill.pricePerCall ?? 0,
    },
    receipt_policy: {
      guaranteed: Boolean(workflow),
      type: workflow ? 'WorkflowRunReceipt' : null,
      receipt_url_template: workflow ? '/r/{receipt_id}' : null,
    },
    trust: {
      receipts: receiptCount,
      success_rate: successRate,
      paid_receipts: rollup.paid,
      refund_rate: rate(rollup.refunded, rollup.total),
      dispute_rate: rate(rollup.disputed, rollup.total),
      forks: workflow?.forkCount ?? 0,
      trust_score: successRate,
      est_latency_ms: skill.estLatencyMs,
    },
    security_scan: {
      provider: skill.securityScanProvider,
      risk_score: skill.securityRiskScore,
      severity: skill.securityRiskSeverity,
      recommendation: skill.securityRecommendation,
      finding_count: skill.securityFindingCount,
      scanned_at: skill.securityScannedAt?.toISOString() ?? null,
      source: skill.securityScanProvider ? 'creator_submitted' : 'missing',
      attested: false,
    },
    workflow: workflow
      ? {
          id: workflow.id,
          slug: workflow.slug,
          royalty_bps: workflow.royaltyBps,
        }
      : null,
    input_shape: skill.inputShape,
    output_shape: skill.outputShape,
    example_input: safeJsonParse(skill.exampleInput),
    example_output: safeJsonParse(skill.exampleOutput),
  };
}

export function serviceRouterDescriptor(service: string, matchedService: string | null) {
  return {
    version: SERVICE_ROUTER_VERSION,
    requested_service: service,
    matched_service: matchedService,
    strategy: 'exact service slug or workflow slug alias',
    best_agent_routing: 'planned',
  };
}
