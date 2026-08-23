export type MarketplaceActivationAction = "quote" | "fund" | "notify";

export function getMarketplaceActivationAction(
  hasQuote: boolean,
  fundedJobId: string | null,
): MarketplaceActivationAction {
  if (!hasQuote) return "quote";
  return fundedJobId ? "notify" : "fund";
}
