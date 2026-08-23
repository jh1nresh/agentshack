import { NextResponse } from "next/server";
import { loadBnbMarketplaceAgents } from "@/lib/bnb-marketplace-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await loadBnbMarketplaceAgents();
  const complete = agents.every((agent) => agent.registryStatus === "live" && agent.endpointStatus === "live");
  return NextResponse.json(
    { agents, network: { name: "BNB Smart Chain Testnet", chainId: 97 }, complete, checkedAt: new Date().toISOString() },
    { status: complete ? 200 : 503 },
  );
}
