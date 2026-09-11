/**
 * The Warden's lines (R5b, F8 — REDESIGN.md §4 "Warden pages"): the one
 * table of Warden-voiced copy for the 404 and error pages, so the voice
 * stays in one place and the rule stays checkable — approval language
 * ("approves") is reserved for the true zero-issue validation line (F1,
 * `ValidationPanel`), and every page carries ONE line of voice beside its
 * plain explanation. Empty states keep their plain, honest titles (the
 * smoke-pinned ones verbatim) and get the shield mark, not a voice line.
 */
export const WARDEN_COPY = {
  notFound: {
    eyebrow: "404",
    /** The page title, in the Warden's voice. */
    title: "The Warden finds no such page.",
    hint: "The card may have been removed, the deck deleted, or the link mistyped.",
  },
  error: {
    eyebrow: "500",
    title: "Something went wrong",
    /** The Warden's line; the reassurance is P1.8's promise, kept true by the editor's retry. */
    hint: "The Warden has reported this one. Your decks are safe — saves that failed will retry from the editor.",
  },
} as const;
