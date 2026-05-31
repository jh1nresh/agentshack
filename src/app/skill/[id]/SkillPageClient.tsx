'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  FileInput,
  FileOutput,
  GitFork,
  Network,
  Play,
  ShieldCheck,
  Tag,
  Wallet,
  Zap,
} from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { BackgroundEffect } from '@/components/landing/BackgroundEffect';
import TrustCard from '@/components/TrustCard';
import SkillSandbox from '@/components/SkillSandbox';
import SkillExecutor from '@/components/skill/SkillExecutor';
import ReviewSection from '@/components/ReviewSection';
import ReviewForm from '@/components/ReviewForm';
import { CapabilityManifestPanel } from '@/components/workflow/CapabilityManifestPanel';
import { createSkillCapabilityManifest } from '@/lib/workflow-capabilities';
import type { SkillMaturity } from '@/lib/skill-maturity';

const PurchaseCard = dynamic(() => import('@/components/PurchaseCard'), { ssr: false });

interface SkillData {
  id: string;
  name: string;
  description: string | null;
  longDescription: string | null;
  category: string | null;
  pricePerCall: number | null;
  price: number;
  skillType: string;
  gatewaySlug: string | null;
  fileContent: string | null;
  evaluationScore: number | null;
  securityScanProvider?: string | null;
  securityRiskScore?: number | null;
  securityRiskSeverity?: string | null;
  securityRecommendation?: string | null;
  securityFindingCount?: number | null;
  securityScannedAt?: string | null;
  executionKind?: string | null;
  inputShape?: string | null;
  outputShape?: string | null;
  estLatencyMs?: number | null;
  sandboxable?: boolean | null;
  authRequired?: boolean | null;
  inputSchema?: string | null;
  outputSchema?: string | null;
  exampleInput?: string | null;
  exampleOutput?: string | null;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    displayName: string | null;
    walletAddress: string | null;
    erc8004TokenId: string | null;
  };
}

interface Attestation {
  sessionId: string;
  status: 'settled' | 'refunded';
  uid: string;
  settledAt: string | null;
}

interface HeatmapBucket {
  date: string;
  count: number;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
    walletAddress: string | null;
  };
  session: {
    id: string;
    callCount: number;
    status: string;
    settledAt: string | null;
  } | null;
}

interface SettledSession {
  id: string;
  callCount: number;
  status: string;
  settledAt: string | null;
}

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
};

type SchemaObject = {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

interface Props {
  skill: SkillData;
  totalCalls: number;
  totalSessions: number;
  passRate: number;
  passedSessions: number;
  failedSessions: number;
  maturity: SkillMaturity;
  sparkline: number[];
  medianLatencyMs: number | null;
  heatmap: HeatmapBucket[];
  attestations: Attestation[];
  reviews: ReviewData[];
}

function truncateAddress(address: string | null | undefined): string {
  if (!address) return '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function schemaItems(schema: SchemaObject | null, fallbackShape: string | null | undefined) {
  const entries = Object.entries(schema?.properties ?? {});
  if (entries.length === 0) {
    return [
      {
        label: fallbackShape ? humanizeKey(fallbackShape) : 'Input payload',
        description: fallbackShape === 'form'
          ? 'Fill the form fields and run the workflow.'
          : 'Send a JSON payload to the workflow.',
      },
    ];
  }

  const required = new Set(schema?.required ?? []);
  return entries.slice(0, 4).map(([key, prop]) => ({
    label: prop.title ?? humanizeKey(key),
    description:
      prop.description ??
      `${prop.type ?? 'value'}${required.has(key) ? ' · required' : ''}`,
  }));
}

function outputItems(schema: SchemaObject | null, fallbackShape: string | null | undefined) {
  const entries = Object.entries(schema?.properties ?? {});
  if (entries.length === 0) {
    return [
      {
        label: fallbackShape ? humanizeKey(fallbackShape) : 'Workflow result',
        description: 'A structured result returned by the workflow.',
      },
      {
        label: 'Receipt',
        description: 'A cleared execution record when run through the paid path.',
      },
    ];
  }

  return entries.slice(0, 4).map(([key, prop]) => ({
    label: prop.title ?? humanizeKey(key),
    description: prop.description ?? 'Returned as part of the workflow result.',
  }));
}

function shortList(items: { label: string }[]): string {
  return items.map((item) => item.label).join(', ');
}

export default function SkillPageClient({
  skill,
  totalCalls,
  totalSessions,
  passRate,
  passedSessions,
  failedSessions,
  maturity,
  sparkline,
  medianLatencyMs,
  heatmap,
  attestations,
  reviews,
}: Props) {
  const trustScore = skill.evaluationScore ?? 0;
  const { authenticated, user, getAccessToken } = usePrivy();
  const [userSessions, setUserSessions] = useState<SettledSession[]>([]);
  const [dbUserId, setDbUserId] = useState<string | undefined>();
  const inputSchema = safeParseJson<SchemaObject | null>(skill.inputSchema, null);
  const outputSchema = safeParseJson<SchemaObject | null>(skill.outputSchema, null);
  const exampleOutput = safeParseJson<Record<string, unknown>>(skill.exampleOutput, {});
  const inputSummary = schemaItems(inputSchema, skill.inputShape);
  const resultSummary = outputItems(outputSchema, skill.outputShape);
  const workflowTarget = skill.gatewaySlug ?? skill.id;
  const primaryDescription =
    skill.description ||
    skill.longDescription?.split('\n').find(Boolean) ||
    'Run this workflow with your input and receive a structured result.';
  const sampleResult =
    Object.keys(exampleOutput).length > 0
      ? exampleOutput
      : {
          result: `${skill.name} returns a structured ${skill.outputShape ?? 'JSON'} response.`,
          receipt: 'Paid runs also create a workflow receipt.',
        };
  const capabilityManifest = createSkillCapabilityManifest(skill);
  const hasSecurityScan = typeof skill.securityRiskScore === 'number';
  const securityTone =
    !hasSecurityScan
      ? 'Not scanned'
      : skill.securityRecommendation === 'DO_NOT_INSTALL'
        ? 'Blocked'
        : (skill.securityRiskScore ?? 100) <= 30
          ? 'Low risk'
          : (skill.securityRiskScore ?? 100) <= 50
            ? 'Review'
            : 'High risk';

  useEffect(() => {
    if (!authenticated || !user) return;
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) return;
      // Fetch user's settled sessions for this skill
      const res = await fetch(
        `/api/sessions?privyId=${encodeURIComponent(user.id)}&skillId=${skill.id}&status=settled,refunded`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setUserSessions(data.sessions ?? []);
      setDbUserId(data.userId);
    })();
    return () => { cancelled = true; };
  }, [authenticated, user, getAccessToken, skill.id]);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <BackgroundEffect />
      <Navbar />

      <main className="dojo-page-shell">
        <div>
          <Link
            href="/"
            className="dojo-back-link"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to marketplace
          </Link>

          <header className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div>
              {skill.category && (
                <span className="mb-4 inline-block rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-0.5 font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)] backdrop-blur-sm">
                  {skill.category}
                </span>
              )}
              <h1 className="mb-4 text-[38px] font-bold leading-tight tracking-tight text-[var(--text)] md:text-[54px]">
                {skill.name}
              </h1>
              <p className="max-w-3xl text-[17px] leading-relaxed text-[var(--text-secondary)]">
                {primaryDescription}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#run-workflow" className="dojo-action dojo-action-primary">
                  <Play className="h-4 w-4 fill-current" />
                  Run once safely
                </a>
                <a href="#permission-manifest" className="dojo-action">
                  <ShieldCheck className="h-4 w-4" />
                  Inspect permissions
                </a>
              </div>
            </div>

            <aside className="glass-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Quick read
                </span>
                <span className="rounded-full bg-[var(--bg-secondary)] px-3 py-1 font-mono text-[11px] text-[var(--text)]">
                  {maturity.label}
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--text)]">
                    <FileInput className="h-4 w-4" />
                    Input
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {shortList(inputSummary)}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--text)]">
                    <FileOutput className="h-4 w-4" />
                    Output
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {shortList(resultSummary)}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text)]">
                      <ShieldCheck className="h-4 w-4" />
                      Security scan
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {securityTone}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {hasSecurityScan
                      ? `Skillspector risk ${skill.securityRiskScore}/100${
                          skill.securityFindingCount !== null && skill.securityFindingCount !== undefined
                            ? ` · ${skill.securityFindingCount} findings`
                            : ''
                        }${skill.securityRecommendation ? ` · ${skill.securityRecommendation}` : ''}`
                      : 'No publish-time Skillspector report has been attached yet.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-[var(--border-light)] pt-4 sm:grid-cols-4">
                  {[
                    ['Maturity', maturity.label],
                    ['Runs', totalCalls.toLocaleString()],
                    ['Success', `${passRate}%`],
                    ['Trust', trustScore.toString()],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="font-mono text-[15px] font-bold text-[var(--text)]">
                        {value}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </header>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Left column */}
            <div className="space-y-6">
              <section className="glass-card p-8">
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-5 text-[var(--text-muted)]">
                  How it works
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      icon: FileInput,
                      label: 'Input',
                      body: inputSummary[0]?.description ?? 'Provide the workflow payload.',
                    },
                    {
                      icon: Zap,
                      label: 'Process',
                      body: 'AgentShack runs the workflow in a bounded session; local install stays off by default.',
                    },
                    {
                      icon: FileOutput,
                      label: 'Output',
                      body: `Receive ${shortList(resultSummary).toLowerCase()} after the workflow completes.`,
                    },
                  ].map(({ icon: Icon, label, body }) => (
                    <div key={label} className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                      <Icon className="mb-3 h-4 w-4 text-[var(--text-secondary)]" />
                      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                        {label}
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                        {body}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <div id="permission-manifest">
                <CapabilityManifestPanel manifest={capabilityManifest} />
              </div>

              <section className="glass-card p-8">
                <div className="mb-5 flex items-center justify-between">
                  <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                    Sample result
                  </div>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    preview
                  </span>
                </div>
                <pre className="overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {formatJson(sampleResult)}
                </pre>
              </section>

              {/* Flagship: live sandbox (token-price-oracle only) */}
              {skill.gatewaySlug === 'token-price-oracle' && (
                <div id="run-workflow">
                  <SkillSandbox />
                </div>
              )}

              {skill.skillType === 'active' && skill.gatewaySlug !== 'token-price-oracle' && (
                <section id="run-workflow" className="glass-card p-8">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
                      Run once safely
                    </div>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      {skill.estLatencyMs ? `${skill.estLatencyMs}ms est.` : 'Live endpoint'}
                    </span>
                  </div>
                  <SkillExecutor
                    skill={{
                      id: skill.id,
                      name: skill.name,
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
                    }}
                    mode="sandbox"
                  />
                </section>
              )}

              {/* Flagship: trust dossier */}
              <TrustCard
                trustScore={trustScore}
                passedSessions={passedSessions}
                failedSessions={failedSessions}
                totalSessions={totalSessions}
                medianLatencyMs={medianLatencyMs}
                sparkline={sparkline}
                heatmap={heatmap}
                attestations={attestations}
                creator={{
                  displayName: skill.creator.displayName,
                  walletAddress: skill.creator.walletAddress,
                  erc8004TokenId: skill.creator.erc8004TokenId,
                }}
              />

              <ReviewSection reviews={reviews} />

              {authenticated && (
                <div className="glass-card p-8">
                  <ReviewForm
                    targetType="skill"
                    targetId={skill.id}
                    userId={dbUserId}
                    sessions={userSessions}
                  />
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <aside className="space-y-6">
              <PurchaseCard
                skill={{
                  id: skill.id,
                  name: skill.name,
                  skillType: skill.skillType,
                  price: skill.price,
                  pricePerCall: skill.pricePerCall,
                  gatewaySlug: skill.gatewaySlug,
                  fileContent: skill.fileContent,
                }}
              />

              <div className="glass-card p-7">
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-5 text-[var(--text-muted)]">
                  Install safety
                </div>
                <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  AgentShack should clear the run before it mutates your environment. Treat local install,
                  slash commands, cron jobs, MCP registration, and config writes as approval events.
                </p>
                <div className="space-y-3 rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4 font-mono text-[11px] text-[var(--text-secondary)]">
                  <div><strong className="text-[var(--text)]">Before:</strong> preview, sandbox, run once, receipt.</div>
                  <div><strong className="text-[var(--text)]">After approval:</strong> install file, command, schedule, or config change.</div>
                  <div><strong className="text-[var(--text)]">Rollback:</strong> install receipt should list what to remove.</div>
                </div>
              </div>

              <div className="glass-card p-7">
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-5 text-[var(--text-muted)]">
                  Trust & receipts
                </div>
                <p className="mb-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {maturity.summary} Paid runs create receipts after delivery is evaluated.
                </p>
                <div className="space-y-3">
                  {[
                    { icon: ShieldCheck, label: 'Maturity', value: maturity.label },
                    { icon: Network, label: 'Network', value: 'BNB Smart Chain' },
                    { icon: ShieldCheck, label: 'Settlement', value: 'ERC-8183' },
                    { icon: Wallet, label: 'Payment', value: 'USDC per call' },
                    { icon: Tag, label: 'Category', value: skill.category || '—' },
                    { icon: Calendar, label: 'Listed', value: formatDate(skill.createdAt) },
                    { icon: Zap, label: 'Updated', value: formatDate(skill.updatedAt) },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        <Icon className="w-3 h-3" />
                        {label}
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text)]">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-7">
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-5 text-[var(--text-muted)]">
                  Creator
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{
                      backgroundColor: `hsl(${
                        ((skill.creator.id?.charCodeAt(0) ?? 0) * 37) % 360
                      }, 60%, 50%)`,
                    }}
                  >
                    {(skill.creator.displayName || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate text-[var(--text)]">
                      {skill.creator.displayName || 'Anonymous'}
                    </div>
                    <div className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                      {truncateAddress(skill.creator.walletAddress)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-7">
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] mb-5 text-[var(--text-muted)]">
                  Creator tools
                </div>
                <p className="mb-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  Want to customize this workflow? Remix keeps lineage attached and creates your own draft.
                </p>
                <div className="grid gap-2">
                  <Link href={`/workflow/${workflowTarget}/fork`} className="dojo-action w-full justify-center">
                    <GitFork className="h-4 w-4" />
                    Remix this skill
                  </Link>
                  <Link href="/create" className="dojo-action dojo-action-primary w-full justify-center">
                    Publish your own
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
