"use client";

/**
 * The Why sheet (Y4a, WAVE4 D5): what's behind the bracket line, opened by
 * its "Why?" — a bottom Drawer on phones, a Modal from md (the
 * AutofillSheet split), so focus return and hotkey suppression come with
 * the editor's dialog slot. Y4a's half is two blocks:
 *
 * - **What the cards show** — the read's findings, highest first, each its
 *   sentence (which names its cards and its reason), what would change it
 *   and its named source; a combo also shows what it does, its piece count
 *   and "How it works ↗". Then "Your call": the questions only the player
 *   can answer, each with what a yes would mean — as open questions, no
 *   answer controls (Y4b stores answers). Then "Couldn't check": what was
 *   missing, never read as a lower number.
 * - **What this read assumes** — the adapter's fixed lines, the rules' page
 *   with its as-of date, and the combo source's credit.
 *
 * Attribution (D0) rides each line's source: Wizards' Game Changers list
 * (via Scryfall) and the Scryfall Tagger tag pages link out through the
 * adapter's `links`; combos credit Commander Spellbook. Every word here is
 * the adapter's or BRACKET_COPY's (D0's copy guard reads both).
 */
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { BRACKET_COPY, dateLabel, levelLabel } from "@/lib/brackets/copy";
import type {
  BracketFactor,
  BracketQuestion,
  BracketRead,
  BracketsMeta,
  CompleteCombo,
  GameAdapter,
} from "@/lib/games/types";

type ExternalUrl = (externalKey: string) => string;

export function BracketSheet({
  adapter,
  read,
  line,
  combos,
  cards,
  phone,
  onClose,
}: {
  adapter: GameAdapter;
  read: BracketRead;
  /** The bracket line's words for this read — the sheet leads with them. */
  line: string;
  /** The facts' complete combos: what each combo line does. */
  combos: readonly CompleteCombo[] | null;
  /** Card names, for a question whose sentence doesn't name its cards. */
  cards: ReadonlyMap<string, { name: string }>;
  /** Phone tier: the bottom Drawer; md+ the Modal. */
  phone: boolean;
  onClose: () => void;
}) {
  const cardsId = useId();
  const assumesId = useId();
  const brackets = adapter.brackets;
  if (!brackets) return null;
  const title = BRACKET_COPY.sheetTitle(brackets.noun);
  const combosMeta = adapter.capabilities.combos;
  const byKey = new Map((combos ?? []).map((c) => [c.key, c]));
  const findings = read.factors.filter((f) => f.atLeast !== null);
  const gaps = read.factors.filter((f) => f.atLeast === null);

  const content = (
    <div className="space-y-4">
      <div>
        <p data-slot="bracket-lead" className="text-sm font-medium">
          {line}
        </p>
        {read.status === "draft" && (
          <p className="text-muted-foreground mt-1 text-xs">{BRACKET_COPY.draftNote}</p>
        )}
      </div>

      <section aria-labelledby={cardsId} className="space-y-2">
        <h3
          id={cardsId}
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          {BRACKET_COPY.cardsShow}
        </h3>
        {findings.length === 0 ? (
          <p className="text-sm">{BRACKET_COPY.nothingFound(brackets.noun)}</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((factor) => (
              <FactorRow
                key={factor.id}
                factor={factor}
                combo={factor.combo ? byKey.get(factor.combo) : undefined}
                links={brackets.links}
                externalUrl={combosMeta?.externalUrl}
              />
            ))}
          </ul>
        )}

        {read.review.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <h4 className="text-sm font-medium">{BRACKET_COPY.yourCall}</h4>
            <p className="text-muted-foreground text-xs">{BRACKET_COPY.yourCallLead}</p>
            <ul className="space-y-1.5">
              {read.review.map((question) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  combo={question.combo ? byKey.get(question.combo) : undefined}
                  cards={cards}
                  brackets={brackets}
                  externalUrl={combosMeta?.externalUrl}
                />
              ))}
            </ul>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="space-y-1 pt-1">
            <h4 className="text-sm font-medium">{BRACKET_COPY.couldntCheck}</h4>
            <ul className="space-y-1">
              {gaps.map((gap) => (
                <li key={gap.id} className="text-xs">
                  {gap.sentence}
                  <SourceLine source={gap.source} href={brackets.links.source(gap.id)} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby={assumesId} className="space-y-2">
        <h3
          id={assumesId}
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          {BRACKET_COPY.readAssumes}
        </h3>
        <ul className="list-disc space-y-1 pl-4 text-xs">
          {read.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs leading-relaxed">
          <ExternalLink href={brackets.links.rules.href}>
            {BRACKET_COPY.rules(brackets.links.rules.label, dateLabel(read.ruleset.asOf))}
          </ExternalLink>
          {combosMeta && (
            <>
              {" · "}
              <ExternalLink href={combosMeta.sourceHref}>
                {BRACKET_COPY.combosCredit(combosMeta.sourceLabel)}
              </ExternalLink>
            </>
          )}
        </p>
      </section>
    </div>
  );

  if (phone) {
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        showSwipeHandle
      >
        <DrawerContent aria-label={title}>
          <div className="flex shrink-0 items-center justify-between gap-2 pr-2 pl-4">
            <DrawerTitle className="text-sm font-semibold">{title}</DrawerTitle>
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
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Modal label={title} onClose={onClose}>
      {content}
    </Modal>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
      <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
    </a>
  );
}

/** A line's named source — linked when the adapter has a page for it. */
function SourceLine({ source, href }: { source: string; href: string | null }) {
  return (
    <p className="text-muted-foreground mt-0.5 text-[0.7rem]">
      {href ? <ExternalLink href={href}>{source}</ExternalLink> : source}
    </p>
  );
}

/** What a combo does, how many cards it takes, and its walkthrough. */
function ComboDetails({ combo, externalUrl }: { combo: CompleteCombo; externalUrl?: ExternalUrl }) {
  return (
    <p className="text-muted-foreground mt-0.5 text-xs">
      {[...combo.results, BRACKET_COPY.pieces(combo.cardPieces.length)].join(" · ")}
      {externalUrl && (
        <>
          {" · "}
          <ExternalLink href={externalUrl(combo.key)}>{BRACKET_COPY.howItWorks}</ExternalLink>
        </>
      )}
    </p>
  );
}

function FactorRow({
  factor,
  combo,
  links,
  externalUrl,
}: {
  factor: BracketFactor;
  combo?: CompleteCombo;
  links: BracketsMeta["links"];
  externalUrl?: ExternalUrl;
}) {
  return (
    <li data-factor={factor.id} className="rounded-lg border px-2.5 py-2">
      <p className="text-sm">{factor.sentence}</p>
      {combo && <ComboDetails combo={combo} externalUrl={externalUrl} />}
      {factor.change && <p className="text-muted-foreground mt-0.5 text-xs">{factor.change}</p>}
      <SourceLine source={factor.source} href={links.source(factor.id)} />
    </li>
  );
}

function QuestionRow({
  question,
  combo,
  cards,
  brackets,
  externalUrl,
}: {
  question: BracketQuestion;
  combo?: CompleteCombo;
  cards: ReadonlyMap<string, { name: string }>;
  brackets: BracketsMeta;
  externalUrl?: ExternalUrl;
}) {
  // Name the cards only when the reason doesn't already (a chain of extra turns does not).
  const names = question.cards.flatMap((id) => {
    const name = cards.get(id)?.name;
    return name ? [name] : [];
  });
  const unnamed = names.some((name) => !question.because.includes(name));
  return (
    <li data-question={question.id} className="rounded-lg border border-dashed px-2.5 py-2">
      <p className="text-sm font-medium">{question.question}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{question.because}</p>
      {combo ? (
        <ComboDetails combo={combo} externalUrl={externalUrl} />
      ) : (
        unnamed && <p className="text-muted-foreground mt-0.5 text-xs">{names.join(", ")}</p>
      )}
      <p className="mt-0.5 text-xs">
        {BRACKET_COPY.ifYes(levelLabel(brackets, question.raisesTo))}
      </p>
      <SourceLine source={question.source} href={brackets.links.source(question.id)} />
    </li>
  );
}
