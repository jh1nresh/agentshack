import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { BackgroundEffect } from "@/components/landing/BackgroundEffect";
import { DojoSpirit } from "@/components/DojoSpirit";
import { prisma } from "@/lib/prisma";
import { buildWorkflowFeedingEvent, buildWorkflowSpiritProfile } from "@/lib/workflow-spirit";

export const dynamic = "force-dynamic";

function formatMoney(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 3)}`;
}

function formatScore(value: number) {
  return value <= 1 ? value.toFixed(2) : (value / 100).toFixed(2);
}

function shortHash(value: string | null | undefined) {
  if (!value) return "not anchored";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function statusCopy(receipt: { score: number; settlementStatus: string }) {
  const passed = receipt.score > 0 && receipt.settlementStatus === "paid";
  if (passed) {
    return {
      label: "PASS",
      tone: "text-emerald-600 dark:text-emerald-300",
      bg: "bg-emerald-500/10",
      icon: CheckCircle2,
    };
  }
  return {
    label: "FAIL",
    tone: "text-red-600 dark:text-red-300",
    bg: "bg-red-500/10",
    icon: XCircle,
  };
}

function bscTxUrl(hash: string | null) {
  return hash ? `https://testnet.bscscan.com/tx/${hash}` : null;
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const { receiptId } = await params;
  const receipt = await prisma.workflowRunReceipt.findUnique({
    where: { id: receiptId },
    include: {
      workflow: {
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          trustScore: true,
          runCount: true,
          forkCount: true,
          royaltyBps: true,
          creatorId: true,
          pricePerRun: true,
        },
      },
      version: {
        select: {
          version: true,
          title: true,
          evaluatorPolicy: true,
          slaMs: true,
        },
      },
      skillCall: {
        select: {
          status: true,
          httpStatus: true,
          latencyMs: true,
          nonce: true,
          createdAt: true,
        },
      },
      session: {
        select: {
          id: true,
          status: true,
          budgetTotal: true,
          budgetRemaining: true,
          pricePerCall: true,
          onchainJobId: true,
          basAttestationUid: true,
          skill: {
            select: {
              id: true,
              name: true,
              gatewaySlug: true,
            },
          },
        },
      },
      buyerAgent: {
        select: {
          id: true,
          name: true,
          walletAddress: true,
          trustScore: true,
        },
      },
      creator: {
        select: {
          id: true,
          displayName: true,
          walletAddress: true,
        },
      },
    },
  });

  if (!receipt) notFound();

  const status = statusCopy(receipt);
  const StatusIcon = status.icon;
  const platformFee = receipt.settlementStatus === "paid" ? receipt.costUsdc * 0.05 : 0;
  const reputationFee = receipt.settlementStatus === "paid" ? receipt.costUsdc * 0.05 : 0;
  const creatorReceived = receipt.settlementStatus === "paid"
    ? Math.max(0, receipt.costUsdc - platformFee - reputationFee)
    : 0;
  const trustImpact = receipt.score > 0 ? "+ execution proof" : "no positive impact";
  const swapUrl = bscTxUrl(receipt.swapTxHash);
  const settleUrl = bscTxUrl(receipt.settleTxHash);
  const spirit = buildWorkflowSpiritProfile({
    workflowId: receipt.workflow.id,
    slug: receipt.workflow.slug,
    name: receipt.workflow.name,
    category: receipt.workflow.category,
    creatorId: receipt.workflow.creatorId,
    creatorName: receipt.creator.displayName ?? receipt.creator.walletAddress,
    runCount: receipt.workflow.runCount,
    forkCount: receipt.workflow.forkCount,
    trustScore: receipt.workflow.trustScore,
    royaltyBps: receipt.workflow.royaltyBps,
  });
  const feedingEvent = buildWorkflowFeedingEvent({
    receiptId: receipt.id,
    score: receipt.score,
    settlementStatus: receipt.settlementStatus,
    spirit,
  });

  const checks = [
    ["Delivered", receipt.delivered],
    ["Valid format", receipt.validFormat],
    ["Within SLA", receipt.withinSla],
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-700">
      <BackgroundEffect />
      <Navbar />

      <main className="dojo-page-shell dojo-page-shell-wide">
        <div className="mb-6">
          <Link
            href={`/workflow/${receipt.workflow.slug}/run`}
            className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to workflow
          </Link>
        </div>

        <header className="dojo-page-header">
          <div className="label-sm mb-3">Asset Receipt</div>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <h1 className="dojo-page-title">
                {receipt.workflow.name}
                <br />
                <span className="text-[var(--text-muted)]">fed by execution.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--text-secondary)]">
                This receipt is the feeding log for a workflow asset. It records evaluator
                outcome, settlement state, hashes, BSC testnet anchor, and reputation impact
                for one cleared agent run.
              </p>
            </div>
            <section className={`dojo-card p-5 ${status.bg}`}>
              <div className={`flex items-center gap-3 ${status.tone}`}>
                <StatusIcon className="h-8 w-8" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.24em]">
                    Clearing result
                  </div>
                  <div className="mt-1 text-3xl font-semibold">{status.label}</div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <ReceiptMetric label="Score" value={formatScore(receipt.score)} />
                <ReceiptMetric label="Settlement" value={receipt.settlementStatus} />
                <ReceiptMetric label="Cost" value={formatMoney(receipt.costUsdc)} />
                <ReceiptMetric label="Anchor" value={receipt.anchorStatus} />
              </div>
            </section>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="dojo-card p-6">
            <DojoSpirit
              profile={spirit}
              name={receipt.workflow.name}
              receipts={receipt.workflow.runCount}
              passRate={receipt.score}
              forks={receipt.workflow.forkCount}
              status={`${feedingEvent.result} feeding event: ${feedingEvent.reputationDelta}`}
            />
          </section>

          <section className="dojo-card p-6">
            <div className="mb-5 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className="text-[18px] font-semibold">Clearing Summary</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ReceiptMetric label="Creator received" value={formatMoney(creatorReceived)} />
              <ReceiptMetric label="Dojo fee" value={formatMoney(platformFee)} />
              <ReceiptMetric label="Reputation pool" value={formatMoney(reputationFee)} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {checks.map(([label, passed]) => (
                <div key={label} className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {label}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[14px] font-semibold">
                    {passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    {passed ? "Passed" : "Failed"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="dojo-card p-6">
            <div className="mb-5 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className="text-[18px] font-semibold">Runtime</h2>
            </div>
            <div className="space-y-3">
              <KeyValue label="Latency" value={receipt.skillCall?.latencyMs ? `${receipt.skillCall.latencyMs}ms` : "unknown"} />
              <KeyValue label="HTTP status" value={receipt.skillCall?.httpStatus ? String(receipt.skillCall.httpStatus) : "unknown"} />
              <KeyValue label="Evaluator" value={receipt.evaluator} />
              <KeyValue label="SLA" value={receipt.version?.slaMs ? `${receipt.version.slaMs}ms` : "5000ms"} />
              <KeyValue label="Trust impact" value={trustImpact} />
            </div>
          </section>

          <section className="dojo-card p-6">
            <div className="mb-5 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--text-muted)]" />
              <h2 className="text-[18px] font-semibold">Proof Data</h2>
            </div>
            <div className="space-y-3">
              <KeyValue label="Receipt ID" value={receipt.id} mono />
              <KeyValue label="Session ID" value={receipt.sessionId} mono />
              <KeyValue label="Request hash" value={shortHash(receipt.requestHash)} mono />
              <KeyValue label="Response hash" value={shortHash(receipt.responseHash)} mono />
              <KeyValue label="On-chain request" value={shortHash(receipt.onchainRequestId)} mono />
              <KeyValue label="BAS UID" value={shortHash(receipt.attestationUid ?? receipt.session.basAttestationUid)} mono />
              {receipt.anchorError && (
                <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] leading-relaxed text-red-700 dark:text-red-200">
                  {receipt.anchorError}
                </div>
              )}
            </div>
          </section>

          <section className="dojo-card p-6">
            <h2 className="mb-5 text-[18px] font-semibold">Participants</h2>
            <div className="space-y-3">
              <KeyValue label="Buyer agent" value={receipt.buyerAgent.name} />
              <KeyValue label="Buyer wallet" value={shortHash(receipt.buyerAgent.walletAddress)} mono />
              <KeyValue label="Creator" value={receipt.creator.displayName ?? "Unnamed creator"} />
              <KeyValue label="Creator wallet" value={shortHash(receipt.creator.walletAddress)} mono />
              <KeyValue label="Gateway slug" value={receipt.session.skill.gatewaySlug ?? receipt.workflow.slug} mono />
            </div>
          </section>

          <section className="dojo-card p-6 lg:col-span-2">
            <h2 className="mb-5 text-[18px] font-semibold">Evaluator Policy</h2>
            <pre className="code-block whitespace-pre-wrap">
              {receipt.version?.evaluatorPolicy?.trim() ||
                "dojo-sanity-v1: delivered 2xx response, valid JSON body, and latency under SLA."}
            </pre>
            <div className="mt-5 flex flex-wrap gap-3">
              {swapUrl && <ProofLink href={swapUrl} label="Swap tx" />}
              {settleUrl && <ProofLink href={settleUrl} label="Settle tx" />}
              <ProofLink href={`/workflow/${receipt.workflow.slug}/run`} label="Run workflow again" local />
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function ReceiptMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 truncate font-mono text-[15px] font-semibold text-[var(--text)]">
        {value}
      </div>
    </div>
  );
}

function KeyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border-light)] pb-3 last:border-b-0">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      <span className={`min-w-0 truncate text-right text-[13px] text-[var(--text)] ${mono ? "font-mono" : "font-sans"}`}>
        {value}
      </span>
    </div>
  );
}

function ProofLink({ href, label, local = false }: { href: string; label: string; local?: boolean }) {
  const className =
    "inline-flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]";

  if (local) {
    return (
      <Link href={href} className={className}>
        {label}
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
