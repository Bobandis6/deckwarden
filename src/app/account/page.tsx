/**
 * /account (P2.1): sign-in, the signed-in account view, and the deck-claim
 * landing spot. OAuth callbackURL points here; ClaimDecks then redeems this
 * browser's tokens and refreshes the server-rendered deck list.
 *
 * Caching intent: force-dynamic — everything on the page is session-shaped.
 * Avatar uses a plain <img> per house image rules (no Vercel optimization
 * quota on externally hosted avatars).
 */
import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ClaimDecks } from "@/components/auth/claim-decks";
import { SignInButtons } from "@/components/auth/sign-in-buttons";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getDb, schema } from "@/db";
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { auth } from "@/lib/auth";
import { getAdapter } from "@/lib/games/registry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  description: "Sign in to keep your decks across browsers.",
};

function formatLabel(gameId: number, formatId: number): string {
  const game = gameCodeById(gameId);
  const code = findFormatById(formatId)?.code;
  if ((game !== "mtg" && game !== "optcg") || !code) return code ?? "";
  return getAdapter(game).formats.find((f) => f.code === code)?.label ?? code;
}

/** UTC-pinned like the share page (commit 4c90f67) — server tz must not leak in. */
function updatedLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground max-w-md text-center">
          An account keeps your decks across browsers and devices. Decks you built on this browser
          come along automatically when you sign in.
        </p>
        <SignInButtons />
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Back to Deckwarden
        </Link>
      </main>
    );
  }

  const db = getDb();
  const [decks, linked] = await Promise.all([
    db
      .select()
      .from(schema.decks)
      .where(eq(schema.decks.userId, session.user.id))
      .orderBy(desc(schema.decks.updatedAt))
      .limit(100),
    db
      .select({ providerId: schema.accounts.providerId })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, session.user.id)),
  ]);
  const providers = [...new Set(linked.map((a) => a.providerId))]
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(", ");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Deckwarden
        </Link>
        <SignOutButton />
      </div>

      <section className="mt-6 flex items-center gap-4">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            width={48}
            height={48}
            referrerPolicy="no-referrer"
            className="size-12 rounded-full border"
          />
        ) : (
          <span
            aria-hidden
            className="bg-muted flex size-12 items-center justify-center rounded-full border text-lg font-semibold"
          >
            {session.user.name.charAt(0).toUpperCase() || "?"}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{session.user.name}</h1>
          <p className="text-muted-foreground truncate text-sm">
            {session.user.email}
            {providers ? ` · via ${providers}` : ""}
          </p>
        </div>
      </section>

      <section aria-label="Your decks" className="mt-8 space-y-3">
        <ClaimDecks />
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Your decks
        </h2>
        {decks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No decks in this account yet —{" "}
            <Link href="/decks/new" className="underline">
              build one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {decks.map((deck) => (
              <li key={deck.id} className="flex items-center gap-3 px-3 py-2">
                <Link
                  href={`/decks/${deck.id}/edit`}
                  className="min-w-0 flex-1 hover:underline"
                  title={`Edit ${deck.name}`}
                >
                  <span className="block truncate text-sm font-medium">{deck.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {formatLabel(deck.gameId, deck.formatId)} · {deck.visibility} · Updated{" "}
                    {updatedLabel(deck.updatedAt)}
                  </span>
                </Link>
                <Link
                  href={`/d/${deck.publicId}`}
                  className="text-muted-foreground shrink-0 text-xs hover:underline"
                >
                  Share page
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
