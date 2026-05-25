import { ShieldCheck } from "lucide-react";
import type { WorkflowCapabilityManifest } from "@/lib/workflow-capabilities";

function listText(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None declared";
}

export function CapabilityManifestPanel({
  manifest,
  title = "Permission manifest",
}: {
  manifest: WorkflowCapabilityManifest;
  title?: string;
}) {
  const rows = [
    {
      label: "Reads",
      value: listText(manifest.permissions.filesystem.read),
    },
    {
      label: "Writes",
      value: listText(manifest.permissions.filesystem.write),
    },
    {
      label: "Network",
      value: listText(manifest.permissions.network),
    },
    {
      label: "Commands",
      value: listText(manifest.permissions.commands),
    },
    {
      label: "Secrets",
      value: listText(manifest.permissions.secrets),
    },
    {
      label: "Side effects",
      value: listText(manifest.declaredSideEffects),
    },
  ];

  return (
    <section className="glass-card p-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {title}
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Default mode is <strong className="text-[var(--text)]">{manifest.defaultMode.replace("_", " ")}</strong>.
            Install, slash command, schedule, and config changes require an explicit capability diff first.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text)]">
          No silent install
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-[8px] border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {row.label}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
