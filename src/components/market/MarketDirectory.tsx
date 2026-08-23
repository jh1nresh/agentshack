"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  BNB_AGENT_CATEGORIES,
  getBnbAgentCategory,
  type BnbAgentCategorySlug,
} from "@/lib/bnb-marketplace";
import { useBnbMarketplaceAgents } from "@/hooks/useBnbMarketplaceAgents";
import styles from "./Marketplace.module.css";

type MarketDirectoryProps = {
  initialCategory?: string;
};

export function MarketDirectory({ initialCategory }: MarketDirectoryProps) {
  const { agents, complete } = useBnbMarketplaceAgents();
  const validInitialCategory = getBnbAgentCategory(initialCategory ?? "")?.slug;
  const [category, setCategory] = useState<BnbAgentCategorySlug | "all">(validInitialCategory ?? "all");
  const [query, setQuery] = useState("");

  const visibleAgents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return agents.filter((agent) => {
      const agentCategory = getBnbAgentCategory(agent.category);
      const inCategory = category === "all" || agent.category === category;
      const matchesQuery = !normalized || [agent.name, agent.summary, agent.task, agent.protocol, agentCategory?.name ?? ""]
        .some((value) => value.toLowerCase().includes(normalized));
      return inCategory && matchesQuery;
    });
  }, [agents, category, query]);

  const [selectedSlug, setSelectedSlug] = useState(validInitialCategory
    ? agents.find((agent) => agent.category === validInitialCategory)?.slug ?? agents[0].slug
    : agents[0].slug);

  const selected = visibleAgents.find((agent) => agent.slug === selectedSlug) ?? visibleAgents[0] ?? agents[0];
  const selectedCategory = getBnbAgentCategory(selected.category);

  function chooseCategory(nextCategory: BnbAgentCategorySlug | "all") {
    setCategory(nextCategory);
    const firstAgent = nextCategory === "all"
      ? agents[0]
      : agents.find((agent) => agent.category === nextCategory);
    if (firstAgent) setSelectedSlug(firstAgent.slug);
  }

  return (
    <>
      <section className={styles.focusPanel} aria-labelledby="selected-agent-title">
        <div className={styles.meta}>
          <span>SELECTED AGENT / BSC TESTNET</span>
          <span className={styles.demoStatus}>● {selected.registryStatus === "live" ? "ONCHAIN IDENTITY" : "CHECKING REGISTRY"}</span>
        </div>

        <div className={styles.agentHeading}>
          <i className={styles.agentInitials}>{selected.initials}</i>
          <div>
            <small>{selectedCategory?.name}</small>
            <h1 id="selected-agent-title">{selected.name}</h1>
            <p>{selected.protocol}</p>
          </div>
        </div>
        <p className={styles.panelLead}>{selected.summary}</p>

        <section className={styles.boundary} aria-label={`${selected.name} testnet job`}>
          <div className={styles.boundaryHeader}>
            <span>TESTNET JOB</span>
            <strong>CHAIN 97 ONLY</strong>
          </div>
          <div className={styles.boundaryGrid}>
            <div><small>Can do</small><strong>{selected.task}</strong></div>
            <div><small>Service fee</small><strong>{selected.feeLabel}</strong></div>
            <div><small>Identity</small><strong>ERC-8004 #{selected.agentId}</strong></div>
          </div>
          <p className={styles.boundaryNote}><strong>Cannot:</strong> {selected.cannotDo}</p>
        </section>

        <div className={styles.actions}>
          <Link href={`/market/${selected.slug}`} className={styles.primaryButton}>View {selected.name} →</Link>
          <Link href={`/?q=${selectedCategory?.slug ?? ""}`} className={styles.secondaryButton}>Categories</Link>
        </div>
        <div className={styles.controlNote}>
          <strong>You approve every testnet transaction.</strong>
          <span>No mainnet transaction or server-held key.</span>
        </div>
      </section>

      <section className={styles.listPanel} aria-labelledby="market-list-title">
        <div className={styles.listHeader}>
          <span className={styles.kicker}>AGENT MARKET / {complete ? "LIVE TESTNET DATA" : "REGISTRY CHECK"}</span>
          <h2 id="market-list-title" className={styles.panelTitle}>Pick one job<br />to automate.</h2>
          <label className={styles.searchLabel}>
            Search agents
            <span className={styles.searchControl}>
              <Search width={13} height={13} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or job"
                autoComplete="off"
              />
            </span>
          </label>
        </div>

        <div className={styles.filterRow} aria-label="Agent category filters">
          <button
            type="button"
            className={`${styles.filterButton} ${category === "all" ? styles.filterButtonActive : ""}`}
            onClick={() => chooseCategory("all")}
            aria-pressed={category === "all"}
          >
            All
          </button>
          {BNB_AGENT_CATEGORIES.map((item) => (
            <button
              key={item.slug}
              type="button"
              className={`${styles.filterButton} ${category === item.slug ? styles.filterButtonActive : ""}`}
              onClick={() => chooseCategory(item.slug)}
              aria-pressed={category === item.slug}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className={`${styles.agentTableRow} ${styles.tableLabels}`} aria-hidden="true">
          <span>Agent</span><span>Job</span><span>Status</span><span />
        </div>

        {visibleAgents.map((agent) => (
          <button
            key={agent.slug}
            type="button"
            className={`${styles.agentTableRow} ${styles.agentTableButton} ${selected.slug === agent.slug ? styles.selectedRow : ""}`}
            onClick={() => setSelectedSlug(agent.slug)}
            aria-pressed={selected.slug === agent.slug}
          >
            <span className={styles.agentCell}><i>{agent.initials}</i><b>{agent.name}</b></span>
            <span>{agent.task}</span>
            <span>{agent.endpointStatus === "live" ? "Live" : "Checking"}</span>
            <span className={styles.viewLink}>View →</span>
          </button>
        ))}

        {visibleAgents.length === 0 && (
          <div className={styles.emptyState}>
            <strong>No testnet agents found</strong>
            <p>Clear the search or choose another category.</p>
          </div>
        )}
      </section>
    </>
  );
}
