/**
 * The hub staples' budget pills (Y1): the site's one budget vocabulary,
 * inclusive — a card at exactly $5.00 shows under "≤ $5 a card", as it
 * already did in Suggestions; an unpriced card shows under All only.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { type StapleItem, StaplesTable } from "./staples-table";

afterEach(cleanup);

const staple = (name: string, cheapestUsd: string | null): StapleItem => ({
  id: `id-${name}`,
  name,
  primaryType: "Artifact",
  costValue: 1,
  cheapestUsd,
});

const STAPLES = [
  staple("Sol Ring", "1.00"),
  staple("Exactly Five", "5.00"),
  staple("Pricey", "5.01"),
  staple("Unpriced", null),
];

describe("StaplesTable budget pills (Y1)", () => {
  it("reads the shared labels and counts inclusively", () => {
    render(<StaplesTable staples={STAPLES} />);
    expect(screen.getByRole("button", { name: "≤ $5 a card" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "≤ $1 a card" })).toBeTruthy();
    expect(screen.getByText("2 of 4 at $5 or less · 1 at $1 or less")).toBeTruthy();
  });

  it("keeps a $5.00 card under ≤ $5 a card and drops the unpriced one", () => {
    render(<StaplesTable staples={STAPLES} />);
    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    expect(screen.getByText("Exactly Five")).toBeTruthy();
    expect(screen.getByText("Sol Ring")).toBeTruthy();
    expect(screen.queryByText("Pricey")).toBeNull();
    expect(screen.queryByText("Unpriced")).toBeNull();
  });
});

/** A hundred staples: `cheap` at $0.50, then `mid` at $3.00, the rest at $9.00. */
const hundred = (cheap: number, mid: number): StapleItem[] =>
  Array.from({ length: 100 }, (_, i) =>
    staple(`Card ${i + 1}`, i < cheap ? "0.50" : i < cheap + mid ? "3.00" : "9.00"),
  );

const bodyRows = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
];
const hiddenRows = (container: HTMLElement) => bodyRows(container).filter((r) => r.hidden);

describe("StaplesTable fold (U7b, WAVE5 D8)", () => {
  it("renders every row, hides the ones past 25, and opens them all on Show all 100", () => {
    const { container } = render(<StaplesTable staples={hundred(30, 30)} />);
    expect(bodyRows(container)).toHaveLength(100);
    expect(hiddenRows(container)).toHaveLength(75);
    expect(
      bodyRows(container)
        .slice(0, 25)
        .every((r) => !r.hidden),
    ).toBe(true);
    expect(bodyRows(container)[24].textContent).toContain("Card 25");
    // Every link is in the markup for a crawler; the hidden rows leave the a11y tree.
    expect(container.querySelectorAll('tbody a[href^="/cards/"]')).toHaveLength(100);
    expect(screen.getAllByRole("row")).toHaveLength(26);
    fireEvent.click(screen.getByRole("button", { name: "Show all 100" }));
    expect(hiddenRows(container)).toHaveLength(0);
    expect(screen.getAllByRole("row")).toHaveLength(101);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("folds the tier, not the hundred: Show all 60 under ≤ $5; nothing to fold under ≤ $1 at 20", () => {
    const { container } = render(<StaplesTable staples={hundred(20, 40)} />);
    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    expect(bodyRows(container)).toHaveLength(60);
    expect(hiddenRows(container)).toHaveLength(35);
    expect(screen.getByRole("button", { name: "Show all 60" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "≤ $1 a card" }));
    expect(bodyRows(container)).toHaveLength(20);
    expect(hiddenRows(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("stays open across tiers once asked", () => {
    const { container } = render(<StaplesTable staples={hundred(30, 30)} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all 100" }));
    fireEvent.click(screen.getByRole("button", { name: "≤ $5 a card" }));
    expect(bodyRows(container)).toHaveLength(60);
    expect(hiddenRows(container)).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});
