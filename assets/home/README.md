# Home atmosphere assets

Created on 2026-10-31 with the built-in image-generation tool, using the owner's
`/Users/danielson/Documents/codex/Deckwarden/fresh-ui/references/home.png` as the
visual reference. These replace the upscaled screenshot crops from the first
HOME-ATMOSPHERE session. They are generated decorative artwork, not official card
images. The actual hero cards still come through the existing Scryfall pipeline.

| Website file | Dimensions | WebP bytes |
| --- | --- | --- |
| `public/home/optcg-tile.webp` | 1600 × 533 | 210,646 |
| `public/home/mtg-tile.webp` | 1600 × 533 | 189,700 |
| `public/home/hero-stage.webp` | 2160 × 726 | 56,816 |

The original generated PNGs are retained in the owner's Codex workspace at
`fresh-ui/home-atmosphere-refinement/art/`. WebP encoding uses sharp, quality 88,
effort 6, with proportional downscaling only. All labels remain live HTML.

## One Piece prompt

Create ONE standalone high-resolution wide landscape banner asset for the One Piece Card Game button on this website. The reference is a website screenshot: recreate ONLY the ocean and sailing ship illustration from the bottom-right game button (x1072–1536, y535–696), as a freshly rendered detailed painting, NOT a screenshot, NOT a website layout. Wide 3:1 canvas, ideally 1536x512 or larger. Match that exact cheerful blue ocean, green rocky tropical islands, cloudy cyan sky, and Going Merry sailing ship on the RIGHT half at about 72% across. Match the reference Going Merry sheep figurehead, warm wooden hull, crisp ropes and rigging, main cream cloth sail with clearly drawn straw-hat skull and crossbones emblem. CRITICAL: sail is SHARP and intact, precise dark contours, visible canvas panels, folds, seams, no blur or smudged/inpainted patch. Detailed hand-painted anime adventure background style, tasteful texture, sharp at small size. Full ship and sails fit vertically with a little breathing room, ocean at bottom. Left 40% mainly open distant sea/islands/sky, so HTML button text can overlay. No type, no game title, no compass UI icon, no arrows, no border, no UI, no watermarks. Deliver only the full-bleed wide background painting.

## Stage prompt

Generate ONLY an empty photographic studio backdrop asset matching the hero background of the supplied website reference. Do NOT generate the website, any cards, any words, UI, logos, objects, panels, borders, or placeholders. We need the exact atmosphere BEHIND the three cards in the top hero: a very dark desaturated forest-green charcoal wall transitioning into a horizontal subtly textured worn green tabletop. Wide landscape 3:1 canvas, at least 2400x800. Composition: wall occupies upper 82% and tabletop lower 18%; horizon soft and low, tabletop extends fully to bottom edge. Most illumination is a broad soft wash across the center-right wall, not a spotlight cone or radial oval. Muted grey-green wall rgb roughly 43,58,49 in the lit center and right, left edge near 15,21,21. Tabletop brightest softly at center-right rgb roughly 52,73,64 with fine real mottled stone/velvet grain and horizontal perspective streaks, falling dark near left edge. Very dark natural photographic surface, rich restrained texture, low contrast atmospheric depth. Gentle light from above right creates broad diffuse wall illumination and a shallow horizontal lit surface at the bottom, with no floating glow, no luminous ellipse, no geometric gradient boundaries, no particles, no smoke, no bokeh, no stars, no glitter, no vignette black corners. Reference is visual authority for material and green color. The actual trading cards will be separately rendered by HTML; image must contain zero cards and zero shadows of cards, just the empty stage.

## Magic prompt

Create ONE standalone high-resolution wide landscape background painting for the Magic: The Gathering button in the supplied reference screenshot. Recreate ONLY the fantasy landscape inside the lower middle button (x627–1060, y535–696), freshly rendered with fine sharp detail, no website UI. Wide 3:1 canvas, at least 1800x600. A spectacular medieval gothic citadel atop a huge floating rocky island covered in green moss and vegetation, additional smaller floating islands and tall narrow spires receding in the sky, pale gold late-afternoon clouds with deep slate blue grey shadows. Match reference composition with main citadel center-right around 62%, airy floating rocks to either side, shadowed foreground left kept quiet for HTML text. Painterly cinematic fantasy world, realistic architectural detail, soaring silhouette and lush forest on rock, sharp beautifully drawn turrets and bridges. No humans, no cards, no labels, no text, no Magic logo, no planeswalker mark, no white icon, no border, no UI, no watermark. The image fills entire wide canvas.
