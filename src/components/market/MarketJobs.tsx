"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, http } from "viem";
import { BNB_TESTNET_EXPLORER, getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { BNB_MARKETPLACE_CHAIN } from "@/lib/bnb-marketplace-chain";
import { boundedSellerResponse, JOB_STEPS, jobStatus, readMarketJobs, saveMarketJob, withMarketJobLock, type MarketJob } from "@/lib/bnb-marketplace-journal";
import { verifyFundedMarketJob } from "@/lib/bnb-marketplace-recovery";
import { useMarketJobs } from "@/hooks/useMarketJobs";
import styles from "./Marketplace.module.css";

export function MarketJobs({ activity = false }: { activity?: boolean }) {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const wallet = authenticated ? wallets[0]?.address : undefined;
  const activeWallet = useRef(wallet);
  activeWallet.current = wallet;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const { jobs, loaded, error: storageError } = useMarketJobs(wallet);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recover(saved: MarketJob) {
    if (!wallet || busy) return;
    setBusy(saved.id);
    setError(null);
    try {
      await withMarketJobLock(wallet, async () => {
        const record = readMarketJobs(window.localStorage, wallet).find((item) => item.id === saved.id);
        if (!record) throw new Error("The saved job could not be found. No new payment was made.");
        if (record.delivery === "response-received") return;
        const reader = createPublicClient({ chain: BNB_MARKETPLACE_CHAIN, transport: http(undefined, { timeout: 12_000, retryCount: 0 }) });
        const verified = await verifyFundedMarketJob(reader, record, wallet);
        if (!mounted.current || activeWallet.current?.toLowerCase() !== wallet.toLowerCase()) throw new Error("Wallet changed. Select the original wallet and try again.");
        const updated: MarketJob = { ...record, jobId: verified.jobId, delivery: "requested", updatedAt: Date.now(), error: undefined };
        saveMarketJob(window.localStorage, updated);
        try {
          const response = await fetch("/api/bnb-marketplace/activate", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "notify_funded", slug: record.slug, ...verified }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Seller did not confirm the request.");
          saveMarketJob(window.localStorage, { ...updated, delivery: "response-received", response: boundedSellerResponse(body.result), updatedAt: Date.now() });
        } catch (cause) {
          saveMarketJob(window.localStorage, { ...updated, delivery: "uncertain", error: "Delivery response could not be saved or confirmed. Inspect the seller/job before retrying.", updatedAt: Date.now() });
          throw cause;
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery failed. No new payment was made.");
    } finally { setBusy(null); }
  }

  return (
    <section className={styles.jobsContent} aria-labelledby="jobs-title">
      <p className={styles.kicker}>YOUR WALLET / BSC TESTNET</p>
      <h1 id="jobs-title">{activity ? "Activity" : "My agents"}</h1>
      <p>{activity ? "Review transaction links and seller responses from your testnet jobs." : "Find the agents you hired and pick up an interrupted delivery."}</p>
      <p className={styles.journalNote}>Saved on this browser only, for the selected wallet. Other devices and older jobs are not imported. Saved statuses are observations, not live execution or investment results.</p>
      {!ready ? <p role="status">Loading wallet…</p> : !authenticated ? (
        <div className={styles.jobCard}><h2>Connect to see your jobs.</h2><p>We never ask for a private key.</p><button className={styles.primaryButton} onClick={login}>Connect wallet →</button></div>
      ) : !wallet ? <p role="status">Select a connected wallet to view its history.</p> : !loaded ? <p role="status">Loading saved jobs…</p> : (
        <>
          <p className={styles.journalNote}>Wallet: {wallet}</p>
          {storageError ? <p className={styles.errorNote} role="alert">{storageError}</p> : !jobs.length ? (
            <div className={styles.jobCard}><h2>No jobs saved here yet.</h2><p>Choose an agent and fund a testnet job. Its transactions will appear here. If you already paid on another device, check that device or the explorer before paying again.</p><Link className={styles.primaryButton} href="/market">Explore agents →</Link></div>
          ) : jobs.map((job) => {
            const agent = getBnbMarketplaceAgent(job.slug)!;
            return (
              <article key={job.id} className={styles.jobCard}>
                <h2>{agent.name}</h2>
                <span className={styles.jobStatus}>{jobStatus(job)}</span>
                <p>{agent.task} · {job.jobId ? `Job #${job.jobId}` : "Job ID not confirmed"}</p>
                <time dateTime={new Date(job.createdAt).toISOString()}>{new Date(job.createdAt).toLocaleString()}</time>
                {(activity || !job.response) && <ol className={styles.jobEvents}>{JOB_STEPS.map((label, index) => (
                  <li key={label}><span>{label}</span>{job.transactions[index] ? <a href={`${BNB_TESTNET_EXPLORER}/tx/${job.transactions[index]!.hash}`} target="_blank" rel="noreferrer">Saved: {job.transactions[index]!.state} ↗</a> : <span>No hash saved</span>}</li>
                ))}</ol>}
                {job.error && <p>{job.error}</p>}
                {job.response && <details><summary>Seller response — not proof of completed execution</summary><pre>{job.response}</pre></details>}
                {!job.transactions[4] && <p className={styles.journalNote}>This setup was interrupted. Review its transactions before starting again; automatic payment replay is disabled.</p>}
                {job.transactions[4] && job.delivery !== "response-received" && <p className={styles.journalNote}>Recovery checks the original create/fund transactions on chain 97. It sends no payment. A retry can repeat the delivery request if the previous response was lost.</p>}
                <div className={styles.jobActions}>
                  {job.transactions[4] && job.delivery !== "response-received" && <button className={styles.primaryButton} disabled={Boolean(busy)} onClick={() => recover(job)}>{busy === job.id ? "Checking chain…" : "Check funding & retry delivery"}</button>}
                  <Link className={styles.secondaryButton} href={`/market/${job.slug}`}>View agent →</Link>
                  {!activity && <Link className={styles.secondaryButton} href="/activity">View activity →</Link>}
                </div>
              </article>
            );
          })}
        </>
      )}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </section>
  );
}
