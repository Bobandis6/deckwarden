/**
 * ColorChip (R5a, C14): the one color control for both games, replacing the
 * three hand-rolled ones — the /commanders text pills, the /leaders hex
 * dots, and the /cards letter buttons. A swatch (Magic: the `--mana-*`
 * pastel with the letter inside, i.e. a pip; One Piece: the Bandai frame
 * hex as a dot) beside the color's NAME, visible or `sr-only`, so the
 * accessible name is always "White" / "Purple" rather than "W" or a bare
 * dot. Colorless is `--mana-c` (Magic; there is no One Piece colorless
 * filter — a mask-0 leader does not exist).
 *
 * Three shapes over one body: `ColorChipLink` (the index filters — a Link
 * with `aria-current="page"` when active), `ColorChipButton` (the /cards
 * toggles — a native button with `aria-pressed`), and the static
 * `ColorChip` / `ColorChipList` (rows and tiles — no interaction). Active =
 * a filled chip with a ring in the game accent; keyboard focus draws an
 * outline in the same accent so the two never fight over the ring. No
 * "use client": the pages render the Link shape server-side and the
 * client CardSearch renders the button shape with its handler.
 *
 * Keys are the shared-mask letters both games' colorset grammar uses
 * (W U B R G C), so the pages' existing toggling code keeps working.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { COLOR_BIT, COLOR_ORDER, maskToLetters, type ColorLetter } from "@/lib/games/colors";
import { OPTCG_COLORS } from "@/lib/games/optcg/colors";
import { cn } from "@/lib/utils";

export type ChipGame = "mtg" | "optcg";

export interface ColorChipDef {
  /** The mask letter (colorset grammar) — the page's toggling key. */
  key: string;
  /** The color's name — always the accessible name. */
  name: string;
  /** CSS color of the swatch. */
  swatch: string;
  /** Magic's letter inside the pip; One Piece dots carry none. */
  letter: string | null;
}

const MTG_NAMES: Record<ColorLetter, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

const MTG_DEFS: ColorChipDef[] = COLOR_ORDER.map((c) => ({
  key: c,
  name: MTG_NAMES[c],
  swatch: `var(--mana-${c.toLowerCase()})`,
  letter: c,
}));

const OPTCG_DEFS: ColorChipDef[] = OPTCG_COLORS.map((c) => ({
  key: c.maskLetter,
  name: c.name,
  swatch: c.hex,
  letter: null,
}));

/** Every chip of a game in its display order (WUBRG + C; Bandai's six). */
export function colorChipDefs(game: ChipGame): ColorChipDef[] {
  return game === "mtg" ? MTG_DEFS : OPTCG_DEFS;
}

export function colorChipDef(game: ChipGame, key: string): ColorChipDef | null {
  return colorChipDefs(game).find((d) => d.key === key) ?? null;
}

/**
 * The chips a mask paints: Magic drops the C bit and shows one Colorless
 * chip for an empty identity (the ciPipsHtml rule); One Piece shows the
 * set colors, nothing for mask 0 (no One Piece card is colorless).
 */
export function chipsForMask(game: ChipGame, mask: number): ColorChipDef[] {
  if (game === "mtg") {
    const letters: string[] = maskToLetters(mask & ~COLOR_BIT.C);
    const shown = letters.length > 0 ? letters : ["C"];
    return shown.flatMap((key) => MTG_DEFS.filter((d) => d.key === key));
  }
  return OPTCG_COLORS.filter((c) => (mask & c.bit) !== 0).flatMap((c) =>
    OPTCG_DEFS.filter((d) => d.key === c.maskLetter),
  );
}

/** The swatch alone — decorative; the name beside it carries the meaning. */
export function ColorSwatch({
  game,
  def,
  className,
}: {
  game: ChipGame;
  def: ColorChipDef;
  className?: string;
}) {
  if (game === "mtg") {
    return (
      <span aria-hidden className={cn(`pip pip-${def.key.toLowerCase()}`, className)}>
        {def.letter}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-[1.35em] shrink-0 rounded-full shadow-[inset_0_-1px_0_rgb(0_0_0/0.2)]",
        className,
      )}
      style={{ backgroundColor: def.swatch }}
    />
  );
}

/** The interactive chip shell — shared with the filters' "All" pill so the row reads as one control set. */
export function chipClass(active: boolean, className?: string): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm leading-none whitespace-nowrap outline-none pointer-coarse:min-h-11 pointer-coarse:px-3",
    "focus-visible:outline-accent-game focus-visible:outline-2 focus-visible:outline-offset-2",
    active ? "bg-muted ring-accent-game font-medium ring-2" : "hover:bg-muted",
    className,
  );
}

function ChipBody({
  game,
  def,
  showLabel,
}: {
  game: ChipGame;
  def: ColorChipDef;
  showLabel: boolean;
}): ReactNode {
  return (
    <>
      <ColorSwatch game={game} def={def} />
      <span className={showLabel ? undefined : "sr-only"}>{def.name}</span>
    </>
  );
}

/** Static chip: a swatch with the color's name (visible or sr-only). */
export function ColorChip({
  game,
  color,
  showLabel = false,
  className,
}: {
  game: ChipGame;
  color: string;
  showLabel?: boolean;
  className?: string;
}) {
  const def = colorChipDef(game, color);
  if (!def) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <ChipBody game={game} def={def} showLabel={showLabel} />
    </span>
  );
}

/** Static chips for a whole mask — index rows and tiles. Renders nothing for an empty list. */
export function ColorChipList({
  game,
  mask,
  className,
}: {
  game: ChipGame;
  mask: number;
  className?: string;
}) {
  const defs = chipsForMask(game, mask);
  if (defs.length === 0) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", className)}>
      {defs.map((def) => (
        <span key={def.key} className="inline-flex items-center">
          <ColorSwatch game={game} def={def} />
          <span className="sr-only">{def.name}</span>
        </span>
      ))}
    </span>
  );
}

/** Filter chip as a link (the indexes); `aria-current="page"` marks the active one. */
export function ColorChipLink({
  game,
  color,
  href,
  active,
  showLabel = true,
  className,
}: {
  game: ChipGame;
  color: string;
  href: string;
  active: boolean;
  showLabel?: boolean;
  className?: string;
}) {
  const def = colorChipDef(game, color);
  if (!def) return null;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={chipClass(active, className)}
    >
      <ChipBody game={game} def={def} showLabel={showLabel} />
    </Link>
  );
}

/** Filter chip as a toggle button (the /cards search); `aria-pressed` carries the state. */
export function ColorChipButton({
  game,
  color,
  pressed,
  onClick,
  showLabel = true,
  className,
}: {
  game: ChipGame;
  color: string;
  pressed: boolean;
  onClick: () => void;
  showLabel?: boolean;
  className?: string;
}) {
  const def = colorChipDef(game, color);
  if (!def) return null;
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={chipClass(pressed, className)}
    >
      <ChipBody game={game} def={def} showLabel={showLabel} />
    </button>
  );
}
