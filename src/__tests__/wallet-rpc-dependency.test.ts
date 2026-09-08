import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";

const require = createRequire(import.meta.url);
const solanaRequire = createRequire(require.resolve("@solana/web3.js"));

describe("wallet SDK RPC dependency compatibility", () => {
  it("resolves the compatible Jayson pin without stream-json", () => {
    const jayson = solanaRequire("jayson/package.json");
    expect(jayson.version).toBe("4.1.3");
    expect(jayson.dependencies["stream-json"]).toBeUndefined();
  });

  it("round-trips the SDK's real JSON-RPC client with a mocked transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request).toMatchObject({
        jsonrpc: "2.0", method: "getBalance",
        params: ["11111111111111111111111111111111", { commitment: "confirmed" }],
      });
      expect(typeof request.id).toBe("string");
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { context: { slot: 1 }, value: 42 } }));
    });
    const client = new Connection("https://rpc.invalid", { commitment: "confirmed", fetch: fetchMock });
    await expect(client.getBalance(new PublicKey("11111111111111111111111111111111"))).resolves.toBe(42);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["not json", JSON.stringify({ jsonrpc: "2.0", id: "1", error: { code: -32602, message: "Invalid params" } })])(
    "rejects invalid RPC replies without reporting a balance: %s", async (body) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      const client = new Connection("https://rpc.invalid", { fetch: fetchMock });
      await expect(client.getBalance(new PublicKey("11111111111111111111111111111111"))).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});
