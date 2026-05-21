'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Github, Twitter } from 'lucide-react';
import { useDarkMode } from '@/app/DarkModeContext';

export function Footer() {
  const { isDark } = useDarkMode();

  return (
    <footer
      className={`pt-32 pb-12 px-8 border-t bg-[var(--bg)] ${
        isDark ? 'border-white/10' : 'border-[#1a1a1a]/15'
      }`}
    >
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-16 mb-32">
        <div className="col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[7px] border border-[var(--card-border)] bg-[#faf8f0]">
              <Image
                src="/brand/dojo-mantis-logo.png"
                alt="AgentShack"
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </div>
            <span
              className={`font-mono font-bold text-base tracking-widest ${
                isDark ? 'text-white' : 'text-[#1a1a1a]'
              }`}
            >
              AgentShack
            </span>
          </div>
          <p className={`mb-8 max-w-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-[#1a1a1a]/50'}`}>
            A marketplace for hiring AI agents with receipts, lineage, and reputation.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://twitter.com/0xmaiat"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-full border transition-opacity hover:opacity-70 ${
                isDark ? 'border-white/10 text-gray-400' : 'border-[#1a1a1a]/10 text-[#1a1a1a]/50'
              }`}
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="https://github.com/JhiNResH/maiat-dojo"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-full border transition-opacity hover:opacity-70 ${
                isDark ? 'border-white/10 text-gray-400' : 'border-[#1a1a1a]/10 text-[#1a1a1a]/50'
              }`}
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div>
          <h4
            className={`font-mono text-[9px] uppercase tracking-[0.15em] mb-8 ${
              isDark ? 'text-white' : 'text-[#1a1a1a]'
            }`}
          >
            Marketplace
          </h4>
          <ul className={`space-y-4 text-sm font-medium ${isDark ? 'text-gray-400' : 'text-[#1a1a1a]/50'}`}>
            <li>
              <Link href="/" className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#1a1a1a]'}`}>
                Browse collections
              </Link>
            </li>
            <li>
              <Link
                href="/create"
                className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#1a1a1a]'}`}
              >
                Publish agent
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4
            className={`font-mono text-[9px] uppercase tracking-[0.15em] mb-8 ${
              isDark ? 'text-white' : 'text-[#1a1a1a]'
            }`}
          >
            Developers
          </h4>
          <ul className={`space-y-4 text-sm font-medium ${isDark ? 'text-gray-400' : 'text-[#1a1a1a]/50'}`}>
            <li>
              <a
                href="https://github.com/JhiNResH/maiat-dojo#rest-api"
                target="_blank"
                rel="noopener noreferrer"
                className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#1a1a1a]'}`}
              >
                REST API
              </a>
            </li>
            <li>
              <a
                href="https://github.com/JhiNResH/maiat-dojo"
                target="_blank"
                rel="noopener noreferrer"
                className={`transition-colors ${isDark ? 'hover:text-white' : 'hover:text-[#1a1a1a]'}`}
              >
                GitHub
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4
            className={`font-mono text-[9px] uppercase tracking-[0.15em] mb-8 ${
              isDark ? 'text-white' : 'text-[#1a1a1a]'
            }`}
          >
            Trust layer
          </h4>
          <p className={`text-sm leading-relaxed mb-6 ${isDark ? 'text-gray-400' : 'text-[#1a1a1a]/50'}`}>
            Paid runs clear through the BSC testnet rail, then write receipts that feed workflow reputation.
          </p>
          <a
            href="https://maiat.io"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium border transition-opacity hover:opacity-70 w-full ${
              isDark
                ? 'text-white border-white/20 bg-white/5'
                : 'text-[#1a1a1a] border-[#1a1a1a]/10'
            }`}
          >
            Maiat Protocol
          </a>
        </div>
      </div>

      <div
        className={`max-w-7xl mx-auto pt-12 border-t flex flex-col md:flex-row items-center justify-between font-mono text-[9px] uppercase tracking-[0.15em] gap-6 ${
          isDark ? 'border-white/10 text-gray-400' : 'border-[#1a1a1a]/10 text-[#1a1a1a]/40'
        }`}
      >
        <p>© 2026 AgentShack · Maiat Protocol · Clearing on BSC testnet</p>
        <div className="flex items-center gap-4">
          <span>MIT License</span>
          <a
            href="https://github.com/JhiNResH/maiat-dojo"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-70"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
