const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Captures the real full switch: input, persistence, layout and contrast checks, then 420 frames
// at exactly 1/60 s each. Runs from the central repository (default) or inside a city repository:
//   node tools/capture-switch.cjs <city>                          central: serves repos/<city>-switch/
//   CAPTURE_ROOT=. CAPTURE_PATH=/ node tools/capture-switch.cjs <city>   city repository
const city = process.argv[2];
const root = process.env.CAPTURE_ROOT || `repos/${city}-switch`;
const pagePath = process.env.CAPTURE_PATH || `/repos/${city}-switch/`;
assert.ok(/^[a-z][a-z0-9-]*$/.test(city) && fs.existsSync(`${root}/${city}.js`), 'provide an initialized city slug');
const tag = `${city}-switch`;
const out = `capture/${city}`;
// Waits poll on a timer: with software WebGL, animation-frame polling can starve and time out.
fs.mkdirSync(`${out}/frames`, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  try {
    await page.goto(`http://127.0.0.1:8080${pagePath}`, { waitUntil: 'networkidle' });
    await page.waitForFunction((tag) => document.querySelector(tag).gl, tag, { polling: 100 });
    const control = page.getByRole('switch');
    await control.click();
    await page.waitForFunction((tag) => document.querySelector(tag).checked, tag, { polling: 100 });
    await control.press('Home');
    await page.waitForFunction((tag) => document.querySelector(tag).position < .001, tag, { polling: 100 });
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
    await page.waitForFunction((tag) => document.querySelector(tag).position === 0, tag, { polling: 100 });
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

    await page.setViewportSize({ width: 800, height: 500 });
    await page.addStyleTag({ content: 'section { height: 500px; min-height: 500px; padding: 40px 24px; gap: 24px; } footer { display: none; } .switch { width: 640px; }' });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator(tag).evaluate((el) => {
      el.jump(false);
      cancelAnimationFrame(el.raf);
      el.raf = 0;
      // Screenshots must advance only the requested frame, regardless of capture speed.
      el.wake = () => {};
      el.frame = () => {};
      el.world = new el.world.constructor();
      el.time = 0;
    });
    for (let frame = 0; frame < 420; frame++) {
      const sceneTime = await page.locator(tag).evaluate((el, frame) => {
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
        el.draw();
        return el.world.t;
      }, frame);
      assert.ok(Math.abs(sceneTime - (frame + 1) / 60) < 1e-6, `${city}: capture time drifted`);
      await page.screenshot({ path: `${out}/frames/${String(frame).padStart(3, '0')}.png` });
      if (frame % 60 === 0) console.log(`${city}: ${frame + 1}/420 full-switch frames captured`);
    }
    assert.deepEqual(errors, [], 'no runtime errors or missing assets');
    fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ city, sourceFrames: 420, sourceFps: 60, seconds: 7, outputWidth: 800, outputHeight: 500, readoutContrast: true, deterministicTime: true, pointer: true, drag: true, keyboard: true, reducedMotion: true, persistence: true, widths: [960, 390, 320], errors }, null, 2));
    console.log(`${city}: real WebGL control, input, persistence, reduced motion and responsive checks passed`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
