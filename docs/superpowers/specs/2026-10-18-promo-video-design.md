# Promo video design

A 16-second, fast-paced promo video of the New Tab extension, with the text built into the picture
and an original beat generated in code.

## Goals

- Snappy: one feature every 2 seconds, hard cuts, words landing on the beat.
- Text is part of the picture (animated headlines and spotlights), not a caption track.
- Every widget looks full and alive, from made-up data. None of the user's own tiles, names or
  tokens appear.
- Re-runnable: one command rebuilds the video after a UI change.
- Nothing outside `promo/` changes, apart from one `.gitignore` line. No demo mode in the
  extension.

## Output

`promo/out/new-tab-promo.mp4`: 1920×1080, 30 fps, H.264 (CRF 18) and AAC 192 kbps. Exactly
16.000 s (480 frames). `promo/out/` is gitignored.

## Timeline

The music runs at 120 BPM, so a beat is 0.5 s and a bar is 2 s (60 frames). Every cut lands on a
bar's downbeat.

| Bar | Time | Scene | Headline (lands on) |
| --- | --- | --- | --- |
| 1 | 0–2 s | ASCII background lighting up as the cursor sweeps across it | "Your new tab." (beat 2) |
| 2 | 2–4 s | Tiles; a folder pops open | "One click." (beat 1) |
| 3 | 4–6 s | Layout mode: a widget is dragged, resized, stacked | "Drag." "Resize." "Stack." (beats 1, 2, 3) |
| 4 | 6–8 s | Markets: sparklines draw in, prices tick | "Live markets." (beat 1) |
| 5 | 8–10 s | GitHub: heatmap fills, PR list | "Your GitHub." (beat 1) |
| 6 | 10–12 s | Sports (10–11 s), hard cut to Weather (11–12 s) | "Scores." (10 s) "Weather." (11 s) |
| 7–8 | 12–16 s | End card: icon and name on the ASCII background | "New Tab" (12 s), "Free for Chrome" (13 s) |

## Look

- The page's own dark theme (`#151515`) and accent (`#d97757`). Headlines are set in Nunito 900
  from `fonts/`, white, with the key word in the accent colour.
- Headlines slam in: scale 1.35 → 1 and opacity 0 → 1 over 180 ms with a slight overshoot. They
  leave on the cut.
- Spotlight: the rest of the page dims to 55% around the featured widget.
- Camera: each scene opens with a 150 ms zoom punch (scale 1.06 → 1) towards the featured widget.
- A rendered cursor (a dot with a click ripple), because headless Chrome doesn't draw one.

## How it's built

All of it lives in `promo/`.

1. **Fixtures** (`promo/fixtures/`): a seeded `state` (tiles for well-known sites, two groups, one
   folder, and the Markets, GitHub, Sports and Weather widgets), plus canned API responses for every
   host those widgets call. Prices trend up, the heatmap is full, a game is live, the weather is
   sunny.
2. **Recorder** (`promo/record.mjs`, Node 22, raw CDP, the same way as the repo's existing browser
   checks):
   - Launches Playwright's Chromium headless at 1920×1080 with the unpacked extension and its own
     profile and CDP port.
   - Closes the startup tab, then seeds `chrome.storage.local` and localStorage.
   - Answers every widget request from the fixtures through the CDP `Fetch` domain, in the page and
     in the service worker, so no real request leaves.
   - Records each scene as its own clip. A scene's camera, spotlight and headlines come from
     `promo/overlay.js`, which is injected into the page and timed from the scene's start.
3. **Capture:** CDP `Page.startScreencast` (JPEG, quality 95), with each frame's timestamp kept.
   If a scene clip shows dropped frames (any gap over 50 ms), that scene switches to frame-stepped
   capture: virtual time advanced 33.3 ms per frame with a screenshot of each. The choice is made
   per scene and logged.
4. **Music** (`promo/music.py`, numpy): a 16 s, 120 BPM, 44.1 kHz stereo WAV.
   - Four-on-the-floor kick, off-beat hi-hats, and claps on beats 2 and 4.
   - A side-chained saw bass on A–F–C–G (one chord per bar).
   - A noise riser through bar 6 into a crash and sub drop at 12 s, then a ring-out with a 0.5 s fade.
   - Mastered to −14 LUFS with ffmpeg `loudnorm`.
5. **Assembly** (`promo/build.mjs`): trims each clip to exactly 60 frames (bar 6 is two 30-frame
   clips; the end card is 120 frames), joins them with hard cuts, adds the music, and encodes the MP4.
   ffmpeg comes from the `imageio-ffmpeg` pip package. Playwright's bundled ffmpeg can't mux audio.

Run it with `node promo/build.mjs`, which records, generates the music and assembles. Recording a
single scene (`--scene markets`) is allowed while iterating.

## Errors

- If a widget makes a request that has no fixture, the recorder fails with the request URL, so
  live data can't leak into a frame.
- If a widget is empty or shows an error banner when its scene starts, the recorder fails with the
  scene's name.
- The build checks the output: 480 frames, 16.000 s, and an audio stream present.

## Verifying it

- The build's checks above.
- Contact sheet: one frame per scene (`promo/out/contact.png`), checked by eye before handing over.
- Beat sync: the music's onsets (from the generated beat grid) match the cut and headline frames
  within 1 frame.

## Not included

Voiceover, other aspect ratios, GIF/WebM, and a Web Store upload.
