# City switches: agent guide

Build an interactive pixel-art city inside a physical day/night switch. The finished
piece includes the city, its changing light and life, a rounded frame, a refracting
glass lens that moves across it, and accessible controls. Preserve that whole
experience when changing a scene or exporting a preview.

## Start with the existing project

- Read `index.html`, the header of `city-switch.js`, and the scene being changed.
- Use `gliwice.js` as a compact example of contemporary landmarks and a pedestrian
  square. Warsaw demonstrates snow, Berlin a riverfront, and Lisbon hills and water.
  Copy only the techniques the new city needs.
- This workspace may contain a combined gallery and independent repositories in
  `repos/<city>-switch/`. A standalone repository has its own engine, scene, demo,
  and `.nojekyll`. Check both locations before editing; keep matching copies in sync.
- In the central repository, the gallery loads scripts directly from the city
  submodules. Commit and publish a city change first, then commit its new
  submodule pointer centrally. Root-level scene snapshots outside that checkout
  are not the gallery source. Never publish a gitlink to a commit absent remotely.
- Read local instructions, inspect Git status and remotes, and preserve existing
  user changes. Do not assume the gallery directory is itself a Git repository.
- Keep this buildless: ordinary JavaScript, a custom element, and static HTML.
  Do not introduce a framework or runtime dependency to draw another city.

## Establish a city-specific composition

1. Identify three or four recognizable landmarks, a foreground activity, and a
   clear time-of-day atmosphere. Prefer contemporary streets, transport, shops,
   lighting, and public spaces unless the user asks for another period.
2. Verify landmark appearance and any named business/address against official
   city, venue, or transport sources. Keep source links in the README. Distinguish
   an existing building from a proposed renovation or a similarly named venue.
3. Plan the scene in logical pixels before adding detail: skyline, buildings,
   ground, landmark bounds, signs, moving actors, and their paths. Reserve quiet
   sky around towers and clear space around lettering.
4. Give the scene a dominant landmark and supporting landmarks at different
   heights. Use contrast and silhouette first; fine texture comes afterward.
5. Make a believable compressed panorama. If buildings from different streets
   appear together, describe it as a collage/panorama, not an exact street view.

The visible reference scene is about **320 × 150 logical pixels**. The actual
buffer is **400 × 190**, with **40 pixels of horizontal and top padding**. Normal
paint coordinates run from `x = -40` to `359` and `y = -40` to `149`.
The engine keeps 150 scene rows visible; available horizontal space varies with
the frame. Important content must survive that framing and the curved ends.

- Keep names and landmark features inside the reliably visible area. A sign that
  fits in a flat canvas may disappear behind a curved end or become unreadable
  through the lens. Check the actual switch, not just the raw city image.
- Keep lettering on its own fascia, clear of windows, awnings, trees, and poles.
  Measure bitmap glyph widths and spacing before choosing the sign's dimensions.
- Decide which objects stand in front of others. Draw background first, then
  architecture, ground details, and foreground life at their intended depth.
- Avoid accidental tangencies: a tower touching a roof, a pole running through a
  name, pedestrians inside a fountain, and vehicles crossing café furniture.
- Moving actors need clear paths for their **entire** cycle, not just one frame.
  Natural occlusion and lens refraction are expected; unintended intersections,
  clipped labels, and objects jumping between layers are defects.

## Use the shared engine contract

Load `city-switch.js` before `<city>.js`. Register one ASCII custom-element tag,
such as `czestochowa-switch`, while preserving accents in visible city names.

```js
(() => {
  const { clamp, mix, smooth, rng } = CitySwitch;
  CitySwitch.define('example-switch', {
    city: 'Example',
    label: 'Example day and night',
    tube: ['#efbd76', '#a1d5cf'],
    body: ['#e8e8df', '#111c25'],
    glass: 'clear',
    sky: [/* noon, gold, dusk, night, dawn; five hex colours each */],
    palette(ctx) { /* Register scene materials and lights. */ },
    build(w, ctx) { /* Draw static scenery and initialize actor state once. */ },
    draw(w, dt, hour, hurry) { /* Draw and advance moving scenery. */ },
  });
})();
```

- Read the full contract in the engine header before using optional hooks.
  `post(w, dt, hour)` runs after colour composition, for reflections/weather.
- Use `w.px`, `w.rect`, `w.sprite`, `w.glyph`, `w.hsign`, `w.vsign`, and the
  existing light/sky helpers. Reuse engine drawing functions when they fit.
- Register materials with `ctx.mat` and light colours with `ctx.neon`; use their
  IDs from `ctx.M` and `ctx.N`. Do not pass an undefined material/light ID.
  Pixel paint coordinates must be finite integers. Round actor positions at draw
  time and keep their underlying movement continuous.
- Materials, light indices, and light-group indices use byte buffers. Stay below
  their limits, including the engine's existing entries; the engine rejects more
  than 255 materials. Do not repeatedly register colours or groups per frame.
- `build()` writes static buffers. Each `tick()` restores those buffers before
  calling `draw()`. Redraw every moving object each frame; do not depend on pixels
  surviving from the previous frame. Use `w.depth` and behind/sky helpers when
  animation must pass behind static scenery.
- The clock runs **12 through 36**: noon, sunset, midnight, dawn, next noon.
  Define schedules on that range; apply `% 24` only for display. Test dawn as well
  as sunset. A returning lens must pass through morning, not replay sunset.
- Advance motion by `dt`, not frame count or a separate timer. `dt` can be zero
  under reduced motion. Do not divide by it or keep moving actors when it is zero.
- Use seeded `rng()` for stable scenery. Initialize actor arrays once and reuse
  them. Avoid unbounded collections and unnecessary allocations in hot loops.
- Scene work should not require changes to the glass, spring physics, pointer
  calibration, or layout engine. If a shared engine change is necessary, inspect
  every caller and validate every city before copying it into standalone repos.

## Preserve the interaction and demo

- Keep the real shadow-DOM button with `role="switch"`, `aria-checked`, its
  accessible name, visible keyboard focus, and live status text.
- Preserve tap/click, drag, arrow keys, Home/End, and Space. Pointer release,
  cancellation, and lost capture must leave the lens usable.
- The element API is `checked`, `position`, and `jump(night)`. The `change` event
  supplies `detail.night`; `scrub` supplies `position`, `hour`, and `dark`.
- Drive page colour, clock, and phase from `scrub`; save the selected day/night
  state from `change`. Keep storage keys distinct between cities.
- Keep the layout responsive and respect reduced motion. Do not replace the
  interactive canvas with a screenshot or hide the controls to make a demo fit.

## Validate before calling it finished

Use a short, repeatable check and keep evidence of what actually ran.

### Static and engine checks

- Run `node --check city-switch.js` and `node --check <city>.js`; check any inline
  demo script too. Run `git diff --check` in each changed repository.
- Confirm every script/asset in the standalone demo exists and uses a relative
  path. It must load only its own city and engine, with the engine first.
- In the central repository run `node tools/validate-switches.cjs`.
- Run `node test-scene.cjs` when present. Add or extend one small engine test for
  nontrivial scene changes. It should instantiate the real scene engine, advance
  several frames at noon, golden hour, dusk, night, midnight, dawn, and next noon,
  exercise `startle`, and tick with reduced motion. Check for exceptions, valid
  buffers, correct light schedules, and a frozen animation clock under reduced
  motion. A syntax check alone does not validate animation.

### Actual-browser visual and behavior checks

- Serve locally with `python3 -m http.server 8000`. Use a real browser with WebGL
  enabled. Confirm the intended renderer is active and inspect runtime errors.
- Review the **full physical switch** at desktop and phone widths, for example
  960 × 600 and 390 × 844. Include a narrow viewport around 320 pixels wide.
- Capture noon, golden hour/dusk, night, and dawn. Inspect both lens endpoints
  and several intermediate positions. Compare flat scene previews with these
  captures when diagnosing composition; the flat preview alone is insufficient.
- Watch multiple animation cycles and a fast drag. Look for disappearing actors,
  abrupt wraps, broken reflections, lighting that never turns off, incorrect
  depth, flicker, unreadable signs, and unintended overlaps across actor paths.
- Exercise tap, drag both ways, arrow keys, Home/End, and Space; verify the
  accessible switch state, clock, phase, page colour, and restored preference.
  Check reduced motion and resizing while the switch is active.
- Check the console and failed requests. Confirm each switch works independently
  and that changing one city's engine did not regress the others.
- Fix observed defects, then repeat the affected checks. State any untested
  browser, device, or rendering path explicitly. Do not claim smooth performance
  on real phones from desktop emulation alone.

### Shareable animation

- When asked for a switch GIF/video, capture the **actual browser-rendered full
  control**, including the frame, glass lens, its motion, and changing city light.
  A raw city-panorama animation is a different artifact.
- Prefer H.264 MP4 for smooth 60 fps playback and smaller files when the user
  accepts video. GIF delays use hundredths of a second and cannot reliably
  preserve exact 60 fps. Label the format and actual frame rate truthfully.
- Aim for a 6–8 second loop with brief day/night holds and both travel directions.
  Keep the entire frame inside the export and preserve enough size for landmarks
  to read. Avoid excessive empty padding or unrelated captions.
- For frame-by-frame capture, stop the browser animation scheduler and advance
  the real scene by exactly `1 / fps` per captured frame. Assert scene time so
  slow screenshot rendering cannot speed up the exported city animation.
- Inspect day, intermediate, night, and return frames, and verify export duration,
  dimensions, looping, and file size. Verify the lens moves and the city animates.
- If local Chromium cannot run, use an available supported browser or a bounded
  GitHub Actions capture job. Do not substitute a mocked lens and call it a
  recording. Keep recording dependencies out of the shipped static application.

## Deliver and publish

- A new city gets `<city>.js`, its demo section or standalone `index.html`, and a
  concise README with local usage, component API, and landmark/attribution links.
  Preserve existing attribution. Do not invent a licence for inherited code.
- When separate repositories are requested, each must contain all of its assets
  and this guide. Keep source copies consistent; no dependency on sibling repos.
- Publish only within the user's requested scope. For GitHub Pages, a buildless
  demo can serve `/` from `main` with `.nojekyll`; no custom build workflow is
  needed. Check existing repository names before creating or changing anything.
- Confirm the deployed commit and successful deployment, then fetch the page and
  its assets. A configured URL or queued build is not a verified live site.
- Report the actual repository/demo/download links, what was validated, any
  remaining issues, and any material verification limits. Keep it brief.
