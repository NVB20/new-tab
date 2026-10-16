# Tab icon

Date: 2026-10-16
Status: approved

## Goal

The new tab page had no icon: Chrome showed a blank globe in the tab strip and on the extension's
card. Give it a mark that is recognisable at 16px and that belongs to this page's look.

## The mark

A dark rounded tile (`#0d1419` fading to `#06090c`, with a 1px white edge at 7%) holding one
continuous stroke that traces an "N": down the left stem, across the diagonal, up the right stem,
with round caps and joins. The stroke is a gradient from mint (`#2fd58f`) at the bottom left to sky
(`#4cc9ff`) at the top right, and ends in a white dot the width of the stroke: a cursor point, as if
the letter were a path traced across the ASCII field. A blurred copy of the stroke behind it makes
it glow.

The stroke is 14 wide in the 128px drawing. The 32px PNG is drawn with a 17 stroke and the 16px
one with 20, each pulled inward so the N keeps its outer extent; at those sizes a 14 stroke is
under two pixels and turns grey. The white dot scales with the stroke.

The icon does not follow the user's accent preference: a static file is what Chrome needs for the
manifest, and the tab strip shows it before any script runs.

## How it got here

The first version was a 5 × 5 dot-matrix "N" in the page's terracotta accent, echoing the Doto
clock face and the ASCII field. The user kept the N and asked for smooth vector shapes and better
colours. Three were offered side by side in mock tab strips: a sharp two-tone folded N in blue and
cyan, a rounded white N on a pink-to-tangerine tile, and this traced stroke. The traced stroke was
chosen.

## Files

- `icons/icon.svg`: the artwork at 128 × 128.
- `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`: rasterized for Chrome, the
  16 and 32 from the heavier-stroke variants.
- `icons/make-icons.mjs`: draws the SVGs and rasterizes them with a Chrome or
  chrome-headless-shell binary passed on the command line (Node has no SVG rasterizer).
- `newtab.html`: `<link rel="icon">` for 16 and 32 (Chrome picks by device pixel ratio).
- `manifest.json`: `icons` for 16, 32, 48 and 128 (card, toolbar, `chrome://extensions`).

## Testing

`npm test` still passes (no JS changes). The manifest parses, every icon path it and the HTML
point to exists, and each PNG has the size its name says. The tab strip itself cannot be
screenshotted headlessly; the user sees the icon after reloading the extension.
