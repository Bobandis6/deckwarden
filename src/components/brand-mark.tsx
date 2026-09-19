/**
 * The Deckwarden mark (W1, WAVE2.md D0): the crest — three forest-green
 * cards with gold outlines fanned behind a charcoal shield carrying a gold
 * downward sword — inlined so headers and empty states render it without an
 * <img> round-trip. The colors stay literal on purpose: the crest palette
 * (green #23483c, gold #ba9b61, charcoal #242c2f) IS the brand, not a theme
 * token, so the mark reads identically in both themes. On the dark page the
 * charcoal shield is ~1.3:1 against the background BY DESIGN — its gold
 * border is the silhouette. Decorative by default (aria-hidden); the link
 * or heading around it carries the name.
 *
 * variant="crest" (default) is for ≥ 28 px. variant="shield" — the shield +
 * sword alone, tight-cropped — is for ≤ 20 px (the browser tab, the Warden
 * approval line): three cards turn to mud at 16 px. src/app/icon.svg is the
 * shield variant as a file; edit it and this component together.
 */
export function BrandMark({
  variant = "crest",
  className,
}: {
  variant?: "crest" | "shield";
  className?: string;
}) {
  if (variant === "shield") {
    return (
      <svg
        viewBox="11 24.5 74 74"
        aria-hidden
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M48 27.5C56.5 33.5 66.5 37.8 77.5 40.7V54C77.5 71 66.5 84 48 95C29.5 84 18.5 71 18.5 54V40.7C29.5 37.8 39.5 33.5 48 27.5Z"
          fill="#242c2f"
          stroke="#ba9b61"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <g fill="#ba9b61">
          <path d="M48 33.5l3.1 3.9-3.1 3.9-3.1-3.9Z" />
          <rect x="46.4" y="40.5" width="3.2" height="9" />
          <path d="M37 49.2c7.2-2.4 14.8-2.4 22 0l-1.1 3.6c-6.4-2-13.4-2-19.8 0Z" />
          <path d="M45 52.5h6V79L48 87 45 79Z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 96 96" aria-hidden className={className} xmlns="http://www.w3.org/2000/svg">
      <g fill="#23483c" stroke="#ba9b61" strokeWidth="3" strokeLinejoin="round">
        <rect x="8.9" y="8.65" width="41" height="57.3" rx="3" transform="rotate(-20 29.4 37.3)" />
        <rect x="46.1" y="8.65" width="41" height="57.3" rx="3" transform="rotate(20 66.6 37.3)" />
        <rect x="27.5" y="1.5" width="41" height="57.3" rx="3" />
      </g>
      <path
        d="M48 27.5C56.5 33.5 66.5 37.8 77.5 40.7V54C77.5 71 66.5 84 48 95C29.5 84 18.5 71 18.5 54V40.7C29.5 37.8 39.5 33.5 48 27.5Z"
        fill="#242c2f"
        stroke="#ba9b61"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g fill="#ba9b61">
        <path d="M48 34.5l2.8 3.4-2.8 3.4-2.8-3.4Z" />
        <rect x="46.6" y="40.8" width="2.8" height="8.7" />
        <path d="M38 49.5c6.5-2.2 13.5-2.2 20 0l-1 3.2c-5.8-1.8-12.2-1.8-18 0Z" />
        <path d="M45.4 52.5h5.2V80L48 87.5 45.4 80Z" />
      </g>
    </svg>
  );
}
