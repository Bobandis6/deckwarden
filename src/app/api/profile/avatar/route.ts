/**
 * PUT /api/profile/avatar — choose the picture (X5, WAVE3.md D5): the
 * provider picture, a Magic card's art, or the initial. The only writer of
 * `users.avatar`; Better Auth's own /update-user stays closed
 * (auth-disabled-paths.ts), and the field is `input: false` there anyway.
 *
 * Order of checks — PATCH /api/profile's: session (401, before anything
 * else) → the per-user limiter (429, before the body is read) → JSON (400)
 * → the zod union of the three kinds (400) → the work. For card art the
 * work is one statement — the card, live, with its live default printing —
 * then: an unknown or removed card is 404; a game whose adapter declares no
 * ambient art is 400 (One Piece: the Bandai posture); a card with no live
 * default printing is 404; then the Scryfall API must name the art's
 * artist (422 when it does not — never unattributed art) and must answer
 * (503 when it does not — the current picture stays). Only then the write,
 * through Drizzle.
 *
 * Stored: the printing id, the card's name and the artist — never a URL
 * (src/lib/profile/avatar.ts). The answer is the stored choice; the client
 * then refetches its session with the cookie cache bypassed, which
 * re-issues the cache cookie (proven in sign-in-refresh.test.ts (e)).
 *
 * Caching intent: dynamic mutation, no-store on every answer.
 */
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { getDb, schema } from "@/db";
import { gameCodeById } from "@/db/seed-data";
import { getSessionUserId } from "@/lib/auth";
import { ambientArtKind, lookupScryfallArtMeta } from "@/lib/cards/art";
import { listAdapters } from "@/lib/games/registry";
import { AVATAR_REQUEST, type AvatarChoice } from "@/lib/profile/avatar";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** The refusal sentences — what the dialog shows under Save, verbatim. */
export const AVATAR_ERRORS = {
  signedOut: "Sign in to change your picture.",
  notFound: "That card isn't in the database any more. Choose another card.",
  notMagic: "Only Magic cards can be your picture.",
  noPrinting: "That card has no printing to take art from. Choose another card.",
  noArtist:
    "Scryfall lists no artist for this card's art, and art is only shown with its artist. Choose another card.",
  unreachable:
    "Scryfall didn't answer, so the art couldn't be checked. Your picture hasn't changed — try again in a minute.",
} as const;

function refuse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId(request.headers);
  if (!userId) return refuse(AVATAR_ERRORS.signedOut, 401);
  const limited = await enforceRateLimit(RATE_LIMITS.profileAvatar(userId));
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return refuse("Body must be JSON", 400);
  }
  const parsed = AVATAR_REQUEST.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400, headers: NO_STORE },
    );
  }

  const db = getDb();
  let avatar: AvatarChoice | null;
  if (parsed.data.kind === "provider") {
    avatar = null;
  } else if (parsed.data.kind === "initial") {
    avatar = { kind: "initial" };
  } else {
    const { cardIdentities, cardPrintings } = schema;
    // loadDefaultPrinting does not filter removed printings; this join does.
    const [card] = await db
      .select({
        name: cardIdentities.name,
        gameId: cardIdentities.gameId,
        printingId: cardPrintings.id,
      })
      .from(cardIdentities)
      .leftJoin(
        cardPrintings,
        and(
          eq(cardPrintings.cardIdentityId, cardIdentities.id),
          eq(cardPrintings.isDefault, true),
          eq(cardPrintings.isRemoved, false),
        ),
      )
      .where(and(eq(cardIdentities.id, parsed.data.cardId), eq(cardIdentities.isRemoved, false)))
      .limit(1);
    if (!card) return refuse(AVATAR_ERRORS.notFound, 404);

    const game = gameCodeById(card.gameId);
    const adapter = listAdapters().find((a) => a.id === game);
    if (!adapter || ambientArtKind(adapter) !== "art_crop") {
      return refuse(AVATAR_ERRORS.notMagic, 400);
    }
    if (!card.printingId) return refuse(AVATAR_ERRORS.noPrinting, 404);

    const lookup = await lookupScryfallArtMeta(card.printingId);
    if (!("meta" in lookup)) {
      return lookup.reason === "no-art"
        ? refuse(AVATAR_ERRORS.noArtist, 422)
        : refuse(AVATAR_ERRORS.unreachable, 503);
    }
    avatar = {
      kind: "art",
      printingId: card.printingId,
      cardName: card.name,
      artist: lookup.meta.artist,
    };
  }

  await db
    .update(schema.users)
    .set({ avatar, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return NextResponse.json({ avatar }, { headers: NO_STORE });
}
