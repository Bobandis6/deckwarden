"use client";

/**
 * "Do you own this precon?" (PRECON-OWNED): one quiet line in the editor's
 * deck pane, the owner's alone, on a deck started from a precon. It
 * arrives with the list (the owner's GET carries the precon; a draft takes
 * it from its own seed), directly after the leader zone, so nothing below
 * it moves once the list is on screen.
 *
 * - Unanswered: the precon's name and "Do you own it?", with Yes and No.
 * - Answered: which precon, and whether you own it, with Change. Change
 *   asks again in place (local state, no edit): the saved answer stands
 *   until Yes or No is picked.
 *
 * An answer is the editor's edit (`onAnswer`): a setting with its own
 * PATCH, and on a draft the edit that mints the row. Focus follows the
 * line: to Change after an answer, to Yes after Change. The controls come
 * after a gap, underlined, 44 px on touch (U9, the goals line's way).
 */
import { useId, useLayoutEffect, useRef, useState } from "react";

import { PRECON_COPY } from "@/lib/collection/precon-copy";
import { cn } from "@/lib/utils";

const ACTION =
  "text-foreground ml-1 cursor-pointer font-medium underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11 pointer-coarse:min-w-11";

export function PreconLine({
  precon,
  onAnswer,
  className,
}: {
  /** The precon's name and the owner's answer; null = not asked yet. */
  precon: { name: string; owns: boolean | null };
  onAnswer: (owns: boolean) => void;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const textId = useId();
  const yesRef = useRef<HTMLButtonElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  // Where focus goes once the line has re-rendered: set by a click, spent here.
  const focusRef = useRef<"yes" | "change" | null>(null);
  useLayoutEffect(() => {
    const target = focusRef.current;
    if (target === null) return;
    focusRef.current = null;
    (target === "yes" ? yesRef : changeRef).current?.focus();
  });

  const open = asking || precon.owns === null;
  const answer = (owns: boolean) => {
    focusRef.current = "change";
    setAsking(false);
    onAnswer(owns);
  };
  const words = open
    ? PRECON_COPY.ask(precon.name)
    : precon.owns
      ? PRECON_COPY.owned(precon.name)
      : PRECON_COPY.notOwned(precon.name);

  return (
    <p
      data-slot="precon-line"
      data-state={open ? "asking" : precon.owns ? "owned" : "not-owned"}
      className={cn("text-muted-foreground text-xs", className)}
    >
      <span id={textId}>{words}</span>
      {open ? (
        <>
          {" "}
          <button
            ref={yesRef}
            type="button"
            aria-describedby={textId}
            onClick={() => answer(true)}
            className={ACTION}
          >
            {PRECON_COPY.yes}
          </button>{" "}
          <button
            type="button"
            aria-describedby={textId}
            onClick={() => answer(false)}
            className={ACTION}
          >
            {PRECON_COPY.no}
          </button>
        </>
      ) : (
        <>
          {" "}
          <button
            ref={changeRef}
            type="button"
            aria-describedby={textId}
            onClick={() => {
              focusRef.current = "yes";
              setAsking(true);
            }}
            className={ACTION}
          >
            {PRECON_COPY.change}
          </button>
        </>
      )}
    </p>
  );
}
