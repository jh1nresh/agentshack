import { afterEach, describe, expect, it, vi } from "vitest";
import { activationRequestSchema, dispatchTestnetActivation } from "@/lib/bnb-marketplace-activation";
import { BNB_MARKETPLACE_AGENTS } from "@/lib/bnb-marketplace";

afterEach(() => vi.restoreAllMocks());

const FUZZ_SEED = 0x8183_8004;
const FUZZ_CASES = 128;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomString(random: () => number, alphabet: string, length: number) {
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

function randomPositiveBigInt(random: () => number, max: bigint) {
  const high = BigInt(Math.floor(random() * 0x1_0000_0000));
  const low = BigInt(Math.floor(random() * 0x1_0000_0000));
  return ((high << 32n) | low) % max + 1n;
}

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

  it("property: rejects caller-controlled endpoint fields and unknown seller slugs", async () => {
    const random = seededRandom(FUZZ_SEED);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (let index = 0; index < FUZZ_CASES; index++) {
      const host = randomString(random, "abcdefghijklmnopqrstuvwxyz0123456789", 12);
      const endpoint = `https://${host}.example/api/${index}`;
      const agent = BNB_MARKETPLACE_AGENTS[index % BNB_MARKETPLACE_AGENTS.length];
      const payload = index % 2 === 0
        ? { action: "quote", slug: agent.slug, endpoint }
        : { action: "notify_funded", slug: agent.slug, jobId: String(index + 1), quoteHash: `0x${"a".repeat(64)}`, endpoint };

      expect(
        activationRequestSchema.safeParse(payload).success,
        `seed=${FUZZ_SEED} case=${index} endpoint=${endpoint}`,
      ).toBe(false);

      const unknownSlug = `fuzz-${randomString(random, "abcdefghijklmnopqrstuvwxyz0123456789-", 24)}`;
      await expect(dispatchTestnetActivation({ action: "quote", slug: unknownSlug }))
        .rejects.toThrow("Unknown BSC Testnet agent");
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("property: rejects malformed quote hashes and job identifiers", () => {
    const random = seededRandom(FUZZ_SEED ^ 0x51a7);
    const validSlug = BNB_MARKETPLACE_AGENTS[0].slug;

    for (let index = 0; index < FUZZ_CASES; index++) {
      const invalidHash = index % 3 === 0
        ? `0x${randomString(random, "0123456789abcdef", 63)}`
        : index % 3 === 1
          ? `0x${randomString(random, "0123456789abcdef", 65)}`
          : `0x${randomString(random, "ghijklmnopqrstuvwxyz", 64)}`;
      const invalidJobId = index % 4 === 0
        ? "0x1"
        : index % 4 === 1
          ? "-1"
          : index % 4 === 2
            ? "1e6"
            : randomString(random, "0123456789", 79 + (index % 32));

      expect(
        activationRequestSchema.safeParse({ action: "notify_funded", slug: validSlug, jobId: "1", quoteHash: invalidHash }).success,
        `seed=${FUZZ_SEED ^ 0x51a7} case=${index} hash=${invalidHash}`,
      ).toBe(false);
      expect(
        activationRequestSchema.safeParse({ action: "notify_funded", slug: validSlug, jobId: invalidJobId, quoteHash: `0x${"b".repeat(64)}` }).success,
        `seed=${FUZZ_SEED ^ 0x51a7} case=${index} jobId=${invalidJobId}`,
      ).toBe(false);
    }
  });

  it("property: accepts positive fees at or below each curated cap", async () => {
    const random = seededRandom(FUZZ_SEED ^ 0xfee);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (let index = 0; index < FUZZ_CASES; index++) {
      const agent = BNB_MARKETPLACE_AGENTS[index % BNB_MARKETPLACE_AGENTS.length];
      const feeAmount = randomPositiveBigInt(random, BigInt(agent.maxFeeAmount)).toString();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        quoteHash: `0x${"c".repeat(64)}`,
        feeAmount,
        wallet: agent.agentWallet,
      }), { status: 200 }));

      const result = await dispatchTestnetActivation({ action: "quote", slug: agent.slug });
      expect(result.quote?.feeAmount, `seed=${FUZZ_SEED ^ 0xfee} case=${index}`).toBe(feeAmount);
    }
  });

  it("property: rejects over-cap and oversized fee strings", async () => {
    const random = seededRandom(FUZZ_SEED ^ 0xbadfee);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (let index = 0; index < FUZZ_CASES; index++) {
      const agent = BNB_MARKETPLACE_AGENTS[index % BNB_MARKETPLACE_AGENTS.length];
      const feeAmount = index % 2 === 0
        ? (BigInt(agent.maxFeeAmount) + 1n + BigInt(index)).toString()
        : randomString(random, "123456789", 79 + (index % 82));
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        quoteHash: `0x${"d".repeat(64)}`,
        feeAmount,
        wallet: agent.agentWallet,
      }), { status: 200 }));

      await expect(dispatchTestnetActivation({ action: "quote", slug: agent.slug }))
        .rejects.toThrow();
    }
  });

  it("property: rejects malformed quote hashes returned by a seller", async () => {
    const random = seededRandom(FUZZ_SEED ^ 0x4a5a);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    for (let index = 0; index < FUZZ_CASES; index++) {
      const agent = BNB_MARKETPLACE_AGENTS[index % BNB_MARKETPLACE_AGENTS.length];
      const quoteHash = index % 3 === 0
        ? `0x${randomString(random, "0123456789abcdef", 63)}`
        : index % 3 === 1
          ? `0x${randomString(random, "0123456789abcdef", 65)}`
          : randomString(random, "0123456789abcdef", 64);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        quoteHash,
        feeAmount: "1",
        wallet: agent.agentWallet,
      }), { status: 200 }));

      await expect(dispatchTestnetActivation({ action: "quote", slug: agent.slug }))
        .rejects.toThrow();
    }
  });
});
