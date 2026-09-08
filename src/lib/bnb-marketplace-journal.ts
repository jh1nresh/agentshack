import { z } from "zod";
import { getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uint = z.string().regex(/^\d{1,78}$/);
export const JOB_STEPS = ["Create job", "Register policy", "Set budget", "Approve exact fee", "Fund job"] as const;
export const journalRecordSchema = z.object({
  id: z.string().uuid(), wallet: address, chainId: z.literal(97),
  slug: z.string().refine((value) => Boolean(getBnbMarketplaceAgent(value))),
  quote: z.object({ quoteHash: hash, feeAmount: uint, wallet: address }).strict(),
  jobId: uint.nullable(),
  transactions: z.array(z.object({ hash, state: z.enum(["submitted", "confirmed", "uncertain", "reverted"]) }).strict().nullable()).length(5),
  delivery: z.enum(["not-requested", "requested", "response-received", "uncertain"]),
  response: z.string().max(32_100).optional(), error: z.string().max(1_000).optional(),
  createdAt: z.number().int().positive().max(8_640_000_000_000_000), updatedAt: z.number().int().positive().max(8_640_000_000_000_000),
}).strict();
export type MarketJob = z.infer<typeof journalRecordSchema>;
export type JournalStorage = Pick<Storage, "getItem" | "setItem">;

export function journalKey(wallet: string) {
  return `agentshack:jobs:v1:97:${address.parse(wallet).toLowerCase()}`;
}

export function readMarketJobs(storage: JournalStorage, wallet: string): MarketJob[] {
  const raw = storage.getItem(journalKey(wallet));
  if (raw === null) return [];
  if (raw.length > 4_000_000) throw new Error("Saved job history is too large. Do not start another payment in this browser.");
  const parsed = z.array(journalRecordSchema).max(100).parse(JSON.parse(raw));
  if (parsed.some((job) => job.wallet.toLowerCase() !== wallet.toLowerCase()) || new Set(parsed.map((job) => job.id)).size !== parsed.length) {
    throw new Error("Saved history does not match this wallet.");
  }
  return parsed.sort((a, b) => b.createdAt - a.createdAt);
}

export function saveMarketJob(storage: JournalStorage, job: MarketJob) {
  const valid = journalRecordSchema.parse(job);
  const jobs = readMarketJobs(storage, valid.wallet);
  const next = [valid, ...jobs.filter((item) => item.id !== valid.id)];
  if (next.length > 100) throw new Error("This browser has reached its 100-job history limit. Existing records were preserved.");
  // Write before moving to another transaction. Quota/security errors stop the flow.
  storage.setItem(journalKey(valid.wallet), JSON.stringify(next));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("agentshack-jobs"));
}

export function jobStatus(job: MarketJob) {
  if (job.delivery === "response-received") return "Seller response saved · execution not verified";
  if (job.transactions[4]) return "Funding submitted · check chain before delivery";
  if (job.transactions.some(Boolean)) return "Interrupted setup · review transactions";
  return "Setup started · no transaction hash saved";
}

export function boundedSellerResponse(value: unknown) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return text.length > 32_000 ? `${text.slice(0, 32_000)}\n[Saved response truncated at 32 KB]` : text;
}

export async function withMarketJobLock<T>(wallet: string, operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error("This browser cannot safely coordinate wallet jobs. Use a browser with Web Locks support.");
  return navigator.locks.request(journalKey(wallet), { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error("Another tab is working on this wallet. Finish that task first.");
    return operation();
  });
}
