import { decodeFunctionData, parseEventLogs, type Hash, type PublicClient } from "viem";
import { getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";
import { BNB_MARKETPLACE_CONTRACTS as contracts, bnbMarketplaceCommerceAbi } from "@/lib/bnb-marketplace-chain";
import { journalRecordSchema, type MarketJob } from "@/lib/bnb-marketplace-journal";

type Reader = Pick<PublicClient, "getChainId" | "getTransaction" | "getTransactionReceipt">;
const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();

// Saved browser state is an observation, never proof or authority for another payment.
// Recovery only reads chain data and returns a notification target; it cannot send money.
export async function verifyFundedMarketJob(reader: Reader, saved: MarketJob, wallet: string) {
  const job = journalRecordSchema.parse(saved);
  const agent = getBnbMarketplaceAgent(job.slug)!;
  if (!same(job.wallet, wallet) || !same(job.quote.wallet, agent.agentWallet)) throw new Error("Saved job belongs to a different wallet or agent.");
  if (await reader.getChainId() !== 97) throw new Error("Recovery requires BSC Testnet (97).");
  const createHash = job.transactions[0]?.hash as Hash | undefined;
  const fundHash = job.transactions[4]?.hash as Hash | undefined;
  if (!createHash || !fundHash) throw new Error("Funding is not recorded. Review the saved transactions; no payment will be repeated.");
  const [create, fund, createReceipt, fundReceipt] = await Promise.all([
    reader.getTransaction({ hash: createHash }), reader.getTransaction({ hash: fundHash }),
    reader.getTransactionReceipt({ hash: createHash }), reader.getTransactionReceipt({ hash: fundHash }),
  ]);
  for (const [transaction, receipt, hash] of [[create, createReceipt, createHash], [fund, fundReceipt, fundHash]] as const) {
    if (transaction.chainId !== 97 || !same(transaction.from, wallet) || !same(transaction.to, contracts.commerce) || transaction.value !== 0n ||
      !same(transaction.hash, hash) || !same(receipt.transactionHash, hash) || receipt.status !== "success") {
      throw new Error("Transaction is pending, failed, or does not match the expected buyer and testnet contract.");
    }
  }
  if (fundReceipt.blockNumber < createReceipt.blockNumber) throw new Error("Funding precedes job creation.");
  const creation = decodeFunctionData({ abi: bnbMarketplaceCommerceAbi, data: create.input });
  const funding = decodeFunctionData({ abi: bnbMarketplaceCommerceAbi, data: fund.input });
  if (creation.functionName !== "createJob" || funding.functionName !== "fund") throw new Error("Unexpected transaction call.");
  const [provider, evaluator, , description, hook] = creation.args;
  if (!same(provider, agent.agentWallet) || !same(evaluator, contracts.router) || !same(hook, contracts.router)) throw new Error("Job parties do not match the curated service.");
  const terms = JSON.parse(description);
  if (terms.version !== 1 || terms.chainId !== 97 || terms.agentId !== agent.agentId || terms.typedSelector !== agent.selector ||
    typeof terms.policy !== "string" || !same(terms.policy, contracts.policy) || typeof terms.quoteHash !== "string" || !same(terms.quoteHash, job.quote.quoteHash)) {
    throw new Error("Onchain job terms do not match the saved quote.");
  }
  const events = parseEventLogs({ abi: bnbMarketplaceCommerceAbi, eventName: "JobCreated", logs: createReceipt.logs.filter((log) => same(log.address, contracts.commerce)) });
  const event = events.find((item) => same(item.args.client, wallet) && same(item.args.provider, agent.agentWallet));
  if (!event || !same(event.args.evaluator, contracts.router) || !same(event.args.hook, contracts.router)) throw new Error("Expected JobCreated event not found.");
  const [fundedId, amount, options] = funding.args;
  if (event.args.jobId !== fundedId || (job.jobId !== null && job.jobId !== fundedId.toString()) || options !== "0x" ||
    amount <= 0n || amount > BigInt(agent.maxFeeAmount) || amount !== BigInt(job.quote.feeAmount)) {
    throw new Error("Funding does not match this job or its exact fee.");
  }
  return { jobId: fundedId.toString(), quoteHash: job.quote.quoteHash };
}
