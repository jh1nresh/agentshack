import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketJobs } from "@/components/market/MarketJobs";
import { MarketplaceHeader } from "@/components/market/MarketplaceHeader";

const state = vi.hoisted(() => ({
  ready: true, authenticated: false, pathname: "/dashboard", wallets: [] as { address: string }[],
  history: { jobs: [] as unknown[], loaded: true, error: null as string | null },
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: state.ready, authenticated: state.authenticated, login: vi.fn(), logout: vi.fn(), user: null }),
  useWallets: () => ({ wallets: state.wallets }),
}));
vi.mock("@/hooks/useMarketJobs", () => ({ useMarketJobs: () => state.history }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: ({ priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => React.createElement("img", props) }));

afterEach(() => {
  vi.unstubAllGlobals();
  state.ready = true; state.authenticated = false; state.pathname = "/dashboard"; state.wallets = [];
  state.history = { jobs: [], loaded: true, error: null };
});
function render(component: React.ReactElement) {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(component);
}
describe("marketplace navigation and truthful job states", () => {
  it.each(["/dashboard", "/activity", "/market"])("has distinct routes and correct active nav on %s", pathname => {
    state.pathname = pathname;
    const html = render(React.createElement(MarketplaceHeader));
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/activity"');
    expect(html).not.toContain('href="/create"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`href="${pathname === "/market" ? "/" : pathname}"[^>]+aria-current="page"`));
  });
  it("shows a connect state instead of redirecting or fabricated history", () => {
    const html = render(React.createElement(MarketJobs));
    expect(html).toContain("Connect to see your jobs");
    expect(html).toContain("Saved on this browser only");
    expect(html).not.toContain("Studio Desk");
  });
  it("shows a genuine empty state after connecting", () => {
    state.authenticated = true; state.wallets = [{ address: "0x" + "1".repeat(40) }];
    const html = render(React.createElement(MarketJobs, { activity: true }));
    expect(html).toContain("No jobs saved here yet");
    expect(html).toContain("Explore agents");
    expect(html).not.toContain("Check funding &amp; retry delivery");
  });
  it("does not substitute an empty state for unreadable history", () => {
    state.authenticated = true; state.wallets = [{ address: "0x" + "1".repeat(40) }];
    state.history.error = "Saved history is unavailable";
    const html = render(React.createElement(MarketJobs));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("No jobs saved here yet");
  });
  it("renders saved transaction links without treating seller text as HTML or completed execution", () => {
    state.authenticated = true; state.wallets = [{ address: "0x" + "1".repeat(40) }];
    state.history.jobs = [{ id: "test", slug: "studio-desk-rebalancer", jobId: "42", createdAt: 1788860000000,
      transactions: [{ hash: "0x" + "a".repeat(64), state: "confirmed" }, null, null, null, null],
      delivery: "response-received", response: '<script>alert("test")</script>' }];
    const html = render(React.createElement(MarketJobs, { activity: true }));
    expect(html).toContain("https://testnet.bscscan.com/tx/");
    expect(html).toContain("execution not verified");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
