# City switches: agent guide

Build an interactive pixel-art city inside a physical day/night switch. The finished
piece includes the city, its changing light and life, a rounded frame, a refracting
glass lens that moves across it, and accessible controls. Preserve that whole
experience when changing a scene or exporting a preview.

## Start with the existing project

- Read `index.html`, the header of `city-switch.js`, and the scene being changed.
- Warsaw, Berlin and Lisbon set the quality bar: Warsaw demonstrates snow, Berlin
  a riverfront and Lisbon hills, trams and water. Copy **techniques, not content**.
  Each city needs its own sky ramps and grade, its own ground treatment and its own
  actors; do not paste another scene's palette, paving, cyclist or crowd.
- Every city is an independent repository with its own engine copy, scene, demo,
  README and `.nojekyll`. The central repository (`city-switches`) is a Git
  repository that pins each city as a submodule in `repos/<city>-switch/`; its map
  and gallery load scripts directly from there. Edit a city only inside its own
  repository or submodule checkout. Copies outside a Git checkout are not sources.
- Commit and publish a city change first, then commit its new submodule pointer
  centrally. Never publish a gitlink to a commit absent remotely.
- Read local instructions, inspect Git status and remotes, and preserve existing
  user changes.
- Keep this buildless: ordinary JavaScript, a custom element, and static HTML.
  Do not introduce a framework or runtime dependency to draw another city.

## Establish a city-specific composition

1. Identify one civic or skyline landmark a resident recognizes in silhouette,
   two or three supporting places or venues, a foreground activity tied to the
   place (a tram, boat, funicular, market crowd), and a clear time-of-day
   atmosphere. A business or hotel alone does not establish a city. Prefer
   contemporary streets, transport, shops, lighting, and public spaces unless the
   user asks for another period.
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
6. If a research file proposes a layout or activity, follow it or update the file
   with the reason for changing it.
7. Reach the foreground density of the original three: several actor types, at
   least one vehicle or other signature moving element, and at least one lit
   storefront or sign that changes at night.

The visible reference scene is about **320 × 150 logical pixels**. The actual
buffer is **400 × 190**, with **40 pixels of horizontal and top padding**. Normal
paint coordinates run from `x = -40` to `359` and `y = -40` to `149`.
The engine keeps the switch at a fixed 2:1 shape, so the framing is the same at
every width. The window is a stadium about **328 × 150**: a straight band from
`x = 71` to `249`, with semicircular ends of radius 75 centred on `y = 75`. For a
feature at height `y`, keep it between `71 − √(71² − (y − 75)²)` and
`249 + √(71² − (y − 75)²)` (4 px of margin). `node tools/check-composition.cjs`
in the central repository checks every sign against this window.

- Keep names and landmark features inside the reliably visible area. A sign that
  fits in a flat canvas may disappear behind a curved end or become unreadable
  through the lens. Check the actual switch, not just the raw city image.
- Keep lettering on its own fascia, clear of windows, awnings, trees, and poles.
  Measure bitmap glyph widths and spacing before choosing the sign's dimensions.
  Use `font: 5` for names that must read at a glance; in the 3 × 5 font V and U
  look alike.
- Decide which objects stand in front of others. Draw background first, then
  architecture, ground details, and foreground life at their intended depth.
- Avoid accidental tangencies: a tower touching a roof, a pole running through a
  name, pedestrians inside a fountain, and vehicles crossing café furniture.
- Moving actors need clear paths for their **entire** cycle, not just one frame.
  Natural occlusion and lens refraction are expected; unintended intersections,
  clipped labels, and objects jumping between layers are defects. Keep pedestrian
  lanes and vehicle tops at least 2 px apart vertically, or draw the vehicle
  behind the lane, so nobody appears to stand on a roof or inside a pantograph.

## Use the shared engine contract

Load `city-switch.js` before `<city>.js`. Register one ASCII custom-element tag,
such as `czestochowa-switch`, while preserving accents in visible city names.
Set `label` to `'<City> day and night'`; never leave the engine default.

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
- When the lens settles back at day the engine jumps from hour 36 to hour 12, so
  every light group must be in the same state at both: an evening light such as
  `addGroup(18, 31)` is off at both noons; a light meant to stay on all day uses
  `addGroup(12, 40)`. Avoid `on ≤ 12` with `off < 36`, and `off > 36` with
  `on > 12`.
- `el.position` covers 12:00–22:00 only. To inspect dawn, set
  `el.branch = 'am'; el.amStart = 22; el.position = p` and call
  `el.settleGroups(); el.emitScrub()`; see `tools/capture-switch.cjs`.
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
- The lens always travels with its full spring, squash and lift, even when the
  browser asks for reduced motion; that preference only stills the city's own
  life (actors, flicker, weather). Keep the layout responsive. Do not replace the
  interactive canvas with a screenshot or hide the controls to make a demo fit.

## Validate before calling it finished

Use a short, repeatable check and keep evidence of what actually ran.

### Static and engine checks

- Run `node --check city-switch.js` and `node --check <city>.js`; check any inline
  demo script too. Run `git diff --check` in each changed repository.
- Confirm every script/asset in the standalone demo exists and uses a relative
  path. It must load only its own city and engine, with the engine first.
- In the central repository run `node tools/validate-switches.cjs` and
  `node tools/check-composition.cjs <city>`. The second fails when a sign leaves
  the window, when later static scenery paints over a sign, or when a light differs
  between hour 12 and hour 36. Accept a flagged sign only after looking at the real
  switch, with a reason in the scene: `checks: { signs: { TEXT: 'why' } }`.
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
- Make an actor strip: advance the real scene with `world.tick` for 60 seconds at
  noon and at night, crop the ground band every 6 seconds, and stack the crops in
  one image. Single screenshots miss collisions; the strip shows them.
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
