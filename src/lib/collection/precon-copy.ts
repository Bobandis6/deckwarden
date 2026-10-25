/**
 * The words of "Do you own this precon?" (PRECON-OWNED), in one table so
 * its guard (precon-copy.test.ts) reads every string: the editor's one
 * line in the deck pane and the sentence the ownership line's method
 * gains. U9's policy: periods, commas and parentheses, no dash, no middle
 * dot; the line's controls follow its words after a gap, underlined.
 *
 * The precon is named as an apposition ("Started from Breed Lethality, a
 * precon.") because product names are data and some begin with "The" (The
 * Hosts of Mordor): "the {name} precon" would read "the The …".
 */
export const PRECON_COPY = {
  /** Unanswered, or asked again after Change: the precon's name and the question. */
  ask: (name: string) => `Started from ${name}, a precon. Do you own it?`,
  yes: "Yes",
  no: "No",
  /** Answered yes: a quiet line naming the precon. */
  owned: (name: string) => `Started from ${name}, a precon you own.`,
  /** Answered no. */
  notOwned: (name: string) => `Started from ${name}, a precon you don't own.`,
  /** Asks again; the saved answer stands until Yes or No is picked. */
  change: "Change",
  /** The ownership line's method gains the precon's rule in this sentence (ownership.ts). */
  method: "Cards from the precon you own count as owned, up to the precon's own quantities.",
} as const;
