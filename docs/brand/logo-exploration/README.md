# TGS logo exploration

**FINAL CHOICE (15 Nov 2026): icon-02 Apex + wordmark-03 Two-tier, `lockups/lockup-01-*.svg`.** Compact version for 375px phone headers: `lockups/lockup-01-compact-*.svg` (icon + GRAND STRATEGIST on one line). **The app uses the full lockup (`lockup-01`) at every screen size, desktop and mobile** (below 1024px it is 46px tall, about 282px wide). The stacked (`lockup-01-stacked-*`) and compact (`lockup-01-compact-*`) lockups are kept in `lockups/` for reference only and are not used in the app (`public/brand/` holds only the full lockup). Favicon set: `../favicon/` (`favicon.svg`, `favicon-32.png`, `apple-touch-icon-180.png`, `icon-192.png`, `icon-512.png`). The favicon cut uses slightly heavier strokes and nodes than icon-02 so it holds at 16px; the PNGs sit on a navy tile (`favicon-32.png` rounded, the others square with safe padding, mark inside the central 60%); `favicon.svg` is transparent and switches between navy and paper with the browser theme. Nothing from the exploration was deleted. The weak spots below apply to the other icons; ignore them for Apex.


Exploration only. Nothing here is applied to the app, Tailwind config, components or database. Open `gallery.html` in a browser (double-click works; no build step).

## What is here

| Folder | Contents |
| --- | --- |
| `icons/` | `icon-01.svg` to `icon-05.svg` (light, the default), plus `-light`, `-dark`, `-mono-navy`, `-mono-white`, `-mono-black` for each |
| `wordmarks/` | `wordmark-01.svg` to `wordmark-05.svg`, plus the same five variants for each |
| `lockups/` | `lockup-01` (final; icon now about as tall as the two text tiers, wider gap), `lockup-01-compact` (final, phones), `lockup-02`, `lockup-03`, same five variants each |
| `../favicon/` | Final favicon set from icon-02 only |
| `gallery.html` | Every mark on light and dark, large, 32px and 16px, one colour, palette and contrast |
| `source/build.py` | Regenerates every file above (needs `fonttools` and the font files listed in its header) |
| `source/contrast.md` | The contrast table, generated |

All SVGs are hand-built geometry or font outlines converted to paths. They contain no raster images, no external references and no live text, so they render without the fonts installed. Icons sit on a 64-unit square grid.

## The ten samples

| # | Name | Meaning |
| --- | --- | --- |
| icon-01 | Bearing G | A G drawn as a bearing ring with a gold aim point at its centre: direction and calculated aim. |
| icon-02 | Apex | Many linked navy voices resolve into one gold node at the top: one Grand Strategist from many. |
| icon-03 | Knight | The one piece that moves around the board rather than through it, cut to straight lines. |
| icon-04 | Laurel column | A fluted column under a laurel crown: classical rigour, and the single winner's honour. |
| icon-05 | Campaign glass | An hourglass with gold settling at the base: time-boxed Campaigns and what they leave behind. |
| wordmark-01 | Editorial serif | One line of high-contrast serif, like a journal masthead: calm, established, editorial. |
| wordmark-02 | Spaced caps | Widely spaced geometric capitals: institutional and modern, plain enough to read at any size. |
| wordmark-03 | Two-tier | Small gold THE between rules over serif capitals: a title-page lockup for formal use. |
| wordmark-04 | TGS short form | A compact TGS with a gold full stop and the name beneath: survives avatars and app icons. |
| wordmark-05 | Grand meets Strategist | Serif Grand meets sans Strategist, with a gold G: tradition and modern thinking in one name. |

Lockups: `lockup-01` Apex + Two-tier, `lockup-02` Bearing G + Spaced caps, `lockup-03` Apex + Editorial serif.

### Known weak spots (checked at 16px, rasterised)

- **icon-04 Laurel column** is the weakest favicon: at 16px the wreath becomes a gold smudge over the column. It needs a simplified favicon cut if chosen.
- **icon-01 Bearing G**: the north, west and south ticks go soft at 16px (they straddle a pixel boundary). The G and the gold point still read.
- **wordmark-04**: the small "THE GRAND STRATEGIST" line is unreadable below about 48px tall. Use "TGS." alone at small sizes.
- **icon-03 Knight** is chess, which the earlier brief asked to avoid as a cliché. It is included because this brief named it.
- Kerning tables are not applied; spacing is set by hand per wordmark. A final version should be kerned in a type tool.

## Palette

Your colour direction holds. The only changes are two darker golds for light backgrounds, derived from Burnished Gold by lowering lightness at the same hue.

| Name | Hex | Use |
| --- | --- | --- |
| Deep Ink Navy | `#0B1F3A` | Primary: text, buttons, the mark on light |
| Night Navy | `#060F1D` | Dark-mode background |
| Warm Paper | `#F7F5F0` | Light-mode background |
| Burnished Gold | `#C8A24A` | Accent on navy; large graphics only on light |
| Deep Gold | `#886B29` | Gold text and borders on light backgrounds (meets 4.5:1) |
| Mark Gold | `#AD8935` | Gold inside the logo on light backgrounds (meets 3:1 for graphics) |
| Slate | `#4A5A70` | Secondary text, light mode |
| Mist | `#A7B2C4` | Secondary text, dark mode |

### Contrast (WCAG 2.2; AA needs 4.5:1 for body text, 3:1 for large text and graphics; AAA needs 7:1)

| Foreground | Background | Pair | Use | Ratio | WCAG |
| --- | --- | --- | --- | --- | --- |
| `#0B1F3A` | `#F7F5F0` | Ink on Paper | body text, light | 15.16:1 | AAA |
| `#0B1F3A` | `#FFFFFF` | Ink on white | body text on white cards | 16.52:1 | AAA |
| `#FFFFFF` | `#0B1F3A` | White on Ink | primary button text | 16.52:1 | AAA |
| `#F7F5F0` | `#060F1D` | Paper on Night | body text, dark | 17.62:1 | AAA |
| `#F7F5F0` | `#0B1F3A` | Paper on Ink | text on navy panels | 15.16:1 | AAA |
| `#C8A24A` | `#0B1F3A` | Gold on Ink | gold text on navy | 6.86:1 | AA |
| `#C8A24A` | `#060F1D` | Gold on Night | gold text, dark mode | 7.97:1 | AAA |
| `#060F1D` | `#C8A24A` | Night on Gold | text on a gold badge | 7.97:1 | AAA |
| `#886B29` | `#F7F5F0` | Deep Gold on Paper | gold text, light | 4.61:1 | AA |
| `#886B29` | `#FFFFFF` | Deep Gold on white | gold text on white cards | 5.02:1 | AA |
| `#4A5A70` | `#F7F5F0` | Slate on Paper | secondary text, light | 6.45:1 | AA |
| `#A7B2C4` | `#060F1D` | Mist on Night | secondary text, dark | 8.97:1 | AAA |
| `#C8A24A` | `#F7F5F0` | Gold on Paper | DO NOT use for text | 2.21:1 | Fail |
| `#C8A24A` | `#FFFFFF` | Gold on white | DO NOT use for text | 2.41:1 | Fail |

Body text is AAA in both themes. Burnished Gold fails as text on light backgrounds (2.2:1), so on light it is Deep Gold for text and Mark Gold inside the logo. Deep Gold only just clears AA (4.61:1), so keep it to labels and borders, not paragraphs.

## Fonts (all free for commercial use)

| Font | Used in | Licence |
| --- | --- | --- |
| Cormorant Garamond (SemiBold) | wordmark-01 | SIL Open Font License 1.1 |
| Manrope (SemiBold, Bold) | wordmark-02, THE in wordmark-03, Strategist in wordmark-05 | SIL Open Font License 1.1 |
| Source Serif 4 (SemiBold) | wordmark-03 | SIL Open Font License 1.1 |
| Space Grotesk (Bold, Medium) | wordmark-04 | SIL Open Font License 1.1 |
| Fraunces (SemiBold) | Grand in wordmark-05 | SIL Open Font License 1.1 |

All come from Google Fonts (github.com/google/fonts, `ofl/` folder). The font files are not committed; `source/build.py` says where to get them. Because the logos are outlined, the site needs none of these fonts loaded to show the logo.

## Recommendation (accepted)

**Pick icon-02 Apex with wordmark-03 Two-tier, which is `lockup-01`.**

- **It says what TGS is.** Many voices, linked, and one gold node at the top is the product: one Grand Strategist named from a Campaign. The bearing, knight, column and hourglass each say something true about strategy or time, but only the Apex says "one from many".
- **Gold is used sparingly, as asked.** One gold node in the icon, one small gold THE in the wordmark. Everything else is navy.
- **It holds up small.** At 16px the Apex still reads as a gold point over a navy network, and in one colour it reads as a simple tree.
- **It fits the site's current type.** The app already loads Source Serif 4 for headings (`src/app/layout.tsx`), so the wordmark's serif matches the headings with no new font to load. For the re-skin, the only font question is the body face.
- **It is not chess and not military.** It feels calm and institutional, which suits retired executives and professors as much as students.

Use the icon alone for the favicon, app icon and social avatar, and the full lockup in the header. On narrow phone headers, the wordmark-03 lockup is wide. If it does not fit at 375px, use the icon plus "GRAND STRATEGIST" only, or the icon alone.

**Runner-up:** `lockup-02` (Bearing G + Spaced caps) if you want a more modern, product-like feel. It is the cleanest in a narrow header, but it says "strategy" less specifically than the Apex.
