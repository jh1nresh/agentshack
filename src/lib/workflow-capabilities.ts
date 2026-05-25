import type { AgentServiceCard } from "@/lib/agent-card-catalog";

export type WorkflowCapabilityManifest = {
  workflowId: string;
  version: string;
  defaultMode: "preview" | "dry_run" | "run_once";
  installBehavior: {
    requiresExplicitInstall: true;
    installsSkills: string[];
    createsSlashCommands: string[];
    createsCronJobs: string[];
    modifiesConfigPaths: string[];
    rollbackSupported: boolean;
  };
  permissions: {
    filesystem: {
      read: string[];
      write: string[];
      denied: string[];
    };
    network: string[];
    commands: string[];
    secrets: string[];
    externalActions: string[];
  };
  declaredSideEffects: string[];
  evaluatorPolicyId?: string;
  rollbackInstructions: string[];
};

export type WorkflowCapabilityDiff = {
  adds: string[];
  requests: string[];
  denies: string[];
  rollback: string[];
};

export type WorkflowInstallReceiptPreview = {
  receiptType: "workflow_install";
  workflowId: string;
  workflowVersion: string;
  permissionsApproved: string[];
  installedFiles: string[];
  createdCommands: string[];
  createdCronJobs: string[];
  modifiedConfigPaths: string[];
  rollbackSupported: boolean;
  userApproved: false;
};

function cleanList(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

export function createAgentCapabilityManifest(agent: AgentServiceCard): WorkflowCapabilityManifest {
  const baseId = agent.slug;
  const slashCommand = `/${agent.slug.replace(/[^a-z0-9-]+/gi, "-")}`;

  return {
    workflowId: baseId,
    version: "fixture-2026-05-25",
    defaultMode: "run_once",
    installBehavior: {
      requiresExplicitInstall: true,
      installsSkills: [`agents/${agent.slug}/SKILL.md`],
      createsSlashCommands: [slashCommand],
      createsCronJobs: [],
      modifiesConfigPaths: [],
      rollbackSupported: true,
    },
    permissions: {
      filesystem: {
        read: ["user-approved order, receipt, or task context"],
        write: ["run artifact and receipt record"],
        denied: ["wallet keys", ".env files", "credential stores"],
      },
      network: agent.integrations,
      commands: ["none before install approval"],
      secrets: ["only user-provided API keys after setup approval"],
      externalActions: cleanList([
        agent.paymentRails.length > 0 ? "payment" : null,
        agent.workflowDeck.some((step) => /refund|claim|settlement|order/i.test(step))
          ? "commerce action"
          : null,
        "schedule_job only after subscribe approval",
      ]),
    },
    declaredSideEffects: [
      "Run once creates an evaluated work receipt.",
      "Install can add a local skill file or slash command only after approval.",
      "Subscribe can schedule recurring work only after schedule approval.",
    ],
    evaluatorPolicyId: `${agent.familyCode.toLowerCase()}-permission-hygiene-v1`,
    rollbackInstructions: [
      `Remove installed ${agent.name} skill file.`,
      `Remove ${slashCommand} slash command if created.`,
      "Disable recurring schedule if subscription was approved.",
    ],
  };
}

export function createSkillCapabilityManifest(skill: {
  id: string;
  name: string;
  skillType: string;
  gatewaySlug: string | null;
  sandboxable?: boolean | null;
  authRequired?: boolean | null;
}): WorkflowCapabilityManifest {
  const active = skill.skillType === "active";
  const slug = skill.gatewaySlug ?? skill.id;

  return {
    workflowId: slug,
    version: "fixture-2026-05-25",
    defaultMode: active && skill.sandboxable ? "dry_run" : "run_once",
    installBehavior: {
      requiresExplicitInstall: true,
      installsSkills: active ? [] : [`skills/${slug}.md`],
      createsSlashCommands: active ? [] : [`/${slug}`],
      createsCronJobs: [],
      modifiesConfigPaths: [],
      rollbackSupported: true,
    },
    permissions: {
      filesystem: {
        read: active ? ["submitted input payload"] : ["downloaded skill file only"],
        write: active ? ["run artifact and evaluated receipt"] : ["none from AgentShack"],
        denied: ["wallet keys", ".env files", "credential stores"],
      },
      network: active ? [`gateway:${slug}`] : [],
      commands: ["none before explicit local install"],
      secrets: skill.authRequired ? ["runtime API key after approval"] : [],
      externalActions: active ? ["payment", "external endpoint call"] : [],
    },
    declaredSideEffects: active
      ? [
          "Safe run opens a bounded session and can create a work receipt.",
          "No local files, commands, cron jobs, or config are changed.",
        ]
      : [
          "Download returns a file only.",
          "Local installation happens outside AgentShack after explicit user action.",
        ],
    evaluatorPolicyId: "permission-hygiene-v1",
    rollbackInstructions: active
      ? ["Close session and refund remaining budget if needed."]
      : [`Delete the downloaded ${skill.name} file or local skill folder.`],
  };
}

export function buildCapabilityDiff(manifest: WorkflowCapabilityManifest): WorkflowCapabilityDiff {
  return {
    adds: [
      ...manifest.installBehavior.installsSkills.map((item) => `Skill: ${item}`),
      ...manifest.installBehavior.createsSlashCommands.map((item) => `Slash command: ${item}`),
      ...manifest.installBehavior.createsCronJobs.map((item) => `Schedule: ${item}`),
      ...manifest.installBehavior.modifiesConfigPaths.map((item) => `Config path: ${item}`),
    ],
    requests: [
      ...manifest.permissions.filesystem.read.map((item) => `Read: ${item}`),
      ...manifest.permissions.filesystem.write.map((item) => `Write: ${item}`),
      ...manifest.permissions.network.map((item) => `Network: ${item}`),
      ...manifest.permissions.commands.map((item) => `Command: ${item}`),
      ...manifest.permissions.secrets.map((item) => `Secret: ${item}`),
      ...manifest.permissions.externalActions.map((item) => `External action: ${item}`),
    ],
    denies: manifest.permissions.filesystem.denied,
    rollback: manifest.rollbackInstructions,
  };
}

export function buildInstallReceiptPreview(
  manifest: WorkflowCapabilityManifest,
): WorkflowInstallReceiptPreview {
  return {
    receiptType: "workflow_install",
    workflowId: manifest.workflowId,
    workflowVersion: manifest.version,
    permissionsApproved: [],
    installedFiles: manifest.installBehavior.installsSkills,
    createdCommands: manifest.installBehavior.createsSlashCommands,
    createdCronJobs: manifest.installBehavior.createsCronJobs,
    modifiedConfigPaths: manifest.installBehavior.modifiesConfigPaths,
    rollbackSupported: manifest.installBehavior.rollbackSupported,
    userApproved: false,
  };
}
