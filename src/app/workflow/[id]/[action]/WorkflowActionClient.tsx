"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, GitFork, Play, Rocket, ShieldCheck } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Navbar } from "@/components/landing/Navbar";
import { DojoSpirit } from "@/components/DojoSpirit";
import type { WorkflowSpiritProfile } from "@/lib/workflow-spirit";

type WorkflowAction = "run" | "fork" | "deploy";

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
};

type SchemaObject = {
  required?: string[];
  properties?: Record<string, SchemaProperty>;
};

export type WorkflowActionData = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  pricePerRun: number;
  royaltyBps: number;
  runs: number;
  forks: number;
  trustScore: number;
  spirit?: WorkflowSpiritProfile;
  creatorName: string;
  skill: {
    id: string;
    name: string;
    gatewaySlug: string;
    inputSchema: string | null;
    exampleInput: string | null;
  };
  version: {
    version: number;
    summary: string;
    slaMs: number | null;
  } | null;
};

type RunResult = {
  ok?: boolean;
  status?: number;
  latencyMs?: number;
  data?: unknown;
  result?: unknown;
  cost?: number;
  balance?: number;
  score?: number;
  session_id?: string;
  latency_ms?: number;
  workflow_receipt?: {
    id: string;
    workflow_id: string;
    version_id: string | null;
    settlement_status: string;
    anchor_status: string;
    onchain_request_id?: string | null;
    swap_tx_hash?: string | null;
    settle_tx_hash?: string | null;
  };
  eval?: {
    score: number;
    delivered: boolean;
    validFormat: boolean;
    withinSla: boolean;
  };
  error?: string;
  code?: string;
  demo?: boolean;
};

type ForkResult = {
  workflow?: {
    id: string;
    slug: string;
    name: string;
    status: string;
  };
  version?: {
    version: number;
  };
  fork?: {
    id: string;
    royaltyBps: number;
  } | null;
  error?: string;
};

type DeployResult = {
  workflow?: {
    id: string;
    slug: string;
    status: string;
  };
  skill?: {
    id: string;
    gatewaySlug: string | null;
    endpointUrl: string | null;
  };
  runUrl?: string;
  gateway?: string;
  error?: string;
};

function safeParseSchema(raw: string | null): SchemaObject | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SchemaObject;
  } catch {
    return null;
  }
}

function safeParseRecord(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function humanizeKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fieldSummary(schema: SchemaObject | null, example: Record<string, unknown>) {
  const fields = Object.entries(schema?.properties ?? {});
  if (fields.length > 0) {
    return fields
      .slice(0, 3)
      .map(([key, prop]) => prop.title ?? humanizeKey(key))
      .join(", ");
  }

  const exampleKeys = Object.keys(example);
  if (exampleKeys.length > 0) {
    return exampleKeys.slice(0, 3).map(humanizeKey).join(", ");
  }

  return "JSON input";
}

function examplePreview(example: Record<string, unknown>, workflow: WorkflowActionData) {
  if (Object.keys(example).length > 0) return example;
  return {
    input: fieldSummary(safeParseSchema(workflow.skill.inputSchema), example),
    result: `${workflow.name} returns a structured workflow result.`,
  };
}

function defaultsFromSchema(schema: SchemaObject | null, example: Record<string, unknown>) {
  const seed: Record<string, unknown> = { ...example };
  for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
    if (seed[key] === undefined && prop.default !== undefined) {
      seed[key] = prop.default;
    }
  }
  return seed;
}

function coerce(prop: SchemaProperty, value: string) {
  if (value === "") return "";
  if (prop.type === "number" || prop.type === "integer") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (prop.type === "boolean") return value === "true";
  return value;
}

function actionCopy(action: WorkflowAction) {
  switch (action) {
    case "run":
      return {
        icon: Play,
        label: "Run once safely",
        eyebrow: "Cleared asset",
        title: "Run this workflow without installing it.",
        body: "AgentShack executes one bounded run, evaluates delivery, writes a receipt, and anchors the cleared work on BSC testnet.",
      };
    case "fork":
      return {
        icon: GitFork,
        label: "Remix skill",
        eyebrow: "Derivative asset",
        title: "Create your own creator variant.",
        body: "Remix the workflow logic, keep provenance attached, and prepare a draft version with lineage and creator royalty metadata.",
      };
    case "deploy":
      return {
        icon: Rocket,
        label: "Deploy workflow",
        eyebrow: "Runtime",
        title: "Ship the asset behind a gateway.",
        body: "Attach an endpoint to a workflow you own, publish a version, and make future receipts feed this asset's reputation.",
      };
  }
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function FieldInput({
  name,
  prop,
  value,
  onChange,
}: {
  name: string;
  prop: SchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = prop.title ?? name;
  const current = value ?? "";
  const base =
    "dojo-input font-mono";

  return (
    <label className="block">
      <span className="label-sm mb-2 block">{label}</span>
      {Array.isArray(prop.enum) && prop.enum.length > 0 ? (
        <select
          value={String(current)}
          onChange={(event) => onChange(coerce(prop, event.target.value))}
          className={base}
        >
          {prop.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={String(current)}
          onChange={(event) => onChange(coerce(prop, event.target.value))}
          placeholder={prop.description ?? ""}
          type={prop.type === "number" || prop.type === "integer" ? "number" : "text"}
          className={base}
        />
      )}
      {prop.description && (
        <span className="mt-2 block text-[12px] leading-relaxed text-[var(--text-muted)]">
          {prop.description}
        </span>
      )}
    </label>
  );
}

function RunPanel({ workflow }: { workflow: WorkflowActionData }) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const schema = useMemo(() => safeParseSchema(workflow.skill.inputSchema), [workflow.skill.inputSchema]);
  const example = useMemo(() => safeParseRecord(workflow.skill.exampleInput), [workflow.skill.exampleInput]);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    defaultsFromSchema(schema, example),
  );
  const [pending, setPending] = useState(false);
  const [paidPending, setPaidPending] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [paidResult, setPaidResult] = useState<RunResult | null>(null);

  const fields = Object.entries(schema?.properties ?? {});
  const required = new Set(schema?.required ?? []);
  const inputSummary = fieldSummary(schema, example);
  const missingRequired = fields.some(
    ([key]) => required.has(key) && (values[key] === "" || values[key] == null),
  );

  async function runWorkflow() {
    if (pending || missingRequired) return;
    setPending(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const isDemo = workflow.id.startsWith("demo-") || workflow.skill.id.startsWith("demo-");
      if (!isDemo) {
        const token = authenticated ? await getAccessToken() : null;
        if (!token) {
          setPending(false);
          login();
          return;
        }
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`/api/skills/${workflow.skill.id}/sandbox`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: values }),
      });
      const data = (await response.json()) as RunResult;
      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        status: 0,
        latencyMs: 0,
        error: error instanceof Error ? error.message : "Network error",
      });
    } finally {
      setPending(false);
    }
  }

  async function runPaidWorkflow() {
    if (paidPending || missingRequired || !apiKey.trim()) return;
    setPaidPending(true);
    setPaidResult(null);
    try {
      const response = await fetch("/api/v1/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          skill: workflow.skill.gatewaySlug,
          input: values,
        }),
      });
      const data = (await response.json()) as RunResult;
      setPaidResult(response.ok ? data : { error: data.error ?? "Paid run failed" });
    } catch (error) {
      setPaidResult({
        error: error instanceof Error ? error.message : "Paid run failed",
      });
    } finally {
      setPaidPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="space-y-6">
        <section className="dojo-card p-5">
          <div className="mb-5 flex items-center justify-between">
            <span className="label-sm">Safe-run input</span>
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {workflow.version?.slaMs ?? 1200}ms SLA
            </span>
          </div>
          <p className="mb-5 rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Provide {inputSummary}. AgentShack runs the workflow once, evaluates delivery, and returns a result with a receipt.
          </p>
          <div className="space-y-4">
            {fields.length > 0 ? (
              fields.map(([key, prop]) => (
                <FieldInput
                  key={key}
                  name={key}
                  prop={prop}
                  value={values[key]}
                  onChange={(value) => setValues((prev) => ({ ...prev, [key]: value }))}
                />
              ))
            ) : (
              <p className="text-[14px] text-[var(--text-muted)]">
                This workflow takes an empty payload.
              </p>
            )}
            <div className="grid gap-3">
              <label className="block">
                <span className="label-sm mb-2 block">Dojo API key</span>
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="dojo_sk_..."
                  className="dojo-input font-mono"
                  type="password"
                />
              </label>
              <button
                onClick={runPaidWorkflow}
                disabled={paidPending || missingRequired || !apiKey.trim()}
                className="dojo-action dojo-action-primary w-full disabled:opacity-40"
              >
                {paidPending ? "Clearing..." : `Run once safely · $${workflow.pricePerRun.toFixed(3)}`}
              </button>
              <details className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
                <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Advanced: try sample without receipt
                </summary>
                <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  This checks endpoint shape only. It does not create a receipt or feed reputation.
                </p>
                <button
                  onClick={runWorkflow}
                  disabled={pending || missingRequired}
                  className="dojo-action mt-3 w-full disabled:opacity-40"
                >
                  {pending ? "Trying sample..." : "Try sample"}
                </button>
              </details>
            </div>
          </div>
        </section>

        <section className="dojo-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="label-sm">Trust & receipts</span>
            <span className="rounded-[6px] bg-[var(--bg-secondary)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">
              testnet
            </span>
          </div>
          <div className="space-y-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            <PolicyRow label="Price" value={`$${workflow.pricePerRun.toFixed(3)} per run`} />
            <PolicyRow label="Evaluator" value="dojo-sanity-v1" />
            <PolicyRow label="PASS" value="receipt feeds reputation and creator earnings" />
            <PolicyRow label="FAIL" value="failure is recorded and does not feed the asset" />
          </div>
          <div className="mt-4 rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Pass criteria
            </div>
            <div className="grid gap-2 text-[12px] text-[var(--text-secondary)]">
              {[
                "2xx response delivered",
                "valid JSON output",
                `SLA under ${workflow.version?.slaMs ?? 5000}ms`,
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--signal)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section id="receipt" className="dojo-card p-5 lg:sticky lg:top-28">
        <div className="mb-5 flex items-center justify-between">
          <span className="label-sm">Result & receipt</span>
          {(paidResult || result) && (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {(paidResult?.latency_ms ?? result?.latencyMs ?? 0)}ms
            </span>
          )}
        </div>
        {paidResult?.workflow_receipt?.id && (
          <Link
            href={`/r/${paidResult.workflow_receipt.id}`}
            className="mb-4 inline-flex items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            Open execution receipt
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
        <pre className="min-h-[360px] overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {formatJson(
            paidResult
              ? paidResult
              : result?.ok
              ? { sandbox: true, data: result.data }
              : result ?? {
                  status: "ready",
                  workflow: workflow.slug,
                  clearing: "Paid runs write WorkflowRunReceipt and feed the workflow asset.",
                  sample: "Try sample only checks endpoint shape; it does not affect reputation.",
                  receipt: "After a cleared run, open /r/<receiptId> for the proof artifact.",
                },
          )}
        </pre>
      </section>
    </div>
  );
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border-light)] pb-2 last:border-b-0">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="max-w-[210px] text-right text-[12.5px] text-[var(--text)]">{value}</span>
    </div>
  );
}

function ForkPanel({ workflow }: { workflow: WorkflowActionData }) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const [name, setName] = useState(`${workflow.name} Remix`);
  const [goal, setGoal] = useState("Customize evaluator policy and publish as my agent workflow.");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<ForkResult | null>(null);

  async function createFork() {
    if (pending || !name.trim()) return;
    const token = authenticated ? await getAccessToken() : null;
    if (!token) {
      login();
      return;
    }

    setPending(true);
    setDraft(null);
    try {
      const response = await fetch(`/api/workflows/${workflow.id}/fork`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(name),
          description: goal.trim() || undefined,
          changeNote: goal.trim() || undefined,
        }),
      });
      const data = (await response.json()) as ForkResult;
      setDraft(response.ok ? data : { error: data.error ?? "Remix failed" });
    } catch (error) {
      setDraft({ error: error instanceof Error ? error.message : "Remix failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section className="dojo-card p-5">
        <span className="label-sm">Remix draft</span>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="label-sm mb-2 block">Variant name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="dojo-input"
            />
          </label>
          <label className="block">
            <span className="label-sm mb-2 block">What changes?</span>
            <textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              rows={5}
              className="dojo-input resize-none leading-relaxed"
            />
          </label>
          <button
            onClick={createFork}
            disabled={pending || !name.trim()}
            className="dojo-action dojo-action-primary w-full disabled:opacity-40"
          >
            {pending ? "Creating..." : "Create remix draft"}
          </button>
        </div>
      </section>
      <section className="dojo-card p-5">
        <span className="label-sm">Provenance</span>
        <pre className="mt-5 min-h-[330px] overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {formatJson(
            draft ?? {
              parent: workflow.slug,
              parent_runs: workflow.runs,
              parent_trust_score: workflow.trustScore,
              fork_count: workflow.forks,
              note: "Remix creates a draft workflow in your account. Creator tools can attach an endpoint later.",
            },
          )}
        </pre>
        {draft?.workflow && (
          <Link
            href={`/workflow/${draft.workflow.id}/deploy`}
            className="dojo-action dojo-action-primary mt-4"
          >
            Continue to creator deploy
          </Link>
        )}
      </section>
    </div>
  );
}

function DeployPanel({ workflow }: { workflow: WorkflowActionData }) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const [endpoint, setEndpoint] = useState(`https://api.example.com/${workflow.slug}/run`);
  const [pricePerRun, setPricePerRun] = useState(workflow.pricePerRun.toFixed(3));
  const [inputSchema, setInputSchema] = useState(workflow.skill.inputSchema ?? "{}");
  const [exampleInput, setExampleInput] = useState(workflow.skill.exampleInput ?? "{}");
  const [dryRun, setDryRun] = useState<RunResult | null>(null);
  const [pending, setPending] = useState<"dry-run" | "deploy" | null>(null);
  const [plan, setPlan] = useState<DeployResult | null>(null);

  async function getAuthToken() {
    const token = authenticated ? await getAccessToken() : null;
    if (!token) {
      login();
      return null;
    }
    return token;
  }

  function parseJsonInput(label: string, value: string) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  }

  async function runDeployDryRun() {
    if (pending) return;
    const token = await getAuthToken();
    if (!token) return;

    setPending("dry-run");
    setDryRun(null);
    setPlan(null);
    try {
      const payload = parseJsonInput("Example input", exampleInput);
      const response = await fetch("/api/skills/dry-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpointUrl: endpoint,
          input: payload,
        }),
      });
      const data = (await response.json()) as RunResult;
      setDryRun(response.ok ? data : { ok: false, error: data.error ?? "Dry run failed" });
    } catch (error) {
      setDryRun({
        ok: false,
        error: error instanceof Error ? error.message : "Dry run failed",
      });
    } finally {
      setPending(null);
    }
  }

  async function deployWorkflow() {
    if (pending || dryRun?.ok !== true) return;
    const token = await getAuthToken();
    if (!token) return;

    setPending("deploy");
    setPlan(null);
    try {
      const parsedPrice = Number(pricePerRun);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throw new Error("Price per run must be greater than 0");
      }

      const response = await fetch(`/api/workflows/${workflow.id}/deploy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpointUrl: endpoint,
          pricePerRun: parsedPrice,
          inputSchema: parseJsonInput("Input schema", inputSchema),
          exampleInput: parseJsonInput("Example input", exampleInput),
          outputShape: "json",
          slaMs: workflow.version?.slaMs ?? 5000,
        }),
      });
      const data = (await response.json()) as DeployResult;
      const fallback =
        response.status === 403
          ? "Only the workflow creator can deploy this workflow. Remix it first, then deploy your remix."
          : "Deploy failed";
      setPlan(response.ok ? data : { error: data.error ?? fallback });
    } catch (error) {
      setPlan({ error: error instanceof Error ? error.message : "Deploy failed" });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <section className="dojo-card p-5">
        <span className="label-sm">Deploy target</span>
        <p className="mt-3 rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Deploy updates a workflow you own. To customize another creator&apos;s workflow, create a remix draft first,
          then attach your endpoint to that remix.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="label-sm mb-2 block">Creator endpoint</span>
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              className="dojo-input font-mono"
            />
          </label>
          <label className="block">
            <span className="label-sm mb-2 block">Price per run</span>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={pricePerRun}
              onChange={(event) => setPricePerRun(event.target.value)}
              className="dojo-input font-mono"
            />
          </label>
          <label className="block">
            <span className="label-sm mb-2 block">Input schema</span>
            <textarea
              value={inputSchema}
              onChange={(event) => {
                setInputSchema(event.target.value);
                setDryRun(null);
              }}
              rows={6}
              className="dojo-input resize-y font-mono text-[12px]"
            />
          </label>
          <label className="block">
            <span className="label-sm mb-2 block">Example input</span>
            <textarea
              value={exampleInput}
              onChange={(event) => {
                setExampleInput(event.target.value);
                setDryRun(null);
              }}
              rows={4}
              className="dojo-input resize-y font-mono text-[12px]"
            />
          </label>
          <button
            onClick={runDeployDryRun}
            disabled={pending !== null}
            className="dojo-action w-full disabled:opacity-40"
          >
            {pending === "dry-run" ? "Testing..." : "Run dry-run"}
          </button>
          <button
            onClick={deployWorkflow}
            disabled={pending !== null || dryRun?.ok !== true}
            className="dojo-action dojo-action-primary w-full disabled:opacity-40"
          >
            {pending === "deploy" ? "Deploying..." : "Deploy workflow"}
          </button>
        </div>
      </section>
      <section className="dojo-card p-5">
        <span className="label-sm">Gateway state</span>
        <pre className="mt-5 min-h-[330px] overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {formatJson(
            plan ?? {
              workflow: workflow.slug,
              dry_run: dryRun ?? "required_before_deploy",
              deploy_effect: "Creates or updates active skill, links it to workflow, publishes workflow.",
            },
          )}
        </pre>
        {plan?.runUrl && (
          <Link
            href={plan.runUrl}
            className="dojo-action dojo-action-primary mt-4"
          >
            Open run page
          </Link>
        )}
      </section>
    </div>
  );
}

export function WorkflowActionClient({
  action,
  workflow,
}: {
  action: WorkflowAction;
  workflow: WorkflowActionData;
}) {
  const copy = actionCopy(action);
  const Icon = copy.icon;
  const schema = safeParseSchema(workflow.skill.inputSchema);
  const example = safeParseRecord(workflow.skill.exampleInput);
  const inputSummary = fieldSummary(schema, example);
  const sampleInput = examplePreview(example, workflow);
  const resultSummary = "Structured result + execution receipt";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <div className="atmosphere" />
      <Navbar />
      <main className="dojo-page-shell dojo-page-shell-wide">
        <Link
          href="/"
          className="dojo-back-link"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Workflow market
        </Link>

        <section className="dojo-workflow-hero mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="dojo-rank-badge mb-3 inline-flex items-center gap-2 rounded-[6px] px-3 py-1.5">
              <Icon className="h-3.5 w-3.5" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                {copy.eyebrow}
              </span>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <Link href="/" className="hover:text-[var(--text)]">Asset market</Link>
              <span>/</span>
              <span>{workflow.category}</span>
              <span>/</span>
              <span className="text-[var(--text)]">{workflow.slug}</span>
            </div>
            <h1 className="font-serif text-[31px] font-black leading-tight tracking-[0] text-[var(--text)] md:text-[42px]">
              {workflow.name}
              <span className="ml-3 align-middle font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--signal-deep)]">
                living
              </span>
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[var(--text-secondary)]">
              {workflow.description || copy.title}
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Input", inputSummary],
                ["Output", resultSummary],
                ["Price", `$${workflow.pricePerRun.toFixed(3)} per run`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {label}
                  </span>
                  <span className="mt-1 block text-[13px] font-semibold leading-relaxed text-[var(--text)]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]">
              {[
                ["Runs", workflow.runs],
                ["Trust", workflow.trustScore],
                ["SLA", workflow.version?.slaMs ? `${workflow.version.slaMs}ms` : "1.2s"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 font-mono text-[11px] text-[var(--text-muted)]">
                  <span>{label}</span>
                  <span className="font-semibold text-[var(--text)]">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="dojo-card w-full p-3">
            <DojoSpirit
              compact
              profile={workflow.spirit}
              name={workflow.name}
              workflowId={workflow.id}
              slug={workflow.slug}
              category={workflow.category}
              receipts={workflow.runs}
              passRate={workflow.trustScore > 1 ? workflow.trustScore / 100 : workflow.trustScore}
              forks={workflow.forks}
              royaltyBps={workflow.royaltyBps}
              status={workflow.spirit?.lineageRevenue.label ?? `${(workflow.royaltyBps / 100).toFixed(1)}% lineage revenue`}
            />
            <div className="mt-3">
              <Link
                href={`/workflow/${workflow.id}/run`}
                className="dojo-action dojo-action-primary w-full justify-center"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Train · ${workflow.pricePerRun.toFixed(3)}
              </Link>
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] text-[var(--text-muted)]">
              <span>receipts feed</span>
              <span className="font-semibold text-[var(--text)]">reputation</span>
            </div>
          </aside>
        </section>

        {action === "run" && (
          <section className="dojo-card mb-4 grid gap-4 p-5 md:grid-cols-[1fr_1fr]">
            <div>
              <span className="label-sm">Example input</span>
              <pre className="mt-3 overflow-auto rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
                {formatJson(sampleInput)}
              </pre>
            </div>
            <div>
              <span className="label-sm">What you get</span>
              <div className="mt-3 grid gap-3">
                {[
                  "A structured workflow result returned by the endpoint.",
                  "An evaluator score for delivery, format, and SLA.",
                  "A receipt link after a paid cleared run.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--signal)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {action === "run" && <RunPanel workflow={workflow} />}
        {action === "fork" && <ForkPanel workflow={workflow} />}
        {action === "deploy" && <DeployPanel workflow={workflow} />}

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Asset slug", workflow.skill.gatewaySlug],
            ["Version", workflow.version ? `v${workflow.version.version}` : "demo"],
            ["Royalty", `${(workflow.royaltyBps / 100).toFixed(1)}%`],
          ].map(([label, value]) => (
            <div key={label} className="dojo-card flex items-center gap-3 p-5">
              <ShieldCheck className="h-4 w-4 text-[var(--text-secondary)]" />
              <div>
                <div className="label-sm">{label}</div>
                <div className="mt-1 font-mono text-[12px] text-[var(--text)]">{value}</div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
