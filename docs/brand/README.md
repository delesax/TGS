# The Grand Strategist: brand in the app (final, 16 Nov 2026)

This is the short, current statement of what the app uses. The exploration history (icons, wordmarks, rejected lockups) is in `logo-exploration/README.md` (also tagged `archive/ui-logo-exploration`).

## Logo

- **Mark:** icon-02 "Apex" (a lattice of nodes with one gold apex node) plus wordmark-03 "Two-tier" (THE above GRAND STRATEGIST between two rules). Files in `logo-exploration/lockups/` and `favicon/`.
- **In the app header:** the **larger-THE** lockup, `public/brand/lockup-full.svg` (same file as `lockup-01-header.svg` here). "THE" is scaled 1.5x and the side rules shortened so it stays legible at header size. It follows the device's light or dark setting by itself (an embedded `prefers-color-scheme` rule).
  - Size: 46px tall on phones (about 282px wide); on desktop 44px tall (about 270px wide) at 1024px growing to 52px (about 319px wide) from 1440px, set by `--header-logo-h` and `--header-h` in `src/app/globals.css`.
  - Accessible name: "The Grand Strategist". The footer carries no logo.
- **Other variants** (not used in the app): `lockup-01-header-light.svg`, `-dark.svg`, `-mono-ink.svg`, `-mono-paper.svg`. Comparison with the earlier lockup: `header-logo-compare.png`.
- **Icons:** `favicon/` (favicon.svg, 32px, 180px Apple touch icon, 192 and 512px PWA icons). The service worker cache is `tgs-shell-v3`; bump it whenever a cached brand file changes.

## Palette (tokens in `src/app/globals.css`)

| Role | Light | Dark |
| --- | --- | --- |
| Background | Paper `#F7F5F0` | Night `#060F1D` |
| Text | Ink `#0B1F3A` | Paper `#F7F5F0` |
| Card | `#FFFFFF` | Ink `#0B1F3A` |
| Muted text | Slate `#4A5A70` | Mist `#A7B2C4` |
| Gold (graphics, text on navy) | Burnished Gold `#C8A24A`; gold text on light uses Deep Gold `#886B29` | `#C8A24A` |
| Focus ring | `#886B29` | `#C8A24A` |
| Control border | `#76808F` | `#66789A` |

Every text pair meets WCAG AA (ratios are in the comments beside each token); control borders and the focus ring meet 3:1. Burnished Gold is never used as text on a light background.

## Fonts and text size

- **Body:** Atkinson Hyperlegible (default). **Headings:** Source Serif 4.
- **Display dialog** (the "Text" button in the header, or the Menu on phones) lets anyone choose the body font (Atkinson Hyperlegible, Inter, Source Sans, Lexend, Open Sans, Source Serif, Merriweather or Lora) and the text size (Small 15px, **Default 17px**, Medium 19px, Large 22px). The choice is saved in the browser only (`localStorage` key `tgs-display`) and applied before first paint to `<html data-font data-size>`. Layouts hold at every size down to 320px wide.

## Theme (light and dark)

- **The theme follows the browser's `prefers-color-scheme`. There is no toggle and nothing is stored.** This was decided for the pilot and left as is. The dark colour set is one `@media (prefers-color-scheme: dark)` block in `globals.css`; the browser chrome colour (`themeColor` in `src/app/layout.tsx`) and the logo SVG follow the same setting.
- A future toggle would need the dark tokens duplicated under `:root[data-theme="dark"]`, a stored `data-theme` set by the same inline script as font and size, a logo that reads the page's setting rather than the device's, and a way for the tests to force each theme.

## Layout

One fluid container (`.page-container`): full width, side padding `clamp(16px, 2.5vw, 40px)`, maximum 1600px, centred. Backgrounds run edge to edge; reading text stays at about 68 characters. The desktop footer is one slim row from 1280px.

## Screenshots

Before and after sets for each UI pass are in `finish-screenshots/`, `layout-screenshots/`, `font-picker-screenshots/`, `polish-screenshots/` and the earlier `reskin-screenshots/` and `mobile-nav-screenshots/`.
