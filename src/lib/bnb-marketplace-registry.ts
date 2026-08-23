import { z } from "zod";
import { BNB_MARKETPLACE_AGENTS, type BnbMarketplaceAgent } from "@/lib/bnb-marketplace";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const registryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    name: z.string().min(1), token_id: z.string(), chain_id: z.number(), contract_address: addressSchema,
    agent_wallet: addressSchema, description: z.string().min(1), created_tx_hash: hashSchema, updated_at: z.string().nullable(),
  }),
});
const agentCardSchema = z.object({ name: z.string().min(1), url: z.string().url() });

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

async function checkedJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(8_000), next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  const text = await response.text();
  if (text.length > 100_000) throw new Error("Upstream response too large");
  return JSON.parse(text) as unknown;
}

export async function loadBnbMarketplaceAgent(agent: BnbMarketplaceAgent): Promise<BnbMarketplaceAgent> {
  try {
    const headers: HeadersInit = {};
    const apiKey = process.env.API_8004SCAN_KEY?.trim();
    if (apiKey) headers["X-API-Key"] = apiKey;
    const [registryRaw, cardRaw] = await Promise.all([
      checkedJson(`https://8004scan.io/api/v1/public/agents/${agent.chainId}/${agent.agentId}`, { headers }),
      checkedJson(agent.agentCardUrl),
    ]);
    const registry = registryResponseSchema.parse(registryRaw).data;
    const card = agentCardSchema.parse(cardRaw);
    if (
      registry.chain_id !== agent.chainId || registry.token_id !== String(agent.agentId) ||
      !sameAddress(registry.contract_address, agent.registryAddress) || !sameAddress(registry.agent_wallet, agent.agentWallet) ||
      card.name !== agent.name || new URL(card.url).origin !== new URL(agent.agentCardUrl).origin
    ) throw new Error("Registry identity mismatch");

    return {
      ...agent, name: registry.name, summary: registry.description, registryStatus: "live", endpointStatus: "live",
      registryUpdatedAt: registry.updated_at, createdTxHash: registry.created_tx_hash as `0x${string}`,
    };
  } catch {
    return { ...agent, registryStatus: "unavailable", endpointStatus: "unavailable", registryUpdatedAt: null, createdTxHash: null };
  }
}

export async function loadBnbMarketplaceAgents() {
  return Promise.all(BNB_MARKETPLACE_AGENTS.map(loadBnbMarketplaceAgent));
}
