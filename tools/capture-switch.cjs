const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Captures the real full switch: input, persistence, layout and contrast checks, then 420 frames
// at exactly 1/60 s each, once at 1600 × 1000 (frames/) and once at 1080 × 1350 (frames-4x5/). Runs from the central repository (default) or inside a city repository:
//   node tools/capture-switch.cjs <city>                          central: serves repos/<city>-switch/
//   CAPTURE_ROOT=. CAPTURE_PATH=/ node tools/capture-switch.cjs <city>   city repository
const city = process.argv[2];
const root = process.env.CAPTURE_ROOT || `repos/${city}-switch`;
const pagePath = process.env.CAPTURE_PATH || `/repos/${city}-switch/`;
assert.ok(/^[a-z][a-z0-9-]*$/.test(city) && fs.existsSync(`${root}/${city}.js`), 'provide an initialized city slug');
const tag = `${city}-switch`;
const out = `capture/${city}`;
// Waits poll on a timer: with software WebGL, animation-frame polling can starve and time out.
// Waits for the lens to stop, not just to touch an end: the spring can pass 0 before it settles.
fs.mkdirSync(`${out}/frames`, { recursive: true });

// CAPTURE_SHARD=i/n records only the i-th of n equal parts of the 420 frames, so that parallel
// jobs can share the work. The scene is deterministic: a shard steps through the earlier frames
// without drawing them and arrives at the same state.
const [shard, shards] = (process.env.CAPTURE_SHARD || '0/1').split('/').map(Number);
const first = Math.floor(420 * shard / shards), last = Math.floor(420 * (shard + 1) / shards);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  try {
    // Only the first shard, or an unsplit run, exercises the control; the others just record.
    if (first === 0) {
      await page.goto(`http://127.0.0.1:8080${pagePath}`, { waitUntil: 'networkidle' });
      await page.waitForFunction((tag) => document.querySelector(tag).gl, tag, { polling: 100 });
      const control = page.getByRole('switch');
      await control.click();
      await page.waitForFunction((tag) => document.querySelector(tag).checked, tag, { polling: 100 });
      await control.press('Home');
      await page.waitForFunction((tag) => document.querySelector(tag).position < .001 && !document.querySelector(tag).moving, tag, { polling: 100 });
      await control.press('ArrowRight');
      await page.waitForFunction((tag) => document.querySelector(tag).position > .01, tag, { polling: 100 });
      await control.press('End');
      await page.waitForFunction((tag) => document.querySelector(tag).checked, tag, { polling: 100 });
      await control.press('Space');
      await page.waitForFunction((tag) => !document.querySelector(tag).checked, tag, { polling: 100 });
      await page.locator(tag).evaluate((el) => el.jump(false));
      const bounds = await control.boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .5);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .5, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction((tag) => document.querySelector(tag).position > .6, tag, { polling: 100 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await control.press('Home');
      await page.waitForFunction((tag) => document.querySelector(tag).position === 0 && !document.querySelector(tag).moving, tag, { polling: 100 });
      await control.press('End');
      await page.waitForFunction((tag) => document.querySelector(tag).checked, tag, { polling: 100 });
      assert.equal(await control.getAttribute('aria-checked'), 'true');
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction((tag) => document.querySelector(tag).checked, tag, { polling: 100 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });

      for (const [name, width, height] of [['desktop', 960, 600], ['phone', 390, 844], ['narrow', 320, 680]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => scrollTo(0, 0));
        for (const [phase, position, morning] of [['day', 0, false], ['dusk', .64, false], ['night', 1, false], ['dawn', .48, true]]) {
          await page.locator(tag).evaluate((el, { position, morning }) => {
            el.position = position;
            el.branch = morning ? 'am' : 'pm';
            el.amStart = 22;
            el.nightHour = 22;
            el.settleGroups();
            el.emitScrub();
          }, { position, morning });
          await page.waitForTimeout(350);
          const contrast = await page.evaluate(() => {
            const lightness = (color) => {
              const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => value / 255);
              const linear = rgb.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
              return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
            };
            const readout = document.querySelector('city-readout');
            const background = lightness(getComputedStyle(readout).backgroundColor);
            return ['.clock', 'b', '.phase'].map((selector) => {
              const foreground = lightness(getComputedStyle(readout.shadowRoot.querySelector(selector)).color);
              return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05);
            });
          });
          assert.ok(contrast.every((ratio) => ratio >= 4.5), `${city}: readout contrast below 4.5:1`);
          await page.evaluate(() => scrollTo(0, 0));
          await page.locator('section').screenshot({ path: `${out}/${name}-${phase}.png` });
          const box = await page.locator(tag).boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${city}: clipped control at ${width}px`);
          assert.ok(box.y >= 0 && box.y + box.height <= height + 1, `${city}: vertical control clipping at ${width}x${height}: ${JSON.stringify(box)}`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${city}: horizontal overflow`);
        }
      }
    }

    // Two recordings of the same deterministic loop, each a layout rendered at twice the density:
    // 800 × 500 becomes the 1600 × 1000 video, and 540 × 675 the 1080 × 1350 (4:5) Instagram post.
    // The 4:5 switch is 492 px wide so that Instagram's 3:4 grid crop (506 px) keeps the whole frame.
    const films = [
      { dir: 'frames', width: 800, height: 500, css: 'section { height: 500px; min-height: 500px; padding: 40px 24px; gap: 24px; } .switch { width: 640px; }' },
      { dir: 'frames-4x5', width: 540, height: 675, css: 'section { height: 675px; min-height: 675px; padding: 24px; gap: 48px; } .switch { width: 492px; } city-readout { --readout-clock-font: 500 60px/1.1 ui-monospace, "SF Mono", Menlo, monospace; --readout-place-size: 19px; --readout-gap: 26px; --readout-padding: 14px 22px; }' },
    ];
    for (const { dir, width, height, css } of films) {
      fs.mkdirSync(`${out}/${dir}`, { recursive: true });
      const film = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'light' });
      film.on('pageerror', (error) => errors.push(error.message));
      // Frames are grabbed through Chrome directly with fast PNG compression: the same lossless pixels as
      // page.screenshot(), in about half the time, since compressing the PNG was half of every frame.
      // captureBeyondViewport keeps the whole layout when it is taller than the headless window.
      const cdp = await film.context().newCDPSession(film);
      const grab = async (path) => {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 2 } });
        fs.writeFileSync(path, Buffer.from(data, 'base64'));
      };
      await film.goto(`http://127.0.0.1:8080${pagePath}`, { waitUntil: 'networkidle' });
      await film.waitForFunction((tag) => document.querySelector(tag).gl, tag, { polling: 100 });
      await film.addStyleTag({ content: `footer { display: none; } ${css}` });
      await film.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const box = await film.locator(tag).boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `${city}: switch clipped in the ${width} × ${height} recording`);
      await film.locator(tag).evaluate((el) => {
        el.jump(false);
        cancelAnimationFrame(el.raf);
        el.raf = 0;
        // Screenshots must advance only the requested frame, regardless of capture speed.
        el.wake = () => {};
        el.frame = () => {};
        // Parallel jobs each replay the loop from a fresh page, so anything random (Warsaw's scene,
        // the raindrops on rain glass) must draw the same numbers in every job, or the video jumps
        // where one job's frames meet the next. Seed it, and reset the glass state the live page left.
        // The phase covers call this again, so each starts from the same state as well.
        window.reseed = () => {
          let seed = 0x5eed;
          Math.random = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          el.wipe.fill(0);
          el.runners = Array.from({ length: el.runners.length }, () => ({ x: 0, y: 0, r: 0, wait: Math.random() * 6, v: 0 }));
          el.world = new el.world.constructor();
          el.time = 0;
        };
        window.reseed();
      });
      for (let frame = 0; frame < last; frame++) {
        const sceneTime = await film.locator(tag).evaluate((el, [frame, record]) => {
          const p = frame / 419;
          const ease = (t) => t * t * (3 - 2 * t);
          el.branch = p >= .58 ? 'am' : 'pm';
          el.amStart = 22;
          el.nightHour = 22;
          el.x = p < .1 ? 0 : p < .43 ? ease((p - .1) / .33) : p < .58 ? 1 : p < .92 ? 1 - ease((p - .58) / .34) : 0;
          el.lift = el.x > 0 && el.x < 1 ? .2 : 0;
          el.time += 1 / 60;
          el.world.tick(1 / 60, el.hour());
          el.uploadWorld();
          el.stepWater(1 / 60, false);
          el.emitScrub();
          if (record) el.draw();
          return el.world.t;
        }, [frame, frame >= first]);
        assert.ok(Math.abs(sceneTime - (frame + 1) / 60) < 1e-6, `${city}: capture time drifted`);
        if (frame < first) continue;
        await grab(`${out}/${dir}/${String(frame).padStart(3, '0')}.png`);
        if (frame % 60 === 0) console.log(`${city}: ${frame + 1}/420 ${width * 2} × ${height * 2} frames captured`);
      }
      // One 4:5 cover for every phase the readout names, in the order the loop passes them. Each
      // is a fresh scene run for three seconds at that hour with the lens at rest: deterministic,
      // so an unchanged scene exports byte-identical covers.
      if (dir === 'frames-4x5' && first === 0) {
        fs.mkdirSync(`${out}/covers`, { recursive: true });
        // Afternoon hours are 12 + 10x on the pm branch; morning hours 36 - 14x on the am branch.
        for (const [name, phase, branch, x] of [
          ['1-daytime', 'Daytime', 'pm', 0], ['2-golden-hour', 'Golden hour', 'pm', .5],
          ['3-signs-coming-on', 'Signs coming on', 'pm', .675], ['4-night', 'Night', 'pm', 1],
          ['5-dawn', 'Dawn', 'am', 6 / 14], ['6-morning', 'Morning', 'am', 3.5 / 14],
        ]) {
          const shown = await film.locator(tag).evaluate((el, [branch, x]) => {
            window.reseed();
            el.branch = branch;
            el.amStart = 22;
            el.nightHour = 22;
            el.x = x;
            el.lift = 0;
            el.settleGroups();
            for (let frame = 0; frame < 180; frame++) {
              el.time += 1 / 60;
              el.world.tick(1 / 60, el.hour());
              el.stepWater(1 / 60, false);
            }
            el.uploadWorld();
            el.emitScrub();
            el.draw();
            return document.querySelector('city-readout').shadowRoot.querySelector('.phase').textContent;
          }, [branch, x]);
          assert.equal(shown, phase, `${city}: the ${name} cover shows ${shown}`);
          // Let the compositor present the new canvas, or the shot can catch the previous frame.
          await film.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await film.screenshot({ path: `${out}/covers/${name}.png` });
        }
        console.log(`${city}: 6 phase covers captured`);
      }
      await film.close();
    }
    assert.deepEqual(errors, [], 'no runtime errors or missing assets');
    if (first === 0) fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ city, sourceFrames: 420, sourceFps: 60, seconds: 7, outputWidth: 1600, outputHeight: 1000, instagram: { dir: 'frames-4x5', covers: 'covers', width: 1080, height: 1350 }, readoutContrast: true, deterministicTime: true, pointer: true, drag: true, keyboard: true, reducedMotion: true, persistence: true, widths: [960, 390, 320], errors }, null, 2));
    console.log(first === 0 ? `${city}: real WebGL control, input, persistence, reduced motion and responsive checks passed` : `${city}: frames ${first + 1}–${last} recorded`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
