/**
 * manaCostHtml (SECURITY-AUDIT-report.md L10). The first block pins what the
 * function rendered before S8, byte for byte, so the escaping change below
 * it is proven to leave every real Scryfall cost alone.
 */
import { describe, expect, it } from "vitest";

import { manaCostHtml } from "./adapter";

const pip = (cls: string, text: string) => `<span class="pip pip-${cls}">${text}</span>`;

describe("manaCostHtml", () => {
  it("renders Scryfall costs as pip spans (pinned before the L10 change)", () => {
    expect(manaCostHtml("{2}{W}{U}")).toBe(pip("2", "2") + pip("w", "W") + pip("u", "U"));
    expect(manaCostHtml("{W/U}")).toBe(pip("wu", "W/U"));
    expect(manaCostHtml("{2/W}")).toBe(pip("2w", "2/W"));
    expect(manaCostHtml("{W/P}")).toBe(pip("wp", "W/P"));
    expect(manaCostHtml("{G/U/P}")).toBe(pip("gup", "G/U/P"));
    expect(manaCostHtml("{X}{X}{R}")).toBe(pip("x", "X") + pip("x", "X") + pip("r", "R"));
    expect(manaCostHtml("{C}")).toBe(pip("c", "C"));
    expect(manaCostHtml("{S}{10}")).toBe(pip("s", "S") + pip("10", "10"));
    // A split card's card-level cost keeps Scryfall's face separator between the pips.
    expect(manaCostHtml("{1}{R} // {2}{G}")).toBe(
      pip("1", "1") + pip("r", "R") + " // " + pip("2", "2") + pip("g", "G"),
    );
    expect(manaCostHtml("")).toBe("");
    expect(manaCostHtml(undefined)).toBe("");
  });

  it("escapes the text outside the braces too (L10): nothing outside a pip reaches the HTML raw", () => {
    expect(manaCostHtml("{W}<img>")).not.toContain("<img>");
    expect(manaCostHtml("{W}<img>")).toBe(pip("w", "W") + "&lt;img&gt;");
    expect(manaCostHtml('<script>x</script>{U}"')).toBe(
      "&lt;script&gt;x&lt;/script&gt;" + pip("u", "U") + "&quot;",
    );
    // Inside a brace group the symbol and the class were already escaped; still are.
    expect(manaCostHtml('{<b x="1">}')).toBe(
      '<span class="pip pip-&lt;b x=&quot;1&quot;&gt;">&lt;b x=&quot;1&quot;&gt;</span>',
    );
    expect(manaCostHtml("a & b")).toBe("a &amp; b");
  });
});
