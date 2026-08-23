"use client";

import { useState } from "react";
import Link from "next/link";
import type { BnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import styles from "./Marketplace.module.css";

const DURATIONS = [7, 14, 30];

export function PermissionSetup({ agent }: { agent: BnbMarketplaceAgent }) {
  const [selectedControl, setSelectedControl] = useState(agent.controls[0]);
  const [dailyLimit, setDailyLimit] = useState(agent.dailyLimitUsd);
  const [duration, setDuration] = useState(agent.defaultDurationDays);
  const [reviewed, setReviewed] = useState(false);

  return (
    <>
      <section className={styles.setupPanel} aria-labelledby="permission-title">
        <Link href={`/market/${agent.slug}`} className={styles.backLink}>← Back to {agent.name}</Link>
        <div className={styles.meta}>
          <span>PERMISSION SETUP / DEMO</span>
          <span>STEP 1 OF 1</span>
        </div>
        <h1 id="permission-title" className={styles.setupTitle}>Set the boundaries.</h1>
        <p className={styles.panelLead}>Choose exactly what this agent may do, how much it may use, and when access ends.</p>

        <fieldset className={styles.field}>
          <legend className={styles.fieldHeading}><span>01</span><h2>Allowed task</h2></legend>
          {agent.controls.slice(0, 2).map((control) => {
            const selected = control === selectedControl;
            return (
              <button
                key={control}
                type="button"
                className={`${styles.choice} ${selected ? styles.choiceSelected : ""}`}
                onClick={() => { setSelectedControl(control); setReviewed(false); }}
                aria-pressed={selected}
              >
                <span className={styles.choiceMark}>{selected ? "✓" : ""}</span>
                <span><strong>{control}</strong><small>{agent.protocol}</small></span>
                <em>{selected ? "SELECTED" : "CHOOSE"}</em>
              </button>
            );
          })}
        </fieldset>

        <div className={styles.fieldPair}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>02 / DAILY LIMIT</span>
            <p>The most this permission may use in one day.</p>
            <input
              className={styles.inputControl}
              type="number"
              inputMode="decimal"
              min="1"
              max="1000000"
              value={dailyLimit}
              onChange={(event) => { setDailyLimit(Number(event.target.value)); setReviewed(false); }}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>03 / ACCESS ENDS</span>
            <p>Access stops automatically after this period.</p>
            <select
              className={styles.inputControl}
              value={duration}
              onChange={(event) => { setDuration(Number(event.target.value)); setReviewed(false); }}
            >
              {DURATIONS.map((days) => <option key={days} value={days}>{days} days</option>)}
            </select>
          </label>
        </div>
      </section>

      <aside className={styles.summaryPanel} aria-labelledby="permission-summary-title">
        <div className={styles.summaryAgent}>
          <i className={styles.agentInitials}>{agent.initials}</i>
          <div><span>PERMISSION FOR</span><strong id="permission-summary-title">{agent.name}</strong><small>{agent.protocol}</small></div>
        </div>

        <section className={styles.summaryRows}>
          <div><small>Can do</small><strong>{selectedControl}</strong></div>
          <div><small>Daily limit</small><strong>${Number.isFinite(dailyLimit) ? dailyLimit.toLocaleString() : "0"}</strong></div>
          <div><small>Ends after</small><strong>{duration} days</strong></div>
          <div><small>Cannot do</small><strong>{agent.cannotDo}</strong></div>
        </section>

        <div className={reviewed ? styles.reviewedNote : styles.reviewNote} aria-live="polite">
          <strong>{reviewed ? "Preview ready" : "You remain in control"}</strong>
          <span>{reviewed ? "No transaction was submitted. Live wallet approval still needs implementation." : "A production version must let you review, approve, and revoke this permission."}</span>
        </div>

        <button type="button" className={`${styles.primaryButton} ${styles.fullWidth}`} onClick={() => setReviewed(true)}>
          Preview permission →
        </button>
        <Link href={`/market/${agent.slug}`} className={`${styles.secondaryButton} ${styles.fullWidth}`}>Back to agent</Link>
        <small className={styles.finePrint}>Demo fixture. No wallet signature, session key, or onchain transaction occurs.</small>
      </aside>
    </>
  );
}
