"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, createWalletClient, custom, formatUnits, getAddress, http, parseEventLogs, type Hash } from "viem";
import type { BnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { BNB_TESTNET_EXPLORER } from "@/lib/bnb-marketplace";
import {
  BNB_MARKETPLACE_CHAIN,
  BNB_MARKETPLACE_CONTRACTS,
  bnbMarketplaceCommerceAbi,
  bnbMarketplaceRouterAbi,
  bnbMarketplaceTokenAbi,
} from "@/lib/bnb-marketplace-chain";
import { useBnbMarketplaceAgents } from "@/hooks/useBnbMarketplaceAgents";
import { getMarketplaceActivationAction } from "@/lib/bnb-marketplace-activation-flow";
import { boundedSellerResponse, readMarketJobs, saveMarketJob, withMarketJobLock, type MarketJob } from "@/lib/bnb-marketplace-journal";
import { useMarketJobs } from "@/hooks/useMarketJobs";
import styles from "./Marketplace.module.css";

type StepState = "waiting" | "active" | "done" | "error";
type ActivationStep = { label: string; state: StepState; hash?: Hash };
type Quote = { quoteHash: `0x${string}`; feeAmount: string; wallet: `0x${string}` };

const INITIAL_STEPS: ActivationStep[] = [
  { label: "Create job", state: "waiting" },
  { label: "Register policy", state: "waiting" },
  { label: "Set budget", state: "waiting" },
  { label: "Approve exact fee", state: "waiting" },
  { label: "Fund job", state: "waiting" },
  { label: "Request delivery", state: "waiting" },
];

async function responseJson(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status})`);
  return body;
}

export function PermissionSetup({ agent }: { agent: BnbMarketplaceAgent }) {
  const { agents } = useBnbMarketplaceAgents();
  const liveAgent = agents.find((item) => item.slug === agent.slug) ?? agent;
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = authenticated ? wallets[0]?.address : undefined;
  const activeWallet = useRef(walletAddress);
  activeWallet.current = walletAddress;
  const mounted = useRef(true);
  const record = useRef<MarketJob | null>(null);
  const { jobs, loaded, error: historyError } = useMarketJobs(walletAddress);
  const interrupted = jobs.find((job) => job.slug === agent.slug && job.delivery !== "response-received");
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const activationReady = liveAgent.registryStatus === "live" && liveAgent.endpointStatus === "live";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setQuote(null);
    setJobId(null);
    setResult(null);
    setSteps(INITIAL_STEPS);
    setError(null);
  }, [walletAddress]);

  function persist(update: Partial<MarketJob>) {
    if (!record.current) return;
    record.current = { ...record.current, ...update, updatedAt: Date.now() };
    saveMarketJob(window.localStorage, record.current);
  }

  function assertSameWallet() {
    if (!mounted.current || !record.current || activeWallet.current?.toLowerCase() !== record.current.wallet.toLowerCase()) {
      throw new Error("Wallet changed. Transaction progress was saved for the original wallet. Open Activity before continuing.");
    }
  }

  function updateStep(index: number, update: Partial<ActivationStep>) {
    if (record.current && index < 5 && update.hash) {
      const transactions = [...record.current.transactions];
      transactions[index] = { hash: update.hash, state: update.state === "done" ? "confirmed" : "submitted" };
      persist({ transactions });
    }
    if (mounted.current && activeWallet.current?.toLowerCase() === record.current?.wallet.toLowerCase()) {
      setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...update } : step));
    }
  }

  async function waitForSuccess(publicClient: ReturnType<typeof createPublicClient>, hash: Hash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error("Transaction was replaced. Inspect your wallet and saved Activity before continuing.");
    if (receipt.status !== "success") throw new Error(`Transaction ${hash.slice(0, 10)}… mined with failure status.`);
    return receipt;
  }

  async function requestDelivery(fundedJobId: string, fundedQuote: Quote) {
    assertSameWallet();
    persist({ delivery: "requested" });
    updateStep(5, { state: "active" });
    const deliveryBody = await responseJson(await fetch("/api/bnb-marketplace/activate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "notify_funded", slug: liveAgent.slug, jobId: fundedJobId, quoteHash: fundedQuote.quoteHash }),
    }));
    persist({ delivery: "response-received", response: boundedSellerResponse(deliveryBody.result), error: undefined });
    if (mounted.current && activeWallet.current?.toLowerCase() === record.current?.wallet.toLowerCase()) setResult(deliveryBody.result as Record<string, unknown>);
    updateStep(5, { state: "done" });
  }

  async function activate() {
    if (!authenticated) {
      login();
      return;
    }
    if (!activationReady) {
      setError("Registry or seller endpoint is unavailable. Activation remains disabled.");
      return;
    }
    if (!walletAddress || !loaded || historyError || interrupted || running) {
      setError("Review your saved activity before starting another payment for this agent.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      await withMarketJobLock(walletAddress, async () => {
        if (!mounted.current || activeWallet.current?.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Wallet changed. Reconnect and request a new quote.");
        const previous = readMarketJobs(window.localStorage, walletAddress).find((job) => job.slug === agent.slug && job.delivery !== "response-received");
        if (previous) throw new Error("An interrupted job already exists. Open Activity; do not repeat its payment.");
        record.current = null;
        const action = getMarketplaceActivationAction(Boolean(quote), jobId);
        if (action === "quote") {
          const quoteBody = await responseJson(await fetch("/api/bnb-marketplace/activate", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "quote", slug: liveAgent.slug }),
          }));
          if (!mounted.current || activeWallet.current?.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Wallet changed. Request a new quote.");
          setQuote(quoteBody.quote as Quote);
          return;
        }

        if (!quote) throw new Error("Signed quote is no longer available.");
        const nextQuote = quote;
        if (action === "notify") {
          throw new Error("Open Activity to verify funding and recover delivery without another payment.");
        }

        setSteps(INITIAL_STEPS);

        const wallet = wallets[0];
        if (!wallet) throw new Error("Connect a BSC Testnet wallet first.");
        await wallet.switchChain(97);
        const provider = await wallet.getEthereumProvider();
        const account = getAddress(wallet.address);
        if (account.toLowerCase() !== walletAddress.toLowerCase() || activeWallet.current?.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("Wallet changed. Request a new quote.");
        const walletClient = createWalletClient({ account, chain: BNB_MARKETPLACE_CHAIN, transport: custom(provider) });
        const publicClient = createPublicClient({ chain: BNB_MARKETPLACE_CHAIN, transport: http() });

        const feeAmount = BigInt(nextQuote.feeAmount);
        const description = JSON.stringify({
          version: 1, task: liveAgent.task, agentId: liveAgent.agentId, quoteHash: nextQuote.quoteHash,
          typedSelector: liveAgent.selector, policy: BNB_MARKETPLACE_CONTRACTS.policy, chainId: 97,
        });
        const expiredAt = BigInt(Math.floor(Date.now() / 1_000) + 3_600);

        record.current = {
          id: crypto.randomUUID(), wallet: account, chainId: 97, slug: agent.slug,
          quote: { quoteHash: nextQuote.quoteHash, feeAmount: nextQuote.feeAmount, wallet: nextQuote.wallet },
          jobId: null, transactions: [null, null, null, null, null], delivery: "not-requested",
          createdAt: Date.now(), updatedAt: Date.now(),
        };
        persist({});

        updateStep(0, { state: "active" });
        assertSameWallet();
        const createHash = await walletClient.writeContract({
          address: BNB_MARKETPLACE_CONTRACTS.commerce,
          abi: bnbMarketplaceCommerceAbi,
          functionName: "createJob",
          args: [liveAgent.agentWallet, BNB_MARKETPLACE_CONTRACTS.router, expiredAt, description, BNB_MARKETPLACE_CONTRACTS.router],
        });
        updateStep(0, { state: "active", hash: createHash });
        const createReceipt = await waitForSuccess(publicClient, createHash);
        const created = parseEventLogs({ abi: bnbMarketplaceCommerceAbi, eventName: "JobCreated", logs: createReceipt.logs.filter((log) => log.address.toLowerCase() === BNB_MARKETPLACE_CONTRACTS.commerce.toLowerCase()) });
        const nextJobId = created[0]?.args.jobId;
        if (nextJobId === undefined) throw new Error("Confirmed createJob receipt did not contain JobCreated.");
        if (created[0].args.client.toLowerCase() !== account.toLowerCase() || created[0].args.provider.toLowerCase() !== liveAgent.agentWallet.toLowerCase()) throw new Error("Created job did not match the expected wallet and agent.");
        persist({ jobId: nextJobId.toString() });
        updateStep(0, { state: "done", hash: createHash });

        updateStep(1, { state: "active" });
        assertSameWallet();
        const registerHash = await walletClient.writeContract({
          address: BNB_MARKETPLACE_CONTRACTS.router, abi: bnbMarketplaceRouterAbi,
          functionName: "registerJob", args: [nextJobId, BNB_MARKETPLACE_CONTRACTS.policy],
        });
        updateStep(1, { state: "active", hash: registerHash });
        await waitForSuccess(publicClient, registerHash);
        updateStep(1, { state: "done", hash: registerHash });

        updateStep(2, { state: "active" });
        assertSameWallet();
        const budgetHash = await walletClient.writeContract({
          address: BNB_MARKETPLACE_CONTRACTS.commerce, abi: bnbMarketplaceCommerceAbi,
          functionName: "setBudget", args: [nextJobId, feeAmount, "0x"],
        });
        updateStep(2, { state: "active", hash: budgetHash });
        await waitForSuccess(publicClient, budgetHash);
        updateStep(2, { state: "done", hash: budgetHash });

        updateStep(3, { state: "active" });
        assertSameWallet();
        const approveHash = await walletClient.writeContract({
          address: BNB_MARKETPLACE_CONTRACTS.paymentToken, abi: bnbMarketplaceTokenAbi,
          functionName: "approve", args: [BNB_MARKETPLACE_CONTRACTS.commerce, feeAmount],
        });
        updateStep(3, { state: "active", hash: approveHash });
        await waitForSuccess(publicClient, approveHash);
        updateStep(3, { state: "done", hash: approveHash });

        updateStep(4, { state: "active" });
        assertSameWallet();
        const fundHash = await walletClient.writeContract({
          address: BNB_MARKETPLACE_CONTRACTS.commerce, abi: bnbMarketplaceCommerceAbi,
          functionName: "fund", args: [nextJobId, feeAmount, "0x"],
        });
        updateStep(4, { state: "active", hash: fundHash });
        await waitForSuccess(publicClient, fundHash);
        updateStep(4, { state: "done", hash: fundHash });
        const fundedJobId = nextJobId.toString();
        setJobId(fundedJobId);
        await requestDelivery(fundedJobId, nextQuote);
      });
    } catch (cause) {
      setSteps((current) => current.map((step) => step.state === "active" ? { ...step, state: "error" } : step));
      setError(cause instanceof Error ? cause.message : "Testnet activation failed");
      if (record.current) {
        try {
          persist({
            transactions: record.current.transactions.map((transaction) => transaction?.state === "submitted" ? { ...transaction, state: "uncertain" } : transaction),
            delivery: record.current.delivery === "requested" ? "uncertain" : record.current.delivery,
            error: (cause instanceof Error ? cause.message : "Activation interrupted").slice(0, 1000),
          });
        } catch { setError("Job history could not be saved. Stop here and check your wallet's transactions before trying again."); }
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <section className={styles.setupPanel} aria-labelledby="permission-title">
        <Link href={`/market/${liveAgent.slug}`} className={styles.backLink}>← Back to {liveAgent.name}</Link>
        <div className={styles.meta}>
          <span>ACTIVATION / BSC TESTNET</span>
          <span>CHAIN ID 97</span>
        </div>
        <h1 id="permission-title" className={styles.setupTitle}>Hire one testnet job.</h1>
        <p className={styles.panelLead}>The seller provides a signed quote. Your wallet then approves five exact testnet calls before delivery begins.</p>

        <section className={styles.boundary} aria-label="Fixed testnet job">
          <div className={styles.boundaryHeader}><span>FIXED JOB</span><strong>EXPIRES IN 1 HOUR</strong></div>
          <div className={styles.boundaryGrid}>
            <div><small>Task</small><strong>{liveAgent.task}</strong></div>
            <div><small>Listed fee</small><strong>{liveAgent.feeLabel}</strong></div>
            <div><small>Identity</small><strong>#{liveAgent.agentId}</strong></div>
          </div>
          <p className={styles.boundaryNote}><strong>Cannot:</strong> {liveAgent.cannotDo}</p>
        </section>

        <section className={styles.controlList} aria-labelledby="activation-progress-title">
          <h2 id="activation-progress-title">Activation progress</h2>
          {steps.map((step, index) => (
            <div key={step.label}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <strong>{step.label}</strong>
              {step.hash ? (
                <a href={`${BNB_TESTNET_EXPLORER}/tx/${step.hash}`} target="_blank" rel="noreferrer">{step.state} ↗</a>
              ) : <em>{step.state}</em>}
            </div>
          ))}
        </section>
      </section>

      <aside className={styles.summaryPanel} aria-labelledby="permission-summary-title">
        <div className={styles.summaryAgent}>
          <i className={styles.agentInitials}>{liveAgent.initials}</i>
          <div><span>TESTNET AGENT</span><strong id="permission-summary-title">{liveAgent.name}</strong><small>{liveAgent.protocol}</small></div>
        </div>

        <section className={styles.summaryRows}>
          <div><small>Registry</small><strong>{liveAgent.registryStatus === "live" ? `ERC-8004 #${liveAgent.agentId}` : "Unavailable"}</strong></div>
          <div><small>Seller endpoint</small><strong>{liveAgent.endpointStatus === "live" ? "Responding" : "Unavailable"}</strong></div>
          <div><small>Network</small><strong>BNB Smart Chain Testnet</strong></div>
          <div><small>Live quote</small><strong>{quote ? `${formatUnits(BigInt(quote.feeAmount), 18)} $U` : "Not requested"}</strong></div>
        </section>

        <div className={result ? styles.reviewedNote : styles.reviewNote} aria-live="polite">
          <strong>{result ? "Agent response received" : "Testnet only"}</strong>
          <span>{result ? `Job ${jobId ?? ""} was funded and a seller response was received. Completed execution is not verified.` : "No mainnet transaction is available in this flow. You approve every testnet call."}</span>
        </div>

        {error && <div className={styles.errorNote} role="alert">{error}</div>}
        {historyError && <div className={styles.errorNote} role="alert">{historyError}</div>}
        {interrupted && !running && <div className={styles.reviewNote}><strong>Saved job needs review</strong><span>Open Activity to check its transactions or recover delivery. Starting another payment here is disabled.</span></div>}
        {result && <pre className={styles.receiptData}>{JSON.stringify(result, null, 2)}</pre>}

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.fullWidth}`}
          onClick={activate}
          disabled={!ready || running || !activationReady || Boolean(result) || Boolean(interrupted) || Boolean(historyError) || (authenticated && (!walletAddress || !loaded))}
        >
          {!authenticated ? "Connect wallet →" : running ? "Waiting…" : result ? "Seller response saved" : interrupted ? "Review saved job in Activity" : quote ? "Fund testnet job →" : "Request signed quote →"}
        </button>
        <Link href="/activity" className={`${styles.secondaryButton} ${styles.fullWidth}`}>View saved activity →</Link>
        <Link href={`/market/${liveAgent.slug}`} className={`${styles.secondaryButton} ${styles.fullWidth}`}>Back to agent</Link>
        <small className={styles.finePrint}>Requires testnet BNB and test $U. Job history is saved on this browser for this wallet; other devices are not synced. No private key is sent to AgentShack or the seller.</small>
      </aside>
    </>
  );
}
