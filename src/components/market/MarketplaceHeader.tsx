"use client";

import Image from "next/image";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import styles from "./Marketplace.module.css";

export function MarketplaceHeader() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const wallet = user?.wallet?.address;
  const accountLabel = wallet ? `${wallet.slice(0, 5)}…${wallet.slice(-4)}` : "Connected";

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="AgentShack home">
        <Image src="/brand/dojo-mantis-logo.png" alt="" width={35} height={35} priority />
        <strong>AgentShack</strong>
      </Link>

      <nav className={styles.nav} aria-label="Primary navigation">
        <Link href="/" className={styles.active}>Market</Link>
        <Link href="/dashboard">My agents</Link>
        <Link href="/dashboard">Activity</Link>
        <Link href="/create">Build</Link>
      </nav>

      <div className={styles.network}>
        <span className={styles.networkLabel}>BNB SMART CHAIN</span>
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
