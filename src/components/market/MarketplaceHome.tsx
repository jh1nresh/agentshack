"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { BNB_AGENT_CATEGORIES } from "@/lib/bnb-marketplace";
import { useBnbMarketplaceAgents } from "@/hooks/useBnbMarketplaceAgents";
import styles from "./Marketplace.module.css";

export function MarketplaceHome() {
  const [query, setQuery] = useState("");
  const { agents, complete } = useBnbMarketplaceAgents();
  const categories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return BNB_AGENT_CATEGORIES;

    return BNB_AGENT_CATEGORIES.filter((category) => {
      const categoryAgents = agents.filter((agent) => agent.category === category.slug);
      return [category.name, category.action, category.description, ...categoryAgents.flatMap((agent) => [agent.name, agent.summary])]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [agents, query]);

  return (
    <div className={styles.homeContent}>
      <section className={styles.homeIntro} aria-labelledby="marketplace-title">
        <div className={styles.homeCopy}>
          <span className={styles.kicker}>BNB AGENT STUDIO / TESTNET MARKETPLACE</span>
          <h1 id="marketplace-title">What should an<br />agent handle?</h1>
          <p>Choose a job, inspect its onchain identity, then activate it on BSC Testnet.</p>
        </div>

        <div className={styles.homeStart}>
          <span className={styles.stepLabel}>START IN THREE STEPS</span>
          <ol>
            <li><b>01</b><strong>Choose a job</strong></li>
            <li><b>02</b><strong>Pick an agent</strong></li>
            <li><b>03</b><strong>Approve the testnet job</strong></li>
          </ol>
          <label className={styles.searchLabel}>
            Search the market
            <span className={styles.searchControl}>
              <Search width={13} height={13} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Job or agent"
                autoComplete="off"
              />
            </span>
          </label>
        </div>
      </section>

      <section aria-labelledby="category-title">
        <div className={styles.categoryHeader}>
          <span id="category-title">CHOOSE A CATEGORY</span>
          <span>{complete ? "REGISTRY + ENDPOINTS LIVE" : "CHECKING LIVE SOURCES"}</span>
        </div>

        {categories.map((category) => {
          const count = agents.filter((agent) => agent.category === category.slug).length;
          const categoryNumber = BNB_AGENT_CATEGORIES.findIndex((item) => item.slug === category.slug) + 1;
          return (
            <Link key={category.slug} href={`/market?category=${category.slug}`} className={styles.categoryRow}>
              <b className={styles.categoryNumber}>{String(categoryNumber).padStart(2, "0")}</b>
              <div>
                <small className={styles.categoryLabel}>{category.name}</small>
                <h2>{category.action}</h2>
              </div>
              <p>{category.description}</p>
              <span className={styles.demoLabel}>{count} TESTNET AGENT</span>
              <strong className={styles.categoryArrow}>Explore →</strong>
            </Link>
          );
        })}

        {categories.length === 0 && (
          <div className={styles.emptyState}>
            <strong>No matching category</strong>
            <p>Try a job such as liquidity, grid, yield, or borrowing.</p>
          </div>
        )}
      </section>
    </div>
  );
}
