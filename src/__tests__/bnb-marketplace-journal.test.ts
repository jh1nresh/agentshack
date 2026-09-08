import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, type Hash } from "viem";
import { BNB_MARKETPLACE_AGENTS } from "@/lib/bnb-marketplace";
import { BNB_MARKETPLACE_CONTRACTS as contracts, bnbMarketplaceCommerceAbi } from "@/lib/bnb-marketplace-chain";
import { boundedSellerResponse, journalKey, jobStatus, readMarketJobs, saveMarketJob, withMarketJobLock, type JournalStorage, type MarketJob } from "@/lib/bnb-marketplace-journal";
import { verifyFundedMarketJob } from "@/lib/bnb-marketplace-recovery";

const buyer = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const createHash = `0x${"a".repeat(64)}` as Hash;
const fundHash = `0x${"b".repeat(64)}` as Hash;
afterEach(() => vi.unstubAllGlobals());
function fixture(index = 0): MarketJob {
  const agent = BNB_MARKETPLACE_AGENTS[index];
  return { id: "d631ef01-7c40-4015-a02a-c52f2cec68c6", wallet: buyer, chainId: 97, slug: agent.slug,
    quote: { quoteHash: `0x${"c".repeat(64)}`, feeAmount: agent.maxFeeAmount, wallet: agent.agentWallet }, jobId: "42",
    transactions: [{ hash: createHash, state: "confirmed" }, null, null, null, { hash: fundHash, state: "submitted" }],
    delivery: "not-requested", createdAt: 1788860000000, updatedAt: 1788860000000 };
}
function storage(): JournalStorage {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
function chain(job: MarketJob) {
  const agent = BNB_MARKETPLACE_AGENTS.find(a => a.slug === job.slug)!;
  const description = JSON.stringify({ version: 1, chainId: 97, agentId: agent.agentId, typedSelector: agent.selector, policy: contracts.policy, quoteHash: job.quote.quoteHash });
  const create = { hash: createHash, chainId: 97, from: buyer, to: contracts.commerce, value: 0n,
    input: encodeFunctionData({ abi: bnbMarketplaceCommerceAbi, functionName: "createJob", args: [agent.agentWallet, contracts.router, 2000000000n, description, contracts.router] }) };
  const fund = { hash: fundHash, chainId: 97, from: buyer, to: contracts.commerce, value: 0n,
    input: encodeFunctionData({ abi: bnbMarketplaceCommerceAbi, functionName: "fund", args: [42n, BigInt(job.quote.feeAmount), "0x"] }) };
  const event = { address: contracts.commerce,
    topics: encodeEventTopics({ abi: bnbMarketplaceCommerceAbi, eventName: "JobCreated", args: { jobId: 42n, client: buyer, provider: agent.agentWallet } }),
    data: encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "address" }], [contracts.router, 2000000000n, contracts.router]),
    blockNumber: 10n, transactionHash: createHash, logIndex: 0, transactionIndex: 0, blockHash: createHash, removed: false };
  const createReceipt = { status: "success", transactionHash: createHash, blockNumber: 10n, logs: [event] };
  const fundReceipt = { status: "success", transactionHash: fundHash, blockNumber: 11n, logs: [] };
  const reader = {
    getChainId: vi.fn(async () => 97),
    getTransaction: vi.fn(async ({ hash }: { hash: string }) => hash === createHash ? create : fund),
    getTransactionReceipt: vi.fn(async ({ hash }: { hash: string }) => hash === createHash ? createReceipt : fundReceipt),
  };
  return { create, fund, event, createReceipt, fundReceipt, reader: reader as unknown as Parameters<typeof verifyFundedMarketJob>[0] };
}

describe("wallet-scoped browser job journal", () => {
  it("rejects a second tab's operation while the wallet lock is held", async () => {
    vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, callback: (lock: null) => unknown) => callback(null) } });
    const operation = vi.fn();
    await expect(withMarketJobLock(buyer, operation)).rejects.toThrow("Another tab");
    expect(operation).not.toHaveBeenCalled();
  });
  it("fails closed without Web Locks instead of silently allowing concurrent payment flows", async () => {
    vi.stubGlobal("navigator", {});
    const operation = vi.fn();
    await expect(withMarketJobLock(buyer, operation)).rejects.toThrow("Web Locks");
    expect(operation).not.toHaveBeenCalled();
  });
  it("persists real hashes and restores them after a new read, never inventing jobs", () => {
    const db = storage();
    expect(readMarketJobs(db, buyer)).toEqual([]);
    const job = fixture();
    saveMarketJob(db, job);
    expect(readMarketJobs(db, buyer)).toEqual([job]);
    expect(readMarketJobs(db, other)).toEqual([]);
    expect(journalKey("0x" + "a".repeat(40))).toBe(journalKey("0x" + "A".repeat(40)));
  });
  it("updates a job without duplicating it or removing earlier jobs", () => {
    const db = storage(); const job = fixture(); saveMarketJob(db, job);
    saveMarketJob(db, { ...job, delivery: "uncertain" });
    expect(readMarketJobs(db, buyer)).toHaveLength(1);
    expect(readMarketJobs(db, buyer)[0].delivery).toBe("uncertain");
  });
  it.each([0, 1, 2, 3, 4])("retains a submitted hash across a refresh before step %i confirms", index => {
    const db = storage(); const job = fixture();
    job.transactions = [null, null, null, null, null];
    job.transactions[index] = { hash: fundHash, state: "submitted" };
    saveMarketJob(db, job);
    const restored = readMarketJobs(db, buyer)[0];
    expect(restored.transactions[index]).toEqual({ hash: fundHash, state: "submitted" });
    expect(restored.delivery).toBe("not-requested");
    expect(restored.transactions.filter(Boolean)).toHaveLength(1);
  });
  it("preserves corrupted data and stops instead of silently resetting payment history", () => {
    const db = storage(); db.setItem(journalKey(buyer), "{broken");
    expect(() => saveMarketJob(db, fixture())).toThrow();
    expect(db.getItem(journalKey(buyer))).toBe("{broken");
  });
  it("blocks quota errors", () => {
    const db = storage(); db.setItem = () => { throw new Error("quota"); };
    expect(() => saveMarketJob(db, fixture())).toThrow("quota");
  });
  it("does not evict history at its limit", () => {
    const db = storage();
    const records = Array.from({ length: 100 }, (_, i) => ({ ...fixture(), id: `d631ef01-7c40-4015-a02a-${String(i).padStart(12, "0")}` }));
    db.setItem(journalKey(buyer), JSON.stringify(records));
    expect(() => saveMarketJob(db, fixture())).toThrow("100-job");
    expect(readMarketJobs(db, buyer)).toHaveLength(100);
  });
  it("does not accept another wallet's record under this key", () => {
    const db = storage(); db.setItem(journalKey(buyer), JSON.stringify([{ ...fixture(), wallet: other }]));
    expect(() => readMarketJobs(db, buyer)).toThrow();
  });
  it("property: rejects malformed hashes, networks, timestamps, and job ids", () => {
    const db = storage();
    for (let i = 0; i < 128; i++) {
      const job = fixture();
      const bad = i % 4 === 0 ? { ...job, chainId: 56 } : i % 4 === 1 ? { ...job, jobId: "9".repeat(79 + i) } :
        i % 4 === 2 ? { ...job, createdAt: 9e15 + i } : { ...job, quote: { ...job.quote, quoteHash: "0x" + "g".repeat(i) } };
      db.setItem(journalKey(buyer), JSON.stringify([bad]));
      expect(() => readMarketJobs(db, buyer), `case=${i}`).toThrow();
    }
  });
  it("caps saved responses and does not label acceptance as execution", () => {
    expect(boundedSellerResponse({ text: "a".repeat(100000) }).length).toBeLessThan(32100);
    expect(jobStatus({ ...fixture(), delivery: "response-received" })).toContain("execution not verified");
    expect(jobStatus(fixture())).toContain("check chain");
  });
});

describe("read-only funded job recovery", () => {
  it.each([0, 1, 2, 3])("verifies real encoded transactions for category %i without a write client", async index => {
    const job = fixture(index); const { reader } = chain(job);
    await expect(verifyFundedMarketJob(reader, job, buyer)).resolves.toEqual({ jobId: "42", quoteHash: job.quote.quoteHash });
    expect(Object.keys(reader).sort()).toEqual(["getChainId", "getTransaction", "getTransactionReceipt"]);
  });
  it("recovers job id from chain when saving the id was interrupted", async () => {
    const job = fixture(); const { reader } = chain(job);
    await expect(verifyFundedMarketJob(reader, { ...job, jobId: null }, buyer)).resolves.toMatchObject({ jobId: "42" });
  });
  it("does not recover a partial setup or trust a saved confirmed label", async () => {
    const job = fixture(); job.transactions[4] = null;
    const { reader } = chain(job);
    await expect(verifyFundedMarketJob(reader, job, buyer)).rejects.toThrow("Funding is not recorded");
  });
  it("rejects another active wallet", async () => {
    const job = fixture(); await expect(verifyFundedMarketJob(chain(job).reader, job, other)).rejects.toThrow("different wallet");
  });
  it.each(["from", "to", "chainId", "value", "hash"] as const)("rejects altered funding transaction %s", async field => {
    const job = fixture(); const test = chain(job);
    Object.assign(test.fund, { [field]: field === "chainId" ? 56 : field === "value" ? 1n : field === "hash" ? createHash : other });
    await expect(verifyFundedMarketJob(test.reader, job, buyer)).rejects.toThrow();
  });
  it.each(["status", "transactionHash", "blockNumber"] as const)("rejects failed or inconsistent receipt %s", async field => {
    const job = fixture(); const test = chain(job);
    Object.assign(test.fundReceipt, { [field]: field === "status" ? "reverted" : field === "blockNumber" ? 9n : createHash });
    await expect(verifyFundedMarketJob(test.reader, job, buyer)).rejects.toThrow();
  });
  it("rejects unavailable receipts rather than treating them as unfunded", async () => {
    const job = fixture(); const test = chain(job);
    vi.mocked(test.reader.getTransactionReceipt).mockRejectedValue(new Error("not found"));
    await expect(verifyFundedMarketJob(test.reader, job, buyer)).rejects.toThrow("not found");
  });
  it("rejects forged events emitted by another contract", async () => {
    const job = fixture(); const test = chain(job); Object.assign(test.event, { address: other });
    await expect(verifyFundedMarketJob(test.reader, job, buyer)).rejects.toThrow("event not found");
  });
  it("rejects a different RPC network", async () => {
    const job = fixture(); const test = chain(job); vi.mocked(test.reader.getChainId).mockResolvedValue(56);
    await expect(verifyFundedMarketJob(test.reader, job, buyer)).rejects.toThrow("Testnet");
  });
  it("property: rejects modified quote hashes, job ids and fees in local storage", async () => {
    for (let i = 0; i < 128; i++) {
      const job = fixture(i % 4); const test = chain(job);
      const changed = i % 3 === 0 ? { ...job, jobId: String(43 + i) } : i % 3 === 1 ?
        { ...job, quote: { ...job.quote, feeAmount: String(i + 1) } } : { ...job, quote: { ...job.quote, quoteHash: `0x${"d".repeat(64)}` } };
      await expect(verifyFundedMarketJob(test.reader, changed, buyer), `case=${i}`).rejects.toThrow();
    }
  });
});
