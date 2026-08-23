import { parseAbi } from "viem";
import { bscTestnet } from "viem/chains";

export const BNB_MARKETPLACE_CHAIN = bscTestnet;
export const BNB_MARKETPLACE_CONTRACTS = {
  commerce: "0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE",
  router: "0xD7d36D66d2F1B608A0F943f722D27e3744f66F25",
  policy: "0xd6a4217588f6b1f5657a92a3e94e6422ad771cea",
  paymentToken: "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565",
} as const;

export const bnbMarketplaceCommerceAbi = parseAbi([
  "function createJob(address provider,address evaluator,uint256 expiredAt,string description,address hook) returns(uint256)",
  "function setBudget(uint256 jobId,uint256 amount,bytes optParams)",
  "function fund(uint256 jobId,uint256 expectedBudget,bytes optParams)",
  "event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiredAt,address hook)",
]);
export const bnbMarketplaceRouterAbi = parseAbi(["function registerJob(uint256 jobId,address policy)"]);
export const bnbMarketplaceTokenAbi = parseAbi(["function approve(address spender,uint256 amount) returns(bool)"]);
