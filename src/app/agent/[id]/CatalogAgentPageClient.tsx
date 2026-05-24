"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
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
  agentCardLevel,
  agentFamilyDisplayCode,
  agentGenerationLabel,
  agentOfferStack,
  type AgentServiceCard,
} from "@/lib/agent-card-catalog";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function money(value: number) {
  return `$${value.toLocaleString()}`;
}

function actionCopy(mode: string | null) {
  if (mode === "setup") return "Setup session is the rung-zero path: a guided hour to connect this agent to a real business workflow.";
  if (mode === "subscribe") return "Subscribe keeps this agent available for recurring merchant work.";
  if (mode === "license") return "Fork / license turns this service into your own merchant-specific version.";
  return "Run one case, get the result, and feed a cleared receipt back into this agent card.";
}

export function CatalogAgentPageClient({ agent }: { agent: AgentServiceCard }) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const level = agentCardLevel(agent);
  const signatureMove = agent.abilities[0] ?? agent.workflowDeck[0] ?? "Cleared work";
  const offerStack = agentOfferStack(agent);

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
            <div className="dojo-agent-profile-card">
              <div className="dojo-foil-sheen" aria-hidden="true" />
              <div className="dojo-agent-profile-card-top">
                <span>Agent</span>
                <strong>{agent.reputation.receiptsCleared} receipts</strong>
              </div>
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
              <div className="dojo-agent-profile-card-body">
                <span>{agent.nfaId}</span>
                <strong>{agent.name}</strong>
                <p>{signatureMove}</p>
              </div>
            </div>

            <div className="dojo-agent-profile-copy">
              <span>{agentFamilyDisplayCode(agent.familyCode)} · {agentGenerationLabel(agent.lineage.generation)}</span>
              <h1>{agent.name}</h1>
              <p>{agent.summary}</p>
              <div className="dojo-agent-profile-loop">
                <span>Run once</span>
                <span>Subscribe</span>
                <span>Fork</span>
              </div>
              <div className="dojo-pet-status">
                <div>
                  <span>Does</span>
                  <strong>{signatureMove}</strong>
                </div>
                <div>
                  <span>Work history</span>
                  <strong>{agent.reputation.receiptsCleared} receipts</strong>
                </div>
                <div>
                  <span>Cleared</span>
                  <strong>{percent(agent.reputation.successRate)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="dojo-agent-profile-stats" aria-label={`${agent.name} agent stats`}>
            <div>
              <span>Level</span>
              <strong>LV {level}</strong>
            </div>
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
              {offerStack.map((offer) => {
                const href = `${agent.detailHref}?mode=${offer.mode}#run`;
                const Icon = offer.mode === "run"
                  ? Play
                  : offer.mode === "setup"
                    ? CalendarCheck
                    : offer.mode === "subscribe"
                      ? Repeat2
                      : GitFork;

                return (
                  <Link
                    key={offer.mode}
                    href={href}
                    className={`dojo-agent-offer ${mode === offer.mode || (!mode && offer.mode === "run") ? "dojo-agent-offer-active" : ""}`}
                  >
                    <span className="dojo-agent-offer-top">
                      <Icon className={offer.mode === "run" ? "h-3.5 w-3.5 fill-current" : "h-3.5 w-3.5"} />
                      <strong>{offer.label}</strong>
                    </span>
                    <span className="dojo-agent-offer-price">{offer.price}</span>
                    <span className="dojo-agent-offer-copy">{offer.summary}</span>
                    <span className="dojo-agent-offer-receipt">{offer.receipt}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="dojo-agent-profile-grid">
            <section className="dojo-agent-profile-panel">
              <div className="dojo-agent-section-title">
                <WalletCards className="h-3.5 w-3.5" />
                Moves
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
                Workflow deck
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
                Care / training log
              </div>
              <div className="dojo-agent-receipt-stamps dojo-training-log">
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
                Evolution / lineage
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
                {agent.archetype}. Forks route {(agent.pricing.royaltyBps / 100).toFixed(1)}% lineage royalty back to the original agent.
              </p>
            </section>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
