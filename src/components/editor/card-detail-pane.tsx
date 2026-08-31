"use client";

/**
 * Card detail pane (P1.2): the card under the cursor — search highlight or a
 * clicked deck row. Full-card Scryfall CDN image via plain <img> (unoptimized
 * by design — CLAUDE.md; artist/© line stays visible in the frame), with the
 * adapter's display contract providing every game-flavored string.
 *
 * P2.7 adds the tag editor here (the LATER.md row's firing): when the shown
 * card has a deck entry, its tags are editable — chips with remove, an
 * add-on-Enter input, and one-click presets off the adapter's hub role
 * template (role tagging's minimal landing; editorial labels stay in the
 * adapter, nothing game-specific here).
 */
import Link from "next/link";
import { useState } from "react";

import { CostPips } from "@/components/deck/cost-pips";
import { MAX_TAG_LENGTH, MAX_TAGS, type EditorCard } from "@/lib/decks/editor-state";
import type { GameAdapter } from "@/lib/games/types";

/** Present only when the shown card is in the deck (taggable). */
export interface TagEditing {
  tags: string[];
  onSetTags: (tags: string[]) => void;
}

export function CardDetailPane({
  adapter,
  card,
  tagging = null,
}: {
  adapter: GameAdapter;
  card: EditorCard | null;
  tagging?: TagEditing | null;
}) {
  if (!card) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Search or click a card to see it here.
      </div>
    );
  }
  const statLine = adapter.display.statLine?.(card) ?? null;

  return (
    <div className="p-3">
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt={card.name}
          width={488}
          height={680}
          className="mx-auto w-full max-w-72 rounded-[4.75%/3.5%] shadow-md"
        />
      ) : (
        <div className="bg-muted mx-auto flex aspect-488/680 w-full max-w-72 items-center justify-center rounded-xl p-3 text-center text-sm">
          {card.name}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-semibold">{card.name}</h2>
        <CostPips html={adapter.display.costHtml(card)} className="text-xs" />
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm">
        {adapter.display.subtitle(card)}
        {statLine ? ` · ${statLine}` : ""}
      </p>
      <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {adapter.display.bodyText(card)}
      </div>
      {/* key: a fresh editor (and draft) per card, not one that follows the cursor */}
      {tagging && <TagEditor key={card.id} adapter={adapter} tagging={tagging} />}

      <p className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
        <span>{card.cheapestUsd !== null ? `from $${card.cheapestUsd.toFixed(2)}` : ""}</span>
        <Link href={`/cards/${card.id}`} className="hover:underline" target="_blank">
          Card page →
        </Link>
      </p>
    </div>
  );
}

function TagEditor({ adapter, tagging }: { adapter: GameAdapter; tagging: TagEditing }) {
  const [draft, setDraft] = useState("");
  const { tags, onSetTags } = tagging;

  const add = (tag: string) => {
    // onSetTags routes through the pure setTags → normalizeTags, so raw
    // input (dupes, whitespace) is safe to hand over as-is.
    if (tag.trim()) onSetTags([...tags, tag]);
    setDraft("");
  };

  const applied = new Set(tags.map((t) => t.toLowerCase()));
  const presets = (adapter.hub?.roles ?? [])
    .map((r) => r.label)
    .filter((label) => !applied.has(label.toLowerCase()));

  return (
    <div className="mt-3 border-t pt-2">
      <h3 className="text-muted-foreground text-xs font-medium">Tags in this deck</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1">
        {tags.map((tag) => (
          <li key={tag}>
            <span className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onSetTags(tags.filter((t) => t !== tag))}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ×
              </button>
            </span>
          </li>
        ))}
        {tags.length < MAX_TAGS && (
          <li>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add(draft);
                }
              }}
              onBlur={() => add(draft)}
              placeholder="Add tag…"
              aria-label="Add tag"
              maxLength={MAX_TAG_LENGTH}
              size={8}
              className="focus-visible:ring-ring/50 rounded-full border border-dashed px-2 py-0.5 text-xs outline-none focus-visible:ring-2"
            />
          </li>
        )}
      </ul>
      {presets.length > 0 && tags.length < MAX_TAGS && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {presets.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => add(label)}
              className="text-muted-foreground hover:text-foreground cursor-pointer rounded-full border px-2 py-0.5 text-xs"
            >
              + {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
