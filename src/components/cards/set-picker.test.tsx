/**
 * SetPicker (X4a, WAVE3.md D0 + D4): the /cards Set box over a local list.
 * Rendered in a small harness that plays CardSearch's part (it holds the
 * chosen code and hands the list in). Typing is a real `input` event with
 * an `inputType` (Base UI reads a bare change as autofill); a press on the
 * box is a `mousedown` (Base UI opens a text box on mousedown). jsdom runs
 * rAF, so the arrow keys are pinned here — the hidden browser pane never
 * paints, and its list navigation stalls.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ReleasedSet } from "@/lib/sets/lines";

import { SET_ROWS_PER_GROUP, SetPicker } from "./set-picker";

function set(code: string, name: string, extra: Partial<ReleasedSet> = {}): ReleasedSet {
  return {
    code,
    name,
    releasedAt: "2024-08-02",
    setType: "expansion",
    group: "main",
    cards: 279,
    ordinal: null,
    ...extra,
  };
}

const SETS: ReleasedSet[] = [
  set("blb", "Bloomburrow", { ordinal: 102 }),
  set("blc", "Bloomburrow Commander", { setType: "commander", ordinal: 38 }),
  set("pblb", "Bloomburrow Promos", { setType: "promo", group: "other" }),
  set("emn", "Eldritch Moon", { releasedAt: "2016-07-22", ordinal: 71 }),
  set("pemn", "Eldritch Moon Promos", {
    releasedAt: "2016-07-22",
    setType: "promo",
    group: "other",
  }),
];

function Harness({
  sets = SETS,
  failed = false,
  initial = "",
  onWantSets = () => {},
}: {
  sets?: ReleasedSet[] | null;
  failed?: boolean;
  initial?: string;
  onWantSets?: () => void;
}) {
  const [code, setCode] = useState(initial);
  const chosen = sets?.find((s) => s.code === code) ?? null;
  return (
    <>
      <SetPicker
        sets={sets}
        failed={failed}
        chosen={chosen}
        onWantSets={onWantSets}
        onPick={(s) => setCode(s.code)}
      />
      <output data-testid="chosen">{code}</output>
    </>
  );
}

const box = () => screen.getByRole("combobox", { name: "Set" }) as HTMLInputElement;
const listbox = () => screen.queryByRole("listbox");
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");
const optionNames = () => options().map((o) => o.querySelector("span span")!.textContent);
const chosen = () => screen.getByTestId("chosen").textContent;
const status = () =>
  document.querySelector<HTMLElement>("[data-slot=autocomplete-status]")!.textContent;

function press(input: HTMLElement) {
  fireEvent.mouseDown(input, { button: 0 });
}
function typeText(input: HTMLElement, value: string) {
  fireEvent.input(input, { target: { value }, inputType: "insertText" });
}

describe("SetPicker", () => {
  it("a press opens every set in two labelled groups — at zero characters — and asks for the list", () => {
    const onWantSets = vi.fn();
    render(<Harness onWantSets={onWantSets} />);
    expect(box().placeholder).toBe("Any set");
    expect(listbox()).toBeNull();
    press(box());
    expect(onWantSets).toHaveBeenCalledTimes(1);
    const groups = within(screen.getByRole("listbox")).getAllByRole("group");
    expect(
      groups.map((g) => g.querySelector("[data-slot=autocomplete-group-label]")!.textContent),
    ).toEqual(["Main sets", "Other products"]);
    expect(optionNames()).toEqual([
      "Bloomburrow",
      "Bloomburrow Commander",
      "Eldritch Moon",
      "Bloomburrow Promos",
      "Eldritch Moon Promos",
    ]);
    // A row: the name, the year and the place, the code.
    expect(options()[3 - 1].textContent).toBe("Eldritch Moon2016 · 71st expansion setemn");
    expect(status()).toBe("5 sets");
  });

  it("typing filters by name or code, best match first; nothing matched says so", () => {
    render(<Harness />);
    const input = box();
    typeText(input, "blo");
    expect(optionNames()).toEqual(["Bloomburrow", "Bloomburrow Commander", "Bloomburrow Promos"]);
    typeText(input, "BLB");
    expect(optionNames()).toEqual(["Bloomburrow"]);
    typeText(input, "moon");
    expect(optionNames()).toEqual(["Eldritch Moon", "Eldritch Moon Promos"]);
    typeText(input, "zzz");
    expect(within(screen.getByRole("listbox")).queryAllByRole("option")).toHaveLength(0);
    expect(document.querySelector("[data-slot=autocomplete-empty]")!.textContent).toBe(
      "No matches",
    );
    expect(status()).toBe("No matches");
  });

  it("nothing is highlighted until an arrow key; ↓ then Enter picks, and the box shows the pick", () => {
    render(<Harness />);
    const input = box();
    typeText(input, "eld");
    expect(options().some((o) => o.hasAttribute("data-highlighted"))).toBe(false);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options()[0].hasAttribute("data-highlighted")).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chosen()).toBe("emn");
    expect(input.value).toBe("Eldritch Moon");
    expect(listbox()).toBeNull();
  });

  it("a click picks; reopening shows every set again, the pick ticked", () => {
    render(<Harness />);
    const input = box();
    typeText(input, "blo");
    fireEvent.click(options()[1]);
    expect(chosen()).toBe("blc");
    expect(input.value).toBe("Bloomburrow Commander");
    press(input);
    expect(optionNames()).toHaveLength(5);
    const ticked = options().filter((o) => o.querySelector("svg"));
    expect(ticked.map((o) => o.querySelector("span span")!.textContent)).toEqual([
      "Bloomburrow Commander",
    ]);
  });

  it("Enter with nothing highlighted picks nothing and keeps the text; Esc closes and keeps it too; leaving puts the chosen name back", () => {
    render(<Harness initial="emn" />);
    const input = box();
    expect(input.value).toBe("Eldritch Moon");
    typeText(input, "blb");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(listbox()).toBeNull();
    expect(chosen()).toBe("emn");
    expect(input.value).toBe("blb");
    typeText(input, "blo");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(listbox()).toBeNull();
    expect(input.value).toBe("blo");
    fireEvent.blur(input);
    expect(input.value).toBe("Eldritch Moon");
    expect(chosen()).toBe("emn");
  });

  it("while the list loads it says so; a failed fetch says that instead", () => {
    const popupLine = () =>
      document.querySelector("[data-slot=set-picker-popup] > p")?.textContent ?? null;
    const { unmount } = render(<Harness sets={null} />);
    press(box());
    expect(popupLine()).toBe("Loading sets…");
    expect(status()).toBe("Loading sets…");
    unmount();
    render(<Harness sets={null} failed />);
    press(box());
    expect(popupLine()).toBe("Couldn't load the sets.");
    expect(status()).toBe("Couldn't load the sets");
  });

  it(`each group shows at most ${SET_ROWS_PER_GROUP} rows, with a line that says how many matched`, async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      set(`s${i}`, `Set ${i}`, { group: i % 2 ? "other" : "main" }),
    );
    render(<Harness sets={many} />);
    press(box());
    await act(async () => {});
    expect(options()).toHaveLength(2 * SET_ROWS_PER_GROUP);
    expect(screen.getByText("Showing 100 of 120 — keep typing to narrow.")).toBeTruthy();
    expect(status()).toBe("120 sets");
  });
});
