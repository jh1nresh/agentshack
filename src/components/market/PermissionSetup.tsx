"use client";

import { useState } from "react";
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
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const activationReady = liveAgent.registryStatus === "live" && liveAgent.endpointStatus === "live";

  function updateStep(index: number, update: Partial<ActivationStep>) {
    setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...update } : step));
  }

  async function waitForSuccess(publicClient: ReturnType<typeof createPublicClient>, hash: Hash) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction ${hash.slice(0, 10)}… mined with failure status.`);
    return receipt;
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
    setRunning(true);
    setError(null);
    setResult(null);
    setSteps(INITIAL_STEPS);

    try {
      if (!quote) {
        const quoteBody = await responseJson(await fetch("/api/bnb-marketplace/activate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "quote", slug: liveAgent.slug }),
        }));
        setQuote(quoteBody.quote as Quote);
        return;
      }

      const wallet = wallets[0];
      if (!wallet) throw new Error("Connect a BSC Testnet wallet first.");
      await wallet.switchChain(97);
      const provider = await wallet.getEthereumProvider();
      const account = getAddress(wallet.address);
      const walletClient = createWalletClient({ account, chain: BNB_MARKETPLACE_CHAIN, transport: custom(provider) });
      const publicClient = createPublicClient({ chain: BNB_MARKETPLACE_CHAIN, transport: http() });

      const nextQuote = quote;
      const feeAmount = BigInt(nextQuote.feeAmount);
      const description = JSON.stringify({
        version: 1, task: liveAgent.task, agentId: liveAgent.agentId, quoteHash: nextQuote.quoteHash,
        typedSelector: liveAgent.selector, policy: BNB_MARKETPLACE_CONTRACTS.policy, chainId: 97,
      });
      const expiredAt = BigInt(Math.floor(Date.now() / 1_000) + 3_600);

      updateStep(0, { state: "active" });
      const createHash = await walletClient.writeContract({
        address: BNB_MARKETPLACE_CONTRACTS.commerce,
        abi: bnbMarketplaceCommerceAbi,
        functionName: "createJob",
        args: [liveAgent.agentWallet, BNB_MARKETPLACE_CONTRACTS.router, expiredAt, description, BNB_MARKETPLACE_CONTRACTS.router],
      });
      updateStep(0, { state: "active", hash: createHash });
      const createReceipt = await waitForSuccess(publicClient, createHash);
      const created = parseEventLogs({ abi: bnbMarketplaceCommerceAbi, eventName: "JobCreated", logs: createReceipt.logs });
      const nextJobId = created[0]?.args.jobId;
      if (nextJobId === undefined) throw new Error("Confirmed createJob receipt did not contain JobCreated.");
      setJobId(nextJobId.toString());
      updateStep(0, { state: "done", hash: createHash });

      updateStep(1, { state: "active" });
      const registerHash = await walletClient.writeContract({
        address: BNB_MARKETPLACE_CONTRACTS.router, abi: bnbMarketplaceRouterAbi,
        functionName: "registerJob", args: [nextJobId, BNB_MARKETPLACE_CONTRACTS.policy],
      });
      updateStep(1, { state: "active", hash: registerHash });
      await waitForSuccess(publicClient, registerHash);
      updateStep(1, { state: "done", hash: registerHash });

      updateStep(2, { state: "active" });
      const budgetHash = await walletClient.writeContract({
        address: BNB_MARKETPLACE_CONTRACTS.commerce, abi: bnbMarketplaceCommerceAbi,
        functionName: "setBudget", args: [nextJobId, feeAmount, "0x"],
      });
      updateStep(2, { state: "active", hash: budgetHash });
      await waitForSuccess(publicClient, budgetHash);
      updateStep(2, { state: "done", hash: budgetHash });

      updateStep(3, { state: "active" });
      const approveHash = await walletClient.writeContract({
        address: BNB_MARKETPLACE_CONTRACTS.paymentToken, abi: bnbMarketplaceTokenAbi,
        functionName: "approve", args: [BNB_MARKETPLACE_CONTRACTS.commerce, feeAmount],
      });
      updateStep(3, { state: "active", hash: approveHash });
      await waitForSuccess(publicClient, approveHash);
      updateStep(3, { state: "done", hash: approveHash });

      updateStep(4, { state: "active" });
      const fundHash = await walletClient.writeContract({
        address: BNB_MARKETPLACE_CONTRACTS.commerce, abi: bnbMarketplaceCommerceAbi,
        functionName: "fund", args: [nextJobId, feeAmount, "0x"],
      });
      updateStep(4, { state: "active", hash: fundHash });
      await waitForSuccess(publicClient, fundHash);
      updateStep(4, { state: "done", hash: fundHash });

      updateStep(5, { state: "active" });
      const deliveryBody = await responseJson(await fetch("/api/bnb-marketplace/activate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "notify_funded", slug: liveAgent.slug, jobId: nextJobId.toString(), quoteHash: nextQuote.quoteHash }),
      }));
      setResult(deliveryBody.result as Record<string, unknown>);
      updateStep(5, { state: "done" });
    } catch (cause) {
      setSteps((current) => current.map((step) => step.state === "active" ? { ...step, state: "error" } : step));
      setError(cause instanceof Error ? cause.message : "Testnet activation failed");
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
          <span>{result ? `Job ${jobId ?? ""} was funded and delivery was requested.` : "No mainnet transaction is available in this flow. You approve every testnet call."}</span>
        </div>

        {error && <div className={styles.errorNote} role="alert">{error}</div>}
        {result && <pre className={styles.receiptData}>{JSON.stringify(result, null, 2)}</pre>}

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.fullWidth}`}
          onClick={activate}
          disabled={!ready || running || !activationReady || Boolean(result)}
        >
          {!authenticated ? "Connect wallet →" : running ? "Waiting…" : result ? "Activated on testnet ✓" : quote ? "Fund testnet job →" : "Request signed quote →"}
        </button>
        <Link href={`/market/${liveAgent.slug}`} className={`${styles.secondaryButton} ${styles.fullWidth}`}>Back to agent</Link>
        <small className={styles.finePrint}>Requires testnet BNB for gas and the quoted test $U fee. No private key is sent to AgentShack or the seller.</small>
      </aside>
    </>
  );
}
