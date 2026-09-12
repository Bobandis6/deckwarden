/**
 * The editor's compact attribution (R4): the site footer no longer renders
 * on the editor routes (a fixed-viewport workspace has no "below the
 * fold"), so the tools content ends with the credit the game needs —
 * Magic: the Scryfall / Fan Content line the footer carries site-wide;
 * One Piece: the ©BANDAI posture line every One Piece surface renders
 * (P4.1 / P4.6 require it wherever One Piece card images appear — the
 * editor was the one surface without it). The game decides which, the
 * same way the deck share page picks its posture line.
 */
import { OptcgPostureLine } from "@/components/optcg-posture-line";
import type { GameAdapter } from "@/lib/games/types";

const LINE_CLASS = "text-muted-foreground px-3 py-3 text-[0.65rem] leading-4";

export function EditorAttribution({ adapter }: { adapter: GameAdapter }) {
  if (adapter.id === "optcg") {
    return (
      <div data-slot="editor-attribution">
        <OptcgPostureLine className={LINE_CLASS} />
      </div>
    );
  }
  return (
    <p data-slot="editor-attribution" className={LINE_CLASS}>
      Card data and images courtesy of{" "}
      <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
        Scryfall
      </a>
      {" · "}unofficial Fan Content permitted under the Fan Content Policy, not approved or endorsed
      by Wizards of the Coast.
    </p>
  );
}
