# Promo video design

A 22-second product film of the New Tab extension, in the style of a SaaS launch film (reference:
Zelios' iBanFirst demo, YouTube `wwIt5ZvROrs`). It uses the extension's GitHub theme with the blue
accent, the text is part of the picture, and the music is generated in code.

## Goals

- Snappy: a new shot every 1.5–3 s, every cut on the beat.
- The reference's look:
  - Thin type whose words blur in, and a typed opening line.
  - The page tilted in 3D with blurred depth.
  - Widgets lifted out of the page to float on a glowing stage, with corner brackets on what's in
    focus.
  - A dark-to-light switch for the closing line, and a logo with a pill on the end card.
- Every widget looks full and alive, from made-up data. None of the user's own tiles, names or
  tokens appear.
- Re-runnable: one command rebuilds the video after a UI change.
- Nothing outside `promo/` changes, apart from one `.gitignore` line. No demo mode in the
  extension.

## Output

`promo/out/new-tab-promo.mp4`: 1920×1080, 30 fps, H.264 (CRF 18) and AAC 192 kbps. Exactly
22.000 s (660 frames). `promo/out/` is gitignored.

## Timeline

The music runs at 120 BPM, so a beat is 0.5 s (15 frames). Every cut lands on a beat.

| Time | Shot | Text |
| --- | --- | --- |
| 0–2.5 s | Dark stage; tile logos float blurred around the edges | "Still opening *ten tabs* every morning?", typed with a caret |
| 2.5–4 s | Dark stage | "Meet" blurs in and out, then the icon and "New Tab", then a pill: "✦ Your whole morning on one page" |
| 4–7 s | Close-up of the GitHub tile under the cursor, pulling back to the whole page tilted in 3D | "Every site, *one click*" (at 5.5 s) |
| 7–10 s | Dark stage; the Markets widget floats tilted, its lines drawing in, with corner brackets | "Live *markets*" (left) |
| 10–13 s | Close-up of the GitHub heatmap, tilted, filling in left to right, slowly pushing in | "Your *GitHub*, at a glance" (at 10.5 s) |
| 13–15.5 s | Dark stage; the Sports and Weather widgets pop in side by side, angled towards each other | "Scores." then "*Weather.*" |
| 15.5–18 s | Layout mode on the Work tab: Weather is dragged to a new place, then Sports is stacked onto it | "Make it *yours*" |
| 18–20 s | Light stage with thin blue arcs drawing in | "No account." then "*Free.*" |
| 20–22 s | Light stage end card | Icon and "New Tab", then a dark pill: "Free for Chrome" |

*Starred* words are drawn in the blue gradient.

## Look

**Colours**
- The page is seeded with the GitHub theme (`#0d1117`, Primer greys) and the app's blue accent
  `#2563eb`.
- Dark stage: `#0d1117`, with a blue glow rising from the bottom edge and a faint one in a top
  corner.
- Light stage: `#f6f8fa`, with a paler glow.
- Shots of the page get the same bottom glow.

**Type**
- Segoe UI Variable Display, the page's own UI font, at weight 300.
- 92 px headlines and 150 px for "Meet". White on dark, `#0d1117` on light.
- Starred words get a gradient: `#3b82f6` → `#93c5fd` on dark, `#1d4ed8` → `#3b82f6` on light.

**Words**
- Each word fades in from a 14 px blur and an 18 px drop over 420 ms, 67 ms after the one before.
- The opening line types at 1.4 frames per character, with a caret that blinks once the line is
  done.

**Camera**
- Shots of the page move the page itself (the top bar and the canvas) with CSS 3D: a perspective
  of 1800 px, a tilt of up to about 20°, and scale.
- The camera eases between keyframes. Each keyframe centres an element on a screen point.
- A depth blur (7 px backdrop blur, clear in an ellipse around the subject) softens the edges.
- The Layout mode shot only scales, since its drags have to land.

**Floating widgets**
- These are copies of the live widgets.
- They rise in from 70 px lower, a 14 px blur and 92% scale over about half a second, then drift
  gently.
- They have soft shadows. Corner brackets close in on the first one.

**Cursor:** a white arrow. The page receives real mouse events, so hover and Layout mode react.

**Motion blur:** each frame is the average of 4 sub-frames, 1/120 s apart.

## How it's built

All of it lives in `promo/`.

1. **Fixtures** (`promo/fixtures/`):
   - A seeded `state`: tiles for well-known sites with simple-icons logos, two groups, one folder,
     the Markets, GitHub, Sports and Weather widgets, and the GitHub theme with the blue accent.
     A second tab, Work, has room to move widgets for the Layout mode shot.
   - Every cache entry the widgets read before asking the network (`newtab:cache:*` in
     localStorage), dated at the video's clock, so no widget asks the network.
   - Prices trend up, the heatmap is full, a game is live, the weather is sunny.
   - Team logos are left out, so no third-party images are used.
2. **Recorder** (`promo/record.mjs`, Node 22, raw CDP, the same way as the repo's existing browser
   checks):
   - Launches Playwright's Chromium headless at 1920×1080 with the unpacked extension and its own
     profile and CDP port.
   - Closes the startup tab, then seeds `chrome.storage.local` and localStorage.
   - Blocks every http(s) request from the page through the CDP `Fetch` domain. Any request
     fails the run.
   - Records each shot from a freshly seeded page. The stage, words, camera, floating widgets,
     brackets and cursor come from `promo/lib/overlay.js`. It's injected into the page as a
     top-layer popover and drawn from the frame number.
3. **Capture:** frame by frame.
   - A clock injected before the page's scripts (`promo/lib/vclock.js`) stands in for
     `performance.now`, `Date`, timers and `requestAnimationFrame`.
   - Every CSS animation is paused and set to the sub-frame's time.
   - Each sub-frame is a JPEG screenshot (quality 92). ffmpeg averages each frame's 4 (`tmix`), so
     a frame looks the same however long it took to capture. Real-time screencast dropped frames
     at 1080p in a trial.
   - The clock reads Tue 20 Oct 2026, 09:41.
   - `PROMO_SUB=1` turns motion blur off for fast iteration.
4. **Music** (`promo/music.py`, numpy): 22 s, 120 BPM, 44.1 kHz stereo WAV. It takes its cues from
   `timeline.mjs` (`musicCues()`, passed as JSON), so it lands on the picture.
   - A pad and a plucked arpeggio with a dotted-eighth echo play on Am–F–C–G, one chord per bar.
   - Soft keyboard ticks land on each typed character.
   - A soft kick, shaker, claps and ducked sub bass come in at 4 s, with the pull-back to the
     page, and drop out at 18 s for the light section.
   - A whoosh swells into every cut. A riser leads into a soft hit at 20 s, which rings out on
     C major.
   - It fades over the last 0.5 s and is mastered to −14 LUFS with ffmpeg `loudnorm`.
5. **Assembly** (`promo/build.mjs`): joins the 660 frames and the music into the MP4, checks it,
   and writes a contact sheet. ffmpeg comes from the `imageio-ffmpeg` pip package, because
   Playwright's bundled ffmpeg can't mux audio.

Run it with `node promo/build.mjs`, which records, generates the music and assembles. Recording a
single shot (`--scene markets`) is allowed while iterating.

## Errors

- If the page makes any network request, the recorder fails with the request URL, so live data
  can't leak into a frame.
- If a widget is empty or shows a note when its shot starts, the recorder fails with the shot's
  name.
- If an element a shot needs is missing (a camera subject, a widget to float, a drag target), the
  recorder fails with its selector.
- The build checks the output: 660 frames, 22.000 s, 1920×1080 H.264 and an AAC track.

## Verifying it

- The build's checks above.
- Contact sheet: one frame per shot (`promo/out/contact.png`), checked by eye before handing over.
- Beat sync: a test checks that every cut, headline cue, logo, pill and drag lands on a beat. The
  music tests check that the kicks sit on the same grid, that the drop falls on the end card's
  first frame, and that a tick lands on each typed character.

## Not included

Voiceover, other aspect ratios, GIF/WebM, and a Web Store upload.
