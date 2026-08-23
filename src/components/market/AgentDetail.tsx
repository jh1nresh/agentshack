"use client";

import Link from "next/link";
import { getBnbAgentCategory, type BnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { useBnbMarketplaceAgents } from "@/hooks/useBnbMarketplaceAgents";
import styles from "./Marketplace.module.css";

export function AgentDetail({ agent }: { agent: BnbMarketplaceAgent }) {
  const { agents } = useBnbMarketplaceAgents();
  const liveAgent = agents.find((item) => item.slug === agent.slug) ?? agent;
  const category = getBnbAgentCategory(liveAgent.category);

  return (
    <>
      <section className={styles.detailPanel} aria-labelledby="agent-detail-title">
        <Link href={`/market?category=${liveAgent.category}`} className={styles.backLink}>← Back to market</Link>
        <div className={styles.meta}>
          <span>AGENT DETAIL / BSC TESTNET</span>
          <span className={styles.demoStatus}>{liveAgent.registryStatus === "live" ? "ONCHAIN IDENTITY" : "REGISTRY UNAVAILABLE"}</span>
        </div>

        <div className={styles.agentHeading}>
          <i className={styles.agentInitials}>{liveAgent.initials}</i>
          <div>
            <small>{category?.name}</small>
            <h1 id="agent-detail-title">{liveAgent.name}</h1>
            <p>{liveAgent.protocol}</p>
          </div>
        </div>
        <p className={styles.panelLead}>{liveAgent.summary}</p>

        <div className={styles.factGrid}>
          <div><small>What it does</small><strong>{liveAgent.task}</strong><p>One bounded job on chain 97.</p></div>
          <div><small>Quoted fee</small><strong>{liveAgent.feeLabel}</strong><p>Read the live quote before funding.</p></div>
          <div><small>Identity</small><strong>ERC-8004 #{liveAgent.agentId}</strong><p>{liveAgent.endpointStatus === "live" ? "Registry and endpoint responded." : "Activation is disabled until checks pass."}</p></div>
        </div>

        <section className={styles.controlList} aria-labelledby="control-list-title">
          <h2 id="control-list-title">What you control</h2>
          {liveAgent.controls.map((control, index) => (
            <div key={control}><b>{String(index + 1).padStart(2, "0")}</b><strong>{control}</strong><em>Owner controlled</em></div>
          ))}
          <div><b>—</b><strong>{liveAgent.cannotDo}</strong><em>Blocked</em></div>
        </section>
      </section>

      <aside className={styles.actionPanel} aria-labelledby="start-agent-title">
        <span className={styles.kicker}>START WITH CONTROL</span>
        <h2 id="start-agent-title" className={styles.detailTitle}>Set the task.<br />Set the limit.</h2>
        <p>Review the fixed testnet job before approving any wallet transaction.</p>

        <div className={styles.startSteps}>
          <div><b>1</b><span>Verify registry identity</span></div>
          <div><b>2</b><span>Read the signed quote</span></div>
          <div><b>3</b><span>Fund one testnet job</span></div>
        </div>

        <Link href={`/market/${liveAgent.slug}/setup`} className={`${styles.primaryButton} ${styles.fullWidth}`} aria-disabled={liveAgent.registryStatus !== "live"}>
          Activate on testnet →
        </Link>
        <small className={styles.finePrint}>BSC Testnet only. The flow never requests a private key or submits a mainnet transaction.</small>
      </aside>
    </>
  );
}
