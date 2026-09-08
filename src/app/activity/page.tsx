import { MarketplaceFrame } from "@/components/market/MarketplaceFrame";
import { MarketJobs } from "@/components/market/MarketJobs";

export default function ActivityPage() {
  return <MarketplaceFrame primaryWord="YOUR" accentWord="ACTIVITY" note={"Read the receipt.\nCheck the chain."}><MarketJobs activity /></MarketplaceFrame>;
}
