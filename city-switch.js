/* city-switch — the engine behind the pixel city dark mode switches.
 *
 * A switch is this engine plus one scene file:
 *
 *   <script src="city-switch.js"></script>
 *   <script src="warsaw.js"></script>
 *   <warsaw-switch></warsaw-switch>
 *
 *   el.checked                 true = night
 *   el.position                0..1, sets the lens directly (no animation)
 *   el.jump(night)             go there at once, no event; for restoring a saved choice
 *   'change' event             detail: { night }
 *   'scrub' event              detail: { position, hour, dark }, fires while the hours move
 *
 *   <city-readout city="Name"></city-readout> after a switch shows its clock, city and phase
 *
 * Derived from tokyo-switch.js. Idea after "住人のいるスイッチ" by @Lattice_Node (ludion.ai/p/toggle-daylight, MIT).
 *
 * Scene contract, for CitySwitch.define(tag, scene):
 *   city, label          names for assistive tech
 *   tube: [a, b]         neon tube colours, left and right half of the frame
 *   body: [day, night]   optional bezel colours
 *   glass                'rain' | 'frost' | 'mist' | 'clear'
 *   sky: [5 ramps]       per key (NOON GOLD DUSK NIGHT DAWN), each 5 colours from top to horizon
 *   keys                 optional [[hour, key], ...] from 12 to 36; hours run 12..36 so the way home passes dawn
 *   grade                optional 5 functions ([r,g,b]) => [r,g,b] replacing the default per-key colour grade
 *   dark(hour)           optional 0..1, drives bloom, shell and page
 *   weather(hour)        optional { rain, snow, wet, glass }, each 0..1
 *   glyphs               optional extra bitmap glyphs, { ch: ['#..', ...] }
 *   palette(ctx)         adds materials and neons: ctx.mat(name, hex, overrides), ctx.neon(name, core, glow, emit)
 *   build(w, ctx)        paints everything static, once, and sets up actors
 *   draw(w, dt, hour, hurry)  paints everything moving, every step (dt is 0 under reduced motion)
 *   post(w, dt, hour)    optional, after pixels exist: w.reflect(), w.mirrorWater(...), w.drawRain(dt), w.drawSnow(dt)
 *   startle(w)           optional, a fast flick of the lens
 *   flipped(w, night)    optional
 */
(() => {
  // Logical scene is 320x150. The buffer has spare sky and street so wider windows still have something to show.
  const PAD_X = 40;
  const PAD_Y = 40;
  const BW = 400;
  const BH = 190;
  const GROUND = 118;
  const ROAD = 127;
  const HOUR_DAY = 12;
  const HOUR_NIGHT = 22;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const pack = (c) => (255 << 24) | (Math.round(clamp(c[2]) * 255) << 16) | (Math.round(clamp(c[1]) * 255) << 8) | Math.round(clamp(c[0]) * 255);

  // ---- Palette: one painted colour per material, graded for each time of day
  const NOON = 0,
    GOLD = 1,
    DUSK = 2,
    NIGHT = 3,
    DAWN = 4;
  const GRADE = [
    ([r, g, b]) => [r, g, b],
    ([r, g, b]) => [r * 1.02 + 0.02, g * 0.82, b * 0.66],
    ([r, g, b]) => [r * 0.5 + 0.03, g * 0.36 + 0.01, b * 0.58 + 0.07],
    ([r, g, b]) => [r * 0.17 + 0.015, g * 0.17 + 0.02, b * 0.3 + 0.065],
    ([r, g, b]) => [r * 0.6 + 0.04, g * 0.52 + 0.02, b * 0.66 + 0.06],
  ];
  const DEFAULT_KEYS = [
    [12, NOON],
    [15, NOON],
    [17, GOLD],
    [18.5, DUSK],
    [19.7, NIGHT],
    [28.6, NIGHT],
    [29.8, DAWN],
    [31.4, NOON],
    [36, NOON],
  ];
  const SKY_END = PAD_Y + 106;
  const STEPS = 5;
  const mixPacked = (a, b, t) => {
    const ch = (s) => Math.round(mix((a >>> s) & 255, (b >>> s) & 255, t)) << s;
    return (255 << 24) | ch(16) | ch(8) | ch(0);
  };
  const GLASS = { rain: 0, frost: 1, mist: 2, clear: 3 };

  const FONT3 = {
    0: '###,#.#,#.#,#.#,###',
    1: '.#.,##.,.#.,.#.,###',
    2: '###,..#,###,#..,###',
    3: '###,..#,.##,..#,###',
    4: '#.#,#.#,###,..#,..#',
    5: '###,#..,###,..#,###',
    6: '###,#..,###,#.#,###',
    7: '###,..#,..#,.#.,.#.',
    8: '###,#.#,###,#.#,###',
    9: '###,#.#,###,..#,###',
    ':': '...,.#.,...,.#.,...',
    A: '###,#.#,###,#.#,#.#',
    B: '##.,#.#,##.,#.#,##.',
    C: '###,#..,#..,#..,###',
    D: '##.,#.#,#.#,#.#,##.',
    E: '###,#..,##.,#..,###',
    G: '###,#..,#.#,#.#,###',
    H: '#.#,#.#,###,#.#,#.#',
    I: '###,.#.,.#.,.#.,###',
    K: '#.#,#.#,##.,#.#,#.#',
    L: '#..,#..,#..,#..,###',
    M: '#...#,##.##,#.#.#,#...#,#...#',
    N: '#..#,##.#,#.##,#..#,#..#',
    O: '###,#.#,#.#,#.#,###',
    P: '###,#.#,###,#..,#..',
    R: '##.,#.#,##.,#.#,#.#',
    S: '###,#..,###,..#,###',
    T: '###,.#.,.#.,.#.,.#.',
    U: '#.#,#.#,#.#,#.#,###',
    W: '#.#,#.#,###,###,#.#',
    Y: '#.#,#.#,###,.#.,.#.',
    F: '###,#..,##.,#..,#..',
    J: '..#,..#,..#,#.#,###',
    Q: '###,#.#,#.#,###,..#',
    V: '#.#,#.#,#.#,#.#,.#.',
    X: '#.#,#.#,.#.,#.#,#.#',
    Z: '###,..#,.#.,#..,###',
    '.': '.,.,.,.,#',
    '-': '...,...,###,...,...',
    ' ': '...,...,...,...,...',
  };
  for (const key of Object.keys(FONT3)) FONT3[key] = FONT3[key].split(',');

  // Sign font for anything that has to read at a glance
  const FONT5 = {
    A: '.###.,#...#,#...#,#####,#...#,#...#,#...#',
    B: '####.,#...#,#...#,####.,#...#,#...#,####.',
    C: '.####,#....,#....,#....,#....,#....,.####',
    D: '####.,#...#,#...#,#...#,#...#,#...#,####.',
    E: '#####,#....,#....,####.,#....,#....,#####',
    F: '#####,#....,#....,####.,#....,#....,#....',
    G: '.####,#....,#....,#.###,#...#,#...#,.###.',
    H: '#...#,#...#,#...#,#####,#...#,#...#,#...#',
    I: '###,.#.,.#.,.#.,.#.,.#.,###',
    J: '..###,...#.,...#.,...#.,...#.,#..#.,.##..',
    K: '#...#,#..#.,#.#..,##...,#.#..,#..#.,#...#',
    L: '#....,#....,#....,#....,#....,#....,#####',
    M: '#...#,##.##,#.#.#,#.#.#,#...#,#...#,#...#',
    N: '#...#,##..#,##..#,#.#.#,#..##,#..##,#...#',
    O: '.###.,#...#,#...#,#...#,#...#,#...#,.###.',
    P: '####.,#...#,#...#,####.,#....,#....,#....',
    Q: '.###.,#...#,#...#,#...#,#.#.#,#..#.,.##.#',
    R: '####.,#...#,#...#,####.,#.#..,#..#.,#...#',
    S: '.####,#....,#....,.###.,....#,....#,####.',
    T: '#####,..#..,..#..,..#..,..#..,..#..,..#..',
    U: '#...#,#...#,#...#,#...#,#...#,#...#,.###.',
    V: '#...#,#...#,#...#,#...#,.#.#.,.#.#.,..#..',
    W: '#...#,#...#,#...#,#.#.#,#.#.#,##.##,#...#',
    X: '#...#,#...#,.#.#.,..#..,.#.#.,#...#,#...#',
    Y: '#...#,#...#,.#.#.,..#..,..#..,..#..,..#..',
    Z: '#####,....#,...#.,..#..,.#...,#....,#####',
    0: '.###.,#...#,#..##,#.#.#,##..#,#...#,.###.',
    1: '..#..,.##..,..#..,..#..,..#..,..#..,.###.',
    2: '.###.,#...#,....#,..##.,.#...,#....,#####',
    3: '####.,....#,....#,.###.,....#,....#,####.',
    4: '...#.,..##.,.#.#.,#..#.,#####,...#.,...#.',
    5: '#####,#....,####.,....#,....#,#...#,.###.',
    6: '.###.,#....,#....,####.,#...#,#...#,.###.',
    7: '#####,....#,...#.,..#..,.#...,.#...,.#...',
    8: '.###.,#...#,#...#,.###.,#...#,#...#,.###.',
    9: '.###.,#...#,#...#,.####,....#,....#,.###.',
    ' ': '...,...,...,...,...,...,...',
    '-': '....,....,....,####,....,....,....',
    '.': '.,.,.,.,.,.,#',
    "'": '#,#,.,.,.,.,.',
  };
  for (const key of Object.keys(FONT5)) FONT5[key] = FONT5[key].split(',');

  const css = `
:host { display: block; position: relative; width: 100%; aspect-ratio: 2 / 1; -webkit-tap-highlight-color: transparent; }
canvas { position: absolute; display: block; pointer-events: none; image-rendering: pixelated; }
button {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; background: transparent;
  border-radius: 9999px; cursor: grab; touch-action: pan-y; user-select: none; -webkit-user-select: none; outline: none;
}
button:active { cursor: grabbing; }
button:focus-visible { outline: 2px solid; outline-offset: 6px; }
.vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

  const OVERHANG = 0.32; // canvas spills past the host by this share of the host's height

  const VERT = `#version 300 es
void main() {
  vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(v * 2.0 - 1.0, 0.0, 1.0);
}`;

  const DOWN = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel, uSize;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 h = uTexel;
  o = texture(uTex, uv) * 4.0;
  o += texture(uTex, uv + vec2(-h.x, -h.y));
  o += texture(uTex, uv + vec2( h.x, -h.y));
  o += texture(uTex, uv + vec2(-h.x,  h.y));
  o += texture(uTex, uv + vec2( h.x,  h.y));
  o /= 8.0;
}`;

  const UP = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel, uSize;
uniform float uGain;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec2 h = uTexel;
  vec4 c = texture(uTex, uv + vec2(-2.0 * h.x, 0.0));
  c += texture(uTex, uv + vec2(-h.x, h.y)) * 2.0;
  c += texture(uTex, uv + vec2(0.0, 2.0 * h.y));
  c += texture(uTex, uv + vec2(h.x, h.y)) * 2.0;
  c += texture(uTex, uv + vec2(2.0 * h.x, 0.0));
  c += texture(uTex, uv + vec2(h.x, -h.y)) * 2.0;
  c += texture(uTex, uv + vec2(0.0, -2.0 * h.y));
  c += texture(uTex, uv + vec2(-h.x, -h.y)) * 2.0;
  o = c / 12.0 * uGain;
}`;

  const SHELL = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uWorld, uBloom, uWipe;
uniform vec2 uRes, uPill, uOrigin, uWorldSize;
uniform vec4 uLens;
uniform vec2 uTube;
uniform float uBezel, uK, uDark, uRain, uTime, uLift, uDensity, uLod;
uniform vec3 uRun[6];
out vec4 o;

uniform vec3 uTubeA, uTubeB, uBodyDay, uBodyNight;
uniform float uGlass; // 0 rain, 1 frost, 2 mist, 3 clear

float rb(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 worldUv(vec2 p) {
  vec2 f = p + 0.5 * uRes;
  return vec2(f.x - uOrigin.x, uOrigin.y - f.y) / uK / uWorldSize;
}
vec3 bloomAt(vec2 p) {
  return texture(uBloom, worldUv(p)).rgb;
}
vec3 glowOf(vec2 p) {
  // Tight halo and a wide haze from the same chain
  vec3 b = bloomAt(p);
  return b * (0.55 + uDark * 0.75);
}
vec3 scene(vec2 p, float lod) {
  vec3 c = textureLod(uWorld, worldUv(p), lod + uLod).rgb;
  return 1.0 - (1.0 - c) * (1.0 - clamp(glowOf(p) * 0.55, 0.0, 1.0));
}

// Beaded water on the pane: a coarse layer and a fine one, each bead swelling and drying on its own
vec3 beads(vec2 p, float cell, float seed) {
  vec2 g = p / cell + seed;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float a = hash(id + seed);
  float b = hash(id * 1.7 + 3.1);
  float c = hash(id * 2.3 + 7.7);
  vec2 d = f - (vec2(a, b) - 0.5) * 0.62;
  float life = sin(uTime * (0.1 + c * 0.25) + c * 40.0);
  float rad = (0.09 + a * b * 0.27) * smoothstep(-0.4, 0.5, life);
  if (rad <= 0.001) return vec3(0.0);
  float q = length(d * vec2(1.0, 0.86)) / rad;
  if (q >= 1.0) return vec3(0.0);
  float m = smoothstep(1.0, 0.82, q);
  return vec3(d / rad * q, m);
}
// Pack the strongest of everything on the glass: xy = bend, z = coverage
vec3 waterAt(vec2 p) {
  float cell = uK * 8.0;
  vec3 w = beads(p, cell, 0.0);
  vec3 w2 = beads(p, cell * 0.55, 11.0);
  if (w2.z > w.z) w = w2;
  w.z *= smoothstep(0.1, 0.85, uRain);
  // Runners slide down in fits, dragging a wet trail
  for (int i = 0; i < 6; i++) {
    vec3 r = uRun[i];
    if (r.z <= 0.0) continue;
    vec2 d = (p - r.xy) / r.z;
    d.y *= 0.8;
    float q = length(d);
    if (q < 1.0) {
      float m = smoothstep(1.0, 0.8, q);
      if (m > w.z) w = vec3(d * q, m);
    }
  }
  // The lens wipes the pane as it passes, water grows back behind it
  float wipe = texture(uWipe, vec2(0.5 + p.x / (uRes.x), 0.5)).r;
  w.z *= 1.0 - smoothstep(0.05, 0.75, wipe);
  return w;
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.13 + 5.1) * 0.3 + vnoise(p * 4.7 + 9.3) * 0.15;
}
float wipeAt(vec2 p) {
  return smoothstep(0.05, 0.75, texture(uWipe, vec2(0.5 + p.x / uRes.x, 0.5)).r);
}

float softBox(vec2 p, vec2 c, vec2 h, float s) {
  vec2 q = abs(p - c) - h;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-s, s, d);
}

// The window pane, with water on it
vec3 pane(vec2 p) {
  if (uGlass > 0.5) {
    vec3 clear = scene(p, 0.0);
    if (uGlass > 2.5 || uRain < 0.01) return clear;
    float winR = uPill.y - uBezel;
    float dw = rb(p, uPill, uPill.y) + uBezel;
    float wipe = 1.0 - wipeAt(p) * 0.92;
    if (uGlass < 1.5) {
      // Frost grows inward from the frame in feathered fronts
      float inward = -dw / winR;
      float grain = fbm(p / (uK * 6.0));
      float fine = fbm(p / (uK * 1.6) + 3.0);
      float reach = uRain * 0.62;
      float front = reach - inward + (grain - 0.5) * 0.55 + (fine - 0.5) * 0.14;
      float ice = smoothstep(0.0, 0.16, front) * wipe;
      vec3 behind = scene(p + (vec2(grain, fine) - 0.5) * uK * 5.0, 2.0);
      vec3 tint = behind * 0.82 + mix(vec3(0.5, 0.56, 0.62), vec3(0.2, 0.24, 0.34), uDark) * (0.45 + fine * 0.55);
      float crystal = smoothstep(0.66, 0.8, fine) * smoothstep(0.0, 0.05, front);
      tint += crystal * mix(0.16, 0.12, uDark);
      return mix(clear, tint, ice * 0.9);
    }
    // Breath on cold glass: soft and low on the pane
    float low = smoothstep(winR * 0.1, -winR * 0.95, p.y + (fbm(p / (uK * 22.0)) - 0.5) * winR * 0.7);
    float fog = uRain * low * wipe;
    vec3 soft = scene(p, 2.6) * 0.86 + mix(vec3(0.3), vec3(0.075, 0.075, 0.1), uDark);
    return mix(clear, soft, fog * 0.86);
  }
  vec3 w = uRain > 0.01 ? waterAt(p) : vec3(0.0);
  vec3 c = scene(p, 0.0);
  if (w.z > 0.002) {
    float r = uK * 8.0;
    // Drops flip and shrink what's behind them
    vec3 seen = scene(p - w.xy * r * 1.15, 1.0) * 1.12;
    float rim = pow(length(w.xy), 3.0);
    seen = mix(seen, seen * 0.42, rim * 0.8);
    float spark = smoothstep(0.82, 0.98, dot(normalize(w.xy + 1e-4), normalize(vec2(-0.45, 0.9)))) * smoothstep(0.35, 0.65, length(w.xy)) * smoothstep(0.95, 0.75, length(w.xy));
    seen += spark * mix(vec3(0.9), vec3(0.75, 0.8, 1.0), uDark) * 0.5;
    c = mix(c, seen, w.z);
  }
  return c;
}

vec3 envSky(vec3 R) {
  // A studio by day, a dim room lit by the city by night
  vec3 hi = mix(vec3(1.0, 0.99, 0.96), vec3(0.34, 0.34, 0.52), uDark);
  vec3 lo = mix(vec3(0.66, 0.64, 0.58), vec3(0.02, 0.02, 0.05), uDark);
  vec3 c = mix(lo, hi, smoothstep(-0.7, 0.8, R.y));
  vec2 s = R.xy / (1.0 + max(R.z, 0.0));
  c += hi * softBox(s, vec2(-0.12, 0.55), vec2(0.5, 0.1), 0.16) * 0.9;
  return c;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = frag - 0.5 * uRes;
  float d = rb(p, uPill, uPill.y);
  float dw = d + uBezel;
  float H = uPill.y;

  vec2 tubeLv = uTube;
  float tubeLine = -uBezel * 0.5;

  // ---- Wall behind: a shadow, and the tube's light in the night
  vec3 wallGlow = vec3(0.0);
  float wallAlpha = 0.0;
  if (d > -2.0) {
    float wide = rb(p + vec2(0.0, H * 0.11), uPill, H);
    float near = rb(p + vec2(0.0, H * 0.025), uPill, H);
    float shadow = 0.26 * (1.0 - smoothstep(-H * 0.18, H * 0.3, wide)) + 0.3 * (1.0 - smoothstep(-H * 0.02, H * 0.07, near));
    shadow *= mix(1.0, 0.75, uDark);
    float out1 = max(d, 0.0);
    float side = smoothstep(-uPill.x * 0.8, uPill.x * 0.8, p.x);
    vec3 tint = uTubeA * tubeLv.x * (1.0 - side) + uTubeB * tubeLv.y * side;
    wallGlow = tint * (exp(-out1 / (H * 0.1)) * 0.42 + exp(-out1 / (H * 0.32)) * 0.34) * uDark;
    // Fade before the canvas edge
    vec2 toEdge = 0.5 * uRes - abs(p);
    float fade = smoothstep(0.0, H * 0.35, min(toEdge.x, toEdge.y));
    wallGlow *= fade;
    shadow *= fade;
    wallAlpha = shadow;
  }

  vec3 color = wallGlow;
  float alpha = max(wallAlpha, max(wallGlow.r, max(wallGlow.g, wallGlow.b)));

  if (d < 1.0) {
    vec3 body = vec3(0.0);

    // ---- Bezel
    if (dw > -1.0) {
      float inner = uPill.x - uPill.y;
      vec2 q = p;
      q.x = sign(p.x) * max(abs(p.x) - inner, 0.0);
      vec2 g = q / max(length(q), 1e-3);
      float t = clamp(-d / uBezel, 0.0, 1.0);
      float s = t * 2.0 - 1.0;
      float slope = -s * s * s * 1.35;
      // Chamfer at the inner edge falls away sharply
      float chamfer = smoothstep(0.76, 0.86, t);
      slope = mix(slope, -1.2, chamfer);
      vec3 N = normalize(vec3(g * slope, 1.0));
      vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);

      vec3 albedo = mix(uBodyDay, uBodyNight, uDark);
      float dif = 0.66 + 0.34 * clamp(dot(N, normalize(vec3(-0.25, 0.75, 0.62))), 0.0, 1.0);
      float fres = 0.05 + 0.95 * pow(1.0 - N.z, 3.2);
      vec3 c = albedo * dif;
      c = mix(c, envSky(R), clamp(fres * 0.85 + mix(0.1, 0.16, uDark), 0.0, 1.0));

      // Inner chamfer is polished: it mirrors the actual street
      float edgeDist = max(uBezel + d, 0.0);
      vec3 mirror = scene(p - g * (edgeDist * 2.0 + uK * 0.5), 2.0);
      c = mix(c, mirror * mix(0.82, 1.0, uDark), chamfer * 0.55);

      // City light across the whole metal, in its own colours
      vec3 city = glowOf(p - g * uBezel * 2.2);
      c += city * mix(0.08, 0.34, uDark) * (0.3 + 0.7 * clamp(t * 1.2, 0.0, 1.0));

      // ---- Neon tube, seated in the bezel
      float tr = max(uBezel * 0.085, 1.1 * uDensity);
      float td = abs(d - tubeLine);
      // Walk along the tube. Two tubes, joined with blacked-out ends at top and bottom centre.
      float side = step(0.0, p.x);
      float lv = mix(tubeLv.x, tubeLv.y, side);
      vec3 hue = mix(uTubeA, uTubeB, side);
      float gapW = uBezel * 0.42;
      float gap = abs(p.x) < gapW && abs(p.y) > H * 0.5 ? 1.0 : 0.0;
      float gapSoft = (1.0 - smoothstep(gapW * 0.6, gapW * 2.6, abs(p.x))) * step(H * 0.5, abs(p.y));
      float capStart = abs(p.x) < gapW + uBezel * 0.7 && abs(p.y) > H * 0.5 ? 1.0 : 0.0;

      // Standoff clips along the run
      float R0 = H + tubeLine;
      float along;
      if (abs(p.x) < inner) along = p.y > 0.0 ? abs(p.x) : 2.0 * inner + 3.14159 * R0 - abs(p.x);
      else {
        vec2 qq = p - vec2(sign(p.x) * inner, 0.0);
        along = inner + (1.5708 - atan(qq.y, abs(qq.x))) * R0;
      }
      float run = 2.0 * inner + 3.14159 * R0;
      float spacing = run / floor(run / (H * 0.78) + 0.5);
      float cd = abs(mod(along, spacing) - spacing * 0.5);
      float clip = (1.0 - smoothstep(tr * 1.0, tr * 1.4, cd)) * (1.0 - smoothstep(tr * 1.6, tr * 2.1, td));

      // Halo on the metal
      float halo = exp(-td / (uBezel * 0.15)) * 0.8 + exp(-td / (uBezel * 0.42)) * 0.42;
      c += hue * lv * uDark * halo * (1.0 - gapSoft * 0.9);
      // Soft contact shadow of the tube (day)
      c *= 1.0 - (1.0 - uDark) * 0.22 * (1.0 - smoothstep(tr, tr * 2.6, abs(d - tubeLine - tr * 1.1)));

      // The glass itself
      float tube = (1.0 - smoothstep(tr * 0.8, tr * 1.15, td)) * (1.0 - gap);
      if (tube > 0.0) {
        float across = clamp((d - tubeLine) / tr, -1.0, 1.0);
        float roll = sqrt(max(1.0 - across * across, 0.0));
        // Unlit: milky glass catching a sliver of light
        vec3 cold = mix(vec3(0.95, 0.94, 0.9), vec3(0.14, 0.14, 0.2), uDark) * (0.74 + 0.26 * roll);
        cold += pow(roll, 8.0) * mix(0.25, 0.08, uDark);
        // Lit: white-hot along the middle, saturated toward the skin
        vec3 lit = mix(hue, vec3(1.0), smoothstep(0.55, 1.0, roll) * 0.86);
        vec3 tubeC = mix(cold, lit * 1.25, lv * smoothstep(0.1, 0.7, uDark + lv * 0.4));
        // Painted-out electrode ends
        tubeC = mix(tubeC, vec3(0.03, 0.03, 0.04) + 0.12 * pow(roll, 6.0), capStart);
        c = mix(c, tubeC, tube);
      }
      c = mix(c, mix(vec3(0.52, 0.52, 0.5), vec3(0.09, 0.09, 0.12), uDark), clip);

      body = c;
    }

    // ---- Window
    if (dw < 1.0) {
      float winR = uPill.y - uBezel;
      vec2 lc = uLens.xy;
      vec2 he = uLens.zw;
      float lr = min(he.x, he.y);
      vec2 lq = p - lc;
      float ld = rb(lq, he, lr);

      vec3 c = ld < 2.0 ? scene(p, 0.0) : pane(p);

      // Pane sheen, only just there
      float sheen = smoothstep(winR * 0.15, winR * 1.05, p.y + p.x * 0.1);
      c = mix(c, vec3(1.0), sheen * sheen * mix(0.14, 0.03, uDark));

      // Set back into the frame
      float top = rb(p - vec2(0.0, winR * 0.05), uPill - uBezel, winR);
      float depth = exp(max(dw, -winR) / (winR * 0.05)) * 0.5 + exp(min(top, 0.0) / (winR * 0.09)) * 0.44;
      c = mix(c, mix(vec3(0.14, 0.12, 0.16), vec3(0.0, 0.0, 0.02), uDark), clamp(depth, 0.0, 0.9));

      // Lens shadow
      float lift = 0.05 + uLift * 0.05;
      float sd = rb(lq + vec2(lr * 0.02, lr * lift * 1.7), he, lr);
      float sh = 1.0 - smoothstep(-lr * 0.16, lr * (0.17 + uLift * 0.12), sd);
      c = mix(c, vec3(0.02, 0.02, 0.05), sh * mix(0.42, 0.62, uDark) * step(0.0, ld));
      // Light gathered through the glass lands just under it
      float cd = rb(lq + vec2(-lr * 0.1, lr * 0.11), he * 0.99, lr);
      float caustic = smoothstep(lr * 0.13, 0.0, abs(cd)) * smoothstep(0.0, -1.0, lq.y / lr + 0.2) * step(0.0, ld);
      c += caustic * mix(vec3(0.42, 0.38, 0.3), glowOf(lc - vec2(0.0, lr * 0.35)) * 1.1 + vec3(0.03), uDark);

      // ---- Lens
      if (ld < 1.0) {
        vec2 innerL = max(he - lr, 0.0);
        vec2 axis = lq - clamp(lq, -innerL, innerL);
        float rad = length(axis);
        vec2 gr = axis / max(rad, 1e-3);
        float rho = clamp(rad / lr, 0.0, 1.0);

        // Flat through the middle, falls away fast at the rim
        const float pw = 4.0;
        float rp = pow(rho, pw);
        float slope = pow(rho, pw - 1.0) * pow(max(1.0 - rp, 2e-3), 1.0 / pw - 1.0);
        vec3 N = normalize(vec3(gr * slope, 1.0));
        vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
        vec2 lp = lq / lr;

        float mag = 1.2 + uLift * 0.05;
        vec2 base = lc + lq / mag;
        float bend = pow(rho, 8.0) * lr * (0.18 + uLift * 0.02);
        vec2 src = base + gr * bend;
        // Footprint, so the compressed rim doesn't shimmer
        float foot = length(dFdx(src)) + length(dFdy(src));
        float lod = max(0.0, log2(foot * 0.5 / uK));
        vec3 seen;
        float ca = 0.015 * smoothstep(0.8, 1.0, rho);
        if (ca > 0.001) {
          vec2 off = gr * bend;
          seen.r = scene(base + off * (1.0 - ca) + gr * ca * lr * 0.06, lod).r;
          seen.g = scene(base + off, lod).g;
          seen.b = scene(base + off * (1.0 + ca) - gr * ca * lr * 0.06, lod).b;
        } else {
          seen = scene(src, lod);
        }
        vec3 lens = seen * mix(1.03, 1.08, uDark);

        // Thickness: darkness at the rim, not an outline
        lens = mix(lens, mix(vec3(0.12, 0.13, 0.17), vec3(0.0, 0.0, 0.03), uDark), pow(rho, 14.0) * 0.55);

        // Light pools inside the lower edge
        float pool = smoothstep(0.1, 0.95, -lp.y * 0.92 + lp.x * 0.22) * smoothstep(1.0, 0.86, rho) * smoothstep(0.5, 0.88, rho);
        lens += mix(vec3(0.34, 0.33, 0.3), glowOf(lc + gr * lr * 0.7) * 0.75 + vec3(0.02), uDark) * pool;

        // Big soft window high up
        float broad = softBox(lp, vec2(-0.1, 0.72), vec2(0.42, 0.1), 0.26) * smoothstep(0.98, 0.7, rho);
        lens = mix(lens, mix(vec3(1.0), vec3(0.74, 0.76, 1.0), uDark), broad * mix(0.34, 0.07, uDark));

        // Glints: a small crisp one up top, a fainter one bottom right
        float la = atan(gr.y, gr.x);
        float arc1 = exp(-pow((rho - 0.83) / 0.026, 2.0)) * smoothstep(0.42, 0.1, abs(la - 2.15));
        float arc2 = exp(-pow((rho - 0.86) / 0.016, 2.0)) * smoothstep(0.26, 0.05, abs(la + 0.86));
        lens += arc1 * mix(0.82, 0.5, uDark) + arc2 * mix(0.42, 0.26, uDark);

        // Mirror at the rim, and the neon in it is the neon that's really out there
        float fres = pow(1.0 - N.z, 2.6);
        vec3 refl = envSky(R);
        refl += glowOf(lc + gr * lr * 1.3) * uDark * 2.2;
        lens = mix(lens, refl, clamp(fres * mix(0.5, 0.56, uDark), 0.0, 0.6));
        // The frame's tubes catch in the glass
        float side = smoothstep(-0.2, 0.9, gr.x * 0.8 + p.x / uPill.x);
        lens += (mix(uTubeA * uTube.x, uTubeB * uTube.y, side)) * uDark * fres * 0.34;

        // Hairline where it meets the air
        float hair = smoothstep(lr * 0.018 + 0.6, 0.0, abs(ld + lr * 0.012));
        float dirH = 0.25 + 0.75 * smoothstep(-0.5, 0.9, dot(gr, normalize(vec2(-0.5, 0.86))));
        lens += hair * dirH * mix(0.34, 0.26, uDark);

        c = mix(c, lens, 1.0 - smoothstep(-0.8, 0.8, ld));
      }

      body = mix(body, c, 1.0 - smoothstep(-0.8, 0.8, dw));
    }

    float cover = 1.0 - smoothstep(-0.8, 0.8, d);
    color = mix(color, body, cover);
    alpha = mix(alpha, 1.0, cover);
  }

  // Keep gradients free of bands
  float n = hash(frag * 0.31 + fract(uTime * 0.01)) + hash(frag * 0.57) - 1.0;
  color += n * 0.9 / 255.0 * min(alpha * 4.0, 1.0);
  o = vec4(clamp(color, 0.0, 1.0), alpha);
}`;

  const define = (tag, scene) => {
    const MATS = [null];
    const M = {};
    const grades = scene.grade || GRADE;
    const mat = (name, hex, over = {}) => {
      M[name] = MATS.length;
      const base = rgb(hex);
      MATS.push(grades.map((grade, key) => pack(over[key] ? rgb(over[key]) : grade(base))));
    };
    // Distance
    mat('FAR1', '#b4cfde', { [GOLD]: '#d9a78f', [DUSK]: '#4d3274', [NIGHT]: '#17143f', [DAWN]: '#8d7aa8' });
    mat('FAR2', '#98b8cc', { [GOLD]: '#b98a80', [DUSK]: '#3c2a66', [NIGHT]: '#111135', [DAWN]: '#6f648f' });
    mat('FAR3', '#7f9fb4', { [GOLD]: '#94707a', [DUSK]: '#2f2358', [NIGHT]: '#0e0e2c', [DAWN]: '#585278' });
    mat('CLOUD', '#ffffff', { [GOLD]: '#ffd9b0', [DUSK]: '#e88aa0', [NIGHT]: '#2a2358', [DAWN]: '#ffc9b8' });
    mat('CLOUD_SH', '#dbe9f2', { [GOLD]: '#f2a98c', [DUSK]: '#a0568e', [NIGHT]: '#1d1a48', [DAWN]: '#d99aa8' });
    // Rail
    mat('STEEL', '#6c787c');
    mat('STEEL_DK', '#4b555a');
    mat('STEEL_LT', '#8b979a');
    mat('CONC', '#bdb7a9');
    mat('CONC_DK', '#938e81');
    mat('CONC_LT', '#d1ccbf');
    mat('WIRE', '#3d444a', { [NIGHT]: '#0a0a18' });
    // Buildings
    mat('TILE', '#d8c6a4');
    mat('TILE_DK', '#bba988');
    mat('TILE_LT', '#e6d6b8');
    mat('GREY', '#a9aca9');
    mat('GREY_DK', '#8a8e8c');
    mat('BRICK', '#a9654c');
    mat('BRICK_DK', '#8a4f3c');
    mat('TEAL', '#6f9d99');
    mat('TEAL_DK', '#567e7c');
    mat('CREAM', '#ece2cb');
    mat('CREAM_DK', '#cec2a6');
    mat('SLATE', '#4b5364');
    mat('SLATE_DK', '#3a4152');
    mat('SLATE_LT', '#5c6578');
    mat('INK', '#2b2c37');
    mat('INK_DK', '#1f2029');
    mat('ROOF', '#7b7f7e');
    mat('TANK', '#c4c7c2');
    mat('TANK_DK', '#9a9e9a');
    mat('RAIL_B', '#6f7577');
    mat('GLASS', '#5f83a0', { [GOLD]: '#ffb765', [DUSK]: '#57457f', [NIGHT]: '#15183a', [DAWN]: '#c97f8c' });
    mat('GLASS_HI', '#a6cbdc', { [GOLD]: '#ffe0a6', [DUSK]: '#8b6a98', [NIGHT]: '#1d2048', [DAWN]: '#f2b6a6' });
    mat('GLASS_DK', '#44607a', { [GOLD]: '#cf8450', [DUSK]: '#3f3268', [NIGHT]: '#101230', [DAWN]: '#9c6a80' });
    mat('AC', '#d3d4cc');
    mat('AC_DK', '#9b9d96');
    // Old shop
    mat('WOOD', '#7e5a3b');
    mat('WOOD_DK', '#5a3e29');
    mat('WOOD_LT', '#a37b52');
    mat('PLASTER', '#ece4d0');
    mat('LANTERN', '#d33b2c');
    mat('LANTERN_DK', '#9a2820');
    mat('SHUTTER', '#9ba1a5');
    mat('SHUTTER_DK', '#858b90');
    mat('ROOM', '#3a3430');
    mat('BARK', '#5a4337');
    mat('BARK_LT', '#755a4a');
    // Street
    mat('ROAD', '#5d6168', { [NIGHT]: '#0d0f26' });
    mat('ROAD_D', '#54585f', { [NIGHT]: '#0b0d21' });
    mat('ROAD_L', '#686c73', { [NIGHT]: '#10122c' });
    mat('LINE', '#ebe8dd', { [NIGHT]: '#35375a' });
    mat('CURB', '#a8a69c', { [NIGHT]: '#262749' });
    mat('WALK', '#c2bdaf', { [NIGHT]: '#1d1e3d' });
    mat('WALK_D', '#b2ad9f', { [NIGHT]: '#191a37' });
    mat('TACTILE', '#e6c23f', { [NIGHT]: '#4a3f3a' });
    mat('POLE', '#77746c');
    mat('POLE_DK', '#5c5a53');
    mat('MANHOLE', '#474a50', { [NIGHT]: '#17182f' });
    // Signs, off
    mat('BOARD_K', '#23242e', { [NIGHT]: '#0b0b16', [DUSK]: '#16142a' });
    mat('BOARD_W', '#f2eee2');
    mat('BOARD_Y', '#f2c733');
    mat('BOARD_R', '#d63a33');
    mat('BOARD_P', '#ec6ea0');
    mat('BOARD_B', '#2f6fc0');
    mat('BOARD_G', '#3a9c5c');
    mat('BOARD_V', '#7c5cc4');
    mat('BOARD_O', '#ea8a35');
    mat('TUBE', '#b8b8ae', { [NIGHT]: '#2a2a48' });
    mat('PAINT_K', '#1c1c24');
    mat('LAMP_OFF', '#3b3f44', { [NIGHT]: '#16162a' });
    // Vending
    mat('VEND_R', '#d03a33');
    mat('VEND_B', '#2c66b8');
    mat('VEND_W', '#e8e8e2');
    mat('VEND_DK', '#262a30');
    // People and things
    mat('SKIN', '#f0c8a0');
    mat('HAIR', '#23201f');
    mat('SUIT', '#2d3648');
    mat('SHIRT', '#f2f2ec');
    mat('SKIRT', '#d36a7c');
    mat('COAT', '#b28a5c');
    mat('UMB', '#dbe8ee', { [NIGHT]: '#5a6a96', [DUSK]: '#a58fb0' });
    mat('CAT_W', '#f1ebdf', { [NIGHT]: '#6f6a8a' });
    mat('CAT_O', '#dc8a3c', { [NIGHT]: '#5a3a4a' });
    mat('CAT_K', '#2a2622');
    mat('CROW', '#1a1a22');
    mat('TIRE', '#17181c');
    mat('CAR_K', '#23252c', { [NIGHT]: '#3e526c' });
    mat('CAR_R', '#c23a33');
    mat('CAR_W', '#e8e8e4', { [NIGHT]: '#8c9caf' });
    mat('CAR_B', '#3f6ca8');
    mat('CAR_Y', '#e5b93a', { [NIGHT]: '#ad8c45' });
    mat('CAR_DK', '#14151a', { [NIGHT]: '#202d43' });
    mat('CAR_GLASS', '#7da3bc', { [NIGHT]: '#1e304b' });
    mat('SMOKE', '#f4f1ea', { [NIGHT]: '#5b5478', [DUSK]: '#b98fa8' });
    mat('MOON', '#f2eddc', { [DUSK]: '#f8d9c0' });
    mat('MOON_DK', '#cfc9b4', { [DUSK]: '#d8b4a8' });
    mat('STAR', '#ffffff');
    mat('POSTER_A', '#e0604f');
    mat('POSTER_B', '#3f9fb0');
    mat('POSTER_C', '#e6c75a');
    mat('SHIRT_B', '#8fb4d6');
    mat('SHIRT_P', '#eba7bc');

    const NEONS = [];
    const N = {};
    const neon = (name, core, glow, em = 1) => {
      N[name] = NEONS.length;
      const c = rgb(core);
      const g = rgb(glow);
      NEONS.push({ core: pack(c), r: g[0] * 255 * em, g: g[1] * 255 * em, b: g[2] * 255 * em });
    };
    neon('NONE', '#000000', '#000000', 0);
    neon('PINK', '#ffd6e8', '#ff2a8c');
    neon('CYAN', '#d4fdff', '#14e0ff');
    neon('YELLOW', '#fff5bd', '#ffc51a');
    neon('RED', '#ffcfc4', '#ff2424');
    neon('GREEN', '#d4ffdd', '#1fee78');
    neon('VIOLET', '#e9daff', '#9a50ff');
    neon('ORANGE', '#ffe6c0', '#ff851a');
    neon('WHITE', '#ffffff', '#d8e6ff');
    // Backlit boards: flat colour and softer glow
    neon('B_WHITE', '#fbf6e6', '#ffe9c0', 0.34);
    neon('B_YELLOW', '#ffd63a', '#ffb81a', 0.42);
    neon('B_RED', '#ff4a3f', '#ff2418', 0.48);
    neon('B_PINK', '#ff5fa8', '#ff2a8c', 0.5);
    neon('B_BLUE', '#2f8fff', '#1a70ff', 0.55);
    neon('B_GREEN', '#2fd87a', '#12c060', 0.48);
    neon('B_VIOLET', '#a06cff', '#8040ff', 0.55);
    neon('B_ORANGE', '#ff9a3a', '#ff7a14', 0.48);
    // Rooms
    neon('WARM', '#e9ae62', '#ff9a30', 0.15);
    neon('WARM_DIM', '#d99a58', '#c06a20', 0.1);
    neon('FLUO', '#b4d8ec', '#a8d4ff', 0.14);
    neon('ROOM_P', '#c64a86', '#ff3a8c', 0.16);
    neon('ROOM_C', '#3aa3ba', '#20c0e0', 0.15);
    neon('STORE', '#eef6ff', '#d0e8ff', 0.4);
    // Fixed lights
    neon('TOWER', '#ffc774', '#ff7a1a', 0.5);
    neon('TOWER_HOT', '#fff0c8', '#ff9a30', 0.7);
    neon('LANTERN', '#ff7a4f', '#ff3a18', 0.7);
    neon('LANTERN_HOT', '#ffd08a', '#ff5a20', 0.8);
    neon('BEACON', '#ff4a3a', '#ff1a10', 1);
    neon('HEAD', '#fffbe8', '#ffeec0', 1);
    neon('TAIL', '#ff3a30', '#ff1408', 0.8);
    neon('SIG_BLUE', '#5ffff0', '#14e0c8', 0.9);
    neon('SIG_YELLOW', '#ffe05a', '#ffb814', 0.9);
    neon('SIG_RED', '#ff5046', '#ff1a10', 0.9);
    neon('LED', '#ffb648', '#ff8a14', 0.75);
    neon('EMBER', '#ffb060', '#ff5a10', 0.7);
    neon('EYE', '#c8ff9a', '#80ff40', 0.5);
    neon('SUN', '#fffbe6', '#ffd67a', 0.42);
    neon('SUN_LOW', '#ffe8a0', '#ff7a2a', 0.85);
    neon('MOON_GLOW', '#f8f3e2', '#bfc8ff', 0.3);
    neon('SPARK', '#e8f4ff', '#6aa8ff', 1);
    neon('STAR', '#dfe6ff', '#8090ff', 0.12);

    const GLYPH = { ...(scene.glyphs || {}) };
    const ctx = { mat, neon, M, N, NOON, GOLD, DUSK, NIGHT, DAWN, GLYPH, FONT3, FONT5, PAD_X, PAD_Y, BW, BH, BAYER, clamp, mix, smooth, rng, rgb, pack };
    scene.palette?.(ctx);
    if (MATS.length > 255) throw new Error(`${tag}: too many materials (${MATS.length})`);

    const STREET = new Set([M.ROAD, M.ROAD_D, M.ROAD_L, M.LINE, M.MANHOLE, M.WALK, M.WALK_D, M.TACTILE, M.CURB, ...(scene.street?.(M) || [])]);
    const SKY = scene.sky.map((stops) => stops.map((s) => pack(rgb(s))));
    const KEYS = scene.keys || DEFAULT_KEYS;
    const darkAt = scene.dark || ((hour) => smooth(17.6, 19.4, hour) * (1 - smooth(28.7, 30.2, hour)));
    const weatherAt = scene.weather || (() => ({}));
    const TUBE_A = new Float32Array(rgb(scene.tube[0]));
    const TUBE_B = new Float32Array(rgb(scene.tube[1]));
    const BODY_DAY = new Float32Array(rgb(scene.body?.[0] || '#ede6d6'));
    const BODY_NIGHT = new Float32Array(rgb(scene.body?.[1] || '#0e0e14'));
    const rowsOf = (c, font) => (font === 5 && FONT5[c]) || GLYPH[c] || FONT3[c] || FONT3[' '];

    class World {
      constructor() {
        const n = BW * BH;
        this.smat = new Uint8Array(n);
        this.sneon = new Uint8Array(n);
        this.sgroup = new Uint8Array(n);
        this.sdepth = new Uint8Array(n);
        this.fmat = new Uint8Array(n);
        this.fneon = new Uint8Array(n);
        this.fgroup = new Uint8Array(n);
        this.rgba = new Uint8Array(n * 4);
        this.pix = new Uint32Array(this.rgba.buffer);
        this.emit = new Uint8Array(n * 4);
        this.mat = this.smat;
        this.neon = this.sneon;
        this.group = this.sgroup;
        this.depth = 0;
        this.groups = [null, { fixed: 1, level: 1 }, { fixed: 2, level: 0 }];
        this.t = 0;
        this.dark = 0;
        this.rain = 0;
        this.snow = 0;
        this.wet = 0;
        this.glass = 0;
        this.palA = new Uint32Array(MATS.length);
        this.palB = new Uint32Array(MATS.length);
        this.rowLoA = new Uint32Array(BH);
        this.rowHiA = new Uint32Array(BH);
        this.rowLoB = new Uint32Array(BH);
        this.rowHiB = new Uint32Array(BH);
        this.pair = -1;
        this.colR = new Float32Array(BW);
        this.colG = new Float32Array(BW);
        this.colB = new Float32Array(BW);
        this.levels = new Float32Array(256);
        this.levels[1] = 1;
        this.shimmer = new Int8Array(1024);
        const r = rng(7);
        for (let i = 0; i < 1024; i++) this.shimmer[i] = Math.round((r() - 0.5) * 6);
        this.rand = rng(2024);

        // Street layout defaults; a scene may change any of them in build()
        this.walkTop = GROUND;
        this.roadTop = ROAD;
        this.lanes = [ROAD + 9, ROAD + 20];
        this.stopLines = [136, 192];
        this.noSignal = false;
        this.signal = { t: 0 };
        this.cars = [];
        this.peds = [];
        this.personStyles = {
          suit: [M.SUIT, M.SUIT, M.HAIR],
          coat: [M.COAT, M.SUIT, M.HAIR],
          shirt: [M.SHIRT, M.SUIT, M.HAIR],
        };
        this.cat = { x: 112, y: GROUND + 7, puff: 0 };
        this.rainFloor = 150;
        this.rainDrops = [];
        for (let i = 0; i < 110; i++) this.rainDrops.push({ x: this.rand() * BW - PAD_X, y: this.rand() * BH - PAD_Y, v: 150 + this.rand() * 90, l: 2 + Math.floor(this.rand() * 3) });
        this.ripples = [];
        for (let i = 0; i < 18; i++) this.ripples.push({ x: 0, y: 0, a: 0 });
        this.flakes = [];
        for (let i = 0; i < 140; i++) this.flakes.push({ x: this.rand() * BW - PAD_X, y: this.rand() * BH - PAD_Y, v: 9 + this.rand() * 16, p: this.rand() * 6.28, size: this.rand() < 0.16 ? 2 : 1 });
        this.beacons = [];
        this.stars = [];
        for (let i = 0; i < 26; i++) this.stars.push([Math.floor(this.rand() * BW) - PAD_X, Math.floor(this.rand() * 70) - PAD_Y, this.rand() * 6.28]);

        this.buildSky();
        // Shared light groups. Hours run on the 12..36 clock.
        const lr = rng(1984);
        this.neonGroup = this.addGroup(18.2, 28.4);
        this.tubeL = this.addGroup(18.25, 28.6);
        this.tubeR = this.addGroup(18.45, 28.5);
        this.softGroup = this.addGroup(17.6, 27.6, 'neon', { soft: true });
        this.store = this.addGroup(12, 40, 'room');
        this.farWin = [];
        for (let i = 0; i < 5; i++) this.farWin.push(this.addGroup(18 + i * 0.3, 25 + i * 0.7, 'room'));
        this.winGroups = [];
        for (let i = 0; i < 28; i++) this.winGroups.push(this.addGroup(17.6 + lr() * 2, 23.5 + lr() * 5.2, 'room'));
        scene.build(this, ctx);
        this.depth = 0;
      }

      // Light groups. Hours are on the 12..36 clock.
      addGroup(on, off, kind = 'neon', opts = {}) {
        this.groups.push({ on, off, kind, level: 0, want: false, ign: 0, seed: this.groups.length * 0.37, ...opts });
        return this.groups.length - 1;
      }

      // ---- Paint
      px(x, y, m) {
        const bx = x + PAD_X;
        const by = y + PAD_Y;
        if (bx < 0 || by < 0 || bx >= BW || by >= BH) return;
        const i = by * BW + bx;
        this.mat[i] = m;
        this.neon[i] = 0;
        this.group[i] = 0;
        if (this.mat === this.smat) this.sdepth[i] = this.depth;
      }
      // Paints only over sky, or behind the near buildings
      pxSky(x, y, m) {
        const bx = x + PAD_X;
        const by = y + PAD_Y;
        if (bx < 0 || by < 0 || bx >= BW || by >= BH) return;
        const i = by * BW + bx;
        if (this.smat[i] !== 0) return;
        this.mat[i] = m;
        this.neon[i] = 0;
        this.group[i] = 0;
      }
      // Paints unless the tree is in the way
      pxBack(x, y, m) {
        const i = (y + PAD_Y) * BW + x + PAD_X;
        if (i >= 0 && i < this.smat.length && this.sdepth[i] < 3) this.px(x, y, m);
      }
      rectBack(x, y, w, h, m) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.pxBack(x + i, y + j, m);
      }
      pxBehind(x, y, m, n = 0, g = 0) {
        const bx = x + PAD_X;
        const by = y + PAD_Y;
        if (bx < 0 || by < 0 || bx >= BW || by >= BH) return;
        const i = by * BW + bx;
        if (this.sdepth[i] > 1) return;
        this.mat[i] = m;
        this.neon[i] = n;
        this.group[i] = g;
      }
      rect(x, y, w, h, m) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, m);
      }
      light(x, y, n, g) {
        const bx = x + PAD_X;
        const by = y + PAD_Y;
        if (bx < 0 || by < 0 || bx >= BW || by >= BH) return;
        const i = by * BW + bx;
        this.neon[i] = n;
        this.group[i] = g;
      }
      lightRect(x, y, w, h, n, g) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.light(x + i, y + j, n, g);
      }
      // A lit pixel with an off colour underneath
      tube(x, y, m, n, g) {
        this.px(x, y, m);
        this.light(x, y, n, g);
      }
      sprite(rows, map, x, y, flip = false) {
        for (let j = 0; j < rows.length; j++) {
          const row = rows[j];
          for (let i = 0; i < row.length; i++) {
            const m = map[row[i]];
            if (m) this.px(flip ? x + row.length - 1 - i : x + i, y + j, m);
          }
        }
      }
      glyph(ch, x, y, cb, font) {
        const rows = rowsOf(ch, font);
        for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '#') cb(x + i, y + j);
        return rows[0].length;
      }
      // Vertical sign. mode 'tube': neon on a dark board. 'lit': glowing board with dark letters.
      vsign(x, y, text, opts) {
        const { n, g, board = M.BOARD_K, off = M.TUBE, w = 9, mode = 'tube', pad = 2, font } = opts;
        const chars = [...text];
        const heights = chars.map((c) => rowsOf(c, font).length);
        const total = heights.reduce((a, b) => a + b + 1, 0) + pad * 2 - 1;
        this.rect(x, y, w, total, board);
        this.rect(x + w - 1, y, 1, total, M.PAINT_K);
        if (mode === 'lit') this.lightRect(x, y, w - 1, total, n, g);
        let cy = y + pad;
        chars.forEach((c, i) => {
          const gw = rowsOf(c, opts.font)[0].length;
          const gx = x + Math.floor((w - 1 - gw) / 2);
          this.glyph(
            c,
            gx,
            cy,
            (px, py) => {
              if (mode === 'lit') this.px(px, py, M.PAINT_K);
              else this.tube(px, py, off, n, g);
            },
            font,
          );
          cy += heights[i] + 1;
        });
        this.rect(x + 1, y - 1, 1, 1, M.STEEL_DK);
        this.rect(x + w - 3, y + total, 1, 1, M.STEEL_DK);
        return total;
      }
      hsign(x, y, w, h, text, opts) {
        const { n, g, board = M.BOARD_K, off = M.TUBE, mode = 'tube', font, ink = M.PAINT_K, gap = 1 } = opts;
        this.rect(x, y, w, h, board);
        if (mode === 'lit') this.lightRect(x, y, w, h, n, g);
        const chars = [...text];
        const widths = chars.map((c) => rowsOf(c, opts.font)[0].length);
        const total = widths.reduce((a, b) => a + b + gap, -gap);
        let cx = x + Math.floor((w - total) / 2);
        chars.forEach((c, i) => {
          const gh = rowsOf(c, font).length;
          this.glyph(
            c,
            cx,
            y + Math.floor((h - gh) / 2),
            (px, py) => {
              if (mode === 'lit') this.px(px, py, ink);
              else this.tube(px, py, off, n, g);
            },
            font,
          );
          cx += widths[i] + gap;
        });
      }
      wire(x0, y0, x1, y1, sag, m = M.WIRE) {
        const steps = Math.abs(x1 - x0);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const y = Math.round(mix(y0, y1, t) + sag * 4 * t * (1 - t));
          this.px(x0 + i * Math.sign(x1 - x0), y, m);
        }
      }
      wireY(x0, y0, x1, y1, sag, x) {
        const t = (x - x0) / (x1 - x0);
        return Math.round(mix(y0, y1, t) + sag * 4 * t * (1 - t));
      }

      // ---- Sky lookup, one pair of stops per row and key
      buildSky() {
        this.skyLo = SKY.map(() => new Uint32Array(BH));
        this.skyHi = SKY.map(() => new Uint32Array(BH));
        this.skyF = new Uint8Array(BH);
        for (let y = 0; y < BH; y++) {
          const p = clamp(Math.pow(y / SKY_END, 1.25)) * 3.999;
          const lo = Math.floor(p);
          this.skyF[y] = Math.round((p - lo) * 16);
          SKY.forEach((stops, key) => {
            this.skyLo[key][y] = stops[lo];
            this.skyHi[key][y] = stops[lo + 1];
          });
        }
      }

      vending(x, y, body, seed) {
        const w = 8;
        const h = this.walkTop - y;
        this.rect(x, y, w, h, body);
        this.rect(x + 1, y + 1, w - 2, 7, M.VEND_W);
        this.lightRect(x + 1, y + 1, w - 2, 7, N.STORE, this.store);
        const colors = [M.BOARD_R, M.BOARD_B, M.BOARD_Y, M.BOARD_G, M.BOARD_O, M.BOARD_W];
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < 3; i++) {
            const m = colors[(i * 2 + row * 3 + seed * 5) % colors.length];
            this.rect(x + 1 + i * 2, y + 2 + row * 3, 1, 2, m);
          }
        }
        this.rect(x + 1, y + 10, 4, 2, M.VEND_DK);
        this.rect(x + 6, y + 9, 1, 3, M.VEND_DK);
        this.rect(x + 1, y + 13, w - 2, 2, M.VEND_DK);
        this.rect(x + w - 1, y, 1, h, M.VEND_DK);
      }

      // Any tall far tower with a blinking aviation light
      tallTower(x, top, w, m, group = this.farWin[0]) {
        this.rect(x, top, w, 110 - top, m);
        this.rect(x + 2, top - 3, w - 4, 3, m);
        this.rect(x + Math.floor(w / 2), top - 9, 1, 6, m);
        this.beacons.push([x + Math.floor(w / 2), top - 9]);
        for (let wy = top + 1; wy < 106; wy += 2) {
          for (let wx = x + 1; wx < x + w - 1; wx += 1) {
            if ((wx * 7 + wy * 13) % 5 < 2) this.light(wx, wy, N.WARM_DIM, group);
          }
        }
      }

      // ---- One world step. hour is on the 12..36 clock.
      tick(dt, hour, opts = {}) {
        const calm = opts.calm;
        if (!calm) this.t += dt;
        this.hour = hour;
        this.dark = darkAt(hour);
        const wx = weatherAt(hour);
        this.rain = wx.rain || 0;
        this.snow = wx.snow || 0;
        this.wet = wx.wet || 0;
        this.glass = wx.glass ?? Math.max(this.rain, this.snow);
        this.updateGroups(dt, hour, calm);
        this.fmat.set(this.smat);
        this.fneon.set(this.sneon);
        this.fgroup.set(this.sgroup);
        this.mat = this.fmat;
        this.neon = this.fneon;
        this.group = this.fgroup;
        const adt = calm ? 0 : dt;
        scene.draw(this, adt, hour, opts.hurry || 0);
        this.mat = this.smat;
        this.neon = this.sneon;
        this.group = this.sgroup;
        this.compose(hour);
        scene.post?.(this, adt, hour);
      }

      startle() {
        scene.startle?.(this);
      }

      updateGroups(dt, hour, calm) {
        const gs = this.groups;
        const levels = this.levels;
        levels[2] = this.dark > 0.45 ? 1 : 0;
        for (let i = 3; i < gs.length; i++) {
          const g = gs[i];
          const want = hour >= g.on && hour < g.off;
          if (want !== g.want) {
            g.want = want;
            g.ign = 0;
          }
          g.ign += dt;
          if (calm) {
            g.level = want ? 1 : 0;
          } else if (!want) {
            g.level = Math.max(0, g.level - dt * (g.kind === 'room' ? 6 : 8));
          } else if (g.kind === 'room' || g.soft) {
            g.level = Math.min(1, g.level + dt * 7);
          } else {
            // Neon doesn't fade up, it stutters
            const s = g.ign / (0.6 + (g.seed % 1) * 0.5);
            if (s >= 1) g.level = 1;
            else {
              const steps = [1, 0, 0.7, 0, 0, 1, 0.15, 1, 0.5, 1, 0.8, 1];
              g.level = steps[Math.floor(s * steps.length)];
            }
          }
          let lv = g.level;
          if (g.broken && lv > 0 && !calm) {
            const f = Math.sin(this.t * 37 + g.seed) * Math.sin(this.t * 2.3 + g.seed * 3);
            if (f > 0.55) lv = 0.1;
            else if (Math.sin(this.t * 0.9) > 0.86 && Math.sin(this.t * 41) > -0.2) lv = 0;
          }
          levels[i] = lv;
        }
        this.tubeLevels = [levels[this.tubeL], levels[this.tubeR]];
      }

      // ---- Sky objects. Each paints only where there is open sky.
      sun(x, y, R, low) {
        const n = low > 0.3 ? N.SUN_LOW : N.SUN;
        const sx = Math.round(x);
        const sy = Math.round(y);
        for (let j = -R; j <= R; j++) {
          for (let i = -R; i <= R; i++) {
            if (i * i + j * j > R * R + 2) continue;
            const bx = sx + i + PAD_X;
            const by = sy + j + PAD_Y;
            if (bx < 0 || by < 0 || bx >= BW || by >= BH) continue;
            const idx = by * BW + bx;
            if (this.smat[idx] !== 0) continue;
            this.fneon[idx] = n;
            this.fgroup[idx] = 1;
          }
        }
      }
      moon(x, y) {
        const mx = Math.round(x);
        const my = Math.round(y);
        for (let j = -6; j <= 6; j++) {
          for (let i = -6; i <= 6; i++) {
            if (i * i + j * j > 37) continue;
            if ((i - 3) * (i - 3) + (j + 1) * (j + 1) <= 26) continue;
            const idx = (my + j + PAD_Y) * BW + mx + i + PAD_X;
            if (idx < 0 || idx >= this.smat.length || this.smat[idx] !== 0) continue;
            this.fmat[idx] = i + j < -5 ? M.MOON : M.MOON_DK;
            this.fneon[idx] = N.MOON_GLOW;
            this.fgroup[idx] = 2;
          }
        }
      }
      drawStars() {
        if (this.dark <= 0.4) return;
        for (const [x, y, p] of this.stars) {
          if (Math.sin(this.t * 1.3 + p) < -0.2) continue;
          const i = (y + PAD_Y) * BW + x + PAD_X;
          if (i >= 0 && i < this.fmat.length && this.smat[i] === 0) {
            this.fneon[i] = N.STAR;
            this.fgroup[i] = 2;
          }
        }
      }
      // clouds: [{ x, y, w, v }, ...]
      drawClouds(clouds, dt) {
        for (const c of clouds) {
          c.x += c.v * dt;
          if (c.x > 370) c.x = -60;
          const cx = Math.round(c.x);
          for (let i = 0; i < c.w; i++) {
            const bump = Math.round(2 + Math.sin(i * 0.5 + c.w) * 2 + Math.sin(i * 0.21 + c.w * 2) * 2 + Math.min(i, c.w - i) * 0.18);
            for (let j = -bump; j <= 1; j++) this.pxSky(cx + i, c.y + j, j > -1 ? M.CLOUD_SH : M.CLOUD);
          }
        }
      }
      // Aviation lights blink in step, as the real ones do
      drawBeacons() {
        if (this.dark > 0.3 && this.t % 2.4 < 1.1) for (const [x, y] of this.beacons) this.pxLight(x, y, N.BEACON);
      }
      pxLight(x, y, n, g = 1) {
        const bx = x + PAD_X;
        const by = y + PAD_Y;
        if (bx < 0 || by < 0 || bx >= BW || by >= BH) return;
        const i = by * BW + bx;
        this.fneon[i] = n;
        this.fgroup[i] = g;
      }

      signalState() {
        const t = this.signal.t % 13;
        return t < 7 ? 'go' : t < 8.2 ? 'slow' : 'stop';
      }

      drawTraffic(dt) {
        this.signal.t += dt;
        const go = this.signalState() === 'go';
        const beams = [];
        const LANE = this.lanes;
        for (const car of this.cars) {
          const lead = car.dir > 0 ? car.x + car.len : car.x;
          const line = car.dir > 0 ? this.stopLines[0] : this.stopLines[1];
          let want = car.speed;
          // Stop at the line on red
          if (!go && !this.noSignal) {
            const gap = (line - lead) * car.dir;
            if (gap > 0 && gap < 28) want = gap < 3 ? 0 : car.speed * (gap / 28);
          }
          // Queue behind whoever is ahead
          for (const other of this.cars) {
            if (other === car || other.dir !== car.dir) continue;
            const gap = car.dir > 0 ? other.x - lead : lead - (other.x + other.len);
            if (gap > 0 && gap < 12) want = Math.min(want, Math.max(0, (gap - 4) * 3));
          }
          car.v = mix(car.v ?? want, want, clamp(dt * 3));
          car.x += car.dir * car.v * dt;
          if (car.dir > 0 && car.x > 370) car.x = -70 - this.rand() * 40;
          if (car.dir < 0 && car.x + car.len < -50) car.x = 370 + this.rand() * 40;
        }
        // Far lane first
        for (const car of [...this.cars].sort((a, b) => a.lane - b.lane)) {
          const y = LANE[car.lane];
          this.drawCar(car, Math.round(car.x), y);
          if (this.dark > 0.3) beams.push([car.dir > 0 ? Math.round(car.x + car.len) : Math.round(car.x) - 1, y, car.dir]);
        }
        this.beams = beams;
        return beams;
      }

      drawCar(car, x, y) {
        const { kind, len, dir } = car;
        const body = kind === 'taxi' ? M.CAR_K : kind === 'kei' ? M.CAR_Y : car.color || M.CAR_W;
        const flip = dir < 0;
        const col = (i) => (flip ? x + len - 1 - i : x + i);
        // Contact shadow
        for (let i = 1; i < len - 1; i++) this.px(x + i, y + 1, M.ROAD_D);
        for (let i = 0; i < len; i++) {
          const cx = col(i);
          const nose = len - 1 - i;
          const tail = i;
          let top = y - 4;
          if (kind === 'kei') {
            // Kei truck: tall cab at the front, low flatbed
            top = i > 11 ? y - 10 : y - 5;
          } else if (i > 5 && i < len - 6) {
            top = y - 9;
          } else if (i > 3 && i < len - 4) {
            top = y - 6;
          }
          if (nose < 1 || tail < 1) top = y - 3;
          for (let cy = top; cy <= y - 1; cy++) {
            let m = body;
            if (cy === y - 1) m = M.CAR_DK;
            this.px(cx, cy, m);
          }
        }
        // Windows
        if (kind === 'kei') {
          for (let i = 13; i < len - 2; i++) for (let cy = y - 9; cy < y - 6; cy++) this.px(col(i), cy, M.CAR_GLASS);
          for (let i = 1; i < 11; i++) this.px(col(i), y - 6, M.CAR_DK);
        } else {
          for (let i = 7; i < len - 7; i++) {
            if (i === Math.floor(len / 2)) continue;
            for (let cy = y - 8; cy < y - 5; cy++) this.px(col(i), cy, M.CAR_GLASS);
          }
        }
        // Wheels
        for (const w of [4, len - 7]) {
          for (let i = 0; i < 4; i++) {
            this.px(col(w + i), y, M.TIRE);
            this.px(col(w + i), y - 1, M.TIRE);
          }
          this.px(col(w + 1), y - 1, M.CAR_W);
        }
        // Lights
        const nose = col(len - 1);
        const tail = col(0);
        this.px(nose, y - 3, M.CAR_W);
        this.px(tail, y - 3, M.CAR_R);
        if (this.dark > 0.3) {
          this.pxLight(nose, y - 3, N.HEAD);
          this.pxLight(nose, y - 2, N.HEAD);
          this.pxLight(tail, y - 3, N.TAIL);
          this.pxLight(tail, y - 2, N.TAIL);
        }
        if (kind === 'taxi') {
          // Yellow stripe and lit roof sign
          for (let i = 2; i < len - 2; i++) this.px(col(i), y - 4, M.CAR_Y);
          const mid = Math.floor(len / 2);
          for (let i = -1; i <= 1; i++) {
            this.px(col(mid + i), y - 10, M.BOARD_O);
            if (this.dark > 0.2) this.pxLight(col(mid + i), y - 10, N.ORANGE);
          }
        }
      }

      drawPeople(dt, hour) {
        const rainy = this.rain > 0.35;
        const sorted = [...this.peds].sort((a, b) => a.y - b.y);
        const quiet = hour > 26.5 && hour < 30;
        sorted.forEach((p, idx) => {
          p.x += p.dir * p.speed * dt;
          if (p.x > 370) p.x = -40;
          if (p.x < -40) p.x = 370;
          if (p.nightOnly && hour < 17.5) return;
          if (quiet && idx % 3) return;
          const x = Math.round(p.x);
          const y = p.y;
          const step = Math.floor(((p.x * 0.5 + p.phase) % 2) + 2) % 2;
          const flip = p.dir < 0;
          const cols = this.personStyles[p.style] || this.personStyles.suit;
          const [top, leg, hair] = cols;
          // Shadow
          this.px(x, y + 1, M.WALK_D);
          this.px(x + 1, y + 1, M.WALK_D);
          this.px(x + 2, y + 1, M.WALK_D);
          // Legs
          if (step) {
            this.px(x, y, leg);
            this.px(x + 2, y, leg);
            this.px(x, y - 1, leg);
            this.px(x + 2, y - 1, leg);
          } else {
            this.px(x + 1, y, leg);
            this.px(x + 1, y - 1, leg);
          }
          this.rect(x, y - 2, 3, 1, leg);
          // Body
          this.rect(x, y - 6, 3, 4, top);
          if (p.style === 'suit') this.px(x + (flip ? 0 : 2), y - 6, M.SHIRT);
          // Head
          this.rect(x, y - 9, 3, 3, M.SKIN);
          this.rect(x, y - 9, 3, 1, hair);
          this.px(flip ? x + 2 : x, y - 8, hair);
          // Things
          if (p.style === 'suit') this.px(flip ? x - 1 : x + 3, y - 3 + step, M.CAR_DK);
          if (rainy) {
            // Clear convenience-store umbrella
            const ux = x + 1;
            for (let i = -4; i <= 4; i++) {
              const uy = y - 11 - (Math.abs(i) < 2 ? 2 : Math.abs(i) < 4 ? 1 : 0);
              this.px(ux + i, uy, M.UMB);
              this.pxLight(ux + i, uy, N.STAR, 2);
            }
            this.px(ux, y - 14, M.SHIRT);
            this.px(ux, y - 10, M.STEEL_LT);
          }
        });
      }

      drawCat(dt, hour) {
        const cat = this.cat;
        const night = this.dark > 0.5;
        cat.puff = Math.max(0, cat.puff - dt);
        const hop = cat.puff > 1 ? Math.round(Math.sin(((1.4 - cat.puff) / 0.4) * Math.PI) * 4) : 0;
        const x = cat.x;
        const y = cat.y - hop;
        const tail = Math.sin(this.t * 2.2) > 0 ? 0 : 1;
        const map = { C: M.CAT_W, O: M.CAT_O, K: M.CAT_K };
        if (!night && cat.puff === 0) {
          // Asleep in the sun, tail flicking
          this.sprite(['..........', '....OCC...', 'CCCOOCCO..', 'CCCCCCCCK.', 'KKCCCCCC..'], map, x - 2, y - 4);
          if (tail) this.px(x + 8, y - 2, M.CAT_K);
          // Zzz
          const z = Math.floor(this.t) % 3;
          if (z) this.glyphZ(x + 6 + z, y - 6 - z);
        } else {
          this.sprite(['O..O...', 'OCCO...', 'CCCC...', 'CCCC.K.', '.CCC.K.', '.CCCOK.', '.C.C...'], map, x, y - 6);
          // Eyes shine under the neon
          if (night) {
            this.pxLight(x + 1, y - 4, N.EYE);
            this.pxLight(x + 3, y - 4, N.EYE);
          } else {
            this.px(x + 1, y - 4, M.CAT_K);
            this.px(x + 3, y - 4, M.CAT_K);
          }
          if (tail) this.px(x + 6, y - 4, M.CAT_K);
          if (cat.puff > 0) {
            // Surprise
            this.rect(x + 2, y - 11, 1, 2, M.BOARD_R);
            this.px(x + 2, y - 8, M.BOARD_R);
          }
        }
      }

      glyphZ(x, y) {
        this.px(x, y, M.CAT_W);
        this.px(x + 1, y, M.CAT_W);
        this.px(x + 1, y + 1, M.CAT_W);
        this.px(x, y + 2, M.CAT_W);
        this.px(x + 1, y + 2, M.CAT_W);
      }

      // ---- Indexed world to RGBA + emissive
      compose(hour) {
        let a = 0;
        while (a < KEYS.length - 2 && hour >= KEYS[a + 1][0]) a++;
        const [h0, k0] = KEYS[a];
        const [h1, k1] = KEYS[a + 1];
        const b = clamp((hour - h0) / (h1 - h0)) * STEPS;
        const lo = Math.min(Math.floor(b), STEPS - 1);
        const blend = Math.round((b - lo) * 16);
        const pair = a * 16 + lo;
        if (pair !== this.pair) {
          this.pair = pair;
          const t0 = lo / STEPS;
          const t1 = (lo + 1) / STEPS;
          for (let m = 1; m < MATS.length; m++) {
            this.palA[m] = mixPacked(MATS[m][k0], MATS[m][k1], t0);
            this.palB[m] = mixPacked(MATS[m][k0], MATS[m][k1], t1);
          }
          for (let y = 0; y < BH; y++) {
            this.rowLoA[y] = mixPacked(this.skyLo[k0][y], this.skyLo[k1][y], t0);
            this.rowHiA[y] = mixPacked(this.skyHi[k0][y], this.skyHi[k1][y], t0);
            this.rowLoB[y] = mixPacked(this.skyLo[k0][y], this.skyLo[k1][y], t1);
            this.rowHiB[y] = mixPacked(this.skyHi[k0][y], this.skyHi[k1][y], t1);
          }
        }
        const { palA, palB, rowLoA: loA, rowHiA: hiA, rowLoB: loB, rowHiB: hiB } = this;
        const pix = this.pix;
        const emit = this.emit;
        emit.fill(0);
        const levels = this.levels;
        const fmat = this.fmat;
        const fgroup = this.fgroup;
        const fneon = this.fneon;
        const skyF = this.skyF;
        const em = 0.28 + 0.72 * this.dark;
        for (let y = 0, i = 0; y < BH; y++) {
          const yy = (y & 3) << 2;
          const f = skyF[y];
          for (let x = 0; x < BW; x++, i++) {
            const th = BAYER[yy | (x & 3)];
            const th2 = (th + 5) & 15;
            const m = fmat[i];
            let c;
            if (m === 0) {
              if (blend > th2) c = f > th ? hiB[y] : loB[y];
              else c = f > th ? hiA[y] : loA[y];
            } else {
              c = blend > th2 ? palB[m] : palA[m];
            }
            const g = fgroup[i];
            if (g !== 0) {
              const lv = levels[g];
              if (lv * 16 > th) {
                const nn = NEONS[fneon[i]];
                c = nn.core;
                const e = lv * em;
                const j = i * 4;
                emit[j] = nn.r * e;
                emit[j + 1] = nn.g * e;
                emit[j + 2] = nn.b * e;
                emit[j + 3] = 255;
              }
            }
            pix[i] = c;
          }
        }
      }

      // Headlight pools on the road
      drawBeams(beams = this.beams || []) {
        if (this.dark < 0.3) return;
        const pix = this.rgba;
        for (const [bx, by, dir] of beams) {
          for (let d = 1; d < 34; d++) {
            const spread = 1 + Math.floor(d / 7);
            const a = (1 - d / 34) * 0.55 * this.dark;
            for (let s = -spread; s <= 1; s++) {
              const x = bx + dir * d + PAD_X;
              const y = by + s + PAD_Y;
              if (x < 0 || x >= BW || y < this.roadTop + PAD_Y || y >= BH) continue;
              if (a * 16 < BAYER[(y & 3) * 4 + (x & 3)]) continue;
              if (!STREET.has(this.fmat[y * BW + x])) continue;
              const j = (y * BW + x) * 4;
              pix[j] = Math.min(255, pix[j] + 54);
              pix[j + 1] = Math.min(255, pix[j + 1] + 50);
              pix[j + 2] = Math.min(255, pix[j + 2] + 40);
            }
          }
        }
      }

      // Wet asphalt: every emissive pixel above throws a long, broken streak on the road
      reflect() {
        const wet = this.wet;
        if (wet <= 0.01) return;
        const pix = this.rgba;
        const emit = this.emit;
        const roadTop = this.roadTop + PAD_Y;
        const walkTop = this.walkTop + PAD_Y;
        const tick = Math.floor(this.t * 9);
        const sh = this.shimmer;
        // What each column of the city throws down at the road
        const { colR, colG, colB } = this;
        colR.fill(0);
        colG.fill(0);
        colB.fill(0);
        for (let y = roadTop - 12; y >= Math.max(0, roadTop - 130); y--) {
          const w = 1 - (roadTop - y) / 170;
          for (let x = 0, j = y * BW * 4; x < BW; x++, j += 4) {
            if (emit[j + 3] === 0) continue;
            colR[x] += emit[j] * w;
            colG[x] += emit[j + 1] * w;
            colB[x] += emit[j + 2] * w;
          }
        }
        for (let y = roadTop; y < BH; y++) {
          const dy = y - roadTop;
          const atten = Math.pow(1 - dy / 30, 0.7) * wet;
          const amp = 0.5 + dy * 0.06;
          const yy = (y & 3) << 2;
          for (let x = 0; x < BW; x++) {
            if (!STREET.has(this.fmat[y * BW + x])) continue;
            const sx = clamp(x + Math.round(sh[(x * 3 + y * 11 + tick) & 1023] * amp * 0.5), 1, BW - 2);
            const k1 = 0.022;
            let r = (colR[sx - 1] + 2 * colR[sx] + colR[sx + 1]) * k1;
            let g = (colG[sx - 1] + 2 * colG[sx] + colG[sx + 1]) * k1;
            let b = (colB[sx - 1] + 2 * colB[sx] + colB[sx + 1]) * k1;
            // A squashed mirror on top keeps the shapes of the lowest signs
            const sy = Math.round(roadTop - 2 - dy * 1.5);
            if (sy >= 0) {
              const j = (sy * BW + sx) * 4;
              r += emit[j] * 0.8;
              g += emit[j + 1] * 0.8;
              b += emit[j + 2] * 0.8;
            }
            if (r + g + b < 5) continue;
            // Ripples break the streak into bands
            const ripple = 0.72 + sh[(x + y * 37 + (tick >> 1) * 5) & 1023] * 0.09;
            const a = atten * ripple * (0.86 + (BAYER[yy | (x & 3)] / 16) * 0.3);
            const i = (y * BW + x) * 4;
            pix[i] = Math.min(255, pix[i] + Math.min(r, 235) * a);
            pix[i + 1] = Math.min(255, pix[i + 1] + Math.min(g, 235) * a);
            pix[i + 2] = Math.min(255, pix[i + 2] + Math.min(b, 235) * a);
          }
        }
        // Pavement catches the shopfronts
        for (let y = walkTop; y < roadTop - 1; y++) {
          const dy = y - walkTop;
          const yy = (y & 3) << 2;
          for (let x = 0; x < BW; x++) {
            if (!STREET.has(this.fmat[y * BW + x])) continue;
            const sy = walkTop - 1 - dy * 2;
            const j = (sy * BW + x) * 4;
            const r = emit[j],
              g = emit[j + 1],
              b = emit[j + 2];
            if (r + g + b < 8) continue;
            const a = (0.5 - dy * 0.03) * wet * (0.4 + (BAYER[yy | (x & 3)] / 16) * 0.8);
            const i = (y * BW + x) * 4;
            pix[i] = Math.min(255, pix[i] + r * a);
            pix[i + 1] = Math.min(255, pix[i + 1] + g * a);
            pix[i + 2] = Math.min(255, pix[i + 2] + b * a);
          }
        }
        // Feed a bit of the road back into the glow
        for (let y = roadTop; y < BH; y += 1) {
          for (let x = 0; x < BW; x++) {
            if (!STREET.has(this.fmat[y * BW + x])) continue;
            const i = (y * BW + x) * 4;
            const sy = Math.round(roadTop - 3 - (y - roadTop) * 3);
            if (sy < 0) continue;
            const j = (sy * BW + x) * 4;
            emit[i] = Math.max(emit[i], emit[j] * 0.14 * wet);
            emit[i + 1] = Math.max(emit[i + 1], emit[j + 1] * 0.14 * wet);
            emit[i + 2] = Math.max(emit[i + 2], emit[j + 2] * 0.14 * wet);
          }
        }
      }

      drawRain(dt) {
        const rain = this.rain;
        if (rain <= 0.01) return;
        const pix = this.rgba;
        const count = Math.floor(this.rainDrops.length * rain);
        for (let n = 0; n < count; n++) {
          const d = this.rainDrops[n];
          d.y += d.v * dt;
          d.x -= d.v * 0.12 * dt;
          if (d.y > this.rainFloor) {
            // Land: a ripple on the road
            if (this.rand() < 0.5) {
              const rip = this.ripples[n % this.ripples.length];
              rip.x = Math.round(d.x);
              rip.y = this.roadTop + Math.floor(this.rand() * Math.max(1, 149 - this.roadTop));
              rip.a = 1;
            }
            d.y = -PAD_Y - this.rand() * 30;
            d.x = this.rand() * BW - PAD_X;
          }
          for (let j = 0; j < d.l; j++) {
            const x = Math.round(d.x - j * 0.12) + PAD_X;
            const y = Math.round(d.y - j) + PAD_Y;
            if (x < 0 || x >= BW || y < 0 || y >= BH) continue;
            const i = (y * BW + x) * 4;
            pix[i] = Math.min(255, pix[i] + 26);
            pix[i + 1] = Math.min(255, pix[i + 1] + 30);
            pix[i + 2] = Math.min(255, pix[i + 2] + 44);
          }
        }
        for (const rip of this.ripples) {
          if (rip.a <= 0) continue;
          rip.a -= dt * 3.2;
          const span = Math.round((1 - rip.a) * 3);
          for (let s = -span; s <= span; s++) {
            if (Math.abs(s) < span - 1) continue;
            const x = rip.x + s + PAD_X;
            const y = rip.y + PAD_Y;
            if (x < 0 || x >= BW || y < 0 || y >= BH) continue;
            if (!STREET.has(this.fmat[y * BW + x])) continue;
            const i = (y * BW + x) * 4;
            pix[i] = Math.min(255, pix[i] + 30);
            pix[i + 1] = Math.min(255, pix[i + 1] + 34);
            pix[i + 2] = Math.min(255, pix[i + 2] + 48);
          }
        }
      }

      // Falling snow, drifting and thickening with the hour. Lit by nothing but the pixels it crosses.
      drawSnow(dt) {
        const amount = this.snow;
        if (amount <= 0.01) return;
        const pix = this.rgba;
        const count = Math.floor(this.flakes.length * amount);
        for (let n = 0; n < count; n++) {
          const f = this.flakes[n];
          f.y += f.v * dt;
          f.x += Math.sin(this.t * 0.9 + f.p) * dt * 9 - dt * 2;
          if (f.y > 150) {
            f.y = -PAD_Y;
            f.x = this.rand() * BW - PAD_X;
          }
          const bx = Math.round(f.x) + PAD_X;
          const by = Math.round(f.y) + PAD_Y;
          for (let j = 0; j < f.size; j++) {
            for (let i = 0; i < f.size; i++) {
              const x = bx + i;
              const y = by + j;
              if (x < 0 || x >= BW || y < 0 || y >= BH) continue;
              const k = (y * BW + x) * 4;
              const lift = mix(150, 66, this.dark);
              pix[k] = Math.min(255, pix[k] + lift);
              pix[k + 1] = Math.min(255, pix[k + 1] + lift);
              pix[k + 2] = Math.min(255, pix[k + 2] + lift + 8);
            }
          }
        }
      }

      // Real water: every pixel of a material in `mats` shows the city above it, flipped about row `line`.
      // Boats and anything else on other materials stay on top. Lights stretch into long shaking streaks.
      mirrorWater(line, bottom, mats, opts = {}) {
        const { strength = 0.72, squash = 1.25, ripple = 1, tint = null } = opts;
        const pix = this.pix;
        const emit = this.emit;
        const sh = this.shimmer;
        const rows = line + PAD_Y;
        const tick = Math.floor(this.t * 7);
        const set = mats instanceof Set ? mats : new Set(mats);
        const out = this.rgba;
        for (let y = rows; y < bottom + PAD_Y && y < BH; y++) {
          const dy = y - rows;
          const amp = (0.4 + dy * 0.2) * ripple;
          const bay = (y & 3) << 2;
          for (let x = 0; x < BW; x++) {
            const i = y * BW + x;
            if (!set.has(this.fmat[i])) continue;
            const wob = sh[(x + y * 41 + tick * 3) & 1023];
            const sx = clamp(x + Math.round(wob * amp * 0.5), 0, BW - 1);
            const sy = rows - 1 - Math.round(dy * squash) - (wob > 1 ? 1 : 0);
            if (sy < 0) continue;
            const j = sy * BW + sx;
            // The sky and city in the water
            const c = pix[j];
            const band = BAYER[bay | (x & 3)] / 16;
            const a = strength * (1 - dy / 90) * (0.88 + band * 0.24);
            const k = i * 4;
            let r = mix(out[k], c & 255, a);
            let g = mix(out[k + 1], (c >>> 8) & 255, a);
            let b = mix(out[k + 2], (c >>> 16) & 255, a);
            // Lights keep their strength and smear
            const e = j * 4;
            r += emit[e] * 0.5;
            g += emit[e + 1] * 0.5;
            b += emit[e + 2] * 0.5;
            if (tint) {
              r *= tint[0];
              g *= tint[1];
              b *= tint[2];
            }
            out[k] = Math.min(255, r);
            out[k + 1] = Math.min(255, g);
            out[k + 2] = Math.min(255, b);
            // A little of that goes back into the glow
            emit[k] = Math.max(emit[k], emit[e] * 0.12);
            emit[k + 1] = Math.max(emit[k + 1], emit[e + 1] * 0.12);
            emit[k + 2] = Math.max(emit[k + 2], emit[e + 2] * 0.12);
          }
        }
      }
    }

    class CitySwitch extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${css}button:focus-visible { outline-color: ${scene.tube[0]}; box-shadow: 0 0 0 2px ${scene.tube[1]}; }</style><canvas aria-hidden="true"></canvas>
        <button type="button" role="switch" aria-checked="false" aria-label="${scene.label || 'Dark mode'}"></button>
        <span class="vh" role="status" aria-live="polite"></span>`;
        this.canvas = root.querySelector('canvas');
        this.button = root.querySelector('button');
        this.statusEl = root.querySelector('.vh');
        this.world = new World();
        this.x = 0;
        this.v = 0;
        this.target = 0;
        this.moving = false;
        this._checked = false;
        this.branch = 'pm';
        this.nightHour = HOUR_NIGHT;
        this.amStart = HOUR_NIGHT;
        this.stretch = 0;
        this.stretchV = 0;
        this.lift = 0;
        this.liftTarget = 0;
        this.hurry = 0;
        this.drag = null;
        this.time = 0;
        this.accum = 1;
        this.wipe = new Uint8Array(64);
        this.runners = Array.from({ length: 6 }, () => ({ x: 0, y: 0, r: 0, wait: Math.random() * 6, v: 0 }));
        this.calm = matchMedia('(prefers-reduced-motion: reduce)');
        this.bindInput();
      }

      connectedCallback() {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(this);
        this.io = new IntersectionObserver((entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
          this.wake();
        });
        this.io.observe(this);
        this.onVis = () => this.wake();
        document.addEventListener('visibilitychange', this.onVis);
        if (this.hasAttribute('checked')) this.jump(true);
        this.resize();
      }

      disconnectedCallback() {
        this.ro.disconnect();
        this.io.disconnect();
        document.removeEventListener('visibilitychange', this.onVis);
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }

      // ---- API
      get checked() {
        return this._checked;
      }
      set checked(v) {
        this.setChecked(Boolean(v), true);
      }
      get position() {
        return this.x;
      }
      set position(v) {
        this.x = clamp(v);
        this.v = 0;
        this.moving = false;
        this.branch = 'pm';
        this.wake();
      }
      // The lens always travels; reduced motion only stills the city's own life
      setChecked(night, animate) {
        if (animate) {
          this.beginTravel();
          this.target = night ? 1 : 0;
          this.moving = true;
          this.wake();
        } else {
          this.commit(night);
        }
      }
      // Instant, for restoring a saved choice on load
      jump(night) {
        this.commit(night, true);
        this.settleGroups();
      }
      settleGroups() {
        this.world.tick(0.2, this.hour(), { calm: true });
        this.dirty = true;
        this.wake();
      }

      hour() {
        if (this.branch === 'am') return mix(36, this.amStart, this.x);
        return mix(HOUR_DAY, this.nightHour, this.x);
      }

      beginTravel() {
        if (this.x <= 0.0005) this.branch = 'pm';
        else if (this.x >= 0.9995) {
          this.branch = 'am';
          this.amStart = this.nightHour;
        }
      }

      commit(night, quiet) {
        this.x = night ? 1 : 0;
        this.v = 0;
        this.moving = false;
        if (!night) this.nightHour = HOUR_NIGHT;
        this.branch = 'pm';
        if (this._checked !== night) {
          this._checked = night;
          this.button.setAttribute('aria-checked', String(night));
          this.toggleAttribute('checked', night);
          this.statusEl.textContent = night ? `Night in ${scene.city}` : `Daytime in ${scene.city}`;
          if (!quiet) {
            this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail: { night } }));
            if (navigator.vibrate) navigator.vibrate(6);
          }
        }
        this.emitScrub();
      }

      emitScrub() {
        const hour = this.hour();
        const dark = darkAt(hour);
        if (dark === this.lastDark && hour === this.lastHour) return;
        this.lastDark = dark;
        this.lastHour = hour;
        this.dispatchEvent(new CustomEvent('scrub', { bubbles: true, composed: true, detail: { position: this.x, hour: hour % 24, dark } }));
      }

      // ---- Layout
      resize() {
        const box = this.getBoundingClientRect();
        if (!box.width || !box.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const pad = Math.round(box.height * OVERHANG);
        const cssW = box.width + pad * 2;
        const cssH = box.height + pad * 2;
        const W = Math.round(cssW * dpr);
        const H = Math.round(cssH * dpr);
        const canvas = this.canvas;
        Object.assign(canvas.style, { left: `${-pad}px`, top: `${-pad}px`, width: `${cssW}px`, height: `${cssH}px` });
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
        }
        const pillW = box.width * dpr;
        const pillH = box.height * dpr;
        const bezel = pillH * 0.078;
        const winH = pillH - bezel * 2;
        const winW = pillW - bezel * 2;

        // Keep the same 150 rows visible so resizing never changes the scene's framing.
        const k = winH / 150;
        const lensR = (winH / 2) * 0.94;
        const lim = winW / 2 - (winH / 2 - lensR) - lensR;
        this.shape = {
          W,
          H,
          dpr,
          pillW,
          pillH,
          bezel,
          winH,
          winW,
          k,
          ox: W / 2 - (160 + PAD_X) * k,
          oy: H / 2 - winH / 2 + BH * k,
          lensR,
          travel: lim * 2,
          travelCss: (lim * 2) / dpr,
        };
        this.initGl();
        this.dirty = true;
        this.world.tick(1 / 30, this.hour(), { calm: this.calm.matches });
        this.wake();
      }

      // ---- GL
      initGl() {
        if (this.gl || this.noGl) return;
        const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
        if (!gl) {
          this.noGl = true;
          this.ctx = this.canvas.getContext('2d');
          this.low = document.createElement('canvas');
          this.low.width = BW;
          this.low.height = BH;
          return;
        }
        this.gl = gl;
        if (!this.lostBound) {
          this.lostBound = true;
          this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.gl = null;
          });
          this.canvas.addEventListener('webglcontextrestored', () => this.resize());
        }
        const compile = (fs) => {
          const prog = gl.createProgram();
          for (const [type, src] of [
            [gl.VERTEX_SHADER, VERT],
            [gl.FRAGMENT_SHADER, fs],
          ]) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
            gl.attachShader(prog, s);
          }
          gl.linkProgram(prog);
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));
          const loc = {};
          const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
          for (let i = 0; i < n; i++) {
            const name = gl.getActiveUniform(prog, i).name.replace('[0]', '');
            loc[name] = gl.getUniformLocation(prog, name);
          }
          return { prog, loc };
        };
        this.pDown = compile(DOWN);
        this.pUp = compile(UP);
        this.pShell = compile(SHELL);
        this.vao = gl.createVertexArray();

        const tex = (min, mag) => {
          const t = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          return t;
        };
        this.texWorld = tex(gl.NEAREST_MIPMAP_LINEAR, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BW, BH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.texEmit = tex(gl.LINEAR, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BW, BH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        this.texWipe = tex(gl.LINEAR, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.wipe);

        const hdr = gl.getExtension('EXT_color_buffer_float');
        this.levels = [];
        let w = BW,
          h = BH;
        for (let i = 0; i < 5; i++) {
          w = Math.max(2, w >> 1);
          h = Math.max(2, h >> 1);
          const t = tex(gl.LINEAR, gl.LINEAR);
          if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
          else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          const fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
          this.levels.push({ t, fbo, w, h });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      uploadWorld() {
        const gl = this.gl;
        if (!gl) return;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texWorld);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, this.world.rgba);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, this.texEmit);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BW, BH, gl.RGBA, gl.UNSIGNED_BYTE, this.world.emit);

        // Bloom: downsample then add back up
        gl.bindVertexArray(this.vao);
        gl.disable(gl.BLEND);
        gl.useProgram(this.pDown.prog);
        gl.uniform1i(this.pDown.loc.uTex, 0);
        let src = this.texEmit,
          sw = BW,
          sh = BH;
        for (const lv of this.levels) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo);
          gl.viewport(0, 0, lv.w, lv.h);
          gl.bindTexture(gl.TEXTURE_2D, src);
          gl.uniform2f(this.pDown.loc.uTexel, 0.5 / sw, 0.5 / sh);
          gl.uniform2f(this.pDown.loc.uSize, lv.w, lv.h);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          src = lv.t;
          sw = lv.w;
          sh = lv.h;
        }
        gl.useProgram(this.pUp.prog);
        gl.uniform1i(this.pUp.loc.uTex, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        const gains = [0.62, 0.62, 0.66, 0.7];
        for (let i = this.levels.length - 1; i > 0; i--) {
          const from = this.levels[i];
          const to = this.levels[i - 1];
          gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
          gl.viewport(0, 0, to.w, to.h);
          gl.bindTexture(gl.TEXTURE_2D, from.t);
          gl.uniform2f(this.pUp.loc.uTexel, 0.5 / from.w, 0.5 / from.h);
          gl.uniform2f(this.pUp.loc.uSize, to.w, to.h);
          gl.uniform1f(this.pUp.loc.uGain, gains[i - 1]);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.disable(gl.BLEND);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      draw() {
        const s = this.shape;
        if (!s) return;
        if (this.noGl) return this.draw2d();
        const gl = this.gl;
        if (!gl) return;
        gl.viewport(0, 0, s.W, s.H);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindVertexArray(this.vao);
        const { prog, loc } = this.pShell;
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texWorld);
        gl.uniform1i(loc.uWorld, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.levels[0].t);
        gl.uniform1i(loc.uBloom, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.texWipe);
        gl.uniform1i(loc.uWipe, 2);
        gl.uniform2f(loc.uRes, s.W, s.H);
        gl.uniform2f(loc.uPill, s.pillW / 2, s.pillH / 2);
        gl.uniform2f(loc.uOrigin, s.ox, s.oy);
        gl.uniform2f(loc.uWorldSize, BW, BH);
        gl.uniform1f(loc.uBezel, s.bezel);
        gl.uniform1f(loc.uK, s.k);
        gl.uniform1f(loc.uDark, this.world.dark);
        gl.uniform1f(loc.uRain, this.world.glass);
        gl.uniform1f(loc.uGlass, GLASS[scene.glass || 'clear']);
        gl.uniform3fv(loc.uTubeA, TUBE_A);
        gl.uniform3fv(loc.uTubeB, TUBE_B);
        gl.uniform3fv(loc.uBodyDay, BODY_DAY);
        gl.uniform3fv(loc.uBodyNight, BODY_NIGHT);
        gl.uniform1f(loc.uTime, this.time);
        gl.uniform1f(loc.uLift, this.lift);
        gl.uniform1f(loc.uDensity, s.dpr);
        gl.uniform1f(loc.uLod, Math.max(0, Math.log2(1 / s.k)));
        gl.uniform2f(loc.uTube, this.world.tubeLevels?.[0] || 0, this.world.tubeLevels?.[1] || 0);
        const st = clamp(this.stretch, -0.5, 1.2);
        const r = s.lensR * (1 + 0.018 * this.lift);
        const hx = r * (1 + 0.2 * st);
        const hy = r * (1 - 0.08 * st);
        const lim = s.winW / 2 - (s.winH / 2 - s.lensR) - hx;
        const cx = clamp((this.x - 0.5) * s.travel, -lim, lim);
        gl.uniform4f(loc.uLens, cx, 0, hx, hy);
        const run = new Float32Array(18);
        this.runners.forEach((d, i) => {
          run[i * 3] = d.x * s.winW * 0.5;
          run[i * 3 + 1] = d.y * s.winH * 0.5;
          run[i * 3 + 2] = scene.glass === 'rain' && this.world.glass > 0.2 ? d.r * s.k : 0;
        });
        gl.uniform3fv(loc.uRun, run);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      draw2d() {
        // No WebGL: the world, clipped to the pill, with a plain disc for the thumb
        const s = this.shape;
        const g = this.ctx;
        this.low.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(this.world.rgba.buffer), BW, BH), 0, 0);
        g.clearRect(0, 0, s.W, s.H);
        g.save();
        g.beginPath();
        g.roundRect((s.W - s.pillW) / 2, (s.H - s.pillH) / 2, s.pillW, s.pillH, s.pillH / 2);
        g.fillStyle = this.world.dark > 0.5 ? '#0e0e16' : '#eee8db';
        g.fill();
        g.beginPath();
        g.roundRect((s.W - s.winW) / 2, (s.H - s.winH) / 2, s.winW, s.winH, s.winH / 2);
        g.clip();
        g.imageSmoothingEnabled = false;
        g.drawImage(this.low, s.ox, s.H - s.oy, BW * s.k, BH * s.k);
        g.restore();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath();
        g.arc(s.W / 2 + (this.x - 0.5) * s.travel, s.H / 2, s.lensR, 0, Math.PI * 2);
        g.fill();
      }

      // ---- Loop
      wake() {
        if (this.raf || !this.visible || document.hidden) return;
        this.last = performance.now();
        this.raf = requestAnimationFrame((t) => this.frame(t));
      }

      frame(now) {
        this.raf = 0;
        if (!this.visible || document.hidden) return;
        const dt = Math.min((now - this.last) / 1000, 1 / 20);
        this.last = now;
        const calm = this.calm.matches;
        this.time += calm ? 0 : dt;
        this.stepThumb(dt, calm);
        this.emitScrub();
        this.stepWater(dt, calm);

        // World runs at 30 Hz. The lens and the glass run at display rate.
        this.accum += dt;
        let paint = this.drag || this.moving || Math.abs(this.stretch) > 0.002 || Math.abs(this.liftTarget - this.lift) > 0.002;
        const hour = this.hour();
        if (this.dirty || (this.accum >= 1 / 30 && (!calm || hour !== this.tickedHour))) {
          const step = Math.min(this.accum, 0.1);
          this.accum = 0;
          this.tickedHour = hour;
          this.world.tick(step, hour, { calm, hurry: this.hurry });
          this.uploadWorld();
          this.dirty = false;
          paint = true;
        }
        if (paint) this.draw();
        this.raf = requestAnimationFrame((t) => this.frame(t));
      }

      stepThumb(dt, calm) {
        if (this.drag) {
          const before = this.x;
          const want = clamp(this.drag.want);
          this.x = mix(this.x, want, clamp(dt * 24));
          this.v = (this.x - before) / Math.max(dt, 1 / 240);
        } else if (this.moving) {
          // A third of the original stiffness: the same eased glide, three times as long (about 1.2 s)
          const omega = 13 / 3;
          const zeta = 0.78;
          const acc = omega * omega * (this.target - this.x) - 2 * zeta * omega * this.v;
          this.v += acc * dt;
          this.x += this.v * dt;
          // Bumps off the ends and squashes against them
          if (this.x > 1) {
            this.x = 1;
            this.stretchV -= Math.abs(this.v) * 1.5;
            this.v *= -0.22;
          } else if (this.x < 0) {
            this.x = 0;
            this.stretchV -= Math.abs(this.v) * 1.5;
            this.v *= -0.22;
          }
          if (Math.abs(this.target - this.x) < 0.002 && Math.abs(this.v) < 0.03) {
            if (this.target === 0 || this.target === 1) this.commit(this.target === 1);
            else {
              this.x = this.target;
              this.v = 0;
              this.moving = false;
            }
          }
        } else if (this.x >= 1 && !calm && this.nightHour < 26) {
          // The clock keeps running through the night
          this.nightHour += dt / 90;
        }
        const goal = clamp(Math.abs(this.v) * 0.4);
        this.stretchV += (190 * (goal - this.stretch) - 13 * this.stretchV) * dt;
        this.stretch += this.stretchV * dt;
        this.lift += (this.liftTarget - this.lift) * clamp(dt * 14);
        this.hurry = Math.max(this.hurry - dt * 1.4, clamp(Math.abs(this.v) * 0.6));
      }

      stepWater(dt, calm) {
        if (!this.gl || !this.shape) return;
        const s = this.shape;
        // Wipe under the lens, drying back over a few seconds
        const lc = (this.x - 0.5) * s.travel;
        const span = s.lensR * 1.02;
        for (let i = 0; i < 64; i++) {
          const px = ((i + 0.5) / 64 - 0.5) * s.W;
          const covered = Math.abs(px - lc) < span ? 1 : 0;
          const next = Math.max(this.wipe[i] - dt * 255 * 0.14, covered * 255);
          this.wipe[i] = next;
        }
        if (!calm) {
          const rain = this.world.glass;
          for (const d of this.runners) {
            if (d.r <= 0) {
              d.wait -= dt;
              if (d.wait <= 0 && rain > 0.3 && scene.glass === 'rain') {
                d.r = 1.6 + Math.random() * 2.2;
                d.x = (Math.random() - 0.5) * 1.8;
                d.y = 1;
                d.v = 0;
                d.stick = 0;
              }
              continue;
            }
            // Stick, then slip
            d.stick -= dt;
            if (d.stick <= 0) {
              d.v = 0.12 + Math.random() * 0.5;
              d.stick = 0.2 + Math.random() * 0.9;
            }
            d.v *= Math.exp(-dt * 2.6);
            d.y -= d.v * dt;
            d.x += Math.sin(d.y * 19 + d.r * 7) * dt * 0.01;
            if (d.y < -1.1) {
              d.r = 0;
              d.wait = 1 + Math.random() * 5;
            }
          }
        }
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.texWipe);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.RED, gl.UNSIGNED_BYTE, this.wipe);
        gl.activeTexture(gl.TEXTURE0);
      }

      // ---- Input
      bindInput() {
        const b = this.button;
        let suppressClick = 0;
        let hovering = false;
        const hover = (on) => (e) => {
          if (e.pointerType !== 'mouse') return;
          hovering = on;
          if (!this.drag) this.liftTarget = on ? 0.35 : 0;
          this.wake();
        };
        b.addEventListener('pointerenter', hover(true));
        b.addEventListener('pointerleave', hover(false));
        b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          this.beginTravel();
          this.moving = false;
          this.drag = { id: e.pointerId, start: e.clientX, from: this.x, want: this.x, moved: false, lastX: e.clientX, lastT: performance.now(), speed: 0 };
          this.liftTarget = 1;
          try {
            b.setPointerCapture(e.pointerId);
          } catch {
            /* still get moves without capture */
          }
          this.wake();
        });
        b.addEventListener('pointermove', (e) => {
          const d = this.drag;
          if (!d || e.pointerId !== d.id) return;
          const dx = e.clientX - d.start;
          if (Math.abs(dx) > 3) d.moved = true;
          d.want = d.from + dx / Math.max(this.shape.travelCss, 1);
          const now = performance.now();
          const ms = Math.max(now - d.lastT, 4);
          const speed = (e.clientX - d.lastX) / Math.max(this.shape.travelCss, 1) / (ms / 1000);
          d.speed = d.speed * 0.6 + speed * 0.4;
          d.lastX = e.clientX;
          d.lastT = now;
          if (Math.abs(d.speed) > 3.2) this.world.startle();
        });
        const release = (e) => {
          const d = this.drag;
          if (!d || e.pointerId !== d.id) return;
          this.drag = null;
          this.liftTarget = hovering ? 0.35 : 0;
          if (d.moved) {
            suppressClick = performance.now() + 300;
            this.target = this.x + d.speed * 0.09 >= 0.5 ? 1 : 0;
            this.v = clamp(d.speed, -3, 3);
            this.moving = true;
          }
          this.wake();
        };
        b.addEventListener('pointerup', release);
        b.addEventListener('pointercancel', release);
        b.addEventListener('lostpointercapture', release);
        b.addEventListener('click', () => {
          if (performance.now() < suppressClick) return;
          this.beginTravel();
          this.target = (this.moving ? this.target >= 0.5 : this.x >= 0.5) ? 0 : 1;
          this.moving = true;
          this.wake();
        });
        b.addEventListener('keydown', (e) => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0;
          const end = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null;
          if (!step && end === null) return;
          e.preventDefault();
          if (step) {
            // Arrows work the clock directly: left is earlier, right is later. Mid-way through dawn the hours can't switch without a jump.
            if (this.branch === 'am' && this.moving) return;
            this.branch = 'pm';
            this.target = clamp((this.moving ? this.target : this.x) + step);
          } else {
            this.beginTravel();
            this.target = end;
          }
          this.moving = true;
          this.wake();
        });
      }
    }

    if (!customElements.get(tag)) customElements.define(tag, CitySwitch);
    return CitySwitch;
  };

  // ---- Readout: the clock, city and phase under a switch, as a small pixel LCD.
  //   <city-readout city="Gliwice"></city-readout>    follows the switch just before it
  //   <city-readout for="some-id"> or el.switch = s   follows another switch
  // Size and type follow custom properties, so pages keep their own layout:
  //   --readout-gap, --readout-padding, --readout-max-width, --readout-clock-font,
  //   --readout-clock-spacing, --readout-place-font, --readout-place-case, --readout-place-spacing
  const READOUT_CSS = `
:host {
  display: flex; align-items: baseline; justify-content: center; gap: var(--readout-gap, 20px);
  max-width: var(--readout-max-width, calc(100vw - 48px)); padding: var(--readout-padding, 12px 16px); box-sizing: border-box;
  color: #f6f2e9; background-color: #0e1a22;
  background-image: repeating-linear-gradient(0deg, #ffffff07 0 1px, transparent 1px 3px), linear-gradient(#16262f, #0b151c);
  box-shadow: 0 -3px 0 0 #050d13, 0 3px 0 0 #050d13, -3px 0 0 0 #050d13, 3px 0 0 0 #050d13,
    inset 0 3px 0 #ffffff12, inset 3px 0 0 #ffffff0a, inset 0 -3px 0 #00000059, inset -3px 0 0 #00000038;
}
:host([hidden]) { display: none; }
.clock {
  position: relative; z-index: 0; font: var(--readout-clock-font, 500 44px/1.1 ui-monospace, "SF Mono", Menlo, monospace);
  font-variant-numeric: tabular-nums; letter-spacing: var(--readout-clock-spacing, -.01em);
  color: var(--led, #f3ecd8); text-shadow: 2px 2px 0 #03080c; white-space: nowrap;
}
/* Unlit segments behind the digits, like a pocket LCD */
.clock::before { content: '88:88'; position: absolute; inset: 0; z-index: -1; color: #fff; opacity: .06; text-shadow: none; }
.colon { animation: colon 1.2s steps(1) infinite; }
@keyframes colon { 50% { opacity: .25; } }
.place { font: var(--readout-place-font, inherit); font-size: var(--readout-place-size, 15px); text-transform: var(--readout-place-case, none); letter-spacing: var(--readout-place-spacing, normal); }
b { display: block; font-weight: 600; text-shadow: 1px 1px 0 #03080c; }
.phase { position: relative; color: #c6d1d5; }
/* A pixel lamp in the gap before the phase, lit in the colour of the hour */
.phase::before { content: ''; position: absolute; left: -12px; top: 50%; width: 6px; height: 6px; margin-top: -3px; background: var(--led, #f3ecd8); box-shadow: 0 0 0 1px #03080c; }
@media (prefers-reduced-motion: reduce) { .colon { animation: none; } }
`;
  const phaseOf = (h) => (h >= 5 && h < 7 ? 'Dawn' : h >= 7 && h < 10 ? 'Morning' : h >= 10 && h < 16 ? 'Daytime' : h >= 16 && h < 18 ? 'Golden hour' : h >= 18 && h < 19.5 ? 'Signs coming on' : 'Night');
  class CityReadout extends HTMLElement {
    static get observedAttributes() { return ['city', 'for']; }
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${READOUT_CSS}</style><span class="clock" part="clock">12:00</span><span class="place" part="place"><b part="city"></b><span class="phase" part="phase">Daytime</span></span>`;
      this.clock = root.querySelector('.clock');
      this.cityName = root.querySelector('b');
      this.phase = root.querySelector('.phase');
      this.onScrub = (event) => this.show(event.detail);
    }
    connectedCallback() {
      // The switch announces its state itself; the readout is decoration
      this.setAttribute('aria-hidden', 'true');
      if (!this._switch) this.switch = this.hasAttribute('for') ? document.getElementById(this.getAttribute('for')) : this.previousElementSibling;
    }
    attributeChangedCallback(name, before, value) {
      if (name === 'city') this.cityName.textContent = value || '';
      else if (this.isConnected) this.switch = document.getElementById(value);
    }
    get switch() { return this._switch || null; }
    set switch(element) {
      this._switch?.removeEventListener('scrub', this.onScrub);
      this._switch = element || null;
      if (!element) return;
      element.addEventListener('scrub', this.onScrub);
      // Ask a switch that is already running for its current hour
      if (typeof element.emitScrub === 'function') { element.lastHour = undefined; element.emitScrub(); }
    }
    show({ hour, dark }) {
      const hh = String(Math.floor(hour)).padStart(2, '0'), mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
      if (this.clock.dataset.time !== hh + mm) {
        this.clock.dataset.time = hh + mm;
        this.clock.innerHTML = `${hh}<span class="colon">:</span>${mm}`;
      }
      this.phase.textContent = phaseOf(hour);
      // Cream by day, amber by night, as rgb() so contrast checks can read it
      const led = [[243, 255], [236, 201], [216, 106]].map(([day, night]) => Math.round(day + (night - day) * dark));
      this.style.setProperty('--led', `rgb(${led.join(', ')})`);
    }
  }
  if (!customElements.get('city-readout')) customElements.define('city-readout', CityReadout);

  window.CitySwitch = { define, PAD_X, PAD_Y, BW, BH, BAYER, clamp, mix, smooth, rng };
})();
