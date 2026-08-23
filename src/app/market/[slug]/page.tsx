import { notFound } from "next/navigation";
import { AgentDetail } from "@/components/market/AgentDetail";
import { MarketplaceFrame } from "@/components/market/MarketplaceFrame";
import { BNB_MARKETPLACE_AGENTS, getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";

export function generateStaticParams() {
  return BNB_MARKETPLACE_AGENTS.map((agent) => ({ slug: agent.slug }));
}

export default async function MarketAgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = getBnbMarketplaceAgent(slug);
  if (!agent) notFound();
  const [primaryWord, accentWord] = agent.name.replace(/([a-z])([A-Z])/g, "$1|$2").split("|");

  return (
    <MarketplaceFrame
      layout="directory"
      primaryWord={primaryWord.toUpperCase()}
      accentWord={(accentWord ?? "AGENT").toUpperCase()}
      note={"Read the task.\nCheck the limit.\nKeep control."}
    >
      <AgentDetail agent={agent} />
    </MarketplaceFrame>
  );
}
