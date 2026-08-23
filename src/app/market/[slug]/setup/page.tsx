import { notFound } from "next/navigation";
import { MarketplaceFrame } from "@/components/market/MarketplaceFrame";
import { PermissionSetup } from "@/components/market/PermissionSetup";
import { BNB_MARKETPLACE_AGENTS, getBnbMarketplaceAgent } from "@/lib/bnb-marketplace";

export function generateStaticParams() {
  return BNB_MARKETPLACE_AGENTS.map((agent) => ({ slug: agent.slug }));
}

export default async function PermissionSetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = getBnbMarketplaceAgent(slug);
  if (!agent) notFound();

  return (
    <MarketplaceFrame
      layout="directory"
      primaryWord="SET"
      accentWord="LIMITS"
      note={"Nothing runs\nuntil you\napprove it."}
    >
      <PermissionSetup agent={agent} />
    </MarketplaceFrame>
  );
}
