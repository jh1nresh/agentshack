import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BNB_MARKETPLACE_AGENTS } from "@/lib/bnb-marketplace";
import { loadBnbMarketplaceAgent } from "@/lib/bnb-marketplace-registry";

const rpc = vi.hoisted(() => ({ getChainId: vi.fn(), readContract: vi.fn() }));
vi.mock("viem", async (importOriginal) => ({
  ...await importOriginal<typeof import("viem")>(),
  createPublicClient: () => rpc,
}));
afterEach(() => vi.restoreAllMocks());

const agent = BNB_MARKETPLACE_AGENTS[0];
const sellerUrl = agent.agentCardUrl.replace("/.well-known/agent-card.json", "");
function metadata(overrides: Record<string, unknown> = {}) {
  return {
    name: agent.name, description: "Onchain registry description", chainId: 97,
    identityRegistry: agent.registryAddress,
    endpoints: [
      { name: "HTTP", endpoint: sellerUrl },
      { name: "A2A", endpoint: agent.agentCardUrl },
    ],
    ...overrides,
  };
}
function dataUri(body: unknown) {
  return "data:application/json;base64," + Buffer.from(JSON.stringify(body)).toString("base64");
}
function mockIdentity(uri = dataUri(metadata()), wallet = agent.agentWallet) {
  rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
    functionName === "getAgentWallet" ? wallet : uri);
}
beforeEach(() => {
  rpc.getChainId.mockReset().mockResolvedValue(97);
  rpc.readContract.mockReset();
  mockIdentity();
});
function cardResponse(body: unknown = { name: agent.name, url: sellerUrl }) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("BNB marketplace registry loader", () => {
  it("verifies the onchain wallet and exact endpoints without an indexer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(cardResponse());
    const loaded = await loadBnbMarketplaceAgent(agent);
    expect(loaded.registryStatus).toBe("live");
    expect(loaded.endpointStatus).toBe("live");
    expect(loaded.summary).toBe("Onchain registry description");
    expect(loaded.createdTxHash).toBeNull();
    expect(loaded.registryUpdatedAt).toBeNull();
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: agent.registryAddress, functionName: "getAgentWallet", args: [1880n],
    }));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(agent.agentCardUrl, expect.objectContaining({
      redirect: "error", cache: "no-store",
    }));
  });

  it("rejects a wallet mismatch before contacting the seller", async () => {
    mockIdentity(dataUri(metadata()), "0x0000000000000000000000000000000000000001");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await loadBnbMarketplaceAgent(agent)).registryStatus).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong RPC chain and fails closed on RPC errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    rpc.getChainId.mockResolvedValueOnce(56);
    expect((await loadBnbMarketplaceAgent(agent)).registryStatus).toBe("unavailable");
    rpc.readContract.mockRejectedValueOnce(new Error("RPC unavailable"));
    expect((await loadBnbMarketplaceAgent(agent)).registryStatus).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { chainId: 56 },
    { name: "Different agent" },
    { identityRegistry: "0x0000000000000000000000000000000000000001" },
    { endpoints: [{ name: "A2A", endpoint: "https://evil.example/card.json" }] },
    { endpoints: [{ name: "A2A", endpoint: agent.agentCardUrl }, { name: "HTTP", endpoint: sellerUrl + "1" }] },
  ])("rejects changed onchain identity metadata: %j", async (overrides) => {
    mockIdentity(dataUri(metadata(overrides)));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    expect((await loadBnbMarketplaceAgent(agent)).registryStatus).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example/metadata", "data:application/json;base64,e30=", "data:application/json;base64," + "a".repeat(100_000)])(
    "rejects unsupported, malformed or oversized tokenURI without fetching it",
    async (uri) => {
      mockIdentity(uri);
      const fetchMock = vi.spyOn(globalThis, "fetch");
      expect((await loadBnbMarketplaceAgent(agent)).registryStatus).toBe("unavailable");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { name: "Different agent", url: sellerUrl },
    { name: agent.name, url: sellerUrl + "1" },
    { name: agent.name, url: "https://evil.example/seller/1880" },
  ])("rejects card identity/path changes: %j", async (card) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(cardResponse(card));
    expect((await loadBnbMarketplaceAgent(agent)).endpointStatus).toBe("unavailable");
  });

  it("cancels an oversized streamed card even with a misleading content length", async () => {
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
    const loaded = await loadBnbMarketplaceAgent(agent);
    expect(loaded.registryStatus).toBe("unavailable");
    expect(loaded.endpointStatus).toBe("unavailable");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
