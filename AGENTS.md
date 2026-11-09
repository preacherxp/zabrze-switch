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
- Start a new scene from the template in this guide, never from a copy of another
  city's file. Several earlier scenes were started that way and still share one
  sun path, one cloud, one tree and one cyclist, which is why they look alike. A
  scene's sun and moon path, clouds, trees, paving and at least two actors beyond
  the engine's pedestrians and cat must be its own.
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

## Gather references before drawing

A scene drawn from memory comes out generic. Nothing is planned or painted until
its references exist.

- Ask the user once, at the start, for reference material: photographs, links, a
  research file, the viewpoint they have in mind, and the landmarks and street life
  that matter to them. Carry on with whatever does not depend on the answer.
- Where they give none, or it leaves gaps, or nobody is there to answer, do the
  research yourself before planning the layout. Do not draw a landmark, a vehicle
  or a sign from memory.
- For every landmark, venue and vehicle, open actual photographs, from official
  city, venue or transport sources first. Reading a description is not enough.
  Note the silhouette, proportions, materials, colours, lettering and how it is
  lit at night, and the date of each photograph where it is known.
- Research the ordinary as well: paving, kerbs and tracks, lamps and street
  furniture, the current tram or bus model and its livery, typical shopfronts,
  trees, weather and season. These are what make the ground and the actors belong
  to this city and no other.
- Distinguish an existing building from a proposed renovation or a similarly named
  venue, and verify any named business and address.
- Write the result to `RESEARCH.md` in the city's repository before building: a
  table of landmarks with their verified present use and pixel-art features, the
  images that were actually opened with their links, a suggested layout in logical
  pixels, the life and vehicles to show, and what could not be verified. The Zabrze
  repository's `RESEARCH.md` is the model. Link the sources from the README too.

## Establish a city-specific composition

1. Identify one civic or skyline landmark a resident recognizes in silhouette,
   two or three supporting places or venues, a foreground activity tied to the
   place (a tram, boat, funicular, market crowd), and a clear time-of-day
   atmosphere. A business or hotel alone does not establish a city. Prefer
   contemporary streets, transport, shops, lighting, and public spaces unless the
   user asks for another period.
2. Draw every landmark, vehicle and sign from the references gathered above, not
   from memory. If one is missing from `RESEARCH.md`, research it first.
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
   storefront or sign that changes at night. `node tools/preview.cjs` in the
   central repository prints how much of a scene moves and lights up. Warsaw,
   Berlin and Lisbon move about 2,400–3,500 pixels a frame at noon, light
   3,000–10,000 pixels at night and use about 80 or more materials. A scene at a
   third of that is unfinished. The numbers are a comparison, not a score to chase:
   a large blank tram moves many pixels and adds little.

Look at the scene after every stage, not once at the end. From the central
repository, `node tools/preview.cjs <city>` runs the real scene without a browser
and writes PNGs to `capture/preview/`: the flat scene at noon, golden hour, dusk,
night and dawn, and an actor strip at noon and at night. Everything outside the
switch window is dimmed, and edge ticks mark every 10 logical pixels (long ticks
every 50, from `x = 0` and `y = 0`). Open the images after blocking in the
silhouettes, after each landmark, after the signs and after each actor, and fix
what looks wrong before adding more. For a city not yet pinned centrally, link or
clone its repository to `repos/<city>-switch/` first.

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

### What the world already provides

The engine header lists the scene options. These are the parts of the world `w`
that it does not list. Use them before writing your own, and check the engine
source for anything not covered here.

- **Scene options not in the header:** `street(M)` returns the extra materials that
  count as ground for wet reflections; `checks: { signs: { TEXT: 'why' } }` accepts
  a sign flagged by the composition check.
- **Context:** `ctx` carries `mat`, `neon`, `M`, `N`, the keys `NOON GOLD DUSK NIGHT
  DAWN`, `rgb(hex)`, `pack([r, g, b])`, `rng`, `clamp`, `mix`, `smooth`, `BW`, `BH`,
  `PAD_X` and `PAD_Y`. `mat(name, hex, { [NIGHT]: hex })` overrides the grade for
  one key.
- **Built-in materials and lights:** the engine registers about 100 materials
  (`ROAD`, `WALK`, `CURB`, `STEEL`, `GLASS`, `SKIN`, `HAIR`, `SUIT`, `COAT`, `SHIRT`,
  `CAR_*`, `BOARD_*`, `CLOUD`, …) and 40 lights (`WARM`, `WARM_DIM`, `STORE`,
  `FLUO`, `LED`, `HEAD`, `TAIL`, `BEACON`, the sign colours, …) before the scene's
  own. Read the two lists at the top of `define` rather than registering a
  duplicate.
- **Light groups:** group `1` is always on and `2` is on whenever it is dark.
  `w.addGroup(on, off, kind, opts)` adds one; `kind` is `'neon'` (flickers on) or
  `'room'` (fades), and `{ soft: true }` fades a neon. Ready-made: `w.neonGroup`,
  `w.softGroup`, `w.store` (all day), five `w.farWin` and 28 staggered
  `w.winGroups` for windows that come on one by one.
- **Depth:** `build()` paints at `w.depth` (0 by default). `w.pxSky` paints only
  where there is no static scenery, `w.pxBehind` only where depth is at most 1,
  and `w.pxBack`/`w.rectBack` only where it is below 3. Paint near buildings at
  depth 2 and foreground trees at 3 so that sky objects and far traffic pass
  behind them.
- **Paint:** `px`, `rect`, `sprite(rows, map, x, y, flip)`, `light`, `lightRect`,
  `tube` (a lit pixel with an off colour), `pxLight` (a light added while
  drawing), `glyph`, `hsign`, `vsign`, `wire(x0, y0, x1, y1, sag)` and `wireY`.
- **Sky:** `sun(x, y, R, low)`, `moon(x, y)`, `drawStars()`,
  `drawClouds([{ x, y, w, v }], dt)` and `drawBeacons()` for the points in
  `w.beacons`. Their paths and shapes are the scene's to choose.
- **Pedestrians:** push `{ x, y, dir, speed, style, phase, nightOnly }` onto
  `w.peds` in `build()` and call `w.drawPeople(dt, hour)` in `draw()`. `y` is the
  feet. `w.personStyles[name] = [top, legs, hair]` adds a style. They carry
  umbrellas in rain and thin out before dawn.
- **Cars:** push `{ x, lane, dir, kind, len, speed, color }` onto `w.cars`; `lane`
  indexes `w.lanes` and `kind` is `'sedan'`, `'taxi'` or `'kei'`.
  `w.drawTraffic(dt)` moves, queues and paints them and stops them at
  `w.stopLines` unless `w.noSignal` is set. `w.walkTop` and `w.roadTop` place the
  pavement and the road.
- **Cat:** `w.cat = { x, y, puff }` with `w.drawCat(dt, hour)`; `startle` usually
  sets `puff`.
- **Props:** `vending(x, y, body, seed)` and `tallTower(x, top, w, m)`, a far tower
  with an aviation light.
- **After composition, in `post()`:** `reflect()` for wet ground,
  `mirrorWater(line, bottom, mats, opts)` for water, `drawRain(dt)`,
  `drawSnow(dt)` and `drawBeams()` for headlights.

The engine's pedestrians, cars and cat are a base layer shared by every city. The
actors that make a city recognisable are written in the scene: its tram, its
boat, its queue, its market.

## Preserve the interaction and demo

- Keep the real shadow-DOM button with `role="switch"`, `aria-checked`, its
  accessible name, visible keyboard focus, and live status text.
- Preserve tap/click, drag, arrow keys, Home/End, and Space. Pointer release,
  cancellation, and lost capture must leave the lens usable.
- The element API is `checked`, `position`, and `jump(night)`. The `change` event
  supplies `detail.night`; `scrub` supplies `position`, `hour`, and `dark`.
- Show the clock, city and phase with the engine's `<city-readout city="Name">`
  placed after the switch (or `for="id"`); size it with its `--readout-*` custom
  properties, not a hand-built copy. Drive page colour from `scrub` and save the
  selected day/night state from `change`. Keep storage keys distinct between cities.
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
- Read the actor strips from `node tools/preview.cjs <city>`: the ground band
  every 6 seconds for 60 seconds, at noon and at night. Single screenshots miss
  collisions; the strip shows them. Its flat stills have no glass, frame or bloom
  and do not replace the browser captures above.
- Exercise tap, drag both ways, arrow keys, Home/End, and Space; verify the
  accessible switch state, clock, phase, page colour, and restored preference.
  Check reduced motion and resizing while the switch is active.
- Check the console and failed requests. Confirm each switch works independently
  and that changing one city's engine did not regress the others.
- Fix observed defects, then repeat the affected checks. State any untested
  browser, device, or rendering path explicitly. Do not claim smooth performance
  on real phones from desktop emulation alone.

### Shareable animation

- Each city repository has an **Export video** workflow. On every push to `main`
  that changes the engine, scene or demo, it runs `tools/capture-switch.cjs`,
  encodes `<city>-day-night-60fps.mp4` and commits it if it changed. Do not commit
  hand-made exports over it; run the workflow manually to refresh a video.
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
