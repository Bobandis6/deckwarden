/**
 * JSON-LD structured data (P2.6). One escaping-aware renderer plus builders
 * for the handful of honest shapes we emit — nothing speculative: schema.org
 * has no deck/card-game vocabulary, so decks are CreativeWork, hubs and
 * cards get BreadcrumbList (the piece Google actually renders), and home
 * declares WebSite + SearchAction against /cards.
 */
import { absUrl } from "@/lib/seo/site";

type JsonLdObject = Record<string, unknown>;

/**
 * Render a JSON-LD script tag. `<` is escaped to < so user-authored
 * strings (deck names, descriptions) can never close the script element and
 * inject markup — JSON.stringify alone does NOT protect against `</script>`.
 */
export function JsonLd({ data }: { data: JsonLdObject }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Deckwarden",
    url: absUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: absUrl("/cards?q={search_term_string}") },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(crumbs: Array<{ name: string; path: string }>): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.path),
    })),
  };
}

export function deckJsonLd(deck: {
  name: string;
  description: string | null;
  publicId: string;
  updatedAt: Date;
  createdAt: Date;
  authorName: string | null;
  authorPath: string | null;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: deck.name,
    ...(deck.description ? { description: deck.description } : {}),
    url: absUrl(`/d/${deck.publicId}`),
    dateCreated: deck.createdAt.toISOString(),
    dateModified: deck.updatedAt.toISOString(),
    ...(deck.authorName
      ? {
          author: {
            "@type": "Person",
            name: deck.authorName,
            ...(deck.authorPath ? { url: absUrl(deck.authorPath) } : {}),
          },
        }
      : {}),
  };
}
