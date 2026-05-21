"use client";

/**
 * ChatRoom — stateful chat container, intent dispatcher, message log.
 *
 * Spec: specs/2026-04-09-chat-first-ui.md
 *
 * Responsibilities:
 *   - Maintain the message list
 *   - Cache the skill catalog (single GET on first need)
 *   - Parse user input via parseChatIntent (pure)
 *   - Dispatch to the right card / placeholder
 *   - Auto-scroll on new messages
 *
 * Invariants:
 *   - This file does not know about specific skills (no slug literals).
 *   - All skill rendering goes through <SkillExecutor> which dispatches
 *     on profile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseChatIntent,
  findSkillForQuery,
  type ChatIntent,
} from "@/lib/chat-intent";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { LandingHero } from "../landing/LandingHero";
import {
  nextMessageId,
  type ChatMessage as ChatMsg,
  type ChatSkillSummary,
} from "./types";
import type { SkillExecutorSkill } from "../skill/SkillExecutor";

// Distributive Omit — TS Omit over a union doesn't narrow, so we peel the
// auto fields off each variant individually.
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;
type ChatMsgDraft = DistributiveOmit<ChatMsg, "id" | "ts">;

// Skills returned by /api/skills include all profile fields, but the route
// shape is loose. We treat the catalog as `ChatSkillSummary & SkillExecutorSkill`
// because both halves are present in the same row.
type CatalogSkill = ChatSkillSummary & SkillExecutorSkill;

/**
 * Landing vs chat mode toggle — we start with ZERO messages. The landing
 * hero IS the greeting, so no canned "welcome" card gets inserted into the
 * log. First user submit flips the state into full chat view.
 */

export function ChatRoom() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSkill[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const push = useCallback((msg: ChatMsgDraft) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: nextMessageId(), ts: Date.now() } as ChatMsg,
    ]);
  }, []);

  const loadCatalog = useCallback(async (): Promise<CatalogSkill[]> => {
    if (catalog) return catalog;
    try {
      const res = await fetch("/api/skills?limit=50");
      const json = (await res.json()) as { skills?: CatalogSkill[] };
      const list = json.skills ?? [];
      setCatalog(list);
      setCatalogError(null);
      return list;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      setCatalogError(msg);
      return [];
    }
  }, [catalog]);

  const dispatchIntent = useCallback(
    async (intent: ChatIntent) => {
      switch (intent.kind) {
        case "help":
          push({ role: "dojo", kind: "help" });
          return;

        case "list-skills": {
          const list = await loadCatalog();
          if (list.length === 0) {
            push({
              role: "dojo",
              kind: "text",
              tone: "warn",
              content: catalogError
                ? `Couldn't load the workflow list (${catalogError}).`
                : "No workflows listed yet.",
            });
            return;
          }
          push({ role: "dojo", kind: "skill-list", skills: list });
          return;
        }

        case "call-skill": {
          const list = await loadCatalog();
          if (list.length === 0) {
            push({
              role: "dojo",
              kind: "text",
              tone: "warn",
              content: 'Catalog is empty. Try "list skills" once seed data lands.',
            });
            return;
          }
          const match = findSkillForQuery(list, intent.query);
          if (!match) {
            push({
              role: "dojo",
              kind: "text",
              tone: "warn",
              content: `Couldn't find a skill matching "${intent.query}". Try "list skills" to see what's available.`,
            });
            return;
          }
          push({
            role: "dojo",
            kind: "text",
            content: `Loaded ${match.name}. Sandbox is below — fill the form and run.`,
          });
          push({ role: "dojo", kind: "skill-executor", skill: match });
          return;
        }

        case "publish":
          push({ role: "dojo", kind: "publish-wizard" });
          return;

        case "my-sessions":
          push({ role: "dojo", kind: "phase-2-stub", feature: "my sessions" });
          return;

        case "close-session":
          push({
            role: "dojo",
            kind: "phase-2-stub",
            feature: "close session",
          });
          return;

        case "unknown":
          push({
            role: "dojo",
            kind: "text",
            tone: "warn",
            content: `I don't follow "${intent.raw}". Try "help" for the command list.`,
          });
          return;
      }
    },
    [catalogError, loadCatalog, push]
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      push({ role: "user", kind: "text", content: text });
      setPending(true);
      try {
        const intent = parseChatIntent(text);
        await dispatchIntent(intent);
      } finally {
        setPending(false);
      }
    },
    [dispatchIntent, push]
  );

  // Triggered from a SkillListCard "Run" button — synthesises a `call <name>` user message
  // so the chat log reads as if the user typed it.
  const handleRunFromList = useCallback(
    (skill: ChatSkillSummary) => {
      void handleSubmit(`call ${skill.name}`);
    },
    [handleSubmit]
  );

  const renderedMessages = useMemo(
    () =>
      messages.map((msg) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          onRunSkill={handleRunFromList}
        />
      )),
    [messages, handleRunFromList]
  );

  // Landing mode: zero-message state shows the editorial hero + leaderboard
  // + trending. The hero's own composer routes through handleSubmit too, so
  // submitting from either surface lands in the same dispatcher.
  const isLanding = messages.length === 0;

  if (isLanding) {
    return <LandingHero pending={pending} onSubmit={handleSubmit} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 pt-6 pb-2"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          {renderedMessages}
          {pending && (
            <div className="mb-8">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--paper-accent)]">
                  AgentShack
                </span>
                <span className="h-px flex-1 bg-[var(--paper-ink-10)]" />
              </div>
              <div className="flex items-center gap-1.5 font-serif text-[15px] italic text-[var(--paper-ink-40)]">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--paper-ink-50)] [animation-delay:0ms]" />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--paper-ink-50)] [animation-delay:150ms]" />
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--paper-ink-50)] [animation-delay:300ms]" />
                <span className="ml-1">thinking</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl">
        <ChatInput pending={pending} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}

export default ChatRoom;
