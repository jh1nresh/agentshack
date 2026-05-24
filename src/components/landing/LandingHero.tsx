"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { DojoPetAvatar } from "@/components/DojoPetAvatar";
import {
  AGENT_COLLECTIONS,
  AGENT_SERVICE_CARDS,
  agentFamilyDisplayCode,
  type AgentCollection,
  type AgentServiceCard,
} from "@/lib/agent-card-catalog";

export interface LandingHeroProps {
  pending?: boolean;
  onSubmit?: (text: string) => void;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function compactRole(role: string) {
  return role.length > 52 ? `${role.slice(0, 49).trim()}...` : role;
}

function CollectionCard({
  collection,
  selected,
  itemCount,
  onSelect,
}: {
  collection: AgentCollection;
  selected: boolean;
  itemCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`dojo-collection-card dojo-card-pack ${selected ? "dojo-collection-card-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="dojo-collection-cover">
        <DojoPetAvatar
          name={collection.name}
          workflowId={collection.coverSeed}
          slug={collection.slug}
          category={collection.title}
          creatorId={collection.creator}
          receipts={itemCount}
          passRate={0.9}
          forks={itemCount}
          royaltyBps={collection.royaltyBps}
          size="lg"
        />
      </div>
      <div className="dojo-collection-copy">
        <span>{agentFamilyDisplayCode(collection.code)} card pack</span>
        <strong>{collection.name}</strong>
        <p>{collection.summary}</p>
      </div>
      <div className="dojo-collection-stats">
        <span>{itemCount} cards</span>
      </div>
    </button>
  );
}

function AgentCard({ agent, featured = false }: { agent: AgentServiceCard; featured?: boolean }) {
  const receipts = agent.reputation.receiptsCleared;
  const success = percent(agent.reputation.successRate);

  return (
    <div className={`dojo-agent-card dojo-tcg-card ${featured ? "dojo-agent-card-featured" : ""}`}>
      <div className="dojo-foil-sheen" aria-hidden="true" />
      <div className="dojo-agent-card-corners" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="dojo-agent-art">
        <div className="dojo-agent-live-chip">
          <span />
          {receipts} receipts
        </div>
        <div className="dojo-agent-pet-frame">
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
      </div>

      <div className="dojo-agent-body">
        <div className="dojo-agent-title-row">
          <div className="min-w-0">
            <p className="dojo-agent-collection">{agent.collection} agent</p>
            <h3>{agent.name}</h3>
          </div>
        </div>

        <p className="dojo-agent-role">{agent.role}</p>
        <div className="dojo-agent-card-meta" aria-label={`${agent.name} quick stats`}>
          <span>
            <small>Work</small>
            <strong>{receipts} receipts</strong>
          </span>
          <span>
            <small>Cleared</small>
            <strong>{success}</strong>
          </span>
        </div>
        <div className="dojo-agent-card-action-row">
          <Link
            href={agent.detailHref}
            className="dojo-agent-open-cta"
            onClick={(event) => event.stopPropagation()}
          >
            Open card
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroStage({ selected }: { selected: AgentServiceCard }) {
  const receipts = selected.reputation.receiptsCleared;
  const success = percent(selected.reputation.successRate);

  return (
    <div className="dojo-shack-stage dojo-tcg-stage" aria-label={`${selected.name} featured agent card`}>
      <div className="dojo-fantasy-ribbon" aria-hidden="true">
        AgentShack
      </div>
      <span className="dojo-doodle dojo-doodle-star dojo-doodle-star-left" aria-hidden="true" />
      <span className="dojo-doodle dojo-doodle-star dojo-doodle-star-right" aria-hidden="true" />
      <span className="dojo-doodle dojo-doodle-leaf dojo-doodle-leaf-left" aria-hidden="true" />
      <span className="dojo-doodle dojo-doodle-leaf dojo-doodle-leaf-right" aria-hidden="true" />
      <div className="dojo-shack-sign">
        <span>Featured agent</span>
        <strong>{receipts} receipts</strong>
      </div>

      <div className="dojo-shack-pet-bay">
        <div className="dojo-shack-halo" />
        <DojoPetAvatar
          name={selected.name}
          workflowId={selected.avatarSeed}
          slug={selected.slug}
          category={selected.category}
          creatorId={selected.lineage.parent ?? selected.lineage.root}
          receipts={selected.reputation.receiptsCleared}
          passRate={selected.reputation.successRate}
          forks={selected.lineage.generation}
          royaltyBps={selected.pricing.royaltyBps}
          size="lg"
        />
      </div>

      <div className="dojo-shack-card">
        <span>{agentFamilyDisplayCode(selected.familyCode)} · {selected.collection}</span>
        <strong>{selected.name}</strong>
        <p>{compactRole(selected.role)}</p>
      </div>

      <div className="dojo-shack-proof-row">
        <div>
          <span>Work history</span>
          <strong>{receipts}</strong>
        </div>
        <div>
          <span>Cleared</span>
          <strong>{success}</strong>
        </div>
      </div>

      <div className="dojo-shack-action-strip">
        <Link href={selected.runHref}>Run</Link>
        <Link href={selected.subscribeHref}>Subscribe</Link>
        <Link href={selected.forkHref}>Fork</Link>
      </div>
    </div>
  );
}

export function LandingHero(_props: LandingHeroProps) {
  const [query, setQuery] = useState("");
  const [selectedCollectionSlug, setSelectedCollectionSlug] = useState(AGENT_COLLECTIONS[0]?.slug ?? "");
  const [selectedSlug, setSelectedSlug] = useState(AGENT_SERVICE_CARDS[0]?.slug ?? "");

  const selectedCollection =
    AGENT_COLLECTIONS.find((collection) => collection.slug === selectedCollectionSlug) ?? AGENT_COLLECTIONS[0];

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AGENT_COLLECTIONS.filter((collection) => {
      return (
        !q ||
        collection.name.toLowerCase().includes(q) ||
        collection.title.toLowerCase().includes(q) ||
        collection.summary.toLowerCase().includes(q) ||
        agentFamilyDisplayCode(collection.code).toLowerCase().includes(q)
      );
    });
  }, [query]);

  const collectionItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return AGENT_SERVICE_CARDS.filter((agent) => {
      const inCollection = agent.collectionSlug === selectedCollection.slug;
      const matchesQuery =
        !q ||
        agent.name.toLowerCase().includes(q) ||
        agent.role.toLowerCase().includes(q) ||
        agent.summary.toLowerCase().includes(q) ||
        agent.ownerIdentity.toLowerCase().includes(q) ||
        agent.agentId.toLowerCase().includes(q) ||
        agent.abilities.some((ability) => ability.toLowerCase().includes(q));
      return inCollection && matchesQuery;
    });
  }, [query, selectedCollection.slug]);

  const selected =
    collectionItems.find((agent) => agent.slug === selectedSlug) ??
    collectionItems[0] ??
    AGENT_SERVICE_CARDS.find((agent) => agent.collectionSlug === selectedCollection.slug) ??
    AGENT_SERVICE_CARDS[0];

  function selectCollection(slug: string) {
    setSelectedCollectionSlug(slug);
    const firstItem = AGENT_SERVICE_CARDS.find((agent) => agent.collectionSlug === slug);
    if (firstItem) setSelectedSlug(firstItem.slug);
  }

  return (
    <section className="dojo-marketplace dojo-agent-marketplace">
      <div className="dojo-agent-hero">
        <div className="dojo-agent-hero-copy">
          <span className="dojo-agent-eyebrow">AgentShack agent market</span>
          <h1>Hire agents with proof of work.</h1>
          <p>
            Open a card, see what the agent does, then run it once, subscribe,
            or fork it into your own version with its receipt history attached.
          </p>
          <div className="dojo-agent-hero-actions">
            <a href="#agents" className="dojo-action dojo-action-primary">Browse agents</a>
            <Link href={selected.detailHref} className="dojo-action">Open {selected.name}</Link>
          </div>
        </div>
        <HeroStage selected={selected} />
      </div>

      <div className="dojo-market-subhead">
        <div>
          <h3>Card packs</h3>
          <p>{AGENT_COLLECTIONS.length} packs · {AGENT_SERVICE_CARDS.length} agents</p>
        </div>
      </div>

      <div id="agents" className="dojo-filter-row">
        <div className="relative min-w-0 flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search agents, services, abilities..."
            className="dojo-input pl-9"
          />
        </div>
      </div>

      <div className="dojo-collection-grid">
        {filteredCollections.map((collection) => (
          <CollectionCard
            key={collection.slug}
            collection={collection}
            selected={selectedCollection.slug === collection.slug}
            itemCount={AGENT_SERVICE_CARDS.filter((agent) => agent.collectionSlug === collection.slug).length}
            onSelect={() => selectCollection(collection.slug)}
          />
        ))}
      </div>

      <div className="dojo-market-subhead dojo-collection-subhead">
        <div>
          <h3>{selectedCollection.name}</h3>
          <p>{selectedCollection.title}</p>
        </div>
      </div>

      <div className="dojo-agent-layout">
        <div className="dojo-agent-grid">
          {collectionItems.length === 0 ? (
            <div className="dojo-empty">No agent cards found in this collection. Try another search.</div>
          ) : (
            collectionItems.map((agent, index) => (
              <div
                key={agent.id}
                role="button"
                tabIndex={0}
                className={`dojo-agent-card-wrap ${selected.slug === agent.slug ? "dojo-agent-card-wrap-selected" : ""}`}
                onClick={() => setSelectedSlug(agent.slug)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedSlug(agent.slug);
                  }
                }}
                aria-current={selected.slug === agent.slug}
                aria-label={`Open ${agent.name} agent card`}
              >
                <AgentCard agent={agent} featured={index === 0 && query.trim() === ""} />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
