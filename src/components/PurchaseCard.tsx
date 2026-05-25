"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { LogIn } from "lucide-react";
import CheckoutCard from "@/components/CheckoutCard";
import { CapabilityDiffPreview } from "@/components/workflow/CapabilityDiffPreview";
import { useEscrowFund, type EscrowStep } from "@/hooks/useEscrowFund";
import { createSkillCapabilityManifest } from "@/lib/workflow-capabilities";
import { formatUnits } from "viem";

interface Skill {
  id: string;
  name: string;
  skillType: string;
  price: number;
  pricePerCall: number | null;
  gatewaySlug: string | null;
  fileContent: string | null;
}

interface Props {
  skill: Skill;
}

type Step = "idle" | "loading" | "done" | "error";

interface PassiveResult {
  content: string;
  fileType: string;
}

// ─── Style tokens ────────────────────────────────────────────────────────────
const ink = "text-[var(--text)]";
const muted = "text-[var(--text-secondary)]";
const faint = "text-[var(--text-muted)]";
const fainter = "text-[var(--text-muted)] opacity-70";
const ruleLight = "border-[var(--border-light)]";
const btnBg = "bg-[var(--text)] text-[var(--bg)] hover:opacity-80";
const inputBorder = "border-[var(--border)] bg-[var(--bg-secondary)]";
const codeBg = "bg-[var(--bg-secondary)] border-[var(--border)]";
const successBg = "text-[var(--text)] bg-[var(--bg-secondary)] border-[var(--border)]";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getOrCreateAgent(
  privyId: string,
  token: string,
  displayName: string | undefined,
  walletAddress: string | undefined
): Promise<string> {
  const key = `dojo_agent_${privyId}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached;

  const res = await fetch("/api/agents/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      privyId,
      displayName,
      walletAddress,
      agent: {
        name: `${displayName || "My"} Agent`,
        description: "Default agent created by Dojo",
      },
    }),
  });
  if (!res.ok) throw new Error("Failed to create agent");
  const data = await res.json();
  localStorage.setItem(key, data.id);
  return data.id;
}

async function syncUser(
  privyId: string,
  token: string,
  opts: { email?: string; walletAddress?: string; displayName?: string }
) {
  await fetch("/api/users/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ privyId, ...opts }),
  });
}

function escrowStepLabel(s: EscrowStep): string {
  switch (s) {
    case 'preparing': return 'Preparing...';
    case 'approving': return 'Approve USDC...';
    case 'creating_job': return 'Create Job...';
    case 'setting_budget': return 'Set Budget...';
    case 'funding': return 'Fund Escrow...';
    case 'confirming': return 'Confirming...';
    default: return 'Fund Safe Run';
  }
}

// ─── Active Skill Panel (wagmi hooks live here) ──────────────────────────────

function ActivePurchasePanel({ skill }: Props) {
  const { user, getAccessToken } = usePrivy();
  const escrow = useEscrowFund();
  const manifest = createSkillCapabilityManifest(skill);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [budget, setBudget] = useState<string>(
    skill.pricePerCall ? String(Math.max(1, Math.round(skill.pricePerCall * 20))) : "5"
  );
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  async function handleCloseSessionById(sessionId: string) {
    setClosing(true);
    try {
      const token = await getAccessToken();
      if (!token || !user) throw new Error("Not authenticated");
      await fetch(`/api/sessions/${sessionId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ privyId: user.id }),
      });
      escrow.reset();
      setStep("idle");
    } catch {
      // silent — session will expire naturally
    } finally {
      setClosing(false);
    }
  }

  async function handleFundSession() {
    setStep("loading");
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token || !user) throw new Error("Not authenticated");

      await syncUser(user.id, token, {
        email: user.email?.address ?? undefined,
        walletAddress: user.wallet?.address ?? undefined,
        displayName: user.google?.name ?? undefined,
      });

      const agentId = await getOrCreateAgent(
        user.id, token, user.google?.name ?? undefined, user.wallet?.address ?? undefined
      );

      await escrow.fund({
        agentId,
        skillId: skill.id,
        budgetTotal: parseFloat(budget),
        gatewaySlug: skill.gatewaySlug || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }

  async function handleFaucet() {
    setFaucetLoading(true);
    setFaucetMsg(null);
    try {
      const token = await getAccessToken();
      if (!token || !user) throw new Error("Not authenticated");
      const res = await fetch("/api/faucet/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ privyId: user.id, walletAddress: escrow.walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      setFaucetMsg(`${data.amount} USDC sent`);
      escrow.reset();
    } catch (err) {
      setFaucetMsg(err instanceof Error ? err.message : "Faucet error");
    } finally {
      setFaucetLoading(false);
    }
  }

  // ── Done: active (escrow funded) ────────────────────────────────────────
  if (escrow.step === "done" && escrow.result) {
    const ar = escrow.result;
    return (
      <div className="classified" data-label="Safe Run Active">
        <div className={`text-xs font-mono ${successBg} border-l-2 px-2 py-1 mb-4`}>
          ✓ Session open · ${ar.budgetTotal} USD locked (agent-funded)
        </div>

        <div className="space-y-0 mb-4">
          {[
            { label: "Session ID", value: ar.sessionId.slice(0, 16) + "…" },
            {
              label: "Expires",
              value: new Date(ar.expiresAt).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
              }),
            },
            { label: "Budget", value: `$${ar.budgetTotal} USD` },
            { label: "On-chain Job", value: `#${ar.onchainJobId}` },
          ].map(({ label, value }) => (
            <div key={label} className={`flex justify-between items-center py-1.5 border-b border-dotted ${ruleLight} last:border-b-0`}>
              <span className={`font-mono text-[10px] ${faint} uppercase tracking-wider`}>{label}</span>
              <span className={`font-mono text-[10px] ${ink} font-bold`}>{value}</span>
            </div>
          ))}
        </div>

        <CheckoutCard />

        <div className={`font-mono text-[10px] ${faint} ${codeBg} p-2 border mb-3 break-all`}>
          POST {ar.gatewayUrl}
        </div>

        <p className={`font-mono text-[10px] ${fainter} border-l-2 ${ruleLight} pl-2 mb-4`}>
          Pass <code>X-Session-Id: {ar.sessionId.slice(0, 8)}…</code> in your agent headers.
        </p>

        <button
          onClick={() => handleCloseSessionById(ar.sessionId)}
          disabled={closing}
          className={`w-full font-mono text-[10px] ${faint} hover:opacity-80 transition-colors py-1 border border-dotted ${ruleLight} disabled:opacity-40`}
        >
          {closing ? "Closing…" : "Close Session & Refund"}
        </button>
      </div>
    );
  }

  // ── Active: fund session form ─────────────────────────────────────────────
  const estimatedCalls = skill.pricePerCall && parseFloat(budget) > 0
    ? Math.floor(parseFloat(budget) / skill.pricePerCall)
    : 0;

  const isEscrowBusy = escrow.step !== 'idle' && escrow.step !== 'done' && escrow.step !== 'error';
  const formattedBalance = escrow.usdcBalance != null
    ? parseFloat(formatUnits(escrow.usdcBalance as bigint, 18)).toFixed(2)
    : null;

  return (
    <div className="classified" data-label="Run Once Safely">
      <div className="mb-1">
        <span className={`font-mono font-bold text-3xl ${ink}`}>
          {skill.pricePerCall ? `$${skill.pricePerCall.toFixed(2)}` : "FREE"}
        </span>
        <span className={`font-mono text-xs ${faint} ml-1`}>/ call</span>
      </div>
      <p className={`font-mono text-[10px] ${muted} mb-4 pb-3 border-b border-dotted ${ruleLight}`}>
        Bounded session · BSC testnet escrow · no local install
      </p>

      <div className="mb-4">
        <CapabilityDiffPreview
          manifest={manifest}
          compact
          title="Safe-run boundary"
          description="This opens a bounded paid session. It does not install a local skill, command, schedule, or config change."
        />
      </div>

      {escrow.walletAddress && (
        <div className={`flex justify-between items-center mb-3 pb-2 border-b border-dotted ${ruleLight}`}>
          <span className={`font-mono text-[10px] ${faint} uppercase tracking-wider`}>USDC Balance</span>
          <span className={`font-mono text-[10px] ${ink} font-bold`}>
            {formattedBalance != null ? `$${formattedBalance}` : "—"}
          </span>
        </div>
      )}

      <div className="mb-4">
        <label className={`font-mono text-[10px] uppercase tracking-wider ${faint} block mb-1.5`}>
          Budget (USD)
        </label>
        <div className={`flex items-center border ${inputBorder}`}>
          <span className={`font-mono text-sm ${faint} px-3`}>$</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            disabled={isEscrowBusy}
            className={`flex-1 bg-transparent font-mono text-sm ${ink} py-2 pr-3 outline-none disabled:opacity-40`}
          />
        </div>
        {estimatedCalls > 0 && (
          <p className={`font-mono text-[10px] ${fainter} mt-1`}>
            ≈ {estimatedCalls} calls
          </p>
        )}
      </div>

      {isEscrowBusy && (
        <div className={`mb-3 ${codeBg} border p-2`}>
          <div className={`font-mono text-[10px] ${ink} mb-1`}>
            {escrowStepLabel(escrow.step)}
          </div>
          <div className="w-full h-1 bg-white/10 overflow-hidden">
            <div
              className="h-full bg-current transition-all duration-300"
              style={{ width: `${(escrow.txCount / escrow.totalTxs) * 100}%` }}
            />
          </div>
          <div className={`font-mono text-[9px] ${fainter} mt-1`}>
            {escrow.txCount}/{escrow.totalTxs} txs confirmed
          </div>
        </div>
      )}

      {(step === "error" || escrow.step === "error") && (error || escrow.error) && (
        <p className="font-mono text-[10px] text-red-500 mb-3">{escrow.error || error}</p>
      )}

      <button
        onClick={handleFundSession}
        disabled={isEscrowBusy || step === "loading" || !budget || parseFloat(budget) <= 0}
        className={`w-full ${btnBg} font-mono text-xs uppercase tracking-wider py-3 transition-colors disabled:opacity-40 mb-2`}
      >
        {isEscrowBusy ? escrowStepLabel(escrow.step) : "Fund Safe Run"}
      </button>

      {escrow.walletAddress && (
        <button
          onClick={handleFaucet}
          disabled={faucetLoading}
          className={`w-full font-mono text-[10px] ${faint} hover:opacity-80 transition-colors py-1.5 border border-dotted ${ruleLight} disabled:opacity-40 mb-1`}
        >
          {faucetLoading ? "Sending..." : "Get Test USDC (Testnet)"}
        </button>
      )}
      {faucetMsg && (
        <p className={`font-mono text-[10px] ${faucetMsg.includes("sent") ? "text-[var(--text)]" : "text-red-500"} mb-1`}>
          {faucetMsg}
        </p>
      )}

      <div className={`text-[10px] font-mono ${fainter} border-l-2 ${ruleLight} pl-2 mt-2`}>
        One-time USDC approval when needed · session expires in 24h · no silent skill install
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PurchaseCard({ skill }: Props) {
  const { ready, authenticated, login, user, getAccessToken } = usePrivy();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [passiveResult, setPassiveResult] = useState<PassiveResult | null>(null);

  const isPassive = skill.skillType === "passive";
  const isFree = skill.price === 0;
  const manifest = createSkillCapabilityManifest(skill);

  async function handlePassiveBuy() {
    setStep("loading");
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token || !user) throw new Error("Not authenticated");

      await syncUser(user.id, token, {
        email: user.email?.address ?? undefined,
        walletAddress: user.wallet?.address ?? undefined,
        displayName: user.google?.name ?? undefined,
      });

      const buyRes = await fetch("/api/skills/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          privyId: user.id,
          skillId: skill.id,
          paymentMethod: "free",
        }),
      });
      const buyData = await buyRes.json();
      if (!buyRes.ok && buyRes.status !== 409) {
        throw new Error(buyData.error || "Purchase failed");
      }

      const contentRes = await fetch(`/api/skills/${skill.id}/content`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentData = await contentRes.json();
      if (!contentRes.ok) throw new Error(contentData.error || "Could not fetch content");

      setPassiveResult({ content: contentData.content, fileType: contentData.fileType });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  }

  // ── Not ready ─────────────────────────────────────────────────────────────
  if (!ready) return null;

  // ── Not authenticated ─────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="classified" data-label={isPassive ? "Preview Install" : "Run Once Safely"}>
        <p className={`font-serif text-sm ${muted} mb-4`}>
          Connect your wallet to {isPassive ? "preview and download" : "run"} this workflow safely.
        </p>
        <button
          onClick={login}
          className={`w-full flex items-center justify-center gap-2 ${btnBg} font-mono text-xs uppercase tracking-wider py-3 transition-colors`}
        >
          <LogIn size={12} />
          Connect Wallet
        </button>
      </div>
    );
  }

  // ── Passive: done ─────────────────────────────────────────────────────────
  if (step === "done" && isPassive && passiveResult) {
    return (
      <div className="classified" data-label="Install File Ready">
        <div className={`text-xs font-mono ${successBg} border-l-2 px-2 py-1 mb-4`}>
          ✓ File delivered · install is still manual
        </div>
        <button
          onClick={() => {
            const blob = new Blob([passiveResult.content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${skill.name.replace(/\s+/g, "-").toLowerCase()}.md`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className={`w-full ${btnBg} font-mono text-xs uppercase tracking-wider py-3 transition-colors mb-2`}
        >
          Download .md
        </button>
        <button
          onClick={() => { setStep("idle"); setPassiveResult(null); }}
          className={`w-full font-mono text-[10px] ${faint} hover:opacity-100 transition-colors py-1`}
        >
          View again
        </button>
      </div>
    );
  }

  // ── Passive: form ─────────────────────────────────────────────────────────
  if (isPassive) {
    return (
      <div className="classified" data-label="Preview Install">
        <div className="mb-3">
          <span className={`font-mono font-bold text-3xl ${ink}`}>
            {isFree ? "Free" : `$${skill.price.toFixed(2)}`}
          </span>
        </div>
        <p className={`font-mono text-[10px] ${muted} mb-4 pb-3 border-b border-dotted ${ruleLight}`}>
          One-time · .md file · no automatic local changes
        </p>

        <div className="mb-4">
          <CapabilityDiffPreview manifest={manifest} compact />
        </div>

        {step === "error" && error && (
          <p className="font-mono text-[10px] text-red-500 mb-3">{error}</p>
        )}

        <button
          onClick={handlePassiveBuy}
          disabled={step === "loading"}
          className={`w-full ${btnBg} font-mono text-xs uppercase tracking-wider py-3 transition-colors disabled:opacity-40`}
        >
          {step === "loading" ? "Preparing…" : "Approve & Download File"}
        </button>
      </div>
    );
  }

  // ── Active: delegate to panel with wagmi hooks ────────────────────────────
  return <ActivePurchasePanel skill={skill} />;
}
