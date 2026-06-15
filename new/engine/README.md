# @jigsaw/engine

Industrial-grade jigsaw puzzle rendering engine. WebGL2 + TypeScript.

This package implements **Part 4 (Rendering & Theme)** and **Part 7 (Piece /
Group / Knife / Puzzle)** of the puzzle engine.

Other parts (multiplayer, UI toolbar, save/restore, applause) are out of
scope for this package and will be added incrementally.

## Install

```bash
npm install
```

## Demos

```bash
npm run dev
# open http://localhost:5173
```

Two demos are included:

- **`examples/theme-flyer/`** — Floating tiles + theme switching + context
  loss recovery. Demonstrates the rendering kernel.
- **`examples/puzzle-demo/`** — A real, playable jigsaw puzzle. Drop pieces
  near each other and they snap. Toggle "Rotatable" to enable scroll-to-rotate.

## Build

```bash
npm run build      # type-check + bundle
npm run preview    # serve the production build
```

## Test

```bash
npm test
npm run test:watch
```

## Architecture

```
src/
  core/        # Engine, Projector, Context, Clock, Errors
  math/        # Vec2, Mat3, Color, AABB, Easing
  reactive/    # Sym, Variant, StateCell
  gl/          # WebGL2 plumbing
    shaders/   # GLSL sources (raw text imports)
  scene/       # Clip, Clips, PosPoint, Piece, Group, Subject, Puzzle, Knife, layers
  tween/       # Tweener2 + updateTweeners
  theme/       # 12 preset themes, reactive state
  utils/       # List (linked list), random, log, web-req
```

### Vertex layout (15 floats / 60 bytes per vertex)

| Offset | Field   | Notes                              |
|--------|---------|------------------------------------|
| 0–1    | pos.xy  | unit quad corner (-1..1)           |
| 2–3    | scale.xy| width/height in OGL units          |
| 4–5    | trans.xy| OGL translation                    |
| 6–7    | rot.xy  | (cos θ, sin θ)                     |
| 8      | state   | free slot                          |
| 9      | color   | free slot                          |
| 10     | opacity | 0..1                               |
| 11–12  | tex0.uv | image UV                           |
| 13–14  | tex1.uv | mask UV                            |

6 vertices per quad, 90 floats per quad. Two VBO buffers ping-pong on
commit.

## Public API (selected)

```ts
import {
  Engine,
  Clip,
  ThemeState,
  THEME_PRESETS,
  Tweener2,
  EASE_IN_OUT,
  injectTheme,
  Puzzle,
  Knife,
  Animator,
  type Theme,
  type InputEvent,
} from '@jigsaw/engine';

// Theme + rendering kernel
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const engine = new Engine(canvas, { layers: 5, clearColor: '#7390aa' });
engine.projector.attachContextLossHandlers();
engine.setInputHandler((e) => puzzle.handleEvent(e));

// Build a playable puzzle
const image = makeImage(); // HTMLCanvasElement
const puzzle = new Puzzle(engine, {
  source: image,
  rows: 3,
  cols: 3,
  rotatable: true,
});

// Theme
ThemeState.val.addListener((t) => injectTheme(t, document.documentElement));
ThemeState.val.val = THEME_PRESETS.coral;

engine.projector.start();
```

## Status

| Milestone | Status | Description |
|-----------|--------|-------------|
| M0 scaffold      | ✅ | Vite + TS strict + ESLint + Prettier |
| M1 math/reactive  | ✅ | Vec2, Mat3, Color, AABB, Easing, Sym, Variant, StateCell, List |
| M2 GL/Shader      | ✅ | WebGL2 context, Shader compile/link, 3 default shaders |
| M3 VertexManager  | ✅ | 15-float quad layout, dual VBO ping-pong |
| M4 Texture pool   | ✅ | Reference counting, reinit on context restore |
| M5 Clip/Clips     | ✅ | 5 layers, draw run merging, hit testing |
| M6 PosPoint/Tweener2 | ✅ | 6 eases, state machine, extend/kill/finish |
| M7 Animator       | ✅ | Sprite-frame animation (autoStart/stop/tick/dispose) |
| M8 Projector      | ✅ | RAF loop, benchmark, task queue, context loss |
| M9 Theme          | ✅ | 12 presets, Variant, CSS injection |
| M10 Theme Demo    | ✅ | `examples/theme-flyer/` |
| Part 7 Piece      | ✅ | State machine (F/H/q/W), variant state, neighbor wiring |
| Part 7 Group      | ✅ | join/absorb/translate, edge counting |
| Part 7 Knife      | ✅ | 4 templates (sock/finger/ball/stub), 30 tab orientations, 36 shape combos, rectangular mask v1 |
| Part 7 Subject    | ✅ | Image load + auto-scale to fit canvas |
| Part 7 Puzzle     | ✅ | PS_* state machine, scatter, showEdgesOnly, handleEvent, completion check |
| Part 7 Demo       | ✅ | `examples/puzzle-demo/` — playable 3x3 (configurable) |

## Next steps

- Shaped (non-rectangular) mask rendering in `buildMask`
- Wheel/scroll-rotate handling in `Piece.handleEvent` (toggle via Puzzle.rotatable)
- Save/restore via `puzzleRecord` (in design)
- Photon multiplayer
- Niftybar UI
- Audio (Sonic / SonicH5)
