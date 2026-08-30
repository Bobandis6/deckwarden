/**
 * Better Auth browser client (P2.1). Client components call
 * `authClient.signIn.social({ provider, callbackURL: "/account" })` — the
 * account page is always the landing spot because it runs the deck-claim
 * flow and lists the account's decks.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
