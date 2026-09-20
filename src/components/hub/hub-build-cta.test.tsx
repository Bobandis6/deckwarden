/**
 * The W4 hub islands: the build CTA's default anchor is always there (the
 * smoke-pinned markup), the "Use for …" CTA and the pick banner appear only
 * with a fresh SAME-game intent, and the banner's Cancel clears the intent.
 * (The null server snapshot itself — nothing in server HTML — is proven by
 * the smokes against rendered pages; RTL renders are post-"hydration".)
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { readPickIntent, writePickIntent } from "@/lib/decks/leader-pick-intent";
import { HubBuildCta } from "./hub-build-cta";
import { LeaderPickBanner } from "./leader-pick-banner";

const intent = { deckId: "deck-1", deckName: "Krenko — Mob Rule", game: "mtg" as const };

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("HubBuildCta", () => {
  // Base UI's Button puts role="button" on the rendered anchor (the
  // account-slot caveat), so the CTAs query as buttons that ARE <a>s.
  it("renders only the default build anchor without an intent", () => {
    render(<HubBuildCta game="mtg" leaderKey="abc-123" label="Build with this commander" />);
    const ctas = screen.getAllByRole("button");
    expect(ctas).toHaveLength(1);
    expect(ctas[0].tagName).toBe("A");
    expect(ctas[0].textContent).toBe("Build with this commander");
    expect(ctas[0].getAttribute("href")).toBe("/decks/new?game=mtg&leader=abc-123");
  });

  it("a fresh same-game intent adds the Use-for CTA above the unchanged default", () => {
    writePickIntent(intent);
    render(<HubBuildCta game="mtg" leaderKey="abc-123" label="Build with this commander" />);
    const ctas = screen.getAllByRole("button");
    expect(ctas).toHaveLength(2);
    expect(ctas[0].textContent).toBe("Use for “Krenko — Mob Rule”");
    expect(ctas[0].getAttribute("href")).toBe("/decks/deck-1/edit?leader=abc-123");
    expect(ctas[1].getAttribute("href")).toBe("/decks/new?game=mtg&leader=abc-123");
  });

  it("a wrong-game intent adds nothing", () => {
    writePickIntent({ ...intent, game: "optcg" });
    render(<HubBuildCta game="mtg" leaderKey="abc-123" label="Build with this commander" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("LeaderPickBanner", () => {
  it("renders nothing without an intent", () => {
    const { container } = render(<LeaderPickBanner game="mtg" noun="commander" />);
    expect(container.firstChild).toBeNull();
  });

  it("names the deck, links back to it, and Cancel clears the intent", () => {
    writePickIntent(intent);
    render(<LeaderPickBanner game="mtg" noun="commander" />);
    expect(screen.getByText(/Choosing a commander for/)).toBeTruthy();
    expect(screen.getByText("“Krenko — Mob Rule”")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to deck" }).getAttribute("href")).toBe(
      "/decks/deck-1/edit",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(readPickIntent()).toBeNull();
    expect(screen.queryByText(/Choosing a commander/)).toBeNull();
  });
});
