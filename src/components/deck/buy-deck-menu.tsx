"use client";

/**
 * Buy controls (W7, D6): the share row's "Buy this deck" dropdown and the
 * editor's "Buy this deck…" dialog, both rendering the same deckBuyOptions
 * items as REAL links to TCGplayer Mass Entry (target=_blank). Rendered only
 * when the adapter declares `capabilities.buy` — One Piece shows nothing,
 * with no apology copy.
 *
 * Over the URL cliff an item switches to the first-class copy path: copy the
 * list, open the bare form, toast "List copied…" (the host surface mounts
 * the Toaster). If the clipboard itself is unavailable, nothing opens and an
 * error toast points at Copy decklist — never a stranded empty tab.
 *
 * Affiliate wiring is DARK until NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE exists
 * (never on Vercel Hobby). The env reads below stay direct property accesses
 * inside this module so the build inlines them and the `rel="sponsored"` +
 * disclosure branches drop out of the client bundle entirely while unset.
 */
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  deckBuyOptions,
  massEntryHref,
  type BuyCapability,
  type BuyCard,
  type DeckBuyOption,
  type MassEntryHref,
} from "@/lib/buy/links";
import type { FormatDef } from "@/lib/games/types";

interface BuyEntry {
  cardId: string;
  zone: string;
  qty: number;
}

/** The buyable deck = the format's countsTowardSize zones (ownership's rule). */
export function countedEntries(
  entries: readonly BuyEntry[],
  format: FormatDef,
): readonly BuyEntry[] {
  const counted = new Set(format.zones.filter((z) => z.countsTowardSize).map((z) => z.id));
  return entries.filter((e) => counted.has(e.zone));
}

function buyItems(
  buy: BuyCapability,
  entries: readonly BuyEntry[],
  cards: ReadonlyMap<string, BuyCard>,
  owned?: ReadonlySet<string>,
): (DeckBuyOption & { href: MassEntryHref })[] {
  return deckBuyOptions(buy, entries, cards, owned).map((option) => ({
    ...option,
    href: massEntryHref(buy.productLine, option.lines),
  }));
}

async function copyAndOpen(href: Extract<MassEntryHref, { kind: "copy" }>) {
  try {
    await navigator.clipboard.writeText(href.text);
  } catch {
    toast.add({
      title: "Couldn't copy the list",
      description: "Your browser blocked clipboard access — use Copy decklist instead.",
      type: "error",
      timeout: 5000,
    });
    return;
  }
  window.open(href.bareUrl, "_blank", "noopener");
  toast.add({ title: "List copied — paste it into Mass Entry", type: "success", timeout: 4000 });
}

/** "sponsored" only on the affiliate day — the ternary folds away while unset. */
function outboundRel(): string {
  return process.env.NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE ? "sponsored noopener" : "noopener";
}

function BuyFooter({ vendor, className }: { vendor: string; className?: string }) {
  return (
    <>
      <p className={`text-muted-foreground text-xs ${className ?? ""}`}>
        Opens {vendor} Mass Entry in a new tab · prices via Scryfall, updated daily.
      </p>
      {process.env.NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE && (
        <p className={`text-muted-foreground text-xs ${className ?? ""}`}>
          Affiliate links — Deckwarden may earn a commission.
        </p>
      )}
    </>
  );
}

/** The share row's `[ Buy this deck ▾ ]` (D6). */
export function BuyDeckMenu({
  buy,
  entries,
  cards,
  owned,
}: {
  buy: BuyCapability;
  entries: readonly BuyEntry[];
  cards: ReadonlyMap<string, BuyCard>;
  /** Present = signed-in viewer with a collection (the share page's gate). */
  owned?: ReadonlySet<string>;
}) {
  const items = buyItems(buy, entries, cards, owned);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        Buy this deck
        <ChevronDownIcon aria-hidden />
      </DropdownMenuTrigger>
      {/* Named "Buy this deck" after its trigger, like every Base UI menu popup. */}
      <DropdownMenuContent align="start" className="min-w-52">
        {items.map((item) => {
          const href = item.href;
          const label = `${item.label} (${item.count})`;
          // LinkItem has no disabled state — an empty option is a plain
          // disabled item (a link to an empty Mass Entry form helps no one).
          if (item.count === 0) {
            return (
              <DropdownMenuItem key={item.id} disabled>
                {label}
              </DropdownMenuItem>
            );
          }
          return href.kind === "link" ? (
            <DropdownMenuLinkItem
              key={item.id}
              href={href.url}
              target="_blank"
              rel={outboundRel()}
              closeOnClick
            >
              {label}
            </DropdownMenuLinkItem>
          ) : (
            <DropdownMenuItem key={item.id} onClick={() => void copyAndOpen(href)}>
              {label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <BuyFooter vendor={buy.vendor} className="max-w-56 px-1.5 pt-1" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The editor's More → "Buy this deck…" dialog — same items, Modal shell. */
export function BuyDeckDialog({
  buy,
  entries,
  cards,
  onClose,
}: {
  buy: BuyCapability;
  entries: readonly BuyEntry[];
  cards: ReadonlyMap<string, BuyCard>;
  onClose: () => void;
}) {
  const items = buyItems(buy, entries, cards);
  return (
    <Modal label="Buy this deck" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const count = <span className="text-muted-foreground tabular-nums">{item.count}</span>;
          if (item.count === 0 || item.href.kind === "copy") {
            const href = item.href;
            return (
              <Button
                key={item.id}
                variant="outline"
                size="sm"
                className="justify-between"
                disabled={item.count === 0}
                onClick={href.kind === "copy" ? () => void copyAndOpen(href) : undefined}
              >
                {item.label}
                {count}
              </Button>
            );
          }
          return (
            <Button
              key={item.id}
              nativeButton={false}
              variant="outline"
              size="sm"
              className="justify-between"
              render={<a href={item.href.url} target="_blank" rel={outboundRel()} />}
            >
              {item.label}
              {count}
            </Button>
          );
        })}
      </div>
      <BuyFooter vendor={buy.vendor} className="mt-3" />
    </Modal>
  );
}
