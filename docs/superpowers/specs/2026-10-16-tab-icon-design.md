# Tab icon

Date: 2026-10-16
Status: approved

## Goal

The new tab page has no icon: Chrome shows a blank globe in the tab strip and on the extension's
card. Give it a mark that is recognisable at 16px and that belongs to this page's look (the Claude
Code palette, the Doto dot-matrix clock face, the ASCII field that lights up around the cursor).

## The mark

A dark rounded tile (the page's `--bg` with a faint top-to-bottom gradient and a 1px warm-white
edge at 9%) holding a 5 × 5 grid of round dots. Thirteen dots form a pixel "N": both outer columns
and the top-left-to-bottom-right diagonal. The other twelve stay unlit, in `--muted` at 13%, like
the resting ASCII field. Lit dots use the accent (`#d97757`) and get warmer and brighter towards the
middle dot (`#f6c2a6`), the way the field brightens under the cursor; a blurred copy of the lit dots
behind them and a soft radial halo over the tile make them glow.

The icon does not follow the user's accent preference: a static file is what Chrome needs for
the manifest, and the tab strip shows it before any script runs.

## Alternatives considered

- **Dot-matrix "+".** Reads as "new tab" but sits next to Chrome's own + button and is less of an
  identity.
- **Terminal block cursor on an ASCII field.** Too busy at 16px; the letters turn to noise.

## Files

- `icons/icon.svg`: the artwork at 128 × 128.
- `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`: rasterized for Chrome. The
  16px one is drawn from a variant with slightly bigger dots and fainter unlit dots, so the strokes
  stay solid where there is no room for gaps.
- `icons/make-icons.mjs`: draws the SVGs and rasterizes them with a Chrome or
  chrome-headless-shell binary passed on the command line (Node has no SVG rasterizer).
- `newtab.html`: `<link rel="icon">` for 16 and 32 (Chrome picks by device pixel ratio).
- `manifest.json`: `icons` for 16, 32, 48 and 128 (card, toolbar, `chrome://extensions`).

## Testing

`npm test` still passes (no JS changes). The manifest parses, every icon path it and the HTML
point to exists, and each PNG has the size its name says. The tab strip itself cannot be
screenshotted headlessly; the user sees the icon after reloading the extension.
