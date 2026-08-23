import { z } from "zod";
import { getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { readBoundedResponseText } from "@/lib/creator-response";

const quoteHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const activationRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), slug: z.string().min(1).max(80) }).strict(),
  z.object({
    action: z.literal("notify_funded"), slug: z.string().min(1).max(80),
    jobId: z.string().regex(/^\d{1,78}$/), quoteHash: quoteHashSchema,
  }).strict(),
]);

const quoteSchema = z.object({
  quoteHash: quoteHashSchema,
  feeAmount: z.string().min(1).max(78).regex(/^\d+$/),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
}).passthrough();

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const read = await readBoundedResponseText(response, 100_000, "Agent response exceeded 100 KB");
  if (!read.ok) throw new Error(read.error);
  let parsed: unknown;
  try { parsed = JSON.parse(read.text); } catch { throw new Error("Agent returned invalid JSON"); }
  if (!response.ok) throw new Error(`Agent request failed (${response.status})`);
  return parsed;
}

export async function dispatchTestnetActivation(input: z.infer<typeof activationRequestSchema>) {
  const agent = getBnbMarketplaceAgent(input.slug);
  if (!agent || agent.chainId !== 97) throw new Error("Unknown BSC Testnet agent");

  if (input.action === "quote") {
    const quote = quoteSchema.parse(await postJson(`${agent.sellerApiBaseUrl}/quote`, {}));
    if (!sameAddress(quote.wallet, agent.agentWallet)) throw new Error("Quote wallet does not match registry identity");
    const feeAmount = BigInt(quote.feeAmount);
    if (feeAmount <= 0n || feeAmount > BigInt(agent.maxFeeAmount)) throw new Error("Quote exceeds the curated testnet fee cap");
    return { action: input.action, agentId: agent.agentId, chainId: agent.chainId, quote };
  }

  const result = await postJson(`${agent.sellerApiBaseUrl}/notify_funded`, {
    jobId: input.jobId, quoteHash: input.quoteHash, dryRun: false, amount: "1",
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Agent returned an invalid receipt");
  return { action: input.action, agentId: agent.agentId, chainId: agent.chainId, result };
}
