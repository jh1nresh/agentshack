#!/usr/bin/env node
/**
 * Dojo creator CLI
 *
 * Publish one executable workflow endpoint into Dojo:
 *   dojo init
 *   DOJO_API_KEY=dojo_sk_... dojo test --file dojo.workflow.yaml
 *   DOJO_API_KEY=dojo_sk_... dojo publish --file dojo.workflow.yaml
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import matter from 'gray-matter';

const yaml = require('js-yaml') as {
  load(input: string): unknown;
};

type Flags = Record<string, string | boolean>;

type WorkflowManifest = {
  name?: string;
  description?: string;
  long_description?: string;
  longDescription?: string;
  category?: string;
  icon?: string;
  tags?: string[] | string;
  price?: number | string;
  price_per_run?: number | string;
  pricePerRun?: number | string;
  endpoint?: string;
  endpoint_url?: string;
  endpointUrl?: string;
  endpoint_auth_header?: string;
  authHeader?: string;
  sla_ms?: number | string;
  slaMs?: number | string;
  input_schema?: unknown;
  inputSchema?: unknown;
  output_schema?: unknown;
  outputSchema?: unknown;
  example_input?: unknown;
  exampleInput?: unknown;
  example_output?: unknown;
  exampleOutput?: unknown;
};

type DryRunResponse = {
  ok?: boolean;
  status?: number;
  latencyMs?: number;
  data?: unknown;
  eval?: {
    score?: number;
    delivered?: boolean;
    validFormat?: boolean;
    withinSla?: boolean;
  };
  error?: string;
};

type PublishResponse = {
  id?: string;
  name?: string;
  gatewaySlug?: string;
  workflow?: {
    id?: string;
    slug?: string;
  } | null;
  error?: string;
};

type ForkResponse = {
  workflow?: {
    id?: string;
    slug?: string;
    name?: string;
    status?: string;
  };
  version?: {
    version?: number;
  };
  fork?: {
    id?: string;
    royaltyBps?: number;
  } | null;
  error?: string;
};

type DeployResponse = {
  workflow?: {
    id?: string;
    slug?: string;
    status?: string;
  };
  skill?: {
    id?: string;
    gatewaySlug?: string | null;
    endpointUrl?: string | null;
  };
  runUrl?: string;
  gateway?: string;
  error?: string;
};

type RunResponse = {
  result?: unknown;
  cost?: number;
  balance?: number;
  score?: number;
  session_id?: string;
  latency_ms?: number;
  workflow_receipt?: {
    id?: string;
    workflow_id?: string;
    version_id?: string | null;
    settlement_status?: string;
    anchor_status?: string;
    onchain_request_id?: string | null;
    swap_tx_hash?: string | null;
    settle_tx_hash?: string | null;
  };
  error?: string;
  reason?: string;
};

type DevKeyUser = {
  id: string;
  displayName: string | null;
  email: string | null;
  walletAddress: string | null;
  apiKey: string | null;
  creditBalance: number;
  ownedAgents: Array<{
    name: string;
    walletAddress: string | null;
  }>;
};

type LoadedManifest = {
  manifest: WorkflowManifest;
  raw: string;
  fileType: 'markdown' | 'text';
};

type SkillspectorReport = {
  risk_score?: number;
  risk_severity?: string;
  risk_recommendation?: string;
  filtered_findings?: unknown[];
  findings?: unknown[];
  error?: string;
};

type SkillspectorSummary = {
  available: boolean;
  score: number | null;
  severity: string | null;
  recommendation: string | null;
  findingCount: number | null;
};

const TEMPLATE = `name: Agent Repo Analyst
description: Analyze a public agent repository and return architecture summary, install path, fit score, risks, and source-backed evidence.
category: Agent Research
price_per_run: 0.003
endpoint: http://localhost:3000/api/skills-internal/repo-analyst
sla_ms: 3000
tags:
  - agent
  - github
  - research
  - agent-workflow

input_schema:
  type: object
  required:
    - repo_url
  properties:
    repo_url:
      type: string
    question:
      type: string

example_input:
  repo_url: https://github.com/garrytan/gbrain
  question: Is this useful for building persistent-memory agents?

output_schema:
  type: object
  required:
    - summary
    - sources
    - risks
  properties:
    fit_score:
      type: number
    verdict:
      type: string
    summary:
      type: string
    sources:
      type: array
    risks:
      type: array
`;

function parseFlags(argv: string[]): { command: string; flags: Flags } {
  const [command = 'help', ...rest] = argv;
  const flags: Flags = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s);
    if (inlineValue !== undefined && inlineValue !== '') {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[rawKey] = next;
      i += 1;
    } else {
      flags[rawKey] = true;
    }
  }

  return { command, flags };
}

function flagString(flags: Flags, name: string, fallback?: string): string | undefined {
  const value = flags[name];
  if (typeof value === 'string') return value;
  return fallback;
}

function flagBool(flags: Flags, name: string): boolean {
  return flags[name] === true;
}

function readJsonInput(flags: Flags): Record<string, unknown> {
  const inputFile = flagString(flags, 'input-file');
  const inline = flagString(flags, 'input');

  if (inputFile && inline) {
    fail('Use either --input or --input-file, not both.');
  }

  const raw = inputFile ? readFileSync(resolve(inputFile), 'utf8') : inline ?? '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const source = inputFile ? inputFile : '--input';
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    fail(`Invalid JSON in ${source}: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('Run input must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function resolveConfig(flags: Flags) {
  const file = resolve(flagString(flags, 'file', 'dojo.workflow.yaml') ?? 'dojo.workflow.yaml');
  const baseUrl = (
    flagString(flags, 'url') ??
    process.env.DOJO_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const apiKey = flagString(flags, 'api-key') ?? process.env.DOJO_API_KEY;
  return { file, baseUrl, apiKey };
}

function readManifest(file: string): LoadedManifest {
  if (!existsSync(file)) {
    fail(`Manifest not found: ${file}\nRun: dojo init --file ${basename(file)}`);
  }

  const raw = readFileSync(file, 'utf8');
  const isFrontmatter = raw.trimStart().startsWith('---');
  const parsed = isFrontmatter
    ? matter(raw).data
    : yaml.load(raw);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`Manifest must be a YAML object: ${file}`);
  }

  return {
    manifest: parsed as WorkflowManifest,
    raw,
    fileType: isFrontmatter || file.toLowerCase().endsWith('.md') ? 'markdown' : 'text',
  };
}

function normalizeManifest(manifest: WorkflowManifest) {
  const endpointUrl = manifest.endpointUrl ?? manifest.endpoint_url ?? manifest.endpoint;
  const priceValue = manifest.pricePerRun ?? manifest.price_per_run ?? manifest.price;
  const price = Number(priceValue);
  const slaMsValue = manifest.slaMs ?? manifest.sla_ms;
  const slaMs = slaMsValue === undefined ? undefined : Number(slaMsValue);
  const exampleInput = manifest.exampleInput ?? manifest.example_input ?? {};
  const exampleOutput = manifest.exampleOutput ?? manifest.example_output;
  const inputSchema = manifest.inputSchema ?? manifest.input_schema;
  const outputSchema = manifest.outputSchema ?? manifest.output_schema;
  const tags = Array.isArray(manifest.tags) ? manifest.tags.join(',') : manifest.tags;
  const authHeader =
    manifest.authHeader ??
    manifest.endpoint_auth_header ??
    process.env.DOJO_ENDPOINT_AUTH_HEADER;

  const missing: string[] = [];
  if (!manifest.name) missing.push('name');
  if (!manifest.description) missing.push('description');
  if (!manifest.category) missing.push('category');
  if (!endpointUrl) missing.push('endpoint');
  if (priceValue === undefined) missing.push('price_per_run');
  if (Number.isNaN(price) || price <= 0) missing.push('price_per_run > 0');

  if (missing.length > 0) {
    fail(`Invalid workflow manifest. Missing or invalid: ${missing.join(', ')}`);
  }

  return {
    name: manifest.name,
    description: manifest.description,
    longDescription: manifest.longDescription ?? manifest.long_description,
    category: manifest.category,
    icon: manifest.icon ?? 'W',
    tags: tags ?? '',
    price,
    endpointUrl,
    slaMs,
    inputSchema,
    outputSchema,
    exampleInput,
    exampleOutput,
    authHeader,
  };
}

async function requestJson<T>(
  url: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    fail(`Could not reach Dojo at ${url}: ${message}`);
  }

  const text = await res.text();
  let data: T;
  try {
    data = text ? JSON.parse(text) as T : ({} as T);
  } catch {
    data = { error: text } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

function authHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function readRiskValue(report: SkillspectorReport, snakeName: keyof SkillspectorReport): unknown {
  const camelName = snakeName
    .split('_')
    .map((part, index) => (index === 0 ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join('');
  const record = report as Record<string, unknown>;
  return record[snakeName] ?? record[camelName];
}

function summarizeSkillspectorReport(report: SkillspectorReport): SkillspectorSummary {
  const scoreValue = readRiskValue(report, 'risk_score');
  const findingsValue = report.filtered_findings ?? report.findings;

  return {
    available: true,
    score: typeof scoreValue === 'number' ? scoreValue : null,
    severity: typeof readRiskValue(report, 'risk_severity') === 'string'
      ? readRiskValue(report, 'risk_severity') as string
      : null,
    recommendation: typeof readRiskValue(report, 'risk_recommendation') === 'string'
      ? readRiskValue(report, 'risk_recommendation') as string
      : null,
    findingCount: Array.isArray(findingsValue) ? findingsValue.length : null,
  };
}

function printScanSummary(summary: SkillspectorSummary): void {
  if (!summary.available) {
    console.warn('Skillspector scan skipped: skillspector binary not found.');
    return;
  }

  console.log('Skillspector scan complete.');
  if (summary.score !== null) console.log(`  riskScore: ${summary.score}`);
  if (summary.severity) console.log(`  severity: ${summary.severity}`);
  if (summary.recommendation) console.log(`  recommendation: ${summary.recommendation}`);
  if (summary.findingCount !== null) console.log(`  findings: ${summary.findingCount}`);
}

function runSkillspectorScan(
  file: string,
  flags: Flags,
  options: { required: boolean },
): SkillspectorSummary {
  const bin = flagString(flags, 'skillspector-bin') ?? process.env.SKILLSPECTOR_BIN ?? 'skillspector';
  const maxRisk = Number(flagString(flags, 'max-risk', '50'));
  if (!Number.isFinite(maxRisk) || maxRisk < 0 || maxRisk > 100) {
    fail('Invalid --max-risk value. Use a number between 0 and 100.');
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'dojo-skillspector-'));
  const reportPath = join(tempDir, 'skillspector-report.json');
  const args = [
    'scan',
    file,
    '--format',
    'json',
    '--output',
    reportPath,
    ...(flagBool(flags, 'llm') ? [] : ['--no-llm']),
  ];

  try {
    const result = spawnSync(bin, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' && !options.required) {
        return {
          available: false,
          score: null,
          severity: null,
          recommendation: null,
          findingCount: null,
        };
      }
      fail(`Skillspector scan could not start: ${result.error.message}`);
    }

    if (!existsSync(reportPath)) {
      const stderr = result.stderr?.trim();
      fail(`Skillspector did not write a JSON report.${stderr ? `\n${stderr}` : ''}`);
    }

    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as SkillspectorReport;
    if (report.error) {
      fail(`Skillspector scan failed: ${report.error}`);
    }

    const summary = summarizeSkillspectorReport(report);
    printScanSummary(summary);

    if (summary.score !== null && summary.score > maxRisk) {
      fail(
        `Skillspector risk score ${summary.score} exceeds --max-risk ${maxRisk}. ` +
        'Review the report or use --skip-scan only for trusted local testing.',
      );
    }
    if (summary.recommendation === 'DO_NOT_INSTALL') {
      fail('Skillspector recommendation is DO_NOT_INSTALL.');
    }

    return summary;
  } catch (err) {
    if (err instanceof SyntaxError) {
      fail(`Could not parse Skillspector JSON report: ${err.message}`);
    }
    throw err;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function devKey(baseUrl: string, flags: Flags) {
  if (process.env.NODE_ENV === 'production') {
    fail('dev-key is disabled when NODE_ENV=production.');
  }

  if (!isLocalBaseUrl(baseUrl)) {
    fail('dev-key only works against a local Dojo URL. Use DOJO_BASE_URL=http://localhost:3000.');
  }

  let PrismaClient: typeof import('@prisma/client').PrismaClient;
  try {
    ({ PrismaClient } = await import('@prisma/client'));
  } catch {
    fail('dev-key requires running inside the maiat-dojo repo with dependencies installed.');
  }

  const { randomBytes } = await import('crypto');
  const prisma = new PrismaClient();
  const minCredits = Number(flagString(flags, 'fund', '10'));

  if (!Number.isFinite(minCredits) || minCredits < 0) {
    await prisma.$disconnect();
    fail('Invalid --fund value. Use a positive number, for example --fund 10.');
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        ownedAgents: {
          some: {},
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        walletAddress: true,
        apiKey: true,
        creditBalance: true,
        ownedAgents: {
          take: 1,
          select: {
            name: true,
            walletAddress: true,
          },
        },
      },
    }) as DevKeyUser | null;

    if (!user) {
      fail('No local user with an agent found. Sign in once or run the seed script before dev-key.');
    }

    const apiKey = user.apiKey ?? `dojo_sk_${randomBytes(32).toString('hex')}`;
    const nextCredits = user.creditBalance < minCredits ? minCredits : user.creditBalance;
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        apiKey,
        creditBalance: nextCredits,
      },
      select: {
        displayName: true,
        email: true,
        walletAddress: true,
        creditBalance: true,
      },
    });

    const label =
      updated.displayName ??
      updated.email ??
      updated.walletAddress ??
      user.id;
    const agent = user.ownedAgents[0];

    console.log('Dojo dev API key ready.');
    console.log(`  user: ${label}`);
    if (agent?.name) console.log(`  agent: ${agent.name}`);
    console.log(`  balance: ${updated.creditBalance}`);
    console.log(`  key: ${apiKey}`);
    console.log('\nExport:');
    console.log(`  export DOJO_API_KEY=${apiKey}`);
    console.log('\nDemo run:');
    console.log(`  DOJO_API_KEY=${apiKey} npm run dojo -- run --skill jiagon-negotiator --input '{"repo_url":"https://github.com/garrytan/gbrain","question":"Is this useful for building persistent-memory agents?"}'`);
  } finally {
    await prisma.$disconnect();
  }
}

async function dryRun(
  baseUrl: string,
  apiKey: string | undefined,
  manifest: ReturnType<typeof normalizeManifest>,
) {
  console.log(`Testing endpoint: ${manifest.endpointUrl}`);

  const { ok, status, data } = await requestJson<DryRunResponse>(
    `${baseUrl}/api/skills/dry-run`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        endpointUrl: manifest.endpointUrl,
        input: manifest.exampleInput,
        ...(manifest.authHeader ? { authHeader: manifest.authHeader } : {}),
      }),
    },
  );

  if (!ok || !data.ok) {
    const reason = data.error ?? JSON.stringify(data.eval ?? data);
    fail(`Dry-run failed (HTTP ${status}): ${reason}`);
  }

  console.log(`Dry-run passed: status=${data.status} latency=${data.latencyMs}ms score=${data.eval?.score}`);
  return data;
}

async function publish(
  baseUrl: string,
  apiKey: string | undefined,
  manifest: ReturnType<typeof normalizeManifest>,
  source: LoadedManifest,
  securityScan?: SkillspectorSummary,
) {
  if (!apiKey) {
    console.warn('No DOJO_API_KEY provided. This only works against a local server with DOJO_SKIP_PRIVY_AUTH=true.');
  }

  const { ok, status, data } = await requestJson<PublishResponse>(
    `${baseUrl}/api/skills/create`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        name: manifest.name,
        description: manifest.description,
        longDescription: manifest.longDescription,
        category: manifest.category,
        icon: manifest.icon,
        price: manifest.price,
        pricePerCall: manifest.price,
        tags: manifest.tags,
        fileContent: source.raw,
        fileType: source.fileType,
        endpointUrl: manifest.endpointUrl,
        executionKind: 'sync',
        inputShape: 'form',
        outputShape: 'json',
        inputSchema: manifest.inputSchema,
        outputSchema: manifest.outputSchema,
        exampleInput: manifest.exampleInput,
        exampleOutput: manifest.exampleOutput,
        estLatencyMs: manifest.slaMs,
        sandboxable: true,
        authRequired: Boolean(manifest.authHeader),
        ...(securityScan?.available
          ? {
              securityScan: {
                provider: 'skillspector',
                score: securityScan.score,
                severity: securityScan.severity,
                recommendation: securityScan.recommendation,
                findingCount: securityScan.findingCount,
                scannedAt: new Date().toISOString(),
              },
            }
          : {}),
      }),
    },
  );

  if (!ok) {
    fail(`Publish failed (HTTP ${status}): ${data.error ?? JSON.stringify(data)}`);
  }

  console.log('Workflow published.');
  console.log(`  skillId: ${data.id}`);
  if (data.gatewaySlug) console.log(`  gatewaySlug: ${data.gatewaySlug}`);
  if (data.workflow?.id) console.log(`  workflowId: ${data.workflow.id}`);
  if (data.workflow?.slug) console.log(`  workflowUrl: ${baseUrl}/workflow/${data.workflow.slug}/run`);
  return data;
}

async function forkWorkflow(
  baseUrl: string,
  apiKey: string | undefined,
  flags: Flags,
) {
  if (!apiKey) fail('DOJO_API_KEY or --api-key is required for fork.');

  const workflowId = flagString(flags, 'workflow') ?? flagString(flags, 'id');
  if (!workflowId) fail('Missing --workflow <workflow-id-or-slug>.');

  const name = flagString(flags, 'name');
  const slug = flagString(flags, 'slug');
  const description = flagString(flags, 'description');
  const changeNote = flagString(flags, 'change-note') ?? description;

  const { ok, status, data } = await requestJson<ForkResponse>(
    `${baseUrl}/api/workflows/${encodeURIComponent(workflowId)}/fork`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
        ...(description ? { description } : {}),
        ...(changeNote ? { changeNote } : {}),
      }),
    },
  );

  if (!ok) {
    fail(`Fork failed (HTTP ${status}): ${data.error ?? JSON.stringify(data)}`);
  }

  console.log('Workflow fork created.');
  if (data.workflow?.id) console.log(`  workflowId: ${data.workflow.id}`);
  if (data.workflow?.slug) console.log(`  workflowSlug: ${data.workflow.slug}`);
  if (data.version?.version) console.log(`  version: v${data.version.version}`);
  return data;
}

async function deployWorkflow(
  baseUrl: string,
  apiKey: string | undefined,
  flags: Flags,
) {
  if (!apiKey) fail('DOJO_API_KEY or --api-key is required for deploy.');

  const workflowId = flagString(flags, 'workflow') ?? flagString(flags, 'id');
  if (!workflowId) fail('Missing --workflow <workflow-id-or-slug>.');

  const manifestFile = flagString(flags, 'file');
  const source = manifestFile && existsSync(resolve(manifestFile))
    ? readManifest(resolve(manifestFile))
    : null;
  const manifest = source ? source.manifest : {};
  const endpointUrl =
    flagString(flags, 'endpoint') ??
    manifest.endpointUrl ??
    manifest.endpoint_url ??
    manifest.endpoint;
  const priceValue =
    flagString(flags, 'price') ??
    manifest.pricePerRun ??
    manifest.price_per_run ??
    manifest.price;
  const pricePerRun = Number(priceValue);
  const slaValue = flagString(flags, 'sla-ms') ?? manifest.slaMs ?? manifest.sla_ms;
  const slaMs = slaValue === undefined ? 5000 : Number(slaValue);
  const inputSchema = manifest.inputSchema ?? manifest.input_schema;
  const outputSchema = manifest.outputSchema ?? manifest.output_schema;
  const exampleInput = manifest.exampleInput ?? manifest.example_input ?? {};
  const exampleOutput = manifest.exampleOutput ?? manifest.example_output;

  const missing: string[] = [];
  if (!endpointUrl) missing.push('endpoint');
  if (!Number.isFinite(pricePerRun) || pricePerRun <= 0) missing.push('price > 0');
  if (!Number.isFinite(slaMs) || slaMs < 200) missing.push('sla-ms >= 200');
  if (missing.length > 0) {
    fail(`Invalid deploy input. Missing or invalid: ${missing.join(', ')}`);
  }

  const { ok, status, data } = await requestJson<DeployResponse>(
    `${baseUrl}/api/workflows/${encodeURIComponent(workflowId)}/deploy`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({
        endpointUrl,
        pricePerRun,
        inputSchema,
        outputSchema,
        exampleInput,
        exampleOutput,
        outputShape: 'json',
        slaMs,
      }),
    },
  );

  if (!ok) {
    fail(`Deploy failed (HTTP ${status}): ${data.error ?? JSON.stringify(data)}`);
  }

  console.log('Workflow deployed.');
  if (data.workflow?.id) console.log(`  workflowId: ${data.workflow.id}`);
  if (data.workflow?.slug) console.log(`  workflowSlug: ${data.workflow.slug}`);
  if (data.skill?.gatewaySlug) console.log(`  gatewaySlug: ${data.skill.gatewaySlug}`);
  if (data.gateway) console.log(`  gateway: ${baseUrl}${data.gateway}`);
  if (data.runUrl) console.log(`  runUrl: ${baseUrl}${data.runUrl}`);
  return data;
}

async function runWorkflow(
  baseUrl: string,
  apiKey: string | undefined,
  flags: Flags,
) {
  if (!apiKey) fail('DOJO_API_KEY or --api-key is required for run.');

  const skill = flagString(flags, 'skill') ?? flagString(flags, 'workflow');
  if (!skill) fail('Missing --skill <gateway-slug>.');

  const input = readJsonInput(flags);
  const { ok, status, data } = await requestJson<RunResponse>(
    `${baseUrl}/api/v1/run`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(apiKey),
      },
      body: JSON.stringify({ skill, input }),
    },
  );

  if (!ok) {
    const reason = data.reason ? ` — ${data.reason}` : '';
    fail(`Run failed (HTTP ${status}): ${data.error ?? JSON.stringify(data)}${reason}`);
  }

  console.log('Workflow run cleared.');
  console.log(`  skill: ${skill}`);
  if (typeof data.cost === 'number') console.log(`  cost: ${data.cost}`);
  if (typeof data.balance === 'number') console.log(`  balance: ${data.balance}`);
  if (typeof data.score === 'number') console.log(`  score: ${data.score}`);
  if (data.session_id) console.log(`  sessionId: ${data.session_id}`);
  if (typeof data.latency_ms === 'number') console.log(`  latency: ${data.latency_ms}ms`);
  if (data.workflow_receipt?.id) {
    console.log(`  receiptId: ${data.workflow_receipt.id}`);
    console.log(`  receiptUrl: ${baseUrl}/r/${data.workflow_receipt.id}`);
  }
  if (data.workflow_receipt?.settlement_status) {
    console.log(`  settlement: ${data.workflow_receipt.settlement_status}`);
  }
  if (data.workflow_receipt?.anchor_status) {
    console.log(`  anchor: ${data.workflow_receipt.anchor_status}`);
  }

  if (!flagBool(flags, 'no-result')) {
    console.log('\nResult:');
    console.log(JSON.stringify(data.result ?? data, null, 2));
  }

  return data;
}

function printHelp() {
  console.log(`Dojo creator CLI

Usage:
  dojo init [--file dojo.workflow.yaml]
  dojo dev-key [--fund 10]
  dojo scan [--file dojo.workflow.yaml] [--llm] [--max-risk 50]
  DOJO_API_KEY=dojo_sk_... dojo test [--file dojo.workflow.yaml] [--url http://localhost:3000]
  DOJO_API_KEY=dojo_sk_... dojo publish [--file dojo.workflow.yaml] [--url http://localhost:3000] [--skip-scan]
  DOJO_API_KEY=dojo_sk_... dojo publish --file SKILL.md
  DOJO_API_KEY=dojo_sk_... dojo fork --workflow <id-or-slug> [--name "My Fork"]
  DOJO_API_KEY=dojo_sk_... dojo deploy --workflow <id-or-slug> --endpoint https://... --price 0.25
  DOJO_API_KEY=dojo_sk_... dojo deploy --workflow <id-or-slug> --file dojo.workflow.yaml
  DOJO_API_KEY=dojo_sk_... dojo run --skill <gateway-slug> --input '{"target":"..."}'
  DOJO_API_KEY=dojo_sk_... dojo run --skill <gateway-slug> --input-file input.json

Environment:
  DOJO_API_KEY                 Creator API key for production publish
  DOJO_BASE_URL                Dojo instance URL
  DOJO_ENDPOINT_AUTH_HEADER    Optional Authorization header sent to your endpoint during dry-run
  SKILLSPECTOR_BIN             Optional path to the NVIDIA SkillSpector binary

Notes:
  - dev-key is a local demo helper. It creates/reuses one DB-backed API key and tops up demo credits.
  - Production endpoints must be public HTTPS.
  - publish runs dry-run first unless --skip-test is passed.
  - publish runs NVIDIA SkillSpector first unless --skip-scan is passed. Use --require-scan to fail if the binary is missing.
  - scan uses static analysis by default. Pass --llm to enable SkillSpector semantic analysis.
  - dojo.workflow.yaml is canonical; SKILL.md frontmatter is supported for compatibility.
  - fork creates a draft workflow; deploy attaches your executable endpoint.
  - run calls /api/v1/run and prints the shareable /r/<receiptId> proof URL.
`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { command, flags } = parseFlags(process.argv.slice(2));
  const { file, baseUrl, apiKey } = resolveConfig(flags);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    if (existsSync(file) && !flagBool(flags, 'force')) {
      fail(`Refusing to overwrite existing manifest: ${file}\nUse --force to replace it.`);
    }
    writeFileSync(file, TEMPLATE, 'utf8');
    console.log(`Created ${file}`);
    return;
  }

  if (command === 'dev-key') {
    await devKey(baseUrl, flags);
    return;
  }

  if (command === 'test') {
    const source = readManifest(file);
    const manifest = normalizeManifest(source.manifest);
    await dryRun(baseUrl, apiKey, manifest);
    return;
  }

  if (command === 'scan') {
    readManifest(file);
    runSkillspectorScan(file, flags, { required: true });
    return;
  }

  if (command === 'publish') {
    const source = readManifest(file);
    const manifest = normalizeManifest(source.manifest);
    let securityScan: SkillspectorSummary | undefined;
    if (!flagBool(flags, 'skip-scan')) {
      const summary = runSkillspectorScan(file, flags, {
        required: flagBool(flags, 'require-scan'),
      });
      if (!summary.available) {
        console.warn('Install NVIDIA SkillSpector or set SKILLSPECTOR_BIN to enable publish-time security scans.');
      } else {
        securityScan = summary;
      }
    }
    if (!flagBool(flags, 'skip-test')) {
      await dryRun(baseUrl, apiKey, manifest);
    }
    await publish(baseUrl, apiKey, manifest, source, securityScan);
    return;
  }

  if (command === 'fork') {
    await forkWorkflow(baseUrl, apiKey, flags);
    return;
  }

  if (command === 'deploy') {
    await deployWorkflow(baseUrl, apiKey, flags);
    return;
  }

  if (command === 'run') {
    await runWorkflow(baseUrl, apiKey, flags);
    return;
  }

  printHelp();
  fail(`Unknown command: ${command}`);
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
