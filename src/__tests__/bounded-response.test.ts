import { describe, expect, it } from "vitest";
import { readBoundedResponseText, readCreatorResponseText } from "@/lib/creator-response";

describe("bounded response reader", () => {
  it("preserves a legitimate streamed response under the byte limit", async () => {
    const response = new Response(JSON.stringify({ status: "accepted", message: "測試" }));

    await expect(readBoundedResponseText(response, 100, "too large")).resolves.toEqual({
      ok: true,
      text: JSON.stringify({ status: "accepted", message: "測試" }),
    });
  });

  it("rejects a declared oversized response without consuming the body", async () => {
    const response = new Response("{}", { headers: { "content-length": "101" } });

    await expect(readBoundedResponseText(response, 100, "too large")).resolves.toEqual({
      ok: false,
      text: "",
      error: "too large",
    });
    expect(response.bodyUsed).toBe(false);
  });

  it("cancels a streamed response that exceeds the limit despite a misleading header", async () => {
    const encoder = new TextEncoder();
    const chunks = ["12345", "67890", "should-not-be-buffered"];
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
    const response = new Response(body, { headers: { "content-length": "1" } });

    await expect(readBoundedResponseText(response, 9, "too large")).resolves.toEqual({
      ok: false,
      text: "",
      error: "too large",
    });
    expect(cancelled).toBe(true);
  });

  it("keeps the creator response compatibility wrapper", async () => {
    const response = new Response("oversized", { headers: { "content-length": "10" } });

    await expect(readCreatorResponseText(response, 9)).resolves.toEqual({
      ok: false,
      text: "",
      error: "Creator response exceeds 9 bytes",
    });
  });
});
