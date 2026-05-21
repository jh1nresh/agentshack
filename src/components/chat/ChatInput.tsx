"use client";

/**
 * ChatInput — bottom composer (and landing hero composer).
 *
 * Spec: specs/2026-04-09-chat-first-ui.md
 *
 * Claude-style composer card with two variants:
 *   - `compact` — docked at bottom of chat log (post-landing state)
 *   - `hero`    — oversized landing composer with editorial trimmings:
 *       · notched "[ ASK THE DOJO ]" label top-left (classified pattern)
 *       · rotating italic placeholder that fades through example queries
 *       · bigger serif, thicker border, taller textarea
 *
 * Both variants share: Send button with letterpress hover + accent red
 * shift, dotted footer with ⏎ / ⇧⏎ glyphs, Enter-to-send behavior.
 */

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";

export type ChatInputVariant = "hero" | "compact";

export interface ChatInputProps {
  pending?: boolean;
  placeholder?: string;
  variant?: ChatInputVariant;
  onSubmit: (text: string) => void;
}

// Rotating placeholder copy for the hero variant — fades through example
// queries every 3.5s so the resting composer has a faint editorial pulse.
// Compact variant stays on the caller-provided static placeholder.
const HERO_PLACEHOLDERS = [
  'Try "list skills" to browse the catalog…',
  'Try "price of BTC" to call the oracle…',
  'Try "help" to see every command…',
  "Type a skill name to open its sandbox…",
];

const PLACEHOLDER_INTERVAL_MS = 3500;

export function ChatInput({
  pending = false,
  placeholder,
  variant = "compact",
  onSubmit,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const isHero = variant === "hero";

  // Cycle the hero placeholder while the composer is empty. Respects
  // prefers-reduced-motion: users who opted out just see the first entry
  // statically (no flash-cycling without the fade transition).
  useEffect(() => {
    if (!isHero) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % HERO_PLACEHOLDERS.length);
    }, PLACEHOLDER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isHero]);

  function send() {
    const text = value.trim();
    if (!text || pending) return;
    onSubmit(text);
    setValue("");
    requestAnimationFrame(() => taRef.current?.focus());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const canSend = value.trim().length > 0 && !pending;

  const staticPlaceholder =
    placeholder ??
    'Ask the front desk — try "list skills", "price of BTC", or "help"';
  const heroPlaceholder = HERO_PLACEHOLDERS[placeholderIdx];
  const showHeroOverlay = isHero && value.length === 0;

  // Hero variant: parent controls spacing, bigger textarea, thicker border
  // for a classified-ad feel. Compact: the original docked composer.
  const wrapperClass = isHero ? "" : "px-6 pb-5 pt-2";
  const containerClass = isHero
    ? "relative border-2 bg-[var(--paper-bg)]"
    : "border bg-[var(--paper-bg)] shadow-[0_-1px_0_0_rgba(26,26,26,0.06),0_1px_0_0_rgba(26,26,26,0.04)]";
  const textareaClass = isHero
    ? "relative block w-full resize-none border-0 bg-transparent px-5 pt-5 pb-3 font-serif text-[18px] leading-[1.5] text-[var(--paper-ink)] placeholder:font-serif placeholder:italic placeholder:text-[var(--paper-ink-30)] focus:outline-none"
    : "relative block w-full resize-none border-0 bg-transparent px-4 pt-4 pb-2 font-serif text-[15px] leading-[1.55] text-[var(--paper-ink)] placeholder:font-serif placeholder:italic placeholder:text-[var(--paper-ink-30)] focus:outline-none";
  const textareaRows = isHero ? 3 : 2;
  const textareaMaxHeight = isHero ? "220px" : "160px";

  return (
    <div className={wrapperClass}>
      <div className={containerClass} style={{ borderColor: "var(--paper-ink)" }}>
        {/* Notched editorial label — hero only. Sits on top of the border
            with the page background knocking out the rule beneath, the
            same trick .classified::before uses in globals.css. Reads as a
            newspaper classified ad rather than a generic search bar. */}
        {isHero && (
          <span className="pointer-events-none absolute -top-[9px] left-4 z-10 bg-[var(--paper-bg-muted)] px-2 font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--paper-ink-65)]">
            [ Ask AgentShack ]
          </span>
        )}

        {/* Rotating italic placeholder overlay — only rendered when the
            composer is empty. We blank the native textarea placeholder in
            hero mode and render our own absolutely-positioned span so we
            can re-key it and trigger .reveal-row on each cycle. */}
        {showHeroOverlay && (
          <div className="pointer-events-none absolute inset-x-5 top-5 z-0">
            <span
              key={placeholderIdx}
              className="reveal-row block font-serif text-[18px] italic leading-[1.5] text-[var(--paper-ink-30)]"
            >
              {heroPlaceholder}
            </span>
          </div>
        )}

        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isHero ? "" : staticPlaceholder}
          rows={textareaRows}
          className={textareaClass}
          style={{ maxHeight: textareaMaxHeight }}
          disabled={pending}
          autoFocus
        />

        <div className="flex items-center justify-between border-t border-dotted border-[var(--paper-ink-20)] px-4 py-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--paper-ink-35)]">
            <span className="text-[var(--paper-ink-55)]">⏎</span>{" "}
            <span className="text-[var(--paper-ink-25)]">submit</span>
            <span className="mx-2 text-[var(--paper-ink-15)]">·</span>
            <span className="text-[var(--paper-ink-55)]">⇧⏎</span>{" "}
            <span className="text-[var(--paper-ink-25)]">newline</span>
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="letterpress flex items-center gap-1.5 border border-[var(--paper-ink)] bg-[var(--paper-ink)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--paper-bg)] transition-colors hover:border-[var(--paper-accent)] hover:bg-[var(--paper-accent)] disabled:cursor-not-allowed disabled:opacity-25"
          >
            Send
            <CornerDownLeft size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
