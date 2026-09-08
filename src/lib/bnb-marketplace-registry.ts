import { z } from "zod";
import { createPublicClient, http, parseAbi } from "viem";
import { BNB_MARKETPLACE_AGENTS, type BnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { BNB_MARKETPLACE_CHAIN } from "@/lib/bnb-marketplace-chain";
import { readBoundedResponseText } from "@/lib/creator-response";

const registryAbi = parseAbi([
  "function getAgentWallet(uint256 agentId) view returns(address)",
  "function tokenURI(uint256 agentId) view returns(string)",
]);
const client = createPublicClient({
  chain: BNB_MARKETPLACE_CHAIN,
  transport: http(undefined, { timeout: 8_000, retryCount: 0 }),
});
const metadataSchema = z.object({
  name: z.string().min(1), description: z.string().min(1), chainId: z.literal(97),
  identityRegistry: z.string(),
  endpoints: z.array(z.object({ name: z.string(), endpoint: z.string().url() })),
});
const agentCardSchema = z.object({ name: z.string().min(1), url: z.string().url() });

export async function loadBnbMarketplaceAgent(agent: BnbMarketplaceAgent): Promise<BnbMarketplaceAgent> {
  try {
    const [chainId, wallet, uri] = await Promise.all([
      client.getChainId(),
      client.readContract({ address: agent.registryAddress, abi: registryAbi, functionName: "getAgentWallet", args: [BigInt(agent.agentId)] }),
      client.readContract({ address: agent.registryAddress, abi: registryAbi, functionName: "tokenURI", args: [BigInt(agent.agentId)] }),
    ]);
    if (chainId !== agent.chainId || wallet.toLowerCase() !== agent.agentWallet.toLowerCase()) {
      throw new Error("Registry identity mismatch");
    }
    // These curated identities use onchain data URIs. Never fetch arbitrary tokenURI URLs.
    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix) || uri.length > 100_000) throw new Error("Unsupported registry metadata");
    const metadata = metadataSchema.parse(JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString("utf8")));
    const sellerUrl = agent.agentCardUrl.replace("/.well-known/agent-card.json", "");
    if (
      metadata.name !== agent.name || metadata.identityRegistry.toLowerCase() !== agent.registryAddress.toLowerCase() ||
      !metadata.endpoints.some((endpoint) => endpoint.name === "A2A" && endpoint.endpoint === agent.agentCardUrl) ||
      !metadata.endpoints.some((endpoint) => endpoint.name === "HTTP" && endpoint.endpoint === sellerUrl)
    ) throw new Error("Registry endpoint mismatch");

    const response = await fetch(agent.agentCardUrl, {
      redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    const read = await readBoundedResponseText(response, 100_000, "Upstream response too large");
    if (!read.ok) throw new Error(read.error);
    const card = agentCardSchema.parse(JSON.parse(read.text));
    if (card.name !== agent.name || card.url !== sellerUrl) throw new Error("Agent card mismatch");

    return {
      ...agent, summary: metadata.description, registryStatus: "live", endpointStatus: "live",
      registryUpdatedAt: null, createdTxHash: null,
    };
  } catch {
    return { ...agent, registryStatus: "unavailable", endpointStatus: "unavailable", registryUpdatedAt: null, createdTxHash: null };
  }
}

export async function loadBnbMarketplaceAgents() {
  return Promise.all(BNB_MARKETPLACE_AGENTS.map(loadBnbMarketplaceAgent));
}
