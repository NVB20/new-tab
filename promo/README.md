# Promo video

`node promo/build.mjs` makes `promo/out/new-tab-promo.mp4` (22 s, 1920×1080, with its own music)
and `promo/out/contact.png` (one frame per shot). `node promo/build.mjs --scene <name>` re-records
one shot (names in `timeline.mjs`) and rebuilds the video from the frames already there.
`PROMO_SUB=1` skips the motion blur, for quick looks.

It needs Playwright's Chromium (`npx playwright install chromium`) and Python with numpy and
imageio-ffmpeg (`pip install numpy imageio-ffmpeg`). Everything on screen is made up: the page
comes from `fixtures/`, and recording fails if the page asks the network for anything.
