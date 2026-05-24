import type { CSSProperties } from "react";
import {
  buildWorkflowSpiritProfile,
  type WorkflowSpiritProfile,
} from "@/lib/workflow-spirit";

type DojoPetAvatarSize = "sm" | "md" | "lg";
type DojoPetKind = "genesis" | "bandana" | "horned" | "sage" | "crest";

const petKinds: readonly DojoPetKind[] = ["genesis", "bandana", "horned", "sage", "crest"];

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

function Sunburst({ red }: { red: string }) {
  const rays = Array.from({ length: 14 }, (_, index) => {
    const angle = index * (360 / 14);
    return (
      <rect
        key={angle}
        x="31.25"
        y="13.2"
        width="1.5"
        height="6.2"
        rx="0.75"
        fill={red}
        transform={`rotate(${angle} 32 21.5)`}
      />
    );
  });

  return (
    <g className="dojo-pet-sunburst">
      {rays}
      <circle cx="32" cy="21.5" r="4.7" fill={red} />
    </g>
  );
}

function Accessory({
  kind,
  accent,
  paper,
  ink,
  red,
}: {
  kind: DojoPetKind;
  accent: string;
  paper: string;
  ink: string;
  red: string;
}) {
  if (kind === "bandana") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M13 24.5 C22 22 42 22 51 24.5" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M15 24.2 C24 22.8 40 22.8 49 24.2" fill="none" stroke={paper} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M49 22.8 L56 18.5 L55 27 Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M51 23.2 L58 25.5 L53 29 Z" fill={accent} stroke={ink} strokeWidth="1.6" strokeLinejoin="round" />
      </g>
    );
  }

  if (kind === "horned") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M23 18 C18 11 18 7 23 4" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M41 18 C46 11 46 7 41 4" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 17 C21 12 21 9 24 6" fill="none" stroke={paper} strokeWidth="1.1" strokeLinecap="round" />
        <path d="M40 17 C43 12 43 9 40 6" fill="none" stroke={paper} strokeWidth="1.1" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "sage") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M14 18.5 L32 8 L50 18.5 Z" fill={paper} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 18 L32 11 L44 18" fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 22.2 C27 24 37 24 46 22.2" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      </g>
    );
  }

  if (kind === "crest") {
    return (
      <g className="dojo-pet-accessory">
        <path d="M32 7 C35 10 36 15 32 19 C28 15 29 10 32 7 Z" fill={accent} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M25 17 C29 14 36 14 40 17" fill="none" stroke={red} strokeWidth="1.8" strokeLinecap="round" />
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
  const logoLeaf = "#8dcc21";
  const logoLeafDark = "#4c9d1b";
  const visor = "#f5f4ec";
  const visorShadow = "#d9dad6";
  const eyeDark = "#260303";
  const eyeRed = "#4d0606";
  const red = "#c83231";
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
      <svg className="dojo-illustrated-pet dojo-mantis-agent" viewBox="0 0 64 64" role="presentation">
        <path className="dojo-pet-shadow-shape" d="M17 52 C26 56 41 56 49 52 C43 58 24 58 17 52 Z" fill="rgba(17,20,15,0.16)" />

        <path d="M24.5 16 C20 8 15 5 7 3.5" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        <path d="M39.5 16 C44 8 49 5 57 3.5" fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        <path d="M24.5 16 C20 8 15 5 7 3.5" fill="none" stroke={logoLeaf} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M39.5 16 C44 8 49 5 57 3.5" fill="none" stroke={logoLeaf} strokeWidth="2.6" strokeLinecap="round" />

        <Accessory kind={petKind} accent={accent} paper={paper} ink={ink} red={red} />

        <path d="M14 23 C16 16 22 13 32 14 C42 13 48 16 50 23 L47 32 C38 31 26 31 17 32 Z" fill={visorShadow} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 21 C20 16.8 25 15.8 32 16.5 C39 15.8 44 16.8 48 21 L46.5 28 C37.5 27 26.5 27 17.5 28 Z" fill={visor} stroke="rgba(17,20,15,0.18)" strokeWidth="1" strokeLinejoin="round" />

        <path d="M16.2 28 L30.3 28 L27.4 43 C22.8 40.5 18.4 36.2 16.2 28 Z" fill={eyeDark} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M47.8 28 L33.7 28 L36.6 43 C41.2 40.5 45.6 36.2 47.8 28 Z" fill={eyeDark} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M18.2 28.4 L29.4 28.4 L27.2 39.7 C23.3 37.4 20.1 33.8 18.2 28.4 Z" fill={eyeRed} opacity="0.76" />
        <path d="M45.8 28.4 L34.6 28.4 L36.8 39.7 C40.7 37.4 43.9 33.8 45.8 28.4 Z" fill={eyeRed} opacity="0.76" />

        <path d="M29.5 28 L34.5 28 L34.5 45.5 L32 50 L29.5 45.5 Z" fill={logoLeaf} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M31.1 29 L32.9 29 L32.9 44 L32 46.4 L31.1 44 Z" fill={logoLeafDark} opacity="0.55" />

        <Sunburst red={red} />

        <circle cx="52.2" cy="24.4" r="5.2" fill="#d9dad6" opacity="0.9" />
        <path d="M47 31 C53 35 55 41 52 49 C47 44 43 38 42.5 31.5 Z" fill={logoLeaf} stroke={ink} strokeWidth="1.4" strokeLinejoin="round" opacity="0.88" />
        <path d="M44 34 C48 38 50 43 49 48" fill="none" stroke={logoLeafDark} strokeWidth="1.3" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  );
}

export default DojoPetAvatar;
