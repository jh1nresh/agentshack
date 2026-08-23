import { afterEach, describe, expect, it, vi } from "vitest";
import { activationRequestSchema, dispatchTestnetActivation } from "@/lib/bnb-marketplace-activation";
import { BNB_MARKETPLACE_AGENTS } from "@/lib/bnb-marketplace";

afterEach(() => vi.restoreAllMocks());

describe("BNB marketplace activation boundary", () => {
  it("accepts only the curated slug and never a caller supplied endpoint", async () => {
    expect(activationRequestSchema.safeParse({ action: "quote", slug: "studio-desk-grid", endpoint: "https://evil.example" }).success).toBe(false);
    await expect(dispatchTestnetActivation({ action: "quote", slug: "missing" })).rejects.toThrow("Unknown BSC Testnet agent");
  });

  it("proxies a quote only to the curated testnet seller and validates its wallet", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[1];
    const quote = {
      quoteHash: `0x${"a".repeat(64)}`,
      feeAmount: "1200000000000000",
      wallet: agent.agentWallet,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(quote), { status: 200 }),
    );

    const result = await dispatchTestnetActivation({ action: "quote", slug: agent.slug });
    expect(result.chainId).toBe(97);
    expect(fetchMock).toHaveBeenCalledWith(`${agent.sellerApiBaseUrl}/quote`, expect.objectContaining({
      method: "POST", redirect: "error", cache: "no-store",
    }));
  });

  it("rejects a signed quote from a wallet outside the registry identity", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      quoteHash: `0x${"b".repeat(64)}`,
      feeAmount: "1",
      wallet: "0x0000000000000000000000000000000000000001",
    }), { status: 200 }));

    await expect(dispatchTestnetActivation({ action: "quote", slug: BNB_MARKETPLACE_AGENTS[0].slug }))
      .rejects.toThrow("Quote wallet does not match registry identity");
  });

  it("rejects a quote above the curated testnet fee cap", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[0];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      quoteHash: `0x${"d".repeat(64)}`,
      feeAmount: (BigInt(agent.maxFeeAmount) + 1n).toString(),
      wallet: agent.agentWallet,
    }), { status: 200 }));

    await expect(dispatchTestnetActivation({ action: "quote", slug: agent.slug }))
      .rejects.toThrow("Quote exceeds the curated testnet fee cap");
  });

  it("notifies delivery only with a funded job id and quote hash", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[3];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "accepted", receipt: { jobId: "42" } }), { status: 200 }),
    );
    const quoteHash = `0x${"c".repeat(64)}` as `0x${string}`;

    await dispatchTestnetActivation({ action: "notify_funded", slug: agent.slug, jobId: "42", quoteHash });
    expect(fetchMock).toHaveBeenCalledWith(`${agent.sellerApiBaseUrl}/notify_funded`, expect.objectContaining({
      body: JSON.stringify({ jobId: "42", quoteHash, dryRun: false, amount: "1" }),
    }));
  });
});
