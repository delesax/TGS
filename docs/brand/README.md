# The Grand Strategist: brand in the app (final, 16 Nov 2026)

This is the short, current statement of what the app uses. The exploration history (icons, wordmarks, rejected lockups) is in `logo-exploration/README.md` (also tagged `archive/ui-logo-exploration`).

## Logo

- **Mark:** icon-02 "Apex" (a lattice of nodes with one gold apex node) plus wordmark-03 "Two-tier" (THE above GRAND STRATEGIST between two rules). Files in `logo-exploration/lockups/` and `favicon/`.
- **In the app header:** the **larger-THE** lockup, as two files with the same viewBox: `public/brand/lockup-light.svg` and `public/brand/lockup-dark.svg` (copies of `lockup-01-header-light.svg` and `-dark.svg` here). "THE" is scaled 1.5x and the side rules shortened so it stays legible at header size. The header holds both images and `globals.css` shows one by `<html data-theme>` (an `<img>` SVG cannot see the page's setting, so the old embedded `prefers-color-scheme` rule is gone); with no JavaScript it follows the device.
  - Size: 46px tall on phones (about 282px wide); on desktop 44px tall (about 270px wide) at 1024px growing to 52px (about 319px wide) from 1440px, set by `--header-logo-h` and `--header-h` in `src/app/globals.css`.
  - Accessible name: "The Grand Strategist". The footer carries no logo.
- **Other variants** (not used in the app): `lockup-01-header.svg` (adaptive), `-mono-ink.svg`, `-mono-paper.svg`. Comparison with the earlier lockup: `header-logo-compare.png`.
- **Icons:** `favicon/` (favicon.svg, 32px, 180px Apple touch icon, 192 and 512px PWA icons). The service worker cache is `tgs-shell-v3`; bump it whenever a cached shell file (offline page, manifest, icons) changes. The header lockups are not in it. Favicon, Apple touch icon, manifest and Open Graph images are fixed and do not follow the theme.

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

- **Three modes, chosen in the Display dialog** (Text button, or the Menu on phones): **Automatic** (the default), **Light** and **Dark**. Automatic is dark from 19:00 to 07:00 by the device's own clock (`NIGHT_START` and `NIGHT_END` in `src/lib/theme.ts`), or whenever the device is set to dark; otherwise light. Light and Dark override both. Nothing is sent to the server: the choice is saved in the browser only, as a `theme` field in the same `tgs-display` value as the font and size (absent, invalid or corrupt means Automatic).
- **One palette.** The tokens in `globals.css` are written once as `light-dark(light value, dark value)`, and `color-scheme` follows `<html data-theme="light|dark">`. A tiny script in `<head>` (`src/lib/theme-init.ts`) resolves the mode before first paint and sets `data-theme`, `data-theme-mode` and the single `theme-color` meta; `src/components/theme-sync.tsx` keeps Automatic live (device scheme changes, the 19:00 and 07:00 boundaries, and tab visibility). With no JavaScript the CSS follows the device (`:root:not([data-theme])`).
- **Checking contrast:** `scripts/contrast.ts` visits every page and state in both themes (`--theme light,dark`, or `--theme auto --hour 21 --device light`) and checks text, placeholders, focus rings and control borders; text on a gradient or glow is sampled from the real rendered pixels. Run it before changing any colour.

## Layout

One fluid container (`.page-container`): full width, side padding `clamp(16px, 2.5vw, 40px)`, maximum 1600px, centred. Backgrounds run edge to edge; reading text stays at about 68 characters. The desktop footer is one slim row from 1280px.

## Screenshots

Before and after sets for each UI pass are in `finish-screenshots/`, `layout-screenshots/`, `font-picker-screenshots/`, `polish-screenshots/` and the earlier `reskin-screenshots/` and `mobile-nav-screenshots/`.
