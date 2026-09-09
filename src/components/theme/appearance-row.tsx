/**
 * The editor routes' appearance control (R1b). The appearance menu left the
 * site footer for the site header, and the editor routes — /decks/new with
 * a game chosen, /decks/[id]/edit — stand outside the (site) group with no
 * header of their own yet (R3 builds it). Until then this slim row keeps
 * the menu reachable on those pages: above the site footer, below the fold
 * on desktop, exactly where R1a's footer control sat. One appearance
 * control per page is the rule — (site) pages get the header's, editor
 * pages get this one.
 */
import { AppearanceMenu } from "@/components/theme/appearance-menu";

export function AppearanceRow() {
  return (
    <div className="flex justify-end px-4 py-2">
      <AppearanceMenu side="top" />
    </div>
  );
}
