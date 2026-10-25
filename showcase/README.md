# Showcase

`checkoutguard-demo.mp4` is an 82-second launch video (1920x1080, 30 fps, H.264, silent). It has captions throughout, and `VOICEOVER.md` has a timed script you can record over it.

## How it's built

- `video/index.html` holds every scene. `window.seek(t)` sets each style from the time `t` alone, with no CSS animations or timers, so every frame comes out exactly the same each time.
- `video/capture.mjs` captures the real side panel from the browser preview in demo mode. It takes full panels for each scenario plus close-ups of the decision banner, the "How to pay" options, the amount at stake, the dispute steps, coverage and recent checks. It also saves their positions to `video/assets/layout.js`.
- `video/render.mjs` steps through the timeline frame by frame in Playwright and pipes the frames to ffmpeg.

Every merchant and piece of evidence shown is fictional and uses reserved `.example` domains.

## Re-render

You need Node 22+, Playwright with Chromium, ffmpeg, and the Inter, Inter Display and JetBrains Mono fonts.

```sh
node showcase/video/render.mjs        # writes showcase/checkoutguard-demo.mp4 (~3 min)
```

If the UI has changed, recapture it first. Both services need to be running:

```sh
make backend                          # terminal 1
make preview                          # terminal 2
node showcase/video/capture.mjs       # refreshes showcase/video/assets/
```

To check layouts quickly, render stills only, or render part of the timeline:

```sh
node showcase/video/render.mjs --stills 6,38.5,66 --out /tmp/stills
node showcase/video/render.mjs --from 30 --to 45 --output /tmp/part.mp4
```
