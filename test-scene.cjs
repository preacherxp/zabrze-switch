const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const registry = new Map();
const context = vm.createContext({
  HTMLElement: class {
    attachShadow() {
      return { querySelector: () => ({ addEventListener() {} }) };
    }
  },
  customElements: {
    get: (tag) => registry.get(tag),
    define: (tag, element) => registry.set(tag, element),
  },
  matchMedia: () => ({ matches: false }),
});
context.window = context;
for (const file of ['city-switch.js', 'zabrze.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
}
const Switch = registry.get('zabrze-switch');
assert.ok(Switch, 'the scene registers its custom element');
const world = new Switch().world;
const daylight = new Uint8Array(world.rgba.length);
for (const hour of [12, 17, 18.5, 22, 26, 29, 31, 36]) {
  for (let frame = 0; frame < 35; frame++) world.tick(1 / 30, hour);
  assert.equal(world.rgba.length, 400 * 190 * 4);
  assert.ok(world.rgba.some((value) => value > 0), `the scene renders at ${hour}`);
  assert.ok(world.groups.length < 256);
  if (hour === 12) daylight.set(world.rgba);
  if (hour === 22) {
    assert.notDeepEqual(world.rgba, daylight, 'night changes the scene');
    assert.ok(world.levels[world.venueG] > .9, 'Venue lights up at night');
  }
}
world.startle();
world.tick(1 / 30, 18);
assert.ok(world.cat.puff > 0, 'the cat still reacts to a quick drag');
const frozenTime = world.t;
world.tick(1 / 30, 22, { calm: true });
assert.equal(world.t, frozenTime, 'reduced motion stops the scene animation');
assert.equal(world.levels[world.venueG], 1);

// Optional raw frames let the same check produce a visual preview without browser dependencies.
if (process.argv[2]) {
  for (const hour of [12, 18, 22]) {
    world.tick(0, hour, { calm: true });
    fs.writeFileSync(path.join(process.argv[2], `zabrze-${hour}.rgba`), world.rgba);
  }
}
console.log('Zabrze: day, dusk, night, dawn, venue lighting and reduced motion passed.');
