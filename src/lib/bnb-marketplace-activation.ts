import { z } from "zod";
import { keccak256, toBytes, verifyMessage, type Hex } from "viem";
import { getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { BNB_MARKETPLACE_CONTRACTS } from "@/lib/bnb-marketplace-chain";
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
  version: z.literal(1), chainId: z.literal(97), agentId: z.number().int().positive(),
  commerce: z.string(), policy: z.string(), feeToken: z.string(),
  category: z.string().min(1), terms: z.string().min(1), typedSelector: z.string().min(1),
  quoteHash: quoteHashSchema,
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/),
  feeAmount: z.string().min(1).max(78).regex(/^\d+$/),
}).strict();

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
    if (
      quote.agentId !== agent.agentId || quote.typedSelector !== agent.selector ||
      !sameAddress(quote.commerce, BNB_MARKETPLACE_CONTRACTS.commerce) ||
      !sameAddress(quote.policy, BNB_MARKETPLACE_CONTRACTS.policy) ||
      !sameAddress(quote.feeToken, BNB_MARKETPLACE_CONTRACTS.paymentToken)
    ) throw new Error("Quote does not match the curated testnet job");
    const feeAmount = BigInt(quote.feeAmount);
    if (feeAmount <= 0n || feeAmount > BigInt(agent.maxFeeAmount)) throw new Error("Quote exceeds the curated testnet fee cap");
    const { quoteHash, signature, ...terms } = quote;
    // Seller v1 signs the keccak256 of its flat terms object with sorted keys.
    const canonicalTerms = Object.fromEntries(Object.keys(terms).sort().map((key) => [key, terms[key as keyof typeof terms]]));
    if (keccak256(toBytes(JSON.stringify(canonicalTerms))) !== quoteHash.toLowerCase()) throw new Error("Quote hash does not match its terms");
    if (!await verifyMessage({ address: agent.agentWallet, message: { raw: quoteHash as Hex }, signature: signature as Hex })) {
      throw new Error("Quote signature does not match registry identity");
    }
    return { action: input.action, agentId: agent.agentId, chainId: agent.chainId, quote: { ...quote, wallet: agent.agentWallet } };
  }

  const result = await postJson(`${agent.sellerApiBaseUrl}/notify_funded`, {
    jobId: input.jobId, quoteHash: input.quoteHash, dryRun: false, amount: "1",
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Agent returned an invalid receipt");
  return { action: input.action, agentId: agent.agentId, chainId: agent.chainId, result };
}
