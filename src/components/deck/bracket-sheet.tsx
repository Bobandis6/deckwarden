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
 *   can answer, each with what a yes would mean. Then "Couldn't check":
 *   what was missing, never read as a lower number.
 * - **What this read assumes** — the adapter's fixed lines, the rules' page
 *   with its as-of date, and the combo source's credit.
 *
 * Y4b's half — only when the editor hands the sheet the deck's goals and a
 * way to change them (`onGoalsChange`); without it the sheet reads exactly
 * as Y4a's:
 *
 * - **"Rules changed since you answered"** first, when the answers were
 *   given under an older ruleset — they still count — with "Keep my
 *   answers" (the same answers, stamped with today's rules);
 * - **Your call** gains Yes / No / Not sure per question, by its stable id;
 * - **Your target** — `Segmented` 1–5 · Not set, the conflict callout (the
 *   findings above the target, each with its reason and what would change
 *   it; Y7b adds "Swap…"), the table-exceptions line, and the note that the
 *   share page shows them;
 * - **How it plays** — optional and collapsed: the adapter's four
 *   questions, Yes / No / Not sure each. Answers only ever raise the read
 *   and are never asked again after ordinary edits.
 *
 * Y5: without `onGoalsChange` (the share page) the sheet reads only — Y4a's
 * blocks, and on each of Your call's questions the owner's answer when the
 * page shows it (a yes or a no the read used; goals.ts' tableGoals).
 *
 * Y6a: the owner's goals line under the lead ("Your goals: Bracket 2 (Core)
 * · ≤ $5 a card · Change" — the budget's only place in the sheet), its
 * "Change" bringing Your target into view; and `openAt: "target"` (the goals
 * line in Suggestions) opens the sheet with focus on the target's choice.
 *
 * Y7b (WAVE4 D8): the conflict callout's rows gain "Swap {card}…" — one per
 * card a finding names that the editor can swap (`canSwap`: a main-list
 * card the adapter offers alternatives for, so never the commander or a
 * land). `onSwapCard` hands the card to the editor, which closes this
 * sheet and opens that card's alternatives under the goals; focus comes
 * back to "Why?", so the next card is one Enter away. Without
 * `onSwapCard` (the share page) the callout reads as before.
 *
 * Every change goes through goals.ts' pure edits and back to the editor,
 * which saves it like any edit (a draft mints its row) — and never asks
 * for the combo facts again: goals don't change the card set.
 *
 * Attribution (D0) rides each line's source: Wizards' Game Changers list
 * (via Scryfall) and the Scryfall Tagger tag pages link out through the
 * adapter's `links`; combos credit Commander Spellbook. Every word here is
 * the adapter's or BRACKET_COPY's (D0's copy guard reads both).
 */
import { ArrowUpRightIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { GoalsLine } from "@/components/deck/goals-line";
import { Segmented } from "@/components/deck/segmented";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { BRACKET_COPY, dateLabel, levelLabel } from "@/lib/brackets/copy";
import {
  EXCEPTIONS_MAX,
  restampAnswers,
  withAnswer,
  withExceptions,
  withTarget,
  type DeckGoals,
} from "@/lib/decks/goals";
import type {
  BracketAnswer,
  BracketFactor,
  BracketQuestion,
  BracketRead,
  BracketsMeta,
  CompleteCombo,
  GameAdapter,
} from "@/lib/games/types";

type ExternalUrl = (externalKey: string) => string;

const ANSWER_OPTIONS: { value: BracketAnswer; label: string }[] = [
  { value: "yes", label: BRACKET_COPY.yes },
  { value: "no", label: BRACKET_COPY.no },
  { value: "unsure", label: BRACKET_COPY.unsure },
];
/** The target's "Not set" segment. */
const NO_TARGET = "none";

const SECTION_HEADING = "text-muted-foreground text-xs font-medium tracking-wide uppercase";

export function BracketSheet({
  adapter,
  read,
  line,
  combos,
  cards,
  phone,
  goals = null,
  onGoalsChange,
  openAt = null,
  onSwapCard,
  canSwap,
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
  /** The deck's goals (Y4b) — what the read was assessed with. */
  goals?: DeckGoals | null;
  /** Y4b: the target and the answers become choices; absent, the sheet only reads. */
  onGoalsChange?: (next: DeckGoals | null) => void;
  /** Y6a: "target" opens the sheet with focus on Your target's choice (the goals line's "Change"). */
  openAt?: "target" | null;
  /** Y7b: the conflict callout's "Swap {card}…" — the editor's swap sheet for that card. */
  onSwapCard?: (cardId: string) => void;
  /** Y7b: which of a finding's cards the editor can swap. */
  canSwap?: (cardId: string) => boolean;
  onClose: () => void;
}) {
  const cardsId = useId();
  const assumesId = useId();
  const targetRef = useRef<HTMLElement>(null);
  /** Your target's pressed choice ("Not set" when none), else the block. */
  const targetFocus = () =>
    targetRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? targetRef.current;
  const initialFocus =
    openAt === "target" && onGoalsChange ? () => targetFocus() ?? null : undefined;
  const goToTarget = () => {
    targetRef.current?.scrollIntoView?.({ block: "start" });
    targetFocus()?.focus();
  };
  const brackets = adapter.brackets;
  if (!brackets) return null;
  const title = BRACKET_COPY.sheetTitle(brackets.noun);
  const combosMeta = adapter.capabilities.combos;
  const byKey = new Map((combos ?? []).map((c) => [c.key, c]));
  const findings = read.factors.filter((f) => f.atLeast !== null);
  const gaps = read.factors.filter((f) => f.atLeast === null);
  const version = brackets.ruleset.version;
  const answerCall = onGoalsChange
    ? (id: string, answer: BracketAnswer) =>
        onGoalsChange(
          withAnswer(goals, "calls", id, answer, {
            rulesetVersion: version,
            live: read.review.map((q) => q.id),
          }),
        )
    : undefined;

  const content = (
    <div className="space-y-4">
      <div>
        <p data-slot="bracket-lead" className="text-sm font-medium">
          {line}
        </p>
        {read.status === "draft" && (
          <p className="text-muted-foreground mt-1 text-xs">{BRACKET_COPY.draftNote}</p>
        )}
        {onGoalsChange &&
          (goals?.targetLevel !== undefined || goals?.budget?.perCardUsd !== undefined) && (
            <GoalsLine brackets={brackets} goals={goals} onChange={goToTarget} className="mt-1" />
          )}
      </div>

      {onGoalsChange && read.answersStale && (
        <div data-slot="bracket-stale" className="space-y-1.5 rounded-lg border px-2.5 py-2">
          <p className="text-sm font-medium">{BRACKET_COPY.rulesChanged}</p>
          <p className="text-muted-foreground text-xs">{BRACKET_COPY.rulesChangedLead}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoalsChange(restampAnswers(goals, version))}
          >
            {BRACKET_COPY.keepAnswers}
          </Button>
        </div>
      )}

      <section aria-labelledby={cardsId} className="space-y-2">
        <h3 id={cardsId} className={SECTION_HEADING}>
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
                  onAnswer={answerCall}
                />
              ))}
            </ul>
            {answerCall && (
              <p className="text-muted-foreground text-xs">{BRACKET_COPY.answersShown}</p>
            )}
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

      {onGoalsChange && (
        <TargetBlock
          brackets={brackets}
          read={read}
          goals={goals}
          onGoalsChange={onGoalsChange}
          sectionRef={targetRef}
          cards={cards}
          onSwapCard={onSwapCard}
          canSwap={canSwap}
        />
      )}

      {onGoalsChange && (
        <HowItPlays
          brackets={brackets}
          stale={read.answersStale}
          goals={goals}
          onGoalsChange={onGoalsChange}
        />
      )}

      <section aria-labelledby={assumesId} className="space-y-2">
        <h3 id={assumesId} className={SECTION_HEADING}>
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
        <DrawerContent aria-label={title} initialFocus={initialFocus}>
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
    <Modal label={title} onClose={onClose} initialFocus={initialFocus}>
      {content}
    </Modal>
  );
}

/**
 * Your target (Y4b): the declared level, what's above it, and the table's
 * exceptions. The target never changes the read — the callout lists the
 * read's own `conflicts`, so a target below the cards can't hide them.
 */
function TargetBlock({
  brackets,
  read,
  goals,
  onGoalsChange,
  sectionRef,
  cards,
  onSwapCard,
  canSwap,
}: {
  brackets: BracketsMeta;
  read: BracketRead;
  goals: DeckGoals | null;
  onGoalsChange: (next: DeckGoals | null) => void;
  /** Y6a: the goals line's "Change" and `openAt: "target"` bring this block into view. */
  sectionRef?: RefObject<HTMLElement | null>;
  /** Card names for the callout's swap buttons. */
  cards: ReadonlyMap<string, { name: string }>;
  onSwapCard?: (cardId: string) => void;
  canSwap?: (cardId: string) => boolean;
}) {
  const headingId = useId();
  const exceptionsId = useId();
  // The line as typed (spaces and all); goals keep it trimmed. The sheet
  // remounts on every open, so this starts from what was saved.
  const [exceptions, setExceptions] = useState(goals?.exceptions ?? "");
  const target = goals?.targetLevel ?? null;
  const options = [
    ...brackets.levels.map((l) => ({ value: String(l.level), label: String(l.level) })),
    { value: NO_TARGET, label: BRACKET_COPY.notSet },
  ];
  const above = new Set(read.conflicts);
  const conflicting = read.factors.filter((f) => above.has(f.id));

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      data-slot="bracket-target"
      className="scroll-mt-2 space-y-2"
    >
      <h3 id={headingId} className={SECTION_HEADING}>
        {BRACKET_COPY.yourTarget}
      </h3>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Segmented
          ariaLabel={BRACKET_COPY.yourTarget}
          options={options}
          value={target === null ? NO_TARGET : String(target)}
          onChange={(value) =>
            onGoalsChange(withTarget(goals, value === NO_TARGET ? null : Number(value)))
          }
        />
        {target !== null && (
          <span className="text-muted-foreground text-xs">{levelLabel(brackets, target)}</span>
        )}
      </div>

      {target !== null && conflicting.length > 0 && (
        <div data-slot="bracket-conflicts" className="space-y-1.5 rounded-lg border px-2.5 py-2">
          <h4 className="text-sm font-medium">{BRACKET_COPY.aboveTarget}</h4>
          <p className="text-muted-foreground text-xs">
            {BRACKET_COPY.aboveTargetLead(levelLabel(brackets, target))}
          </p>
          <ul className="space-y-1.5">
            {conflicting.map((factor) => {
              // Y7b: one "Swap…" per card the editor can swap, in the factor's (name)
              // order — none without a way to swap (the share page).
              const swappable = onSwapCard
                ? factor.cards.filter((id) => cards.has(id) && (canSwap?.(id) ?? false))
                : [];
              return (
                <li key={factor.id} data-conflict={factor.id}>
                  <p className="text-sm">{factor.sentence}</p>
                  {factor.change && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{factor.change}</p>
                  )}
                  {swappable.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {swappable.map((id) => (
                        <Button
                          key={id}
                          type="button"
                          variant="outline"
                          size="xs"
                          className="max-w-full pointer-coarse:h-11 pointer-coarse:px-3"
                          onClick={() => onSwapCard?.(id)}
                        >
                          <span className="truncate">Swap {cards.get(id)?.name}…</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={exceptionsId} className="text-xs font-medium">
          {BRACKET_COPY.exceptions}
        </label>
        <Input
          id={exceptionsId}
          value={exceptions}
          maxLength={EXCEPTIONS_MAX}
          placeholder={brackets.exceptionsHint}
          autoComplete="off"
          className="pointer-coarse:h-11"
          onChange={(e) => {
            setExceptions(e.target.value);
            onGoalsChange(withExceptions(goals, e.target.value));
          }}
        />
      </div>
      <p className="text-muted-foreground text-xs">{BRACKET_COPY.shownOnSharePage}</p>
    </section>
  );
}

/** How it plays (Y4b): optional and collapsed — open by itself only when the rules changed. */
function HowItPlays({
  brackets,
  stale,
  goals,
  onGoalsChange,
}: {
  brackets: BracketsMeta;
  stale: boolean;
  goals: DeckGoals | null;
  onGoalsChange: (next: DeckGoals | null) => void;
}) {
  const headingId = useId();
  const play = goals?.answers?.play ?? {};
  const answered = brackets.questions.filter((q) => play[q.key] !== undefined).length;
  return (
    <Collapsible
      defaultOpen={stale && answered > 0}
      render={<section aria-labelledby={headingId} data-slot="bracket-how-it-plays" />}
    >
      <h3 id={headingId}>
        <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium tracking-wide uppercase hover:underline pointer-coarse:min-h-11">
          {BRACKET_COPY.howItPlays}
          {answered > 0 && (
            <span className="tracking-normal normal-case">· {BRACKET_COPY.answered(answered)}</span>
          )}
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 motion-safe:transition-transform motion-safe:duration-150 group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="space-y-2 pt-2">
        <p className="text-muted-foreground text-xs">{BRACKET_COPY.howItPlaysLead}</p>
        <ul className="space-y-2">
          {brackets.questions.map((q) => (
            <li key={q.key} data-play={q.key} className="space-y-1">
              <p className="text-sm">{q.question}</p>
              <Segmented
                ariaLabel={q.question}
                options={ANSWER_OPTIONS}
                value={play[q.key] ?? null}
                onChange={(answer) =>
                  onGoalsChange(
                    withAnswer(goals, "play", q.key, answer, {
                      rulesetVersion: brackets.ruleset.version,
                    }),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">{BRACKET_COPY.answersShown}</p>
      </CollapsibleContent>
    </Collapsible>
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
  onAnswer,
}: {
  question: BracketQuestion;
  combo?: CompleteCombo;
  cards: ReadonlyMap<string, { name: string }>;
  brackets: BracketsMeta;
  externalUrl?: ExternalUrl;
  /** Y4b: Yes / No / Not sure, by the question's stable id. */
  onAnswer?: (id: string, answer: BracketAnswer) => void;
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
      {!onAnswer && (question.answer === "yes" || question.answer === "no") && (
        // Y5: the share page's sheet reads only — the owner's answer, as said.
        <p data-slot="owner-answer" className="mt-0.5 text-xs">
          {BRACKET_COPY.ownersAnswer}:{" "}
          {question.answer === "yes" ? BRACKET_COPY.yes : BRACKET_COPY.no}
        </p>
      )}
      {onAnswer && (
        <div className="mt-1.5">
          <Segmented
            label={BRACKET_COPY.yourAnswer}
            // Questions can share their words (two template combos): the
            // group's name carries its cards too.
            ariaLabel={
              names.length > 0 ? `${question.question} ${names.join(", ")}` : question.question
            }
            options={ANSWER_OPTIONS}
            value={question.answer}
            onChange={(answer) => onAnswer(question.id, answer)}
          />
        </div>
      )}
      <SourceLine source={question.source} href={brackets.links.source(question.id)} />
    </li>
  );
}
