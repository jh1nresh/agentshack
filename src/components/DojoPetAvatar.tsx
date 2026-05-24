import type { CSSProperties } from "react";
import {
  buildWorkflowSpiritProfile,
  type WorkflowSpiritProfile,
} from "@/lib/workflow-spirit";

type DojoPetAvatarSize = "sm" | "md" | "lg";
type DojoPetKind = "novice" | "bandana" | "horned" | "sage" | "crest";

const petKinds: readonly DojoPetKind[] = ["novice", "bandana", "horned", "sage", "crest"];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function Accessory({ kind, accent, paper, ink }: { kind: DojoPetKind; accent: string; paper: string; ink: string }) {
  if (kind === "bandana") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M17 20.5 C24 18.5 36 18.5 47 20.5" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M18 20.5 C26 19.2 36 19.4 45.5 20.8" fill="none" stroke={paper} strokeWidth="2" strokeLinecap="round" />
        <path d="M45 19 L52 14 L50 23 Z" fill={paper} stroke={ink} strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M47 19 L54 21 L49 25 Z" fill={accent} stroke={ink} strokeWidth="2.1" strokeLinejoin="round" />
      </g>
    );
  }

  if (kind === "horned") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M21 17 C18 11 19 7 25 5" fill="none" stroke={ink} strokeWidth="3.1" strokeLinecap="round" />
        <path d="M43 17 C46 11 45 7 39 5" fill="none" stroke={ink} strokeWidth="3.1" strokeLinecap="round" />
        <path d="M22 16 C20 11 21 9 25 7" fill="none" stroke={paper} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M42 16 C44 11 43 9 39 7" fill="none" stroke={paper} strokeWidth="1.5" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "sage") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M14 18 L32 6 L50 18 Z" fill={paper} stroke={ink} strokeWidth="2.7" strokeLinejoin="round" />
        <path d="M21 17 L32 10 L43 17" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 22 C27 24 38 24 47 22" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "crest") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M32 7 C35 10 36 15 32 19 C28 15 29 10 32 7 Z" fill={accent} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M25 17 C29 14 36 14 40 17" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      </g>
    );
  }

  return null;
}

export function DojoPetAvatar({
  profile,
  name = "Dojo Spirit",
  workflowId,
  slug,
  category,
  creatorId,
  receipts = 0,
  passRate = 1,
  forks = 0,
  royaltyBps = 0,
  size = "md",
}: {
  profile?: WorkflowSpiritProfile;
  name?: string;
  workflowId?: string;
  slug?: string;
  category?: string | null;
  creatorId?: string | null;
  receipts?: number;
  passRate?: number;
  forks?: number;
  royaltyBps?: number | null;
  size?: DojoPetAvatarSize;
}) {
  const spirit = profile ?? buildWorkflowSpiritProfile({
    workflowId: workflowId ?? slug ?? name,
    slug: slug ?? slugify(name),
    name,
    category: category ?? null,
    creatorId,
    runCount: receipts,
    forkCount: forks,
    trustScore: passRate,
    royaltyBps,
  });
  const petKind = petKinds[hashSeed(`${spirit.profileId}:${spirit.discipline}:${spirit.pattern}`) % petKinds.length];
  const accent = spirit.palette.accent;
  const mat = spirit.palette.mat;
  const ink = "#11140f";
  const paper = "#f4f1dc";
  const style = {
    "--pet-accent": accent,
    "--pet-mat": mat,
    "--pet-ink": ink,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`dojo-pet-avatar dojo-pet-avatar-${size} dojo-pet-${spirit.pattern} dojo-pet-aura-${spirit.aura}`}
      data-belt={spirit.belt}
      data-kind={petKind}
      style={style}
    >
      <svg className="dojo-illustrated-pet" viewBox="0 0 64 64" role="presentation">
        <path className="dojo-pet-shadow-shape" d="M17 51 C26 55 41 55 49 51 C43 58 24 58 17 51 Z" fill="rgba(17,20,15,0.15)" />
        <path className="dojo-pet-ear-shape dojo-pet-ear-shape-left" d="M18 23 C11 21 9 28 14 33 C17 36 20 34 21 29" fill={mat} stroke={ink} strokeWidth="2.7" strokeLinejoin="round" />
        <path className="dojo-pet-ear-shape dojo-pet-ear-shape-right" d="M46 23 C53 21 55 28 50 33 C47 36 44 34 43 29" fill={mat} stroke={ink} strokeWidth="2.7" strokeLinejoin="round" />
        <path className="dojo-pet-head-shape" d="M18 20 C21 14 27 12 33 13 C40 12 46 15 48 21 C51 30 48 43 40 47 C35 50 27 50 23 47 C15 42 13 29 18 20 Z" fill={mat} stroke={ink} strokeWidth="3.1" strokeLinejoin="round" />
        <path d="M24 19 C29 17 36 17 42 19" fill="none" stroke="#b9e2c2" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
        <path d="M23 30 C25 28 28 28 30 30" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M36 30 C38 28 41 28 43 30" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M32 34 C33.5 35.5 33.5 37 32 38.2 C30.5 37 30.5 35.5 32 34 Z" fill={accent} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M27 41 C30 43 35 43 38 41" fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 24 C23 22 26 21 30 21" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth="2.2" strokeLinecap="round" />
        <Accessory kind={petKind} accent={accent} paper={paper} ink={ink} />
      </svg>
    </div>
  );
}

export default DojoPetAvatar;
