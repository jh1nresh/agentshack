"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import styles from "./Marketplace.module.css";

export function MarketplaceHeader() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0]?.address;
  const accountLabel = wallet ? `${wallet.slice(0, 5)}…${wallet.slice(-4)}` : "Connected";

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="AgentShack home">
        <Image src="/brand/dojo-mantis-logo.png" alt="" width={35} height={35} priority />
        <strong>AgentShack</strong>
      </Link>

      <nav className={styles.nav} aria-label="Primary navigation">
        {[
          { href: "/", label: "Market", active: pathname === "/" || pathname.startsWith("/market") },
          { href: "/dashboard", label: "My agents", active: pathname === "/dashboard" },
          { href: "/activity", label: "Activity", active: pathname === "/activity" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className={item.active ? styles.active : undefined} aria-current={item.active ? "page" : undefined}>{item.label}</Link>
        ))}
      </nav>

      <div className={styles.network}>
        <span className={styles.networkLabel}>BSC TESTNET · 97</span>
        {ready && authenticated ? (
          <button type="button" className={styles.connectButton} onClick={logout} aria-label="Disconnect wallet">
            {accountLabel}
          </button>
        ) : (
          <button type="button" className={styles.connectButton} onClick={login} disabled={!ready}>
            Connect
          </button>
        )}
      </div>
    </header>
  );
}
