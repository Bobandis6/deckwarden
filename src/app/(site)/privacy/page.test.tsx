/**
 * The privacy page says what the code does (S6, SECURITY-AUDIT-report.md
 * L16 and L17): every stored field group is named, with the numbers the
 * code enforces — created_ip cleared after 30 days (created-ip-retention.ts),
 * backups kept 35 days (backups/retention.ts), sessions seven days — and the
 * sentences the audit found untrue stay gone.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BACKUP_RETENTION_DAYS } from "@/lib/backups/retention";
import { CREATED_IP_RETENTION } from "@/lib/decks/created-ip-retention";

import PrivacyPage from "./page";

afterEach(cleanup);

function pageText(): string {
  render(<PrivacyPage />);
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

describe("the privacy page", () => {
  it("names every stored field group, with the code's own numbers", () => {
    const text = pageText();
    for (const phrase of [
      // Cookies: three, all functional (Better Auth's session, its cache, the OAuth state).
      "a session cookie keeps you signed in",
      "short-lived cached copy",
      "a state cookie guards the round trip",
      "no other cookie is set",
      // Sessions: IP + user agent, seven days.
      "IP address and browser identifier (user agent)",
      "expires after seven days without a visit",
      // Decks: notes, goals, versions, folders, the journal.
      "the primer notes you write",
      "the goals you set",
      "the saved versions you keep",
      "Folders store their name, description, and visibility",
      "game journal",
      // created_ip: every deck, cleared after the retention window.
      "signed in or not, we record the creating IP address",
      `clears it ${CREATED_IP_RETENTION} later`,
      // Backups and their retention.
      `kept for ${BACKUP_RETENTION_DAYS} days and then deleted`,
      "encrypted at rest",
      "never sign-in tokens or sessions",
      // Error reports carry no cookie, header or IP (S2).
      "without cookies, request headers, or your IP address",
      // The One Piece image host.
      "img.deckwarden.gg",
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it("no longer claims what the code does not do", () => {
    const text = pageText();
    for (const phrase of [
      "the only cookie",
      "Housekeeping also deletes",
      "possibly your IP address",
      "permanently and immediately",
      "browser version",
      "encrypted backups",
    ]) {
      expect(text, phrase).not.toContain(phrase);
    }
    // The purge is a stated policy, not a running fact, until the owner arms it.
    expect(text).toContain("We may delete anonymous decks");
  });
});
