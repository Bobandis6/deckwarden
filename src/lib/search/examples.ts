/**
 * The search's "Try" examples (SEARCH-EXAMPLES, idea 5 of
 * DESIGN-REFERENCES-2026-11-02.md, build 3 of
 * DESIGN-REFERENCES-session-prompt.md): real searches that teach what the
 * boxes accept, where nothing on screen did. Pure: a day and home's rows
 * come in, links come out.
 *
 * The four (the study's): two of the day's hero commanders (magicHome's fan
 * for that UTC day, so the line names commanders home's hero is showing), a
 * staple every Magic player knows, and one One Piece card number, the
 * syntax the One Piece box takes beside names (P4.8's id pass). A commander
 * is named by the part of its name before the first comma ("Atraxa" for
 * "Atraxa, Praetors' Voice"): the box ranks a part of a name, which is the
 * thing worth teaching, and no comma lands inside a sentence of links. When
 * two of the fan share that part, the next fan card stands in, so two links
 * never run one search.
 *
 * Each example carries its game and its link: `/cards?q=<text>`, with
 * `game=optcg` for One Piece, the params /cards reads. /cards shows its own
 * game's examples; the header's box, which searches both games, shows all
 * four with the open page's game first.
 */
import { magicHome, type MagicShelfRow } from "@/lib/home/shelves";

export type ExampleGame = "mtg" | "optcg";

export interface SearchExample {
  /** What the box would hold: the link's words and its `q`. */
  text: string;
  /** The corpus it searches (/cards' tab). */
  game: ExampleGame;
  /** The search itself: /cards with `q`, and `game=optcg` for One Piece. */
  href: string;
}

/** How many of the day's commanders the examples name. */
export const COMMANDER_EXAMPLES = 2;

/** The staple: in nearly every Commander deck, and its name is its whole search. */
export const STAPLE_EXAMPLE = "Sol Ring";

/**
 * One Piece's example: a card number. OP01-001 is the first card of the
 * first set (a leader), so it never moves.
 */
export const ONE_PIECE_EXAMPLE = "OP01-001";

/** A name as an example: the front face, up to its first comma. */
export function exampleName(name: string): string {
  const front = name.split(" // ")[0];
  const comma = front.indexOf(",");
  return (comma > 0 ? front.slice(0, comma) : front).trim();
}

/** The search an example runs: /cards with `q`, and the game when it is One Piece. */
export function exampleHref(text: string, game: ExampleGame): string {
  const params = new URLSearchParams(game === "optcg" ? { game, q: text } : { q: text });
  return `/cards?${params}`;
}

function example(text: string, game: ExampleGame): SearchExample {
  return { text, game, href: exampleHref(text, game) };
}

/**
 * The day's examples, in the order /cards and the header show them: the
 * day's commanders (the fan's order, highest-ranked first), the staple,
 * One Piece's card number. With no rows (a cold corpus) the commanders are
 * simply absent. `day` is the UTC day key (`utcDayKey`), the caller's: the
 * same rows and day always give the same examples.
 */
export function searchExamples(day: string, rows: readonly MagicShelfRow[]): SearchExample[] {
  const names: string[] = [];
  for (const card of magicHome(rows, day).fan) {
    const text = exampleName(card.name);
    if (names.length < COMMANDER_EXAMPLES && text !== "" && !names.includes(text)) {
      names.push(text);
    }
  }
  return [
    ...names.map((text) => example(text, "mtg")),
    example(STAPLE_EXAMPLE, "mtg"),
    example(ONE_PIECE_EXAMPLE, "optcg"),
  ];
}
