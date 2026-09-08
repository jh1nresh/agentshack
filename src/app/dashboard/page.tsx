import { MarketplaceFrame } from "@/components/market/MarketplaceFrame";
import { MarketJobs } from "@/components/market/MarketJobs";

export default function DashboardPage() {
  return <MarketplaceFrame primaryWord="YOUR" accentWord="AGENTS" note={"One wallet.\nYour saved jobs."}><MarketJobs /></MarketplaceFrame>;
}
