'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Moon, Sun, Swords } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { useDarkMode } from '@/app/DarkModeContext';

function DarkToggle() {
  const { isDark, toggleDark } = useDarkMode();
  return (
    <button
      onClick={toggleDark}
      aria-label="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-secondary)] transition-all hover:text-[var(--text)] active:scale-90"
    >
      {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

function WalletPill() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  if (!ready) return null;

  if (authenticated && user) {
    const displayName =
      user.email?.address?.split('@')[0] ||
      user.google?.name ||
      (user.wallet?.address
        ? `${user.wallet.address.slice(0, 6)}…${user.wallet.address.slice(-4)}`
        : 'Agent');

    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text)]" />
          {displayName}
        </span>
        <button
          onClick={logout}
          className="text-[12px] text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className="flex items-center gap-1.5 rounded-full bg-[var(--text)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--bg)] transition-opacity hover:opacity-80"
    >
      <Swords className="h-3 w-3" />
      Enter
    </button>
  );
}

export function Navbar() {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav className="glass-nav flex w-full max-w-7xl items-center justify-between px-5 py-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[7px] border border-[var(--card-border)] bg-[#faf8f0] shadow-sm">
            <Image
              src="/brand/dojo-mantis-logo.png"
              alt="AgentShack"
              width={32}
              height={32}
              className="h-full w-full object-cover"
              priority
            />
          </span>
          <span className="leading-none">
            <span className="block text-[18px] font-black tracking-tight text-[var(--text)] sm:text-[20px]">
              AgentShack
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <DarkToggle />
          <WalletPill />
        </div>
      </nav>
    </div>
  );
}
