# Zabrze switch

Contemporary Zabrze in a pixel-art day/night switch: the restored Carboneum water tower and its modern glass lift, Strefa Carnall visitor heritage, the modern Arena Zabrze exterior, and Dom Muzyki i Tańca.

[Live demo](https://preacherxp.github.io/zabrze-switch/)

The scene is a compressed panorama of locations across the city. It portrays present-day tourism, culture, football and everyday public space. The heritage headframe stays still; visitors, a cyclist and the modern lift bring the scene to life.

## Research

[The source-cited research note](RESEARCH.md) records official venue and city references, inspected photographs, current visitor roles, addresses, architectural geometry and the limits of the available images. No stadium capacity or future completed-stand configuration is asserted. Night lighting schedules are artistic.

## Run and validate

```sh
python3 -m http.server 8000
node test-scene.cjs
```

Open http://localhost:8000. No build or runtime dependencies are required. See [AGENTS.md](AGENTS.md) for real-browser composition and interaction checks.

## Embed

```html
<script src="city-switch.js"></script>
<script src="zabrze.js"></script>
<zabrze-switch style="display: block; width: min(680px, 100%);"></zabrze-switch>
```

Drag through the hours, tap or press Space to toggle, or use arrow keys. The API exposes `checked`, `position`, and `jump(night)`. `change` supplies `detail.night`; `scrub` supplies `position`, `hour`, and `dark`.

GitHub Pages serves `/` from `main`.

## Attribution

The engine is derived from `tokyo-switch.js`; the original idea is “住人のいるスイッチ” by @Lattice_Node ([original project](https://ludion.ai/p/toggle-daylight), MIT), as credited in the engine source. Research photographs are drawing references and are not redistributed.
