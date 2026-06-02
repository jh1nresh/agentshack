#!/usr/bin/env node

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

type ToolCallParams = {
  name?: unknown;
  arguments?: unknown;
};

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type ServiceListResponse = {
  services?: unknown;
  count?: number;
  router?: unknown;
  error?: string;
};

type RunResponse = {
  result?: unknown;
  service?: unknown;
  mode?: string;
  cost?: number;
  balance?: number;
  score?: number;
  session_id?: string;
  latency_ms?: number;
  receipt?: {
    id?: string;
    settlement_status?: string;
    anchor_status?: string;
  } | null;
  workflow_receipt?: {
    id?: string;
    settlement_status?: string;
    anchor_status?: string;
  };
  error?: string;
  reason?: string;
};

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_VERSION = '0.1.0';

function baseUrl() {
  return (process.env.DOJO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

function apiKey() {
  return process.env.DOJO_API_KEY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function jsonText(value: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorText(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

async function readJson<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, init);
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = { error: text } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

async function dojoSearchWorkflows(args: Record<string, unknown>): Promise<ToolResult> {
  const query = asString(args.query)?.trim().toLowerCase() ?? '';
  const category = asString(args.category)?.trim().toLowerCase() ?? '';
  const limit = Math.max(1, Math.min(asNumber(args.limit) ?? 10, 50));
  const { ok, status, data } = await readJson<ServiceListResponse>(`${baseUrl()}/api/v1/services`);

  if (!ok) {
    return errorText(`AgentShack services request failed (${status}): ${data.error ?? JSON.stringify(data)}`);
  }

  const rawServices = Array.isArray(data.services) ? data.services : [];
  const services = rawServices
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => {
      const haystack = [
        asString(item.service),
        asString(item.legacy_skill),
        asString(item.name),
        asString(item.description),
        asString(item.category),
      ].join(' ').toLowerCase();
      const itemCategory = asString(item.category)?.toLowerCase() ?? '';
      return (!query || haystack.includes(query)) && (!category || itemCategory === category);
    })
    .slice(0, limit)
    .map((item) => ({
      service: item.service,
      legacy_skill: item.legacy_skill,
      name: item.name,
      description: item.description,
      pricing: item.pricing,
      category: item.category,
      trust: item.trust,
      security_scan: item.security_scan,
      run_modes: item.run_modes,
      workflow: item.workflow,
      example_input: item.example_input,
    }));

  return jsonText({
    count: services.length,
    base_url: baseUrl(),
    router: data.router,
    services,
  });
}

async function dojoRunWorkflow(args: Record<string, unknown>): Promise<ToolResult> {
  const service = asString(args.service);
  const skill = asString(args.skill);
  const workflow = asString(args.workflow);
  const requested = service ?? skill ?? workflow;
  if (!requested) return errorText('Missing required argument: service');

  const key = asString(args.api_key) ?? apiKey();
  if (!key) return errorText('DOJO_API_KEY is required to run workflows.');

  const input = asRecord(args.input);
  const payload = service
    ? { service, input }
    : skill
      ? { skill, input }
      : { workflow: workflow!, input };
  const { ok, status, data } = await readJson<RunResponse>(`${baseUrl()}/api/v1/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!ok) {
    const reason = data.reason ? ` - ${data.reason}` : '';
    return errorText(`Dojo run failed (${status}): ${data.error ?? JSON.stringify(data)}${reason}`);
  }

  return jsonText({
    service: data.service ?? requested,
    mode: data.mode,
    result: data.result,
    cost: data.cost,
    balance: data.balance,
    score: data.score,
    session_id: data.session_id,
    latency_ms: data.latency_ms,
    receipt: data.receipt ?? data.workflow_receipt,
    workflow_receipt: data.workflow_receipt,
    receipt_url: (data.receipt?.id ?? data.workflow_receipt?.id)
      ? `${baseUrl()}/r/${data.receipt?.id ?? data.workflow_receipt?.id}`
      : null,
  });
}

async function dojoGetReceipt(args: Record<string, unknown>): Promise<ToolResult> {
  const receiptId = asString(args.receipt_id) ?? asString(args.id);
  if (!receiptId) return errorText('Missing required argument: receipt_id');

  const { ok, status, data } = await readJson<Record<string, unknown>>(
    `${baseUrl()}/api/v1/receipts/${encodeURIComponent(receiptId)}`,
  );

  if (!ok) {
    return errorText(`Dojo receipt request failed (${status}): ${asString(data.error) ?? JSON.stringify(data)}`);
  }

  return jsonText({
    ...data,
    receipt_url: `${baseUrl()}/r/${receiptId}`,
  });
}

const tools = [
  {
    name: 'agentshack_list_services',
    description: 'List AgentShack services that can be run once and return receipts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text for service name, slug, or description.' },
        category: { type: 'string', description: 'Optional exact category filter.' },
        limit: { type: 'number', description: 'Max results, 1-50. Default 10.' },
      },
    },
  },
  {
    name: 'agentshack_run_service',
    description: 'Run an AgentShack service once through the clearing API and return the receipt URL.',
    inputSchema: {
      type: 'object',
      required: ['service'],
      properties: {
        service: { type: 'string', description: 'AgentShack service slug.' },
        workflow: { type: 'string', description: 'Legacy workflow slug.' },
        input: { type: 'object', description: 'Service input JSON object.' },
        api_key: { type: 'string', description: 'Optional AgentShack API key override. Defaults to DOJO_API_KEY.' },
      },
    },
  },
  {
    name: 'dojo_search_workflows',
    description: 'Legacy alias: search public AgentShack services available for cleared execution.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text for workflow name, slug, or description.' },
        category: { type: 'string', description: 'Optional exact category filter.' },
        limit: { type: 'number', description: 'Max results, 1-50. Default 10.' },
      },
    },
  },
  {
    name: 'dojo_run_workflow',
    description: 'Legacy alias: run an AgentShack service through the clearing API and return the execution receipt URL.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'AgentShack service slug.' },
        skill: { type: 'string', description: 'Legacy Dojo gateway slug.' },
        workflow: { type: 'string', description: 'Legacy workflow slug.' },
        input: { type: 'object', description: 'Workflow input JSON object.' },
        api_key: { type: 'string', description: 'Optional Dojo API key override. Defaults to DOJO_API_KEY.' },
      },
    },
  },
  {
    name: 'dojo_get_receipt',
    description: 'Fetch a Dojo execution receipt by id, including PASS/FAIL, settlement, evaluator checks, and proof hashes.',
    inputSchema: {
      type: 'object',
      required: ['receipt_id'],
      properties: {
        receipt_id: { type: 'string', description: 'WorkflowRunReceipt id.' },
      },
    },
  },
] as const;

async function callTool(params: unknown): Promise<ToolResult> {
  const parsed = isRecord(params) ? (params as ToolCallParams) : {};
  const name = asString(parsed.name);
  const args = asRecord(parsed.arguments);

  try {
    if (name === 'agentshack_list_services') return await dojoSearchWorkflows(args);
    if (name === 'agentshack_run_service') return await dojoRunWorkflow(args);
    if (name === 'dojo_search_workflows') return await dojoSearchWorkflows(args);
    if (name === 'dojo_run_workflow') return await dojoRunWorkflow(args);
    if (name === 'dojo_get_receipt') return await dojoGetReceipt(args);
    return errorText(`Unknown Dojo MCP tool: ${name ?? 'missing name'}`);
  } catch (err) {
    return errorText(err instanceof Error ? err.message : String(err));
  }
}

function response(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function errorResponse(id: JsonRpcId | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleRequest(req: JsonRpcRequest) {
  if (req.id === undefined) return null;

  if (req.method === 'initialize') {
    return response(req.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'dojo-mcp', version: SERVER_VERSION },
    });
  }

  if (req.method === 'ping') {
    return response(req.id, {});
  }

  if (req.method === 'tools/list') {
    return response(req.id, { tools });
  }

  if (req.method === 'tools/call') {
    return response(req.id, await callTool(req.params));
  }

  return errorResponse(req.id, -32601, `Method not found: ${req.method ?? 'unknown'}`);
}

function writeMessage(message: unknown) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

let buffer = Buffer.alloc(0);

function readContentLength(header: string): number | null {
  const match = header.match(/content-length:\s*(\d+)/i);
  if (!match) return null;
  return Number(match[1]);
}

function pumpMessages() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const header = buffer.slice(0, headerEnd).toString('utf8');
    const length = readContentLength(header);
    if (!length || length < 0) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;

    const raw = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    void (async () => {
      try {
        const parsed = JSON.parse(raw) as JsonRpcRequest;
        const out = await handleRequest(parsed);
        if (out) writeMessage(out);
      } catch (err) {
        writeMessage(errorResponse(null, -32700, err instanceof Error ? err.message : 'Parse error'));
      }
    })();
  }
}

process.stdin.on('data', (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  pumpMessages();
});

process.stdin.resume();
