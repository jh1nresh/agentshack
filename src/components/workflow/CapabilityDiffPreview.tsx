import {
  buildCapabilityDiff,
  buildInstallReceiptPreview,
  type WorkflowCapabilityManifest,
} from "@/lib/workflow-capabilities";

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {title}
      </div>
      <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {(items.length > 0 ? items : ["None"]).map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

export function CapabilityDiffPreview({
  manifest,
  compact = false,
  title = "Install preview",
  description = "This is a preview only. AgentShack will not add files, commands, schedules, or config changes without approval.",
}: {
  manifest: WorkflowCapabilityManifest;
  compact?: boolean;
  title?: string;
  description?: string;
}) {
  const diff = buildCapabilityDiff(manifest);
  const receipt = buildInstallReceiptPreview(manifest);

  return (
    <section className={`rounded-[8px] border border-[var(--border)] bg-[var(--bg-secondary)] ${compact ? "p-3" : "p-5"}`}>
      <div className="mb-4">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text)]">
          {title}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      </div>

      <div className={`grid gap-4 ${compact ? "" : "md:grid-cols-2"}`}>
        <DiffList title="Adds" items={diff.adds} />
        <DiffList title="Requests" items={diff.requests} />
        <DiffList title="Does not request" items={diff.denies} />
        <DiffList title="Rollback" items={diff.rollback} />
      </div>

      {!compact && (
        <div className="mt-5 rounded-[8px] border border-[var(--border-light)] bg-[var(--card-bg)] p-4">
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            InstallReceipt preview
          </div>
          <pre className="overflow-auto font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
