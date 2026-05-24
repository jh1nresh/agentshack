"use client";

/**
 * PublishWizardCard — 6-step in-chat skill publishing wizard.
 *
 * Steps:
 *   1. Name + description
 *   2. Endpoint URL + optional auth header
 *   3. Input description → LLM-inferred schema (editable)
 *   4. Profile tiles (json/text/image) + latency slider
 *   5. Dry-run sandbox test (must PASS to unlock step 6)
 *   6. Pricing + category → summary → Publish
 *
 * Hard invariant: changing endpointUrl resets sandboxPassed.
 * Auth gate: shows "Log in to publish" if not authenticated.
 */

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { LogIn } from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface DryRunResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  data: unknown;
  eval: {
    score: number;
    delivered: boolean;
    validFormat: boolean;
    withinSla: boolean;
  };
}

const CATEGORIES = [
  "Trading",
  "Security",
  "Content",
  "DeFi",
  "Analytics",
  "Infra",
  "Social",
] as const;

const OUTPUT_SHAPES = [
  { value: "json", label: "JSON", desc: "Structured data" },
  { value: "text", label: "Text", desc: "Plain text / markdown" },
  { value: "image", label: "Image", desc: "Base64 or URL" },
] as const;

export function PublishWizardCard() {
  const { authenticated, login, getAccessToken, user } = usePrivy();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 2
  const [endpointUrl, setEndpointUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");

  // Step 3
  const [inputDescription, setInputDescription] = useState("");
  const [inputSchema, setInputSchema] = useState("");
  const [exampleInput, setExampleInput] = useState("");
  const [schemaInferred, setSchemaInferred] = useState(false);

  // Step 4
  const [outputShape, setOutputShape] = useState("json");
  const [estLatencyMs, setEstLatencyMs] = useState(2000);

  // Step 5
  const [sandboxPassed, setSandboxPassed] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  // Step 6
  const [pricePerCall, setPricePerCall] = useState("0.01");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [published, setPublished] = useState(false);
  const [publishedSkillName, setPublishedSkillName] = useState("");

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) throw new Error('Session expired — please sign in and try again.');
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  // Reset sandbox if endpoint changes
  const handleEndpointChange = useCallback(
    (val: string) => {
      setEndpointUrl(val);
      if (sandboxPassed) {
        setSandboxPassed(false);
        setDryRunResult(null);
      }
    },
    [sandboxPassed]
  );

  // Step 3: Infer schema
  const handleInferSchema = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/skills/infer-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ name, description, inputDescription }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Inference failed");
      setInputSchema(JSON.stringify(json.inputSchema, null, 2));
      setExampleInput(JSON.stringify(json.exampleInput, null, 2));
      setSchemaInferred(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, name, description, inputDescription]);

  // Step 5: Dry run
  const handleDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDryRunResult(null);
    try {
      let parsedInput = {};
      if (exampleInput.trim()) {
        try {
          parsedInput = JSON.parse(exampleInput);
        } catch {
          throw new Error("Example input is not valid JSON");
        }
      }

      const headers = await authHeaders();
      const res = await fetch("/api/skills/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          endpointUrl,
          input: parsedInput,
          authHeader: authHeader || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Dry run failed");
      setDryRunResult(json);
      setSandboxPassed(json.ok === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry run failed");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, endpointUrl, exampleInput, authHeader]);

  // Step 6: Publish
  const handlePublish = useCallback(async () => {
    if (!user?.id) {
      setError("Not authenticated — please sign in and try again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();

      // Parse schemas for the API — stringify happens server-side
      let parsedInputSchema: unknown = null;
      let parsedExampleInput: unknown = null;
      try {
        if (inputSchema.trim()) parsedInputSchema = JSON.parse(inputSchema);
      } catch {
        /* user edited to invalid JSON — send as string */
        parsedInputSchema = inputSchema;
      }
      try {
        if (exampleInput.trim()) parsedExampleInput = JSON.parse(exampleInput);
      } catch {
        parsedExampleInput = exampleInput;
      }

      const res = await fetch("/api/skills/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          privyId: user?.id ?? "",
          name,
          description,
          category,
          price: Number(pricePerCall),
          pricePerCall: Number(pricePerCall),
          endpointUrl,
          executionKind: "sync",
          inputShape: "form",
          outputShape,
          estLatencyMs,
          sandboxable: true,
          authRequired: !!authHeader,
          inputSchema: parsedInputSchema,
          exampleInput: parsedExampleInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      setPublished(true);
      setPublishedSkillName(json.name ?? name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setLoading(false);
    }
  }, [
    authHeaders,
    name,
    description,
    category,
    pricePerCall,
    endpointUrl,
    outputShape,
    estLatencyMs,
    authHeader,
    inputSchema,
    exampleInput,
    user?.id,
  ]);

  // Auth gate
  if (!authenticated) {
    return (
      <div className="classified" data-label="Publish Skill">
        <p className="mb-3 font-serif text-sm text-[var(--paper-ink-60)]">
          Log in to publish a skill on AgentShack.
        </p>
        <button
          onClick={login}
          className="flex items-center gap-2 bg-[var(--paper-ink)] px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-[var(--paper-bg)] transition hover:bg-[var(--paper-ink-70)]"
        >
          <LogIn size={12} />
          Log In to Publish
        </button>
      </div>
    );
  }

  // Published success state
  if (published) {
    return (
      <div className="classified" data-label="Published">
        <div className="mb-2 border-l-2 border-[var(--paper-success)] bg-[var(--paper-success-bg)] px-2 py-1 font-mono text-xs text-[var(--paper-success)]">
          ✓ Skill published
        </div>
        <p className="font-serif text-[15px] leading-[1.65] text-[var(--paper-ink)]">
          <strong>{publishedSkillName}</strong> is now live. Try{" "}
          <code className="font-mono text-[11px] font-bold text-[var(--paper-accent)]">
            list skills
          </code>{" "}
          to see it, or{" "}
          <code className="font-mono text-[11px] font-bold text-[var(--paper-accent)]">
            call {publishedSkillName.toLowerCase().replace(/\s+/g, "-")}
          </code>{" "}
          to test.
        </p>
      </div>
    );
  }

  return (
    <div className="classified" data-label={`Publish — Step ${step} of 6`}>
      {/* Step indicator */}
      <div className="mb-3 flex gap-1">
        {([1, 2, 3, 4, 5, 6] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 ${
              s < step
                ? "bg-[var(--paper-ink)]"
                : s === step
                  ? "bg-[var(--paper-accent)]"
                  : "bg-[var(--paper-ink-15)]"
            }`}
          />
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 border-l-2 border-[var(--paper-danger)] bg-[var(--paper-danger-bg)] px-2 py-1 font-mono text-[11px] text-[var(--paper-danger)]">
          {error}
        </div>
      )}

      {/* Step 1: Name + Description */}
      {step === 1 && (
        <div>
          <StepHeader title="Name & Description" hint="What does your skill do?" />
          <div className="space-y-3">
            <Input
              label="Skill Name"
              value={name}
              onChange={setName}
              placeholder="Token Price Oracle"
            />
            <Textarea
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Returns real-time token prices from multiple DEXs"
              rows={2}
            />
          </div>
          <StepNav
            canNext={name.trim().length > 0 && description.trim().length > 0}
            onNext={() => setStep(2)}
          />
        </div>
      )}

      {/* Step 2: Endpoint */}
      {step === 2 && (
        <div>
          <StepHeader title="Endpoint" hint="Where does Dojo call your skill?" />
          <div className="space-y-3">
            <Input
              label="Endpoint URL"
              value={endpointUrl}
              onChange={handleEndpointChange}
              placeholder="https://api.example.com/v1/skill"
            />
            <Input
              label="Auth Header (optional)"
              value={authHeader}
              onChange={setAuthHeader}
              placeholder="Bearer sk-..."
            />
          </div>
          <StepNav
            canPrev
            canNext={isValidUrl(endpointUrl)}
            onPrev={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        </div>
      )}

      {/* Step 3: Input Schema */}
      {step === 3 && (
        <div>
          <StepHeader title="Input Schema" hint="Describe inputs → we infer the schema" />
          <div className="space-y-3">
            <Textarea
              label="Describe your inputs"
              value={inputDescription}
              onChange={setInputDescription}
              placeholder="Symbol (string, e.g. BTC), timeframe (string, e.g. 1h)"
              rows={2}
            />
            <button
              onClick={handleInferSchema}
              disabled={loading || !inputDescription.trim()}
              className="flex items-center gap-2 bg-[var(--paper-ink)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--paper-bg)] transition hover:bg-[var(--paper-ink-70)] disabled:opacity-40"
            >
              {loading ? "Inferring…" : "Infer Schema"}
            </button>
            {schemaInferred && (
              <>
                <Textarea
                  label="JSON Schema (editable)"
                  value={inputSchema}
                  onChange={setInputSchema}
                  rows={6}
                  mono
                />
                <Textarea
                  label="Example Input (editable)"
                  value={exampleInput}
                  onChange={setExampleInput}
                  rows={3}
                  mono
                />
              </>
            )}
          </div>
          <StepNav
            canPrev
            canNext={schemaInferred}
            onPrev={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        </div>
      )}

      {/* Step 4: Profile */}
      {step === 4 && (
        <div>
          <StepHeader title="Execution Profile" hint="How does your skill respond?" />
          <div className="space-y-3">
            <div>
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[var(--paper-ink-50)]">
                Output Format
              </span>
              <div className="flex gap-2">
                {OUTPUT_SHAPES.map((shape) => (
                  <button
                    key={shape.value}
                    onClick={() => setOutputShape(shape.value)}
                    className={`flex-1 border-2 px-3 py-2 text-left transition ${
                      outputShape === shape.value
                        ? "border-[var(--paper-ink)] bg-[var(--paper-ink-5)]"
                        : "border-[var(--paper-ink-15)] hover:border-[var(--paper-ink-40)]"
                    }`}
                  >
                    <span className="block font-mono text-[11px] font-bold">
                      {shape.label}
                    </span>
                    <span className="block font-serif text-[11px] text-[var(--paper-ink-50)]">
                      {shape.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[var(--paper-ink-50)]">
                Expected Latency: {estLatencyMs}ms
              </span>
              <input
                type="range"
                min={200}
                max={5000}
                step={100}
                value={estLatencyMs}
                onChange={(e) => setEstLatencyMs(Number(e.target.value))}
                className="w-full accent-[var(--paper-ink)]"
              />
              <div className="flex justify-between font-mono text-[9px] text-[var(--paper-ink-30)]">
                <span>200ms</span>
                <span>5000ms</span>
              </div>
            </div>
          </div>
          <StepNav
            canPrev
            canNext
            onPrev={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        </div>
      )}

      {/* Step 5: Sandbox Test */}
      {step === 5 && (
        <div>
          <StepHeader title="Sandbox Test" hint="Must PASS to publish" />
          <button
            onClick={handleDryRun}
            disabled={loading}
            className="mb-3 flex items-center gap-2 bg-[var(--paper-ink)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--paper-bg)] transition hover:bg-[var(--paper-ink-70)] disabled:opacity-40"
          >
            {loading ? "Testing…" : "Run Test"}
          </button>
          {dryRunResult && (
            <div
              className={`border-l-2 px-3 py-2 ${
                dryRunResult.ok
                  ? "border-[var(--paper-success)] bg-[var(--paper-success-bg)]"
                  : "border-[var(--paper-danger)] bg-[var(--paper-danger-bg)]"
              }`}
            >
              <div className="mb-1 font-mono text-[11px] font-bold">
                {dryRunResult.ok ? "✓ PASS" : "✗ FAIL"}
              </div>
              <div className="space-y-0.5 font-mono text-[10px] text-[var(--paper-ink-70)]">
                <div>Status: {dryRunResult.status}</div>
                <div>Latency: {dryRunResult.latencyMs}ms</div>
                <div>
                  Delivered: {dryRunResult.eval.delivered ? "yes" : "no"} ·
                  Valid JSON: {dryRunResult.eval.validFormat ? "yes" : "no"} ·
                  Within SLA: {dryRunResult.eval.withinSla ? "yes" : "no"}
                </div>
              </div>
            </div>
          )}
          <StepNav
            canPrev
            canNext={sandboxPassed}
            onPrev={() => setStep(4)}
            onNext={() => setStep(6)}
            nextLabel={sandboxPassed ? "Next" : "Must PASS"}
          />
        </div>
      )}

      {/* Step 6: Pricing + Publish */}
      {step === 6 && (
        <div>
          <StepHeader title="Pricing & Publish" hint="Set your rate, then go live" />
          <div className="space-y-3">
            <Input
              label="Price per Call (USD)"
              value={pricePerCall}
              onChange={setPricePerCall}
              placeholder="0.01"
            />
            <div>
              <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[var(--paper-ink-50)]">
                Category
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border-2 border-[var(--paper-ink-15)] bg-transparent px-3 py-2 font-mono text-[11px] text-[var(--paper-ink)] outline-none focus:border-[var(--paper-ink)]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Summary */}
            <div className="border-t-2 border-dotted border-[var(--paper-ink-15)] pt-3">
              <span className="mb-2 block font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--paper-ink-50)]">
                Summary
              </span>
              <div className="space-y-1 font-mono text-[10px] text-[var(--paper-ink-70)]">
                <div>
                  <strong>{name}</strong> — {description}
                </div>
                <div>Endpoint: {endpointUrl}</div>
                <div>
                  Output: {outputShape} · Latency: ~{estLatencyMs}ms
                </div>
                <div>
                  Price: ${pricePerCall}/call · Category: {category}
                </div>
              </div>
            </div>

            <button
              onClick={handlePublish}
              disabled={
                loading || !pricePerCall || Number(pricePerCall) <= 0
              }
              className="w-full bg-[var(--paper-ink)] py-2.5 font-mono text-[11px] uppercase tracking-wider text-[var(--paper-bg)] transition hover:bg-[var(--paper-ink-70)] disabled:opacity-40"
            >
              {loading ? "Publishing…" : "Publish Skill"}
            </button>
          </div>
          <StepNav canPrev onPrev={() => setStep(5)} />
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function StepHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3 border-b-[3px] border-double border-[var(--paper-ink-60)] pb-1">
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--paper-ink-70)]">
        {title}
      </span>
      <span className="ml-2 font-serif text-[11px] italic text-[var(--paper-ink-40)]">
        {hint}
      </span>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[var(--paper-ink-50)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border-2 border-[var(--paper-ink-15)] bg-transparent px-3 py-2 font-mono text-[11px] text-[var(--paper-ink)] outline-none placeholder:text-[var(--paper-ink-25)] focus:border-[var(--paper-ink)]"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[var(--paper-ink-50)]">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-y border-2 border-[var(--paper-ink-15)] bg-transparent px-3 py-2 text-[11px] text-[var(--paper-ink)] outline-none placeholder:text-[var(--paper-ink-25)] focus:border-[var(--paper-ink)] ${
          mono ? "font-mono" : "font-serif"
        }`}
      />
    </div>
  );
}

function StepNav({
  canPrev = false,
  canNext = false,
  onPrev,
  onNext,
  nextLabel,
}: {
  canPrev?: boolean;
  canNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="mt-3 flex justify-between">
      {canPrev && onPrev ? (
        <button
          onClick={onPrev}
          className="font-mono text-[10px] uppercase tracking-wider text-[var(--paper-ink-50)] transition hover:text-[var(--paper-ink)]"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          onClick={onNext}
          disabled={!canNext}
          className="bg-[var(--paper-ink)] px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--paper-bg)] transition hover:bg-[var(--paper-ink-70)] disabled:opacity-40"
        >
          {nextLabel ?? "Next →"}
        </button>
      )}
    </div>
  );
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

export default PublishWizardCard;
