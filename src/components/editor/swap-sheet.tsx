"use client";

/**
 * The swap sheets (Y7b, WAVE4 D8 "The surfaces") — a swap made from where
 * the player already is, so a full deck never passes through 99 or 101.
 * Both are the editor's dialog slot: a bottom Drawer on phones, a Modal
 * from md (the Why sheet's split), so the hotkeys stand down and focus has
 * somewhere to go back to.
 *
 * - **SwapSheet** — "Swap X": the card's alternatives (Y7a's ask and rows,
 *   shared with the Card tab's section), under the deck's goals. A deck
 *   row's "Swap…" opens it, and so does each card of the bracket sheet's
 *   conflict callout — so one swap lowers the bracket one card at a time.
 * - **SwapInSheet** — "Swap in X": an add at the deck's maximum. The card
 *   comes in and a CUT PARTNER goes out (../../lib/recommend/swap-in.ts):
 *   the Cut Coach's cheapest ordinary cut at the incoming card's mana value,
 *   named with its tradeoff line, then every other card to choose from.
 *   Combo protection is the bracket line's own combo facts — no request of
 *   its own — and the sheet says so whenever they can't protect anything.
 *
 * The swap itself is the editor's (one copy out, one in, in place; the
 * toast "Swapped A → B · Undo" whose one Undo restores both cards). The
 * editor closes the sheet on success and says where focus goes; an error
 * stays here as a line.
 */
import { XIcon } from "lucide-react";
import { useMemo, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";

import {
  AlternativesContent,
  useAlternatives,
  type SwapEditing,
} from "@/components/editor/alternatives-section";
import { sourceMeta } from "@/components/editor/recommendations-panel";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import type { BracketFactsState } from "@/lib/brackets/facts";
import type { EditorCard, EditorEntry } from "@/lib/decks/editor-state";
import type { CompleteCombo, FormatDef, GameAdapter } from "@/lib/games/types";
import { completeCombosByCard, type CutEntryInput } from "@/lib/recommend/cuts";
import { cutCombosFromFacts, planSwapIn, type SwapInOption } from "@/lib/recommend/swap-in";

type FinalFocus = ComponentProps<typeof Modal>["finalFocus"];
type InitialFocus = ComponentProps<typeof Modal>["initialFocus"];

function SheetShell({
  title,
  phone,
  initialFocus,
  finalFocus,
  onClose,
  children,
}: {
  title: string;
  phone: boolean;
  initialFocus?: InitialFocus;
  finalFocus?: FinalFocus;
  onClose: () => void;
  children: ReactNode;
}) {
  if (phone) {
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        showSwipeHandle
      >
        <DrawerContent aria-label={title} initialFocus={initialFocus} finalFocus={finalFocus}>
          <div className="flex shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            <DrawerTitle className="truncate text-sm font-semibold">{title}</DrawerTitle>
            <DrawerClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  className="pointer-coarse:size-11"
                />
              }
            >
              <XIcon />
            </DrawerClose>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Modal label={title} onClose={onClose} initialFocus={initialFocus} finalFocus={finalFocus}>
      {children}
    </Modal>
  );
}

/** "Swap X" — a card's alternatives, asked once per open, under the deck's goals. */
export function SwapSheet({
  adapter,
  card,
  swap,
  phone,
  finalFocus,
  onClose,
}: {
  adapter: GameAdapter;
  card: EditorCard;
  /** The editor's ask and swap for this card; null renders nothing. */
  swap: SwapEditing | null;
  phone: boolean;
  finalFocus?: FinalFocus;
  onClose: () => void;
}) {
  const meta = adapter.recommend?.swap;
  const [showHidden, setShowHidden] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const key = swap?.body ? JSON.stringify(swap.body) : null;
  const { state, retry } = useAlternatives(key, meta !== undefined && swap !== null);
  if (!meta || !swap) return null;
  return (
    <SheetShell title={`Swap ${card.name}`} phone={phone} finalFocus={finalFocus} onClose={onClose}>
      <div data-slot="swap-sheet" className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Cards that share a job with {card.name}. A swap keeps the deck’s count.
        </p>
        <AlternativesContent
          adapter={adapter}
          meta={meta}
          card={card}
          asked={key !== null}
          state={state}
          onRetry={retry}
          showHidden={showHidden}
          onToggleHidden={() => setShowHidden((v) => !v)}
          onPick={(row) => setSwapError(swap.onSwap(row.card) ?? null)}
          swapError={swapError}
        />
      </div>
    </SheetShell>
  );
}

/** "Swap in X" — the add at the deck's maximum: the card in, a cut partner out. */
export function SwapInSheet({
  adapter,
  format,
  incoming,
  qty,
  entries,
  cards,
  combos,
  factsState,
  phone,
  onSwap,
  finalFocus,
  onClose,
}: {
  adapter: GameAdapter;
  format: FormatDef;
  incoming: EditorCard;
  /** The copies asked for ("4 Forest"); one comes in while the deck is full. */
  qty: number;
  entries: readonly EditorEntry[];
  cards: ReadonlyMap<string, EditorCard>;
  /** The bracket line's combo facts — what protects combo pieces here. */
  combos: readonly CompleteCombo[] | null;
  factsState: BracketFactsState;
  phone: boolean;
  /** The editor's swap: this card out, the incoming one in. An error line, or nothing. */
  onSwap: (outId: string) => string | undefined;
  finalFocus?: FinalFocus;
  onClose: () => void;
}) {
  const recommend = adapter.recommend;
  const meta = recommend?.swap;
  const mainZone = format.zones.find((z) => !z.isLeaderZone);
  const leaderZones = useMemo(
    () => new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id)),
    [format],
  );
  const hasLeader = entries.some((e) => leaderZones.has(e.zone));
  // A card already in the list comes in as one more copy — the add's rule, said aloud.
  const alreadyQty = entries.reduce(
    (n, e) => (e.zone === mainZone?.id && e.cardId === incoming.id ? n + e.qty : n),
    0,
  );
  const [swapError, setSwapError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const partnerRef = useRef<HTMLButtonElement>(null);

  const plan = useMemo(() => {
    if (!recommend || !mainZone) return null;
    const cutEntries: CutEntryInput[] = [];
    for (const e of entries) {
      const card = cards.get(e.cardId);
      if (card) cutEntries.push({ card, zone: e.zone, qty: e.qty, tags: e.tags });
    }
    return planSwapIn({
      meta: recommend,
      roleTargets: adapter.hub?.roles ?? [],
      entries: cutEntries,
      excludedZones: leaderZones,
      completeCombosByCard: completeCombosByCard(
        cutCombosFromFacts(combos, cards),
        new Set(entries.map((e) => e.cardId)),
      ),
      incoming,
      zone: mainZone.id,
    });
  }, [recommend, mainZone, entries, cards, adapter, leaderZones, combos, incoming]);

  if (!meta || !plan) return null;
  const max = format.deckSize.max;
  const bucketName = plan.bucketLabel !== null ? meta.bucketName(plan.bucketLabel) : null;
  // The combo signal's honest status, the Cut Coach's rule: say so whenever it isn't live.
  const comboNote = !recommend?.combos
    ? null
    : !hasLeader
      ? `Combo warnings need a ${adapter.display.leaderNoun} — this suggestion doesn’t protect combos yet.`
      : combos !== null
        ? null
        : factsState === "checking"
          ? "Checking combos — this suggestion doesn’t protect them yet."
          : "Couldn’t check combos — this suggestion doesn’t protect them.";
  const pick = (outId: string) => setSwapError(onSwap(outId) ?? null);
  const rowProps = { adapter, incomingName: incoming.name, onPick: pick };
  // The rest of the list waits behind a toggle only while the bucket has something to show.
  const othersFolded = bucketName !== null && (plan.partner !== null || plan.sameBucket.length > 0);

  return (
    <SheetShell
      title={`Swap in ${incoming.name}`}
      phone={phone}
      initialFocus={plan.partner ? partnerRef : undefined}
      finalFocus={finalFocus}
      onClose={onClose}
    >
      <div data-slot="swap-in-sheet" className="space-y-3">
        <p className="text-sm">
          {incoming.name} comes in and one card goes out
          {max !== null ? ` — the deck stays at ${max}` : ""}.
          {qty > 1 ? " One copy at a time while the deck is full." : ""}
        </p>
        {alreadyQty > 0 && (
          <p data-slot="swap-in-already" className="text-muted-foreground text-xs">
            {incoming.name} is already in the deck (×{alreadyQty}) — this adds another copy.
          </p>
        )}
        {comboNote && <p className="text-muted-foreground text-xs">{comboNote}</p>}

        {plan.partner ? (
          <section aria-label="Suggested cut" data-slot="swap-partner" className="space-y-1">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Suggested cut
            </h3>
            <ul>
              <PartnerRow {...rowProps} option={plan.partner} primary buttonRef={partnerRef} />
            </ul>
          </section>
        ) : (
          <p data-slot="swap-no-partner" className="text-muted-foreground text-xs">
            {bucketName === null
              ? meta.unmatched(incoming)
              : `No suggested cut at ${bucketName} — choose the card to cut.`}
          </p>
        )}

        <Collapsible defaultOpen={plan.partner === null}>
          {plan.partner && (
            <CollapsibleTrigger className="text-foreground cursor-pointer text-xs font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11">
              Choose another card
            </CollapsibleTrigger>
          )}
          <CollapsibleContent className="space-y-2 pt-1.5" data-slot="swap-choices">
            {bucketName !== null && plan.sameBucket.length > 0 && (
              <section aria-label={`Also at ${bucketName}`} className="space-y-1">
                <h3 className="text-muted-foreground text-xs font-medium">Also at {bucketName}</h3>
                <ul className="space-y-1">
                  {plan.sameBucket.map((option) => (
                    <PartnerRow key={option.cardId} {...rowProps} option={option} />
                  ))}
                </ul>
              </section>
            )}
            {plan.others.length > 0 &&
              (!othersFolded ? (
                <ul aria-label="Every card" className="space-y-1">
                  {plan.others.map((option) => (
                    <PartnerRow key={option.cardId} {...rowProps} option={option} />
                  ))}
                </ul>
              ) : (
                <div className="space-y-1">
                  <button
                    type="button"
                    aria-expanded={showOthers}
                    onClick={() => setShowOthers((v) => !v)}
                    className="text-foreground cursor-pointer text-xs font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
                  >
                    {showOthers
                      ? "Hide the other cards"
                      : `Show the other ${plan.others.length} card${plan.others.length === 1 ? "" : "s"}`}
                  </button>
                  {showOthers && (
                    <ul aria-label="Other cards" className="space-y-1">
                      {plan.others.map((option) => (
                        <PartnerRow key={option.cardId} {...rowProps} option={option} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </CollapsibleContent>
        </Collapsible>

        {swapError && (
          <p role="alert" className="text-destructive text-xs">
            {swapError}
          </p>
        )}
      </div>
    </SheetShell>
  );
}

/** One card that could go out: its tradeoff's lead line (the Cut Coach's words), or none. */
function PartnerRow({
  adapter,
  incomingName,
  option,
  primary = false,
  buttonRef,
  onPick,
}: {
  adapter: GameAdapter;
  incomingName: string;
  option: SwapInOption;
  primary?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onPick: (outId: string) => void;
}) {
  const top = option.cut?.evidence[0] ?? null;
  const sources = option.cut
    ? [...new Set(option.cut.evidence.map((e) => sourceMeta(adapter, e.source).label))]
    : [];
  return (
    <li
      data-partner={option.cardId}
      className={`rounded-md border px-2 py-1.5 ${option.cut?.inCompleteCombo ? "border-amber-600/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {option.name}
          {option.qty > 1 && (
            <span className="text-muted-foreground font-normal"> ×{option.qty}</span>
          )}
        </span>
        {option.cut?.inCompleteCombo && (
          <span className="shrink-0 rounded-full border border-amber-600/40 px-1.5 text-xs leading-4 text-amber-700 dark:text-amber-400">
            in combo
          </span>
        )}
        <Button
          ref={buttonRef}
          size="xs"
          variant={primary ? "default" : "secondary"}
          className="pointer-coarse:h-11 pointer-coarse:px-3"
          aria-label={`Swap ${option.name} for ${incomingName}`}
          onClick={() => onPick(option.cardId)}
        >
          Swap
        </Button>
      </div>
      {top ? (
        <>
          <p
            className={`mt-1 text-xs leading-relaxed ${
              top.side === "keep" ? "text-amber-700 dark:text-amber-400" : ""
            }`}
          >
            {top.why}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">{sources.join(" · ")}</p>
        </>
      ) : (
        <p className="text-muted-foreground mt-0.5 text-xs">No signal data</p>
      )}
    </li>
  );
}
