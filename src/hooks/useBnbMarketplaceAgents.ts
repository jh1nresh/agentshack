"use client";

import useSWR from "swr";
import { BNB_MARKETPLACE_AGENTS, type BnbMarketplaceAgent } from "@/lib/bnb-marketplace";

type AgentsResponse = { agents: BnbMarketplaceAgent[]; complete: boolean; checkedAt: string };

async function fetcher(url: string): Promise<AgentsResponse> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok && !Array.isArray(body?.agents)) throw new Error("Registry unavailable");
  return body;
}

export function useBnbMarketplaceAgents() {
  const { data, error, isLoading } = useSWR<AgentsResponse>("/api/bnb-marketplace/agents", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  return {
    agents: data?.agents ?? [...BNB_MARKETPLACE_AGENTS], complete: data?.complete ?? false,
    checkedAt: data?.checkedAt ?? null, isLoading, error,
  };
}
