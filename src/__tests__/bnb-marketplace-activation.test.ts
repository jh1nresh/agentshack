import { afterEach, describe, expect, it, vi } from "vitest";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activationRequestSchema, dispatchTestnetActivation } from "@/lib/bnb-marketplace-activation";
import { getMarketplaceActivationAction } from "@/lib/bnb-marketplace-activation-flow";
import * as marketplace from "@/lib/bnb-marketplace";
import quotes from "./fixtures/bnb-seller-quotes.json";

afterEach(() => vi.restoreAllMocks());
const agents = marketplace.BNB_MARKETPLACE_AGENTS;
const seed = 0x81838004;
const cases = 128;
function randomGenerator() {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}
function respond(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
}
function hashTerms(quote: typeof quotes[number]) {
  const { quoteHash: _hash, signature: _sig, ...terms } = quote;
  return keccak256(toBytes(JSON.stringify(Object.fromEntries(Object.keys(terms).sort().map((key) => [key, terms[key as keyof typeof terms]])))));
}

describe("BNB marketplace activation boundary", () => {
  it.each([0, 1, 2, 3])("verifies real seller v1 signed quote fixture %i without a wallet field", async (index) => {
    const agent = agents[index];
    const fetchMock = respond(quotes[index]);
    const result = await dispatchTestnetActivation({ action: "quote", slug: agent.slug });
    expect(result.quote?.wallet).toBe(agent.agentWallet);
    expect(result.quote?.feeAmount).toBe(quotes[index].feeAmount);
    expect(fetchMock).toHaveBeenCalledWith(agent.sellerApiBaseUrl + "/quote", expect.objectContaining({
      redirect: "error", cache: "no-store",
    }));
  });

  it("accepts reordered quote fields without changing the signed content", async () => {
    respond(Object.fromEntries(Object.entries(quotes[0]).reverse()));
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).resolves.toMatchObject({ chainId: 97 });
  });

  it("rejects unknown agents and caller-controlled endpoints before fetching", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const random = randomGenerator();
    for (let index = 0; index < cases; index++) {
      const request = index % 2 === 0
        ? { action: "quote", slug: agents[index % 4].slug }
        : { action: "notify_funded", slug: agents[index % 4].slug, jobId: "42", quoteHash: quotes[index % 4].quoteHash };
      const payload = { ...request, endpoint: `https://attacker-${random()}.example` };
      expect(activationRequestSchema.safeParse(payload).success, `seed=${seed} case=${index}`).toBe(false);
      await expect(dispatchTestnetActivation({ action: "quote", slug: `missing-${random()}` })).rejects.toThrow("Unknown BSC Testnet agent");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("property: rejects malformed hashes and job identifiers", () => {
    const random = randomGenerator();
    for (let index = 0; index < cases; index++) {
      const quoteHash = ["0x" + "a".repeat(63), "0x" + "a".repeat(65), "0x" + "g".repeat(64)][index % 3];
      const jobId = ["0x1", "-" + random(), "1e6", "9".repeat(79 + index)][index % 4];
      const valid = { action: "notify_funded", slug: agents[0].slug, jobId: "42", quoteHash: quotes[0].quoteHash };
      expect(activationRequestSchema.safeParse({ ...valid, quoteHash }).success).toBe(false);
      expect(activationRequestSchema.safeParse({ ...valid, jobId }).success).toBe(false);
    }
  });

  it.each([
    { chainId: 56 }, { agentId: 1881 }, { typedSelector: "swapAnything" },
    { commerce: "0x0000000000000000000000000000000000000001" },
    { policy: "0x0000000000000000000000000000000000000001" },
    { feeToken: "0x0000000000000000000000000000000000000001" },
  ])("rejects changed chain, identity or payment targets: %j", async (change) => {
    respond({ ...quotes[0], ...change });
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow();
  });

  it("rejects modified terms even when the original signature is retained", async () => {
    respond({ ...quotes[0], terms: "Different terms" });
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow("Quote hash does not match its terms");
  });

  it("rejects recomputed terms signed by a different agent", async () => {
    const forged = { ...quotes[0], feeAmount: "1", signature: quotes[1].signature };
    forged.quoteHash = hashTerms(forged);
    respond(forged);
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow("Quote signature does not match registry identity");
  });

  it("rejects unsigned legacy wallet claims", async () => {
    respond({ quoteHash: quotes[0].quoteHash, feeAmount: "1", wallet: agents[0].agentWallet });
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow();
  });

  it("property: validates positive under-cap fees with real test signatures", async () => {
    // Public deterministic test key, never funded or used outside these unit tests.
    const signer = privateKeyToAccount("0x" + "1".repeat(64) as `0x${string}`);
    vi.spyOn(marketplace, "getBnbMarketplaceAgent").mockImplementation((slug) => {
      const agent = agents.find((item) => item.slug === slug);
      return agent ? { ...agent, agentWallet: signer.address } : undefined;
    });
    const random = randomGenerator();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (let index = 0; index < cases; index++) {
      const agent = agents[index % 4];
      const amount = ((BigInt(random()) << 32n) | BigInt(random())) % BigInt(agent.maxFeeAmount) + 1n;
      const quote = { ...quotes[index % 4], feeAmount: amount.toString() };
      if (index < 4) quote.feeAmount = agent.maxFeeAmount;
      quote.quoteHash = hashTerms(quote);
      quote.signature = await signer.signMessage({ message: { raw: quote.quoteHash as `0x${string}` } });
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(quote)));
      const result = await dispatchTestnetActivation({ action: "quote", slug: agent.slug });
      expect(result.quote?.feeAmount, `seed=${seed} case=${index}`).toBe(quote.feeAmount);
    }
  });

  it("property: rejects zero, over-cap and oversized fees", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (let index = 0; index < cases; index++) {
      const agent = agents[index % 4];
      const feeAmount = index % 3 === 0 ? "0" : index % 3 === 1
        ? (BigInt(agent.maxFeeAmount) + 1n + BigInt(index)).toString() : "9".repeat(79 + index);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...quotes[index % 4], feeAmount })));
      await expect(dispatchTestnetActivation({ action: "quote", slug: agent.slug })).rejects.toThrow();
    }
  });

  it("property: rejects malformed seller hashes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (let index = 0; index < cases; index++) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...quotes[0], quoteHash: "0x" + "a".repeat(65 + index) })));
      await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow();
    }
  });

  it("cancels oversized seller streams", async () => {
    const cancel = vi.fn();
    const chunks = [new Uint8Array(60_000), new Uint8Array(40_001), new Uint8Array(60_000)];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) controller.enqueue(chunk);
        else controller.close();
      },
      cancel,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { headers: { "content-length": "1" } }));
    await expect(dispatchTestnetActivation({ action: "quote", slug: agents[0].slug })).rejects.toThrow("Agent response exceeded 100 KB");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("forwards a delivery notification without asserting seller-side settlement", async () => {
    const fetchMock = respond({ status: "accepted", receipt: { jobId: "42" } });
    await dispatchTestnetActivation({ action: "notify_funded", slug: agents[0].slug, jobId: "42", quoteHash: quotes[0].quoteHash });
    expect(fetchMock).toHaveBeenCalledWith(agents[0].sellerApiBaseUrl + "/notify_funded", expect.objectContaining({
      body: JSON.stringify({ jobId: "42", quoteHash: quotes[0].quoteHash, dryRun: false, amount: "1" }),
    }));
  });

  it("property: retries confirmed funded jobs at delivery without funding again", () => {
    expect(getMarketplaceActivationAction(false, null)).toBe("quote");
    expect(getMarketplaceActivationAction(true, null)).toBe("fund");
    const random = randomGenerator();
    for (let index = 0; index < cases; index++) {
      expect(getMarketplaceActivationAction(true, String(random()))).toBe("notify");
    }
  });
});
