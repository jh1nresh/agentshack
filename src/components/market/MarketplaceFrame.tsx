import type { ReactNode } from "react";
import { MarketplaceHeader } from "./MarketplaceHeader";
import styles from "./Marketplace.module.css";

type MarketplaceFrameProps = {
  children: ReactNode;
  primaryWord?: string;
  accentWord?: string;
  note?: string;
  layout?: "standard" | "directory";
};

export function MarketplaceRail({
  primaryWord = "AGENT",
  accentWord = "MARKET",
  note = "Four jobs.\nOne clear place\nto start.",
}: Omit<MarketplaceFrameProps, "children" | "layout">) {
  return (
    <aside className={styles.rail} aria-label="BNB Agent Market">
      <span className={styles.railTop}>BNB CHAIN</span>
      <div className={styles.railWords} aria-hidden="true">
        <b>{primaryWord}</b>
        <strong>{accentWord}</strong>
      </div>
      <p className={styles.railNote}>{note}</p>
    </aside>
  );
}
export function MarketplaceFrame({
  children,
  primaryWord,
  accentWord,
  note,
  layout = "standard",
}: MarketplaceFrameProps) {
  return (
    <div className={styles.app}>
      <MarketplaceHeader />
      <main className={layout === "directory" ? styles.directoryFrame : styles.frame}>
        <MarketplaceRail primaryWord={primaryWord} accentWord={accentWord} note={note} />
        {children}
      </main>
    </div>
  );
}
