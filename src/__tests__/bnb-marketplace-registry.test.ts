import { afterEach, describe, expect, it, vi } from "vitest";
import { BNB_MARKETPLACE_AGENTS } from "@/lib/bnb-marketplace";
import { loadBnbMarketplaceAgent } from "@/lib/bnb-marketplace-registry";

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("BNB marketplace registry loader", () => {
  it("marks an exact registry identity and agent card live", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[0];
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          name: agent.name,
          token_id: String(agent.agentId),
          chain_id: 97,
          contract_address: agent.registryAddress,
          agent_wallet: agent.agentWallet,
          description: "Live registry description",
          created_tx_hash: `0x${"1".repeat(64)}`,
          updated_at: "2026-08-23T00:00:00Z",
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ name: agent.name, url: agent.sellerApiBaseUrl.replace("/api/seller", "/seller") }));

    const loaded = await loadBnbMarketplaceAgent(agent);
    expect(loaded.registryStatus).toBe("live");
    expect(loaded.endpointStatus).toBe("live");
    expect(loaded.summary).toBe("Live registry description");
  });

  it("fails closed when the registry wallet does not match", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[0];
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          name: agent.name,
          token_id: String(agent.agentId),
          chain_id: 97,
          contract_address: agent.registryAddress,
          agent_wallet: "0x0000000000000000000000000000000000000001",
          description: agent.summary,
          created_tx_hash: `0x${"2".repeat(64)}`,
          updated_at: null,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ name: agent.name, url: agent.sellerApiBaseUrl.replace("/api/seller", "/seller") }));

    const loaded = await loadBnbMarketplaceAgent(agent);
    expect(loaded.registryStatus).toBe("unavailable");
    expect(loaded.endpointStatus).toBe("unavailable");
    expect(loaded.createdTxHash).toBeNull();
  });

  it("fails closed and cancels an oversized streamed registry response", async () => {
    const agent = BNB_MARKETPLACE_AGENTS[0];
    const encoder = new TextEncoder();
    const chunks = ["x".repeat(60_000), "y".repeat(40_001), "z".repeat(60_000)];
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(body, { status: 200, headers: { "content-length": "1" } }))
      .mockResolvedValueOnce(jsonResponse({ name: agent.name, url: agent.sellerApiBaseUrl.replace("/api/seller", "/seller") }));

    const loaded = await loadBnbMarketplaceAgent(agent);
    expect(loaded.registryStatus).toBe("unavailable");
    expect(loaded.endpointStatus).toBe("unavailable");
    expect(cancelled).toBe(true);
  });
});
