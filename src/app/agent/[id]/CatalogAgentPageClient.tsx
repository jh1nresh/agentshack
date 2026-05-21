"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  GitFork,
  Layers3,
  Play,
  ReceiptText,
  Repeat2,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { BackgroundEffect } from "@/components/landing/BackgroundEffect";
import { Footer } from "@/components/landing/Footer";
import { Navbar } from "@/components/landing/Navbar";
import { DojoPetAvatar } from "@/components/DojoPetAvatar";
import {
  agentFamilyDisplayCode,
  agentGenerationLabel,
  agentProofLevelLabel,
  agentCardStatusLabel,
  type AgentServiceCard,
} from "@/lib/agent-card-catalog";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function money(value: number) {
  return `$${value.toLocaleString()}`;
}

function actionCopy(mode: string | null) {
  if (mode === "subscribe") return "Subscribe keeps this agent available for recurring merchant work.";
  if (mode === "license") return "Fork / license turns this service into your own merchant-specific version.";
  return "Run one case, get the result, and write a receipt back to this agent card.";
}

export function CatalogAgentPageClient({ agent }: { agent: AgentServiceCard }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-700">
      <BackgroundEffect />
      <Navbar />

      <main className="dojo-page-shell">
        <Link href="/#agents" className="dojo-back-link">
          <ArrowLeft className="w-3 h-3" />
          Back to AgentShack
        </Link>

        <section className="dojo-agent-profile">
          <div className="dojo-agent-profile-hero">
            <div className="dojo-agent-profile-avatar">
              <DojoPetAvatar
                name={agent.name}
                workflowId={agent.avatarSeed}
                slug={agent.slug}
                category={agent.category}
                creatorId={agent.lineage.parent ?? agent.lineage.root}
                receipts={agent.reputation.receiptsCleared}
                passRate={agent.reputation.successRate}
                forks={agent.lineage.generation}
                royaltyBps={agent.pricing.royaltyBps}
                size="lg"
              />
            </div>

            <div className="dojo-agent-profile-copy">
              <span>{agentFamilyDisplayCode(agent.familyCode)} · {agentGenerationLabel(agent.lineage.generation)} · {agent.nfaId}</span>
              <h1>{agent.name}</h1>
              <p>{agent.summary}</p>
              <div className="dojo-agent-card-meta">
                <span>{agent.familyName}</span>
                <span>{agentGenerationLabel(agent.lineage.generation)}</span>
                <span>{agentProofLevelLabel(agent.proofLevel)} proof</span>
                <span>{agent.ownerIdentity}</span>
              </div>
              <div className="dojo-agent-profile-loop">
                <span>Run once</span>
                <span>Subscribe</span>
                <span>Fork / License</span>
              </div>
            </div>
          </div>

          <section className="dojo-agent-profile-panel">
            <div className="dojo-agent-section-title">
              <ShieldCheck className="h-3.5 w-3.5" />
              Agent identity
            </div>
            <div className="dojo-agent-nfa-strip dojo-agent-nfa-strip-wide">
              <div>
                <span>AgentID</span>
                <strong>{agent.agentId}</strong>
              </div>
              <div>
                <span>Family</span>
                <strong>{agentFamilyDisplayCode(agent.familyCode)}</strong>
              </div>
              <div>
                <span>Family role</span>
                <strong>{agent.familyRole}</strong>
              </div>
              <div>
                <span>Proof summary</span>
                <strong>{agent.proofSummary}</strong>
              </div>
            </div>
          </section>

          <div className="dojo-agent-profile-stats" aria-label={`${agent.name} agent stats`}>
            <div>
              <span>Credit</span>
              <strong>CR {agent.reputation.creditScore}</strong>
            </div>
            <div>
              <span>Success</span>
              <strong>{percent(agent.reputation.successRate)}</strong>
            </div>
            <div>
              <span>Receipts</span>
              <strong>{agent.reputation.receiptsCleared}</strong>
            </div>
            <div>
              <span>Cleared volume</span>
              <strong>{money(agent.reputation.verifiedVolumeUsd)}</strong>
            </div>
          </div>

          <section id="run" className="dojo-agent-profile-panel">
            <div>
              <div className="dojo-agent-section-title">
                <Play className="h-3.5 w-3.5 fill-current" />
                Hire this agent
              </div>
              <p>{actionCopy(mode)}</p>
            </div>
            <div className="dojo-agent-profile-actions">
              <Link href={`${agent.detailHref}?mode=run#run`} className="dojo-action dojo-action-primary">
                <Play className="h-3.5 w-3.5 fill-current" />
                Run once
              </Link>
              <Link href={`${agent.detailHref}?mode=subscribe#run`} className="dojo-action">
                <Repeat2 className="h-3.5 w-3.5" />
                Subscribe
              </Link>
              <Link href={`${agent.detailHref}?mode=license#run`} className="dojo-action">
                <GitFork className="h-3.5 w-3.5" />
                Fork / License
              </Link>
            </div>
          </section>

          <div className="dojo-agent-profile-grid">
            <section className="dojo-agent-profile-panel">
              <div className="dojo-agent-section-title">
                <WalletCards className="h-3.5 w-3.5" />
                Abilities
              </div>
              <div className="dojo-agent-move-list">
                {agent.abilities.map((ability, index) => (
                  <div key={ability} className="dojo-agent-move">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{ability}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="dojo-agent-profile-panel">
              <div className="dojo-agent-section-title">
                <Layers3 className="h-3.5 w-3.5" />
                Service deck
              </div>
              <ol className="dojo-agent-quest-list">
                {agent.workflowDeck.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>

            <section className="dojo-agent-profile-panel">
              <div className="dojo-agent-section-title">
                <ReceiptText className="h-3.5 w-3.5" />
                Proof receipts
              </div>
              <div className="dojo-agent-receipt-stamps">
                {agent.receipts.map((receipt) => (
                  <div key={receipt.id}>
                    <span>{receipt.status}</span>
                    <strong>{receipt.label} · {money(receipt.amountUsd)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="dojo-agent-profile-panel">
              <div className="dojo-agent-section-title">
                <ShieldCheck className="h-3.5 w-3.5" />
                Lineage and royalties
              </div>
              <div className="dojo-agent-dex-lineage">
                <div>
                  <span>Root</span>
                  <strong>{agent.lineage.root}</strong>
                </div>
                <div>
                  <span>Parent</span>
                  <strong>{agent.lineage.parent ?? "Genesis"}</strong>
                </div>
                <div>
                  <span>Children</span>
                  <strong>{agent.lineage.forks?.join(", ") ?? "None"}</strong>
                </div>
              </div>
              <p className="dojo-agent-profile-note">
                {agent.archetype}. {agentCardStatusLabel(agent.status)}. {(agent.pricing.royaltyBps / 100).toFixed(1)}% lineage royalty. Every cleared run feeds this agent card reputation.
              </p>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
