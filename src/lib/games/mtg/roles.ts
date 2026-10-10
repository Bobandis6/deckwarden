/**
 * Swap Lab's roles (Y7a, WAVE4 D8) — the whitelist of Scryfall Tagger
 * function tags that say what job a card does, declared by UUID (slugs get
 * renamed). Pure data, client-safe: the ingest reads it to write sparse
 * `attrs.roles` (src/lib/games/mtg/tagger.ts), the route matches on it, and
 * the Card tab names each role and links its tag.
 *
 * A role's cards are its tag's taggings plus every descendant tag's (the
 * flags' roll-up rule), minus any card an `except` tag rolls up to — the
 * part of Tagger's tree that does a different job: land tutors are ramp,
 * not tutors; cards that only bring themselves back, or bring back lands,
 * aren't the recursion a deck slot asks for.
 *
 * Chosen from measured sizes on the 2026-10-10 bulk (Y7a's ship note has
 * the table): every role holds 350–5,300 commander-legal ranked cards, and
 * the 25-staple gold set scored best with these 17 and a mana-value window
 * of ±1. The roles are community tags, not rules text: the words always say
 * "community-tagged on Scryfall Tagger" and never claim two cards do
 * exactly the same thing. data/mtg/tagger-overrides.json switches each role
 * off without touching code (`roles.<key>.enabled`).
 *
 * Autofill and the Cut Coach never read these (the owner's call, WAVE4
 * Context): their role evidence stays the user's own tags.
 */

export interface MtgRoleTag {
  /** The Tagger tag's identity. */
  id: string;
  /** For people and links — Tagger renames slugs, so nothing matches on it. */
  slug: string;
}

export interface MtgRole {
  /** What `attrs.roles` stores — ours, stable, kebab-case. */
  key: string;
  /** Our words for the job, lowercase, as the evidence line uses them. */
  label: string;
  tag: MtgRoleTag;
  /** Tags whose cards are taken back out of this role (a different job). */
  except?: readonly MtgRoleTag[];
}

/** Display order: mana first, then cards, answers, and the rest. */
export const MTG_ROLES = [
  {
    key: "ramp",
    label: "ramp",
    tag: { id: "2f3e4ad7-5e60-41b4-bdbc-653f16869cf6", slug: "ramp" },
  },
  {
    key: "mana-rock",
    label: "mana rock",
    tag: { id: "523a4f29-25ee-483c-8123-a8e62b62af5a", slug: "mana-rock" },
  },
  {
    key: "mana-dork",
    label: "mana dork",
    tag: { id: "bb6c0ff7-302d-48ff-aee9-5cfefd44e351", slug: "mana-dork" },
  },
  {
    key: "land-ramp",
    label: "land ramp",
    tag: { id: "8e3bf407-28b7-49ab-83d5-5a9c46b1cd79", slug: "land-ramp" },
  },
  {
    key: "card-draw",
    label: "card draw",
    tag: { id: "b6448c45-ce65-4848-aa98-2151e4e07437", slug: "draw" },
  },
  {
    key: "tutor",
    label: "tutor",
    tag: { id: "c768d2ec-3264-4a90-a98f-bea8467857d3", slug: "tutor" },
    except: [{ id: "cc2644e4-57c6-46f7-a69c-0cd82dbf2e9d", slug: "tutor-land" }],
  },
  {
    key: "creature-removal",
    label: "creature removal",
    tag: { id: "d91e421d-ff87-4aad-a4bf-5aefc51252b6", slug: "removal-creature" },
  },
  {
    key: "artifact-removal",
    label: "artifact removal",
    tag: { id: "ea1ae714-3500-481b-9bdd-f33c57db8678", slug: "removal-artifact" },
  },
  {
    key: "enchantment-removal",
    label: "enchantment removal",
    tag: { id: "ecee5d4b-f573-4ec8-b918-ad134873005e", slug: "removal-enchantment" },
  },
  {
    key: "spot-removal",
    label: "spot removal",
    tag: { id: "cc12d27d-1d0e-4849-9551-71caead74d24", slug: "spot-removal" },
  },
  {
    key: "board-wipe",
    label: "board wipe",
    tag: { id: "3fb7e4fd-5304-4120-b7c4-8a89f70ad3f0", slug: "sweeper" },
  },
  {
    key: "counterspell",
    label: "counterspell",
    tag: { id: "690fc968-48ba-4854-a948-3db6bf19d3a9", slug: "counterspell" },
  },
  {
    key: "burn",
    label: "burn",
    tag: { id: "0641a74c-4dd5-426d-be58-2ab86d71995d", slug: "burn" },
  },
  {
    key: "protection",
    label: "protection",
    tag: { id: "6e2cdc7c-b02c-4b59-a171-f93723721b79", slug: "protection" },
  },
  {
    key: "recursion",
    label: "recursion",
    tag: { id: "82b824ad-648f-467f-a190-2e0fa9a795d2", slug: "recursion" },
    except: [
      { id: "c6252441-972e-4bda-931a-d504a81068f4", slug: "recursion-self" },
      { id: "f6ba5380-259b-4f37-b1bf-1a53033ec70e", slug: "recursion-land" },
    ],
  },
  {
    key: "token-maker",
    label: "token maker",
    tag: { id: "a9657a5d-e7f8-4000-a795-7a78b5fb8923", slug: "repeatable-token-generator" },
  },
  {
    key: "sacrifice-outlet",
    label: "sacrifice outlet",
    tag: { id: "aa908dd5-bf9e-4835-bbbb-77579a1f0e5f", slug: "repeatable-sacrifice-outlet" },
  },
] as const satisfies readonly MtgRole[];

export type MtgRoleKey = (typeof MTG_ROLES)[number]["key"];

export const MTG_ROLE_KEYS: readonly MtgRoleKey[] = MTG_ROLES.map((r) => r.key);

const BY_KEY: ReadonlyMap<string, MtgRole> = new Map(MTG_ROLES.map((r) => [r.key, r]));

export function isMtgRoleKey(key: unknown): key is MtgRoleKey {
  return typeof key === "string" && BY_KEY.has(key);
}

export function mtgRole(key: MtgRoleKey): MtgRole {
  return BY_KEY.get(key)!;
}

/** A Tagger tag's public page (D0: the credit links to the tag). */
export function taggerTagUrl(slug: string): string {
  return `https://tagger.scryfall.com/tags/card/${encodeURIComponent(slug)}`;
}
