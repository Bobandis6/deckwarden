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
 * Caching intent: force-dynamic — ?colors= drives the query, same reasoning
 * as /commanders; one partial-indexed read per request is cheap.
 *
 * Color filter semantics: exact colors_mask ("Red/Green leaders", not
 * "leaders that include Red") — mirrors /commanders' exact-identity call.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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

function filterHref(letters: string): string {
  return letters ? `/leaders?colors=${letters.toLowerCase()}` : "/leaders";
}

/** Small color dots + screen-reader text, shared by the index rows. */
function ColorDots({ mask }: { mask: number }) {
  const colors = OPTCG_COLORS.filter((c) => (mask & c.bit) !== 0);
  if (colors.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {colors.map((c) => (
        <span
          key={c.name}
          aria-hidden
          title={c.name}
          className="inline-block size-2.5 rounded-full"
          style={{ backgroundColor: c.hex }}
        />
      ))}
      <span className="sr-only">{colors.map((c) => c.name).join("/")}</span>
    </span>
  );
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

  const leaders = await loadOpLeaderIndex({ colorsMask });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← Deckwarden
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">One Piece Leaders</h1>
        <Button nativeButton={false} render={<Link href="/decks/new?game=optcg" />}>
          Start a deck
        </Button>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Every leader in the game, A to Z. The same name can lead very different decks — each card is
        its own archetype, so each gets its own page.
      </p>

      <nav aria-label="Color filter" className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href={filterHref("")}
          aria-current={colorsMask === null ? "page" : undefined}
          className={`rounded-md border px-2 py-1 text-sm ${colorsMask === null ? "bg-foreground text-background" : "hover:underline"}`}
        >
          All
        </Link>
        {OPTCG_COLORS.map((c) => {
          const active = activeLetters.includes(c.maskLetter);
          const next = active
            ? activeLetters.replace(c.maskLetter, "")
            : activeLetters + c.maskLetter;
          return (
            <Link
              key={c.name}
              href={filterHref(next)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-2 py-1 text-sm ${active ? "bg-foreground text-background" : "hover:underline"}`}
            >
              {c.name}
            </Link>
          );
        })}
      </nav>

      {leaders.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No leaders match that exact color pairing.{" "}
          <Link href={filterHref("")} className="underline">
            Show all leaders
          </Link>
        </p>
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
                    <ColorDots mask={leader.colorsMask} />
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
