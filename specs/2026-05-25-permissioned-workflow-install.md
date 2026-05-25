# Permissioned Workflow Install + Safe First Run

> Status: Proposed next optimization
> Date: 2026-05-25
> Owner: JhiNResH
> Source: https://x.com/steipete/status/2058883349632934149?s=20
> Related: `2026-04-27-agent-workflow-marketplace.md`, `2026-05-06-workflow-detail-product-page.md`, `2026-05-12-base-batches-reputation-clearing-network.md`, `2026-05-13-agent-family-schema.md`

## Source Signal

Peter Steinberger's complaint is narrow but important: CLIs that install new skills onto a user's system without asking feel invasive.

AgentShack should treat this as a product-quality signal:

```text
Skill/workflow install is a safety event, not a convenience default.
```

## Problem

A normal agent marketplace pushes users toward `Install agent` or `Add skill` too early. That is dangerous for AgentShack because workflows may touch:

- local files
- repos
- GitHub/CLI tools
- credentials/secrets
- cron jobs / scheduled tasks
- slash commands
- config files
- external posting/sending APIs
- payments/settlement later

If AgentShack silently mutates the user's environment, it will feel like malware even when the output is useful.

## Product Decision

Make the default AgentShack first-run loop permissioned and reversible:

```text
Discover workflow
→ inspect capability manifest
→ run once / dry run in bounded scope
→ show artifact + run receipt
→ evaluate outcome
→ optionally install / subscribe / expose slash command
→ create install receipt only after explicit approval
```

Default CTA should be:

```text
Run once safely
```

Not:

```text
Install agent
```

## Positioning

Do not frame this as a generic agent app store.

Use:

```text
AgentShack lets you run trusted agent workflows without letting them silently mutate your environment.
```

Protocol framing:

```text
AgentShack = market shell
Maiat = receipt / evaluation / reputation clearing layer
```

## User-Facing Modes

Every workflow/detail page should expose modes explicitly:

1. `Preview`
   - View job, sample input/output, required permissions, side effects, evaluator policy.
2. `Dry run`
   - Simulate or run on fixture data without durable side effects.
3. `Run once safely`
   - Execute one bounded run with explicit scope approval and a run receipt.
4. `Install locally`
   - Mutate user's agent environment only after approval and capability diff.
5. `Subscribe / Schedule`
   - Add recurring execution only after schedule + permission confirmation.
6. `Expose slash command`
   - Create a command only after explicit approval.

## Capability Manifest

Add a workflow capability manifest. This can be embedded in workflow metadata first; it does not require contract changes in the first PR.

Suggested shape:

```ts
export type WorkflowCapabilityManifest = {
  workflowId: string;
  version: string;
  defaultMode: 'preview' | 'dry_run' | 'run_once';
  installBehavior: {
    requiresExplicitInstall: true;
    installsSkills?: string[];
    createsSlashCommands?: string[];
    createsCronJobs?: string[];
    modifiesConfigPaths?: string[];
    rollbackSupported: boolean;
  };
  permissions: {
    filesystem?: {
      read?: string[];
      write?: string[];
      denied?: string[];
    };
    network?: string[];
    commands?: string[];
    secrets?: string[];
    externalActions?: Array<
      | 'post_comment'
      | 'create_issue'
      | 'send_message'
      | 'publish'
      | 'deploy'
      | 'payment'
      | 'schedule_job'
      | 'modify_config'
    >;
  };
  declaredSideEffects: string[];
  evaluatorPolicyId?: string;
  rollbackInstructions?: string[];
};
```

## Capability Diff

Before local install, slash command creation, cron creation, or config mutation, show a before/after diff:

```text
This workflow wants to change your agent environment.

Adds:
- Skill: github-pr-reviewer
- Slash command: /review-pr

Requests:
- Read current repo
- Run git and gh
- Write review artifact under ./reports/

Does not request:
- Push commits
- Post PR comments without confirmation
- Create issues
- Modify credentials

Rollback:
- Remove skill directory
- Remove slash command
- Restore config backup

[Run once only] [Approve install] [Cancel]
```

## Receipt Types

### RunReceipt

Existing receipt concepts should continue to represent workflow execution.

Minimum fields to preserve or add when practical:

```json
{
  "receiptType": "workflow_run",
  "workflowId": "github-pr-reviewer",
  "operatorId": "agent_123",
  "mode": "run_once",
  "permissionsApproved": ["repo_read", "report_write"],
  "artifactRefs": ["report.md"],
  "evaluatorPolicyId": "policy_123",
  "evaluatorVerdict": "pass",
  "sideEffectsObserved": []
}
```

### InstallReceipt

New receipt type for environment mutation:

```json
{
  "receiptType": "workflow_install",
  "workflowId": "github-pr-reviewer",
  "workflowVersion": "1.2.0",
  "operatorId": "agent_123",
  "installedFiles": ["~/.agentshack/skills/github-pr-reviewer/SKILL.md"],
  "createdCommands": ["/review-pr"],
  "createdCronJobs": [],
  "modifiedConfigPaths": ["~/.agentshack/config.yaml"],
  "permissionsApproved": ["repo_read", "github_api_read", "report_write"],
  "capabilityDiffHash": "sha256:...",
  "rollbackSupported": true,
  "userApproved": true,
  "approvedAt": "2026-05-25T00:00:00Z"
}
```

## Reputation Rule

Silent side effects should hurt reputation.

Evaluator policy should fail or flag runs when:

- workflow installs skills without explicit approval
- workflow writes outside declared paths
- workflow creates cron/schedule jobs without explicit approval
- workflow modifies config without capability diff
- workflow posts/sends/publishes without approval
- workflow asks for broader permissions at runtime than declared in the manifest
- rollback is claimed but missing or broken

Add a reputation dimension:

```text
permission hygiene
```

Possible visible metrics:

- declared permissions matched observed actions
- silent side-effect incidents
- rollback success rate
- external-action approval compliance

## First Implementation Slice

Build this as a product/spec/UI foundation before changing settlement contracts.

### Scope

1. Add a manifest schema/type and fixture examples.
2. Add a capability/permission section to workflow detail pages.
3. Change the primary CTA hierarchy to prefer `Run once safely` over `Install`.
4. Add a capability diff preview component for install-like actions.
5. Add mocked/local `InstallReceipt` shape to the receipt model or fixture layer.
6. Add evaluator copy/rules for silent side-effect violations.

### Out of Scope

- No wallet/payment/settlement contract changes.
- No real local machine installer yet.
- No actual cron/job creation.
- No credential storage changes.
- No external posting/sending/publishing side effects.
- No production permission broker.
- No auto-install of skills or slash commands.

## Likely Files

Inspect before editing, but likely surfaces include:

- `src/app/skill/[id]/SkillPageClient.tsx`
- `src/app/workflow/[id]/[action]/WorkflowActionClient.tsx`
- `src/components/SkillCard.tsx`
- `src/components/SkillSandbox.tsx`
- `src/components/skill/SkillExecutor.tsx`
- `src/components/DownloadSkillButton.tsx`
- `src/app/r/[receiptId]/page.tsx`
- `src/components/TrustCard.tsx`
- new component: `src/components/workflow/CapabilityManifestPanel.tsx`
- new component: `src/components/workflow/CapabilityDiffPreview.tsx`
- new model/util: `src/lib/workflow-capabilities.ts` or existing schema location after inspection
- fixture/seed location after inspection

## Acceptance Criteria

- Workflow detail page clearly answers: what can this workflow read, write, call, install, and mutate?
- First-run CTA says `Run once safely` or equivalent; `Install` is not the primary default.
- Any install-like action shows a capability diff before approval.
- Install behavior states whether it adds skills, slash commands, cron jobs, or config changes.
- UI distinguishes `RunReceipt` from `InstallReceipt`.
- Mock/fixture install receipt renders on receipt page or receipt preview.
- Copy explicitly says no local install occurs without explicit approval.
- Existing workflow run/sandbox/purchase pages still render.
- No real external side effects are added in this optimization.

## Test / Verification Plan

Run after implementation:

```bash
npm run typecheck
npm run build
npm test -- --run
```

Manual checks:

1. Open a workflow detail page.
2. Confirm first viewport shows job/value and `Run once safely`.
3. Confirm capability manifest panel shows reads/writes/network/commands/secrets/side effects.
4. Trigger install preview if available.
5. Confirm capability diff appears before any install confirmation.
6. Confirm cancel path performs no mutation.
7. Open receipt preview/page for install receipt fixture.
8. Confirm it shows approved permissions, installed artifacts, rollback status, and timestamp.

## Suggested PR Breakdown

### PR A — Manifest + UI copy

- Add manifest type/fixtures.
- Show permission manifest on workflow detail.
- Change primary CTA copy to `Run once safely`.

### PR B — Capability diff preview

- Add diff component.
- Wire install/download button to preview mode before confirmation.
- Keep action mocked/no-op unless already supported.

### PR C — InstallReceipt fixture + receipt page rendering

- Add install receipt model/fixture.
- Render install receipts separately from run receipts.
- Add silent-side-effect evaluator policy copy.

## Copy Rules

Prefer:

```text
Run once safely
Inspect permissions
Preview install changes
Install after approval
Rollback supported
No silent installs
```

Avoid:

```text
One-click install
Autoinstall
Trust us
Verified agent
Unlimited access
```

Do not use `verified` unless evaluator/receipt proof exists.

## Why This Matters

This is a small product optimization with a large positioning effect.

It moves AgentShack from:

```text
agent marketplace / skill directory
```

toward:

```text
permissioned agent work clearing with receipts and reputation
```

That is the stronger moat.