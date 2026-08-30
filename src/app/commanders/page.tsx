/**
 * /commanders — the leader index (P2.4): browse commanders by color and
 * popularity. Rows come straight from card data (edhrec_rank order), so the
 * page is honest with zero users.
 *
 * Caching intent: force-dynamic — ?colors= / ?page= drive the query, and
 * one partial-indexed read (ci_leaders) per request is cheap; if this page
 * ever shows up in Neon compute, the upgrade path is ISR per filter
 * combination, not a rethink.
 *
 * Color filter semantics: exact color identity ("Azorius commanders", not
 * "commanders that include W or U") — the way players name the space.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { ciPipsHtml, COLOR_ORDER, lettersToMask, maskToLetters } from "@/lib/games/colors";
import { LEADERS_PAGE_SIZE, loadLeaderIndex } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commanders",
  description: "Browse Commander leaders by color identity and popularity.",
  // Filter/page variants (?colors=, ?page=) canonicalize to the bare index —
  // hubs are the real landing pages; faceted lists shouldn't split them (P2.6).
  alternates: { canonical: "/commanders" },
};

const COLOR_LABEL: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
  C: "Colorless",
};

function filterHref(letters: string, page = 1): string {
  const params = new URLSearchParams();
  if (letters) params.set("colors", letters.toLowerCase());
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/commanders?${qs}` : "/commanders";
}

export default async function CommandersPage({ searchParams }: PageProps<"/commanders">) {
  const sp = await searchParams;
  const rawColors = typeof sp.colors === "string" ? sp.colors : "";
  const rawPage = typeof sp.page === "string" ? Number(sp.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100 ? rawPage : 1;

  // "c" alone = exactly colorless (mask 0); letters = exactly that identity.
  const wantsColorless = /c/i.test(rawColors);
  const colorMask = lettersToMask(rawColors.replace(/c/gi, ""));
  const ciMask = wantsColorless && colorMask === 0 ? 0 : colorMask > 0 ? colorMask : null;
  const activeLetters = ciMask === null ? "" : ciMask === 0 ? "C" : maskToLetters(ciMask).join("");

  const leaders = await loadLeaderIndex({ ciMask, page });
  const hasNext = leaders.length === LEADERS_PAGE_SIZE;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← Deckwarden
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight">Commanders</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Ranked by how much each commander is actually played (EDHREC data via Scryfall).
      </p>

      <nav aria-label="Color identity filter" className="mt-4 flex flex-wrap gap-1.5">
        <Link
          href={filterHref("")}
          aria-current={ciMask === null ? "page" : undefined}
          className={`rounded-md border px-2 py-1 text-sm ${ciMask === null ? "bg-foreground text-background" : "hover:underline"}`}
        >
          All
        </Link>
        {COLOR_ORDER.map((c) => {
          // Toggle the letter within the current exact-identity selection.
          const next =
            c === "C"
              ? activeLetters === "C"
                ? ""
                : "C"
              : activeLetters.includes(c)
                ? activeLetters.replace(c, "").replace("C", "")
                : activeLetters.replace("C", "") + c;
          const active = c === "C" ? activeLetters === "C" : activeLetters.includes(c);
          return (
            <Link
              key={c}
              href={filterHref(next)}
              aria-current={active ? "page" : undefined}
              className={`rounded-md border px-2 py-1 text-sm ${active ? "bg-foreground text-background" : "hover:underline"}`}
            >
              {COLOR_LABEL[c]}
            </Link>
          );
        })}
      </nav>

      {leaders.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          No commanders match that exact color identity{page > 1 ? " on this page" : ""}.{" "}
          <Link href={filterHref(activeLetters)} className="underline">
            Back to page 1
          </Link>
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border">
          {leaders.map((leader, i) => (
            <li key={leader.id}>
              <Link
                href={`/c/${leader.slug}`}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:underline"
              >
                <span className="min-w-0">
                  <span className="text-muted-foreground mr-2 text-xs tabular-nums">
                    {(page - 1) * LEADERS_PAGE_SIZE + i + 1}
                  </span>
                  <span className="text-sm font-medium">{leader.name}</span>
                </span>
                <span
                  className="shrink-0"
                  dangerouslySetInnerHTML={{ __html: ciPipsHtml(leader.ciMask) }}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        {page > 1 ? (
          <Link href={filterHref(activeLetters, page - 1)} className="underline">
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {hasNext && (
          <Link href={filterHref(activeLetters, page + 1)} className="underline">
            Next →
          </Link>
        )}
      </div>

      <p className="text-muted-foreground mt-12 text-xs">
        Card data courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        . Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
      </p>
    </main>
  );
}
