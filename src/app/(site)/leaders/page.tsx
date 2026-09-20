/**
 * /leaders — the One Piece leader index (P4.4). The OP sibling of
 * /commanders, deliberately its own route: "commander" is MTG vocabulary,
 * and OP's namespace decision (hub/queries.ts header) keeps each game's hub
 * root separate. 142 leaders today — one page, no pagination.
 *
 * Ordering is name ASC (then external key): the honest zero-signal order —
 * OP popularity/prices are all-NULL, and external-key order interleaves
 * EB/OP/P/ST prefixes, a poor "newest first" proxy (LATER row 55 holds the
 * release-date map). Rows show the external key because OP names don't
 * identify leaders: 17 distinct Monkey.D.Luffys are 17 archetypes.
 *
 * Caching intent: force-dynamic — ?colors= / ?q= (W4: name filter, in
 * lockstep with /commanders) drive the query, same reasoning as
 * /commanders; one partial-indexed read per request is cheap.
 *
 * Color filter semantics: exact colors_mask ("Red/Green leaders", not
 * "leaders that include Red") — mirrors /commanders' exact-identity call.
 *
 * R5a: the filter and the row dots are the shared ColorChip (C14), and the
 * main carries `data-game="optcg"`. No List / Grid toggle here until LATER
 * row 51 fires — 142 r2.dev images on one page is exactly the throttling
 * the row warns about; the grid arrives with `img.deckwarden.gg`.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { chipClass, ColorChipLink, ColorChipList } from "@/components/color-chip";
import { EmptyState } from "@/components/empty-state";
import { GameSwitch } from "@/components/game-switch";
import { LeaderPickBanner } from "@/components/hub/leader-pick-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCardName } from "@/lib/cards/normalize";
import { loadOpLeaderIndex } from "@/lib/hub/queries";
import { lettersToMask } from "@/lib/games/colors";
import { OPTCG_COLORS } from "@/lib/games/optcg/colors";
import type { OptcgAttrs } from "@/lib/games/optcg/adapter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "One Piece Leaders",
  description:
    "Browse every One Piece Card Game leader by color — life, traits, and effect text, with a hub page for each leader.",
  // Filter variants (?colors=) canonicalize to the bare index, same call as
  // /commanders (P2.6): hubs are the landing pages, faceted lists shouldn't split.
  alternates: { canonical: "/leaders" },
};

function filterHref(letters: string, q = ""): string {
  const params = new URLSearchParams();
  if (letters) params.set("colors", letters.toLowerCase());
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/leaders?${qs}` : "/leaders";
}

export default async function LeadersPage({ searchParams }: PageProps<"/leaders">) {
  const sp = await searchParams;
  const rawColors = typeof sp.colors === "string" ? sp.colors : "";
  // Mask letters only (translate.ts grammar); unknown characters fall out.
  const mask = lettersToMask(rawColors);
  const colorsMask = mask > 0 ? mask : null;
  const activeLetters =
    colorsMask === null
      ? ""
      : OPTCG_COLORS.filter((c) => (colorsMask & c.bit) !== 0)
          .map((c) => c.maskLetter)
          .join("");

  // Name filter (W4 — /leaders parity with /commanders, the lockstep rule).
  const rawQ = typeof sp.q === "string" ? sp.q : "";
  const qActive = normalizeCardName(rawQ) !== "";

  const leaders = await loadOpLeaderIndex({ colorsMask, q: rawQ });

  return (
    <main className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="optcg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">One Piece Leaders</h1>
        <Button nativeButton={false} render={<Link href="/decks/new?game=optcg" />}>
          Start a deck
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Every leader in the game, A to Z. The same name can lead very different decks — each card is
        its own archetype, so each gets its own page.
      </p>

      {/* Contextual game switch (R1b, REDESIGN.md §2): the Commander index is one pill away. */}
      <GameSwitch active="optcg" className="mt-4" />

      {/* Pick banner (W4, D3): null server snapshot — appears after
          hydration only, above the whole filter row (same placement as
          /commanders). */}
      <LeaderPickBanner game="optcg" noun="leader" />

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Name filter (W4 — /commanders parity): plain GET form, colors
            ride along hidden, Enter submits. */}
        <form action="/leaders" method="get" role="search" className="w-full sm:w-56">
          <label htmlFor="leaders-q" className="sr-only">
            Filter by name
          </label>
          <Input
            id="leaders-q"
            type="search"
            name="q"
            defaultValue={rawQ}
            placeholder="Filter by name…"
            autoComplete="off"
            spellCheck={false}
          />
          {activeLetters && (
            <input type="hidden" name="colors" value={activeLetters.toLowerCase()} />
          )}
        </form>
        <nav aria-label="Color filter" className="flex flex-wrap gap-1.5">
          <Link
            href={filterHref("", rawQ)}
            aria-current={colorsMask === null ? "page" : undefined}
            className={chipClass(colorsMask === null)}
          >
            All
          </Link>
          {OPTCG_COLORS.map((c) => {
            const active = activeLetters.includes(c.maskLetter);
            const next = active
              ? activeLetters.replace(c.maskLetter, "")
              : activeLetters + c.maskLetter;
            return (
              <ColorChipLink
                key={c.name}
                game="optcg"
                color={c.maskLetter}
                href={filterHref(next, rawQ)}
                active={active}
              />
            );
          })}
        </nav>
      </div>

      {leaders.length === 0 ? (
        qActive ? (
          <EmptyState
            className="mt-6"
            title={`No leaders match “${rawQ.trim()}”`}
            action={
              <Link href={filterHref(activeLetters)} className="underline">
                Clear filter
              </Link>
            }
          />
        ) : (
          <EmptyState
            className="mt-6"
            title="No leaders match that exact color pairing."
            action={
              <Link href={filterHref("")} className="underline">
                Show all leaders
              </Link>
            }
          />
        )
      ) : (
        <>
          <p className="text-muted-foreground mt-6 text-sm" aria-live="polite">
            {leaders.length} leader{leaders.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-2 divide-y rounded-lg border">
            {leaders.map((leader) => {
              const attrs = leader.attrs as OptcgAttrs;
              return (
                <li key={leader.id}>
                  <Link
                    href={`/l/${leader.slug}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
                  >
                    <span className="min-w-0">
                      <span className="text-sm font-medium">{leader.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs tabular-nums uppercase">
                        {leader.externalKey}
                      </span>
                      {attrs.life != null && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {attrs.life} Life
                        </span>
                      )}
                    </span>
                    <ColorChipList game="optcg" mask={leader.colorsMask} className="text-xs" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-muted-foreground mt-12 text-xs">
        ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is
        unofficial fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei
        Animation. No official card-data API exists for the One Piece Card Game —{" "}
        <Link href="/legal#one-piece" className="underline">
          how we source this data
        </Link>
        .
      </p>
    </main>
  );
}
