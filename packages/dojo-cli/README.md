# @maiat/dojo

Creator CLI for publishing, forking, and deploying Dojo agent workflows.

## Usage

```bash
npx @maiat/dojo init
npm run dojo -- dev-key
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo test --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo publish --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo fork --workflow jiagon-negotiator --name "My Repo Analyst"
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo deploy --workflow my-repo-analyst --file dojo.workflow.yaml
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo run --service jiagon-negotiator --input '{"repo_url":"https://github.com/garrytan/gbrain"}'
```

Use `DOJO_BASE_URL` or `--url` to point at a non-production Dojo instance:

```bash
DOJO_BASE_URL=http://localhost:3000 npx @maiat/dojo publish --file dojo.workflow.yaml
```

For local demos from the repo, generate or reuse a DB-backed key:

```bash
npm run dojo -- dev-key
export DOJO_API_KEY=dojo_sk_...
DOJO_API_KEY=dojo_sk_... npm run dojo -- run \
  --service jiagon-negotiator \
  --input '{"repo_url":"https://github.com/garrytan/gbrain"}'
```

`dev-key` is intentionally local-only. It requires the app database config,
selects a user with an agent, creates an API key if needed, and tops up demo
credits to `10` by default. Use `--fund 25` to choose another local demo
balance.

`run` is the Codex/terminal-friendly clearing demo command. It calls
`/api/v1/run` with a service slug, prints the execution result, and returns the
shareable `/r/<receiptId>` proof URL when the service writes a receipt. Legacy
`--skill` and `--workflow` flags are still accepted as aliases.

## Manifest

`dojo.workflow.yaml` is the canonical workflow manifest:

```yaml
name: Agent Repo Analyst
description: Analyze a public agent repository and return source-backed evidence.
category: Agent Research
price_per_run: 0.003
endpoint: https://your-agent.example.com/api/repo-analyst
sla_ms: 3000

input_schema:
  type: object
  required:
    - repo_url
  properties:
    repo_url:
      type: string

example_input:
  repo_url: https://github.com/garrytan/gbrain
```

`SKILL.md` files with YAML frontmatter are also supported:

```bash
DOJO_API_KEY=dojo_sk_... npx @maiat/dojo publish --file SKILL.md
```
