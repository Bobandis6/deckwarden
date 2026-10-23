/**
 * /brackets — Commander brackets, explained from Deckwarden's own data
 * (BRACKETS-PAGE, DECKCHECK-STUDY §2.2): the five levels from the versioned
 * ruleset the read applies, the Game Changers as the database last flagged
 * them, what the read assumes and what it asks the player, and every
 * precon's read as the honest example (each tile's own line, counted). It
 * reads nothing a visitor types: the door is the editor's Paste a list
 * import. Until now brackets were explained only inside a deck's Why sheet.
 *
 * The words: the adapter's (`brackets.guide`: the levels' rows, the list,
 * the assumption lines and the reasons; the questions; the tiles' lines)
 * beside this page's own prose. Every allowance comes off the reviewed
 * table, so a ruleset bump moves the page with the read, and links Wizards'
 * own text with both dates shown (the rules' and the list's revision). It
 * never says a precon belongs in Bracket 2: Wizards dropped that tie, and
 * the spread is what the read finds. Nothing from another site's guide
 * enters it (the study's boundary).
 *
 * Caching intent: ISR, revalidate daily, like /sets and /precons. Four
 * statements per revalidation and zero per visit: the list's cards (one,
 * loadBracketListCards) and the precons' bracket facts (three,
 * loadPreconBracketFacts: the cards, the complete combos and the
 * freshness, which the list's "last checked" shares). Whether a feed is
 * stale is decided at revalidation time, and a stale list is shown and
 * said to be stale, never hidden. No searchParams, headers() or cookies(),
 * by design: any of them would render the page on every hit. About one
 * ISR write a day (every deploy empties ISR; Next 16's HTML is not byte
 * stable).
 *
 * Magic only: One Piece declares no brackets, so there is nothing to
 * switch to and no game pills.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CardImage } from "@/components/cards/card-image";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BRACKET_COPY, dateLabel, levelLabel, nounLabel } from "@/lib/brackets/copy";
import { loadBracketListCards } from "@/lib/brackets/list";
import { preconSpread } from "@/lib/decks/precon-brackets";
import { loadPreconBracketFacts } from "@/lib/decks/precons";
import { startDoorHref, startDoors } from "@/lib/decks/start-doors";
import { TILE_IMAGE } from "@/lib/decks/tiles";
import { getAdapter } from "@/lib/games/registry";
import type { FeedFreshness } from "@/lib/games/types";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Commander brackets",
  description:
    "What each Commander bracket allows, the current Game Changers list, and how Deckwarden reads a deck against them.",
  alternates: { canonical: "/brackets" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** When the list's flags were last read, and whether that is still fresh (the adapter's call). */
function lastCheck(found: number, feed: FeedFreshness | null): string {
  const these = `these ${plural(found, "card", "cards")}`;
  if (feed?.asOf && (feed.state === "ok" || feed.state === "stale")) {
    const flagged = `Scryfall flagged ${these} at the last check, ${dateLabel(feed.asOf)}.`;
    return feed.state === "ok"
      ? flagged
      : `${flagged} That check is out of date, so the list may have changed since.`;
  }
  return `The card data flags ${these}. When the flags were last checked couldn't be read.`;
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="underline underline-offset-2" rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

export default async function BracketsPage() {
  const adapter = getAdapter("mtg");
  const brackets = adapter.brackets;
  const guide = brackets?.guide;
  if (!brackets || !guide) throw new Error("The Magic adapter declares no bracket guide.");
  const commander = adapter.formats.find((f) => f.code === "commander");
  const [cards, facts] = await Promise.all([
    loadBracketListCards(adapter),
    loadPreconBracketFacts(adapter),
  ]);
  const spread = commander ? preconSpread({ adapter, format: commander, facts }) : null;
  const feed = facts.freshness?.feeds[guide.list.feed] ?? null;
  const first = brackets.levels[0];
  const last = brackets.levels[brackets.levels.length - 1];
  const noun = nounLabel(brackets);
  const paste = commander ? startDoors(adapter, commander).find((d) => d.kind === "paste") : null;
  const precons = adapter.display.preconBrowse;
  const combos = adapter.capabilities.combos;
  const holdsMore = spread ? spread.reasons.reduce((n, r) => n + r.count, 0) > spread.past : false;

  return (
    <main id="main" className="max-w-browse mx-auto w-full flex-1 px-4 py-8" data-game="mtg">
      <h1 className="type-title">Commander brackets</h1>
      <p className="text-muted-foreground max-w-reading mt-1 text-sm text-pretty">
        Brackets give a Commander table one vocabulary before the game starts: Wizards of the
        Coast&apos;s levels, from {levelLabel(brackets, first.level)} to{" "}
        {levelLabel(brackets, last.level)}. This page shows what each one allows and how Deckwarden
        reads a deck against them.
      </p>

      <section aria-labelledby="brackets-levels" className="mt-10">
        <h2 id="brackets-levels" className="type-section">
          What each bracket allows
        </h2>
        <p className="text-muted-foreground max-w-reading mt-1 text-sm">
          From <External href={brackets.links.rules.href}>{brackets.links.rules.label}</External> as
          of {dateLabel(guide.rulesAsOf)}, the rules the read applies.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {guide.levels.map((level) => (
            <li
              key={level.level}
              data-slot="bracket-level"
              data-level={level.level}
              className="rounded-lg border p-4"
            >
              <h3 className="type-small">{levelLabel(brackets, level.level)}</h3>
              {/* One card a row on phones: each rule beside its value, so the
                  five cards stay short; stacked once the cards share a row. */}
              <dl className="mt-3 space-y-2">
                {level.rows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[8rem_1fr] items-baseline gap-x-3 sm:block"
                  >
                    <dt className="type-meta text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        <p className="max-w-reading mt-4 text-sm">{guide.levelsNote}</p>
      </section>

      <section aria-labelledby="brackets-list" className="mt-10">
        <h2 id="brackets-list" className="type-section">
          {`The ${guide.list.label}`}
        </h2>
        <p className="max-w-reading mt-1 text-sm">{guide.list.allowance}</p>
        <p className="text-muted-foreground max-w-reading mt-1 text-sm" data-slot="list-check">
          <External href={guide.list.href}>Wizards&apos; list</External> as of{" "}
          {dateLabel(guide.list.asOf)} named {plural(guide.list.count, "card", "cards")}.{" "}
          {lastCheck(cards.length, feed)}
        </p>
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-x-2 gap-y-3 sm:grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] sm:gap-3">
          {cards.map((card) => (
            <li key={card.id} data-slot="list-card">
              <Link
                href={`/cards/${card.id}`}
                className="focus-visible:ring-accent-game block rounded-[4.75%/3.5%] outline-none focus-visible:ring-2"
              >
                {/* The caption names the link; an image-less card's box repeats
                    the name for the eye only. */}
                <CardImage
                  src={card.image}
                  alt=""
                  width={TILE_IMAGE.width}
                  height={TILE_IMAGE.height}
                  frame
                  className="h-auto w-full"
                  fallback={<span aria-hidden="true">{card.name}</span>}
                />
                <span
                  data-slot="list-card-name"
                  className="mt-1.5 line-clamp-2 text-xs font-medium"
                >
                  {card.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="brackets-read" className="mt-10">
        <h2 id="brackets-read" className="type-section">
          How Deckwarden reads a deck
        </h2>
        <p className="max-w-reading mt-1 text-sm">
          It reads the card list against the rules above and names the lowest {brackets.noun} the
          cards prove. It gives no score: what the cards can&apos;t show, it asks you.
        </p>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="type-small">What the read assumes</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm" data-slot="read-assumes">
              {guide.assumptions(facts.freshness).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="type-small">What only you can say</h3>
            <p className="mt-2 text-sm">
              In a deck&apos;s Why sheet, {BRACKET_COPY.howItPlays} asks:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm" data-slot="read-asks">
              {brackets.questions.map((q) => (
                <li key={q.key}>{q.question}</li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-sm">{BRACKET_COPY.howItPlaysLead}</p>
            {brackets.speed && (
              <p className="mt-2 text-sm">
                The sheet also shows how fast a list looks (fast mana, tutors and the curve), and
                those never change the {brackets.noun}.
              </p>
            )}
          </div>
        </div>

        {spread && spread.total > 0 && (
          <div className="mt-8">
            <h3 className="type-small">Every precon, read the same way</h3>
            <p className="max-w-reading mt-2 text-sm">
              Wizards no longer ties precons to {levelLabel(brackets, 2)}, so Deckwarden reads each
              one as printed, like any other list, with no answers given. What the read says today
              about all {spread.total}:
            </p>
            <div className="max-w-reading mt-3">
              <Table data-slot="precon-spread">
                <TableHeader>
                  <TableRow>
                    <TableHead>What the read says</TableHead>
                    <TableHead className="text-right">Precons</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spread.lines.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell>{row.line}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {spread.base && spread.past > 0 && (
              <>
                <p className="max-w-reading mt-6 text-sm" data-slot="precon-past">
                  {plural(spread.past, "precon reads", "precons read")} higher than {noun}{" "}
                  {spread.base.label}. What puts {spread.past === 1 ? "it" : "them"} there
                  {holdsMore ? " (a precon can hold more than one):" : ":"}
                </p>
                <div className="max-w-reading mt-3">
                  <Table data-slot="precon-reasons">
                    <TableHeader>
                      <TableRow>
                        <TableHead>What it holds</TableHead>
                        <TableHead className="text-right">Precons</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spread.reasons.map((row) => (
                        <TableRow key={row.reason}>
                          <TableCell>{row.reason}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            <p className="text-muted-foreground max-w-reading mt-3 text-xs">{brackets.tableNote}</p>
            {precons && (
              <p className="mt-3 text-sm">
                <Link href={precons.href} className="underline underline-offset-4">
                  See each precon&apos;s read
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      {paste && (
        <section
          aria-labelledby="brackets-door"
          className="mt-10 rounded-lg border p-4 sm:p-6"
          data-slot="bracket-door"
        >
          <h2 id="brackets-door" className="type-section">
            Read your own deck
          </h2>
          <p className="max-w-reading mt-1 text-sm">
            Paste a decklist and the editor reads it the same way, card by card, with the reasons
            beside it.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href={startDoorHref(paste, adapter.id)} />}>
              Check a deck
            </Button>
            {precons && (
              <Button variant="ghost" nativeButton={false} render={<Link href={precons.href} />}>
                {precons.label}
              </Button>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="brackets-sources" className="mt-10">
        <h2 id="brackets-sources" className="type-section">
          Sources
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            The brackets and the Game Changers list: Wizards of the Coast&apos;s{" "}
            <External href={brackets.links.rules.href}>Commander Brackets</External> and{" "}
            <External href={guide.list.href}>Game Changers</External>
          </li>
          <li>
            Card data, images and the Game Changer flags:{" "}
            <External href="https://scryfall.com">Scryfall</External>
          </li>
          <li>
            Mass land denial and extra turns, tagged by its community:{" "}
            <External href="https://tagger.scryfall.com">Scryfall Tagger</External>
          </li>
          {combos && (
            <li>
              Combos and their ratings:{" "}
              <External href={combos.sourceHref}>{combos.sourceLabel}</External>
            </li>
          )}
        </ul>
        <p className="text-muted-foreground mt-6 text-xs">
          Deckwarden is unofficial Fan Content and is not endorsed by Wizards of the Coast.
        </p>
      </section>
    </main>
  );
}
