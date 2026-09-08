"use client";

import { useEffect, useState } from "react";
import { readMarketJobs, type MarketJob } from "@/lib/bnb-marketplace-journal";

export function useMarketJobs(wallet?: string) {
  const [snapshot, setSnapshot] = useState<{ wallet?: string; jobs: MarketJob[]; error: string | null }>({ jobs: [], error: null });
  useEffect(() => {
    function refresh() {
      try {
        setSnapshot({ wallet, jobs: wallet ? readMarketJobs(window.localStorage, wallet) : [], error: null });
      } catch {
        setSnapshot({ wallet, jobs: [], error: "This browser could not read this wallet's job history. Existing records were not changed. Do not repeat a payment until you check its transaction." });
      }
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("agentshack-jobs", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("agentshack-jobs", refresh);
    };
  }, [wallet]);
  return snapshot.wallet === wallet ? { ...snapshot, loaded: true } : { wallet, jobs: [], error: null, loaded: false };
}
