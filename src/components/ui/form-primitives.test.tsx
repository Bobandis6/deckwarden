/**
 * The form primitives (U10a, WAVE5.md D10): Field, Input, Textarea, Checkbox,
 * Table and Spinner as they arrive — the edge token on every field (U1), the
 * 44 px coarse-pointer floor, a FieldLabel associated with its control, every
 * FieldDescription and FieldError in the control's aria-describedby, a
 * Checkbox that is a real button with the real `disabled`, a TableRow that
 * passes `hidden` through (U7b's fold), a Spinner at rest under reduced
 * motion. The control-edge test pins Input's and the Autocomplete copy's
 * token; this file pins the rest.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";
import { Spinner } from "./spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { Textarea } from "./textarea";

const tokensOf = (cls: string) => cls.split(/\s+/);

describe("Input and Textarea", () => {
  it("Input grows to 44 px on a coarse pointer", () => {
    render(<Input aria-label="Note" />);
    expect(tokensOf(screen.getByRole("textbox", { name: "Note" }).className)).toContain(
      "pointer-coarse:min-h-11",
    );
  });

  it("Textarea draws its line on the token, keeps the dark fill on --input, grows on touch", () => {
    render(<Textarea aria-label="Notes" />);
    const cls = tokensOf(screen.getByRole("textbox", { name: "Notes" }).className);
    expect(cls).toContain("border-(--border-control)");
    expect(cls).not.toContain("border-input");
    expect(cls).toContain("dark:bg-input/30");
    expect(cls).toContain("pointer-coarse:min-h-11");
    expect(cls).not.toContain("field-sizing-content");
  });
});

describe("Field", () => {
  it("associates the label, and puts the description and the error in aria-describedby", () => {
    render(
      <Field>
        <FieldLabel>Short description</FieldLabel>
        <Input placeholder="One or two sentences." />
        <FieldDescription>Shows in link previews.</FieldDescription>
        <FieldError>Too long.</FieldError>
      </Field>,
    );
    const input = screen.getByLabelText("Short description");
    expect(input.tagName).toBe("INPUT");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Shows in link previews.",
      "Too long.",
    ]);
    expect(screen.getByRole("alert").textContent).toBe("Too long.");
    expect(document.querySelector("[data-slot=field]")?.getAttribute("data-orientation")).toBe(
      "vertical",
    );
  });

  it("renders no error line without content", () => {
    render(
      <Field>
        <FieldLabel>Name</FieldLabel>
        <Input />
        <FieldError>{null}</FieldError>
      </Field>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("[data-slot=field-error]")).toBeNull();
  });

  it("a horizontal Field is the checkbox row: the label after the box, the row 14 px", () => {
    render(
      <Field orientation="horizontal">
        <Checkbox />
        <FieldLabel>Main sets only</FieldLabel>
      </Field>,
    );
    const box = screen.getByRole("checkbox", { name: "Main sets only" });
    expect(box.tagName).toBe("BUTTON");
    const field = document.querySelector<HTMLElement>("[data-slot=field]")!;
    expect(field.getAttribute("data-orientation")).toBe("horizontal");
    expect(tokensOf(field.className)).toContain("flex-row");
    expect(tokensOf(field.className)).toContain("text-sm");
    expect(tokensOf(screen.getByText("Main sets only").className)).toContain(
      "group-data-[orientation=horizontal]/field:[font:inherit]",
    );
  });

  it("a horizontal Field's description reaches the checkbox", () => {
    render(
      <Field orientation="horizontal" disabled>
        <Checkbox data-testid="only-owned-toggle" />
        <FieldLabel>Only cards I own</FieldLabel>
        <FieldDescription>
          Sign in and import a collection to filter by cards you own
        </FieldDescription>
      </Field>,
    );
    const box = screen.getByRole("checkbox", { name: "Only cards I own" }) as HTMLButtonElement;
    expect(box.disabled).toBe(true);
    const ids = (box.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      "Sign in and import a collection to filter by cards you own",
    ]);
    expect(tokensOf(screen.getByText("Only cards I own").className)).toContain(
      "group-data-disabled/field:text-muted-foreground",
    );
  });

  it("the label is the 12 px muted caption over a control", () => {
    render(
      <Field>
        <FieldLabel>Date</FieldLabel>
        <Input type="date" />
      </Field>,
    );
    const cls = tokensOf(screen.getByText("Date").className);
    expect(cls).toContain("type-label-xs");
    expect(cls).toContain("text-muted-foreground");
  });
});

describe("Textarea in a Field", () => {
  it("takes the label, the description and a ref; stays controlled", () => {
    const onChange = vi.fn();
    const ref = { current: null as HTMLTextAreaElement | null };
    render(
      <Field>
        <FieldLabel>Notes</FieldLabel>
        <Textarea ref={ref} value="gg" rows={2} onChange={onChange} />
        <FieldError>Too long.</FieldError>
      </Field>,
    );
    const area = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.value).toBe("gg");
    expect(area.getAttribute("rows")).toBe("2");
    expect(ref.current).toBe(area);
    expect(document.getElementById(area.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Too long.",
    );
    fireEvent.change(area, { target: { value: "gg wp" } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Checkbox", () => {
  it("is a native button with role=checkbox on the token, a 44 px hit area on touch", () => {
    const onChange = vi.fn();
    render(<Checkbox aria-label="Keep my 1 card" checked={false} onCheckedChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Keep my 1 card" }) as HTMLButtonElement;
    expect(box.tagName).toBe("BUTTON");
    expect(box.getAttribute("type")).toBe("button");
    expect(box.getAttribute("aria-checked")).toBe("false");
    const cls = tokensOf(box.className);
    expect(cls).toContain("border-(--border-control)");
    expect(cls).not.toContain("border-input");
    expect(cls).toContain("size-4");
    expect(cls).toContain("pointer-coarse:after:-inset-3.5");
    expect(cls).toContain("data-checked:bg-primary");
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("checked, indeterminate and disabled are real states", () => {
    const { rerender } = render(<Checkbox aria-label="Include Lands" checked />);
    const box = () => screen.getByRole("checkbox", { name: "Include Lands" }) as HTMLButtonElement;
    expect(box().getAttribute("aria-checked")).toBe("true");
    expect(box().hasAttribute("data-checked")).toBe(true);
    expect(box().querySelector("[data-slot=checkbox-indicator]")).toBeTruthy();
    rerender(<Checkbox aria-label="Include Lands" checked={false} indeterminate />);
    expect(box().getAttribute("aria-checked")).toBe("mixed");
    expect(box().hasAttribute("data-indeterminate")).toBe(true);
    rerender(<Checkbox aria-label="Include Lands" checked={false} disabled />);
    expect(box().disabled).toBe(true);
  });

  it("a label wrapping the box names it and toggles it", () => {
    const onChange = vi.fn();
    render(
      <label>
        <Checkbox checked={false} onCheckedChange={onChange} />
        Swap Pricey A
      </label>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Swap Pricey A" }));
    expect(onChange).toHaveBeenCalledWith(true, expect.anything());
  });
});

describe("Table", () => {
  it("keeps the table semantics, the house density and a hidden row", () => {
    const { container } = render(
      <Table className="min-w-[28rem]">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Card</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>1</TableCell>
            <TableCell>Sol Ring</TableCell>
          </TableRow>
          <TableRow hidden>
            <TableCell>2</TableCell>
            <TableCell>Arcane Signet</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector("[data-slot=table-container]")?.className).toContain(
      "overflow-x-auto",
    );
    const table = container.querySelector("table")!;
    expect(tokensOf(table.className)).toContain("min-w-[28rem]");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr[hidden]")).toHaveLength(1);
    expect(tokensOf(container.querySelector("th")!.className)).toContain("py-1.5");
    expect(tokensOf(container.querySelector("td")!.className)).toContain("pr-3");
    expect(tokensOf(container.querySelector("tbody tr")!.className)).not.toContain(
      "hover:bg-muted/50",
    );
  });
});

describe("Spinner", () => {
  it("is a status at rest under reduced motion, and quiet inside a labelled button", () => {
    const { container, rerender } = render(<Spinner />);
    const svg = container.querySelector("[data-slot=spinner]")!;
    expect(svg.getAttribute("role")).toBe("status");
    expect(svg.getAttribute("aria-label")).toBe("Loading");
    expect(tokensOf(svg.getAttribute("class") ?? "")).toEqual(
      expect.arrayContaining(["animate-spin", "motion-reduce:animate-none", "size-4"]),
    );
    rerender(<Spinner aria-hidden role={undefined} aria-label={undefined} />);
    const quiet = container.querySelector("[data-slot=spinner]")!;
    expect(quiet.getAttribute("aria-hidden")).toBe("true");
    expect(quiet.getAttribute("role")).toBeNull();
  });
});
