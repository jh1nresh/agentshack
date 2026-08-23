import Link from "next/link";
import { getBnbAgentCategory, type BnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import styles from "./Marketplace.module.css";

function money(value: number) {
  return `$${value.toLocaleString()}`;
}

export function AgentDetail({ agent }: { agent: BnbMarketplaceAgent }) {
  const category = getBnbAgentCategory(agent.category);

  return (
    <>
      <section className={styles.detailPanel} aria-labelledby="agent-detail-title">
        <Link href={`/market?category=${agent.category}`} className={styles.backLink}>← Back to market</Link>
        <div className={styles.meta}>
          <span>AGENT DETAIL / DEMO</span>
          <span className={styles.demoStatus}>REGISTRY NOT CONNECTED</span>
        </div>

        <div className={styles.agentHeading}>
          <i className={styles.agentInitials}>{agent.initials}</i>
          <div>
            <small>{category?.name}</small>
            <h1 id="agent-detail-title">{agent.name}</h1>
            <p>{agent.protocol}</p>
          </div>
        </div>
        <p className={styles.panelLead}>{agent.summary}</p>

        <div className={styles.factGrid}>
          <div><small>What it does</small><strong>{agent.task}</strong><p>Only inside the task you choose.</p></div>
          <div><small>Example limit</small><strong>{money(agent.dailyLimitUsd)} / day</strong><p>You choose the final amount.</p></div>
          <div><small>Evidence</small><strong>Demo fixture</strong><p>Live registry evidence is still required.</p></div>
        </div>

        <section className={styles.controlList} aria-labelledby="control-list-title">
          <h2 id="control-list-title">What you control</h2>
          {agent.controls.map((control, index) => (
            <div key={control}><b>{String(index + 1).padStart(2, "0")}</b><strong>{control}</strong><em>Owner controlled</em></div>
          ))}
          <div><b>—</b><strong>{agent.cannotDo}</strong><em>Blocked</em></div>
        </section>
      </section>

      <aside className={styles.actionPanel} aria-labelledby="start-agent-title">
        <span className={styles.kicker}>START WITH CONTROL</span>
        <h2 id="start-agent-title" className={styles.detailTitle}>Set the task.<br />Set the limit.</h2>
        <p>Review the complete permission summary before any wallet approval.</p>

        <div className={styles.startSteps}>
          <div><b>1</b><span>Choose the allowed task</span></div>
          <div><b>2</b><span>Set the daily limit</span></div>
          <div><b>3</b><span>Choose when access ends</span></div>
        </div>

        <Link href={`/market/${agent.slug}/setup`} className={`${styles.primaryButton} ${styles.fullWidth}`}>
          Set my limits →
        </Link>
        <small className={styles.finePrint}>This prototype previews permissions only. It does not submit a transaction.</small>
      </aside>
    </>
  );
}
