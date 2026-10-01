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
