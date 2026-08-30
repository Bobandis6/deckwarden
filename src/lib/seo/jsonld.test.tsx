import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { breadcrumbJsonLd, deckJsonLd, JsonLd, websiteJsonLd } from "./jsonld";

describe("JsonLd", () => {
  it("escapes </script> in user content so deck names can't break out", () => {
    const { container } = render(
      <JsonLd data={{ name: `</script><img src=x onerror=alert(1)>` }} />,
    );
    const script = container.querySelector("script")!;
    expect(script.innerHTML).not.toContain("</script>");
    expect(script.innerHTML).toContain("\\u003c/script>");
    // Round-trips back to the original string when parsed as JSON.
    expect(JSON.parse(script.innerHTML).name).toBe(`</script><img src=x onerror=alert(1)>`);
  });
});

describe("builders", () => {
  it("websiteJsonLd declares the card search action", () => {
    const data = websiteJsonLd() as { potentialAction: { target: { urlTemplate: string } } };
    expect(data.potentialAction.target.urlTemplate).toContain("/cards?q={search_term_string}");
  });

  it("breadcrumbJsonLd numbers positions from 1 with absolute items", () => {
    const data = breadcrumbJsonLd([
      { name: "Commanders", path: "/commanders" },
      { name: "Atraxa", path: "/c/atraxa" },
    ]) as { itemListElement: Array<{ position: number; item: string }> };
    expect(data.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(data.itemListElement[1].item).toMatch(/^https:\/\/.+\/c\/atraxa$/);
  });

  it("deckJsonLd omits author and description when absent", () => {
    const data = deckJsonLd({
      name: "My deck",
      description: null,
      publicId: "abc123",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-02-01T00:00:00Z"),
      authorName: null,
      authorPath: null,
    });
    expect(data).not.toHaveProperty("author");
    expect(data).not.toHaveProperty("description");
    expect(data.dateModified).toBe("2026-02-01T00:00:00.000Z");
  });
});
