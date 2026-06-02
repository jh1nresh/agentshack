# @maiat/dojo-mcp

Minimal stdio MCP server for AgentShack clearing demos.

## Tools

- `agentshack_list_services` — list public services from `/api/v1/services`
- `agentshack_run_service` — run one service through `/api/v1/run`
- `dojo_get_receipt` — inspect a receipt through `/api/v1/receipts/:id`

Legacy aliases are still available:

- `dojo_search_workflows`
- `dojo_run_workflow`

## Local usage

```bash
DOJO_BASE_URL=http://localhost:3000 DOJO_API_KEY=dojo_sk_... npm --workspace @maiat/dojo-mcp run build
DOJO_BASE_URL=http://localhost:3000 DOJO_API_KEY=dojo_sk_... node packages/dojo-mcp/dist/server.js
```

## MCP config

```json
{
  "mcpServers": {
    "dojo": {
      "command": "node",
      "args": ["/Users/jhinresh/maiat-dojo/packages/dojo-mcp/dist/server.js"],
      "env": {
        "DOJO_BASE_URL": "http://localhost:3000",
        "DOJO_API_KEY": "dojo_sk_..."
      }
    }
  }
}
```
