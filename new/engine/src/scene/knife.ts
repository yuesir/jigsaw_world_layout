/**
 * Knife — jigsaw shape templates and the cut algorithm.
 *
 * The Knife takes a Subject (puzzle image) and a {rows, cols, size} spec
 * and produces a list of PieceSpec objects, each with:
 *   - image bounds (within the subject)
 *   - tab/hole orientation for each of the 4 edges
 *   - tab/hole height
 *   - shape descriptor (which template + bend)
 *
 * Then `buildMask` renders the actual mask canvas used by the Piece shader
 * for shaped rendering.
 *
 * The shape data is taken verbatim from the original jigex-prog.js. Each
 * template defines 6 quadratic Bezier segments (12 control points) that
 * describe one side of a tab or hole. The tab is mirrored to form a hole
 * (ptsReversed). 4 templates × 4 sides = the full shape vocabulary.
 */
import { log } from '../utils/log';
import { Sym } from '../reactive/sym';

/* ——— Sym layer registry ——— */

const LAYER_GROUP = 'knifeLayers';
['pieces-layer', 'bkgd-layer', 'bottom-layer', 'primer-layer', 'top-layer'].forEach((name, i) => {
  Sym.register(name, i, LAYER_GROUP);
});

/** Resolve a layer name to its integer index. */
export function getLayerOrdinal(name: string): number {
  return Sym.get(LAYER_GROUP, name)?.ordinal ?? 0;
}

/* ——— Shape control points ——— */

/**
 * 12 control points per template = 6 quadratic Bezier segments that trace
 * one side of a tab. `fromBase` is the perpendicular offset (normalized,
 * 0..1 of base length), `alongBase` is the position along the base
 * (0..1, 0 = start, 1 = end).
 *
 * `pts`        — tab going outward
 * `ptsReversed`— same shape, mirrored inward (used for holes)
 */
type Template = {
  name: string;
  pts: ReadonlyArray<{ fromBase: number; alongBase: number }>;
  ptsReversed: ReadonlyArray<{ fromBase: number; alongBase: number }>;
  /** Per-side measured tab heights, cached. Keyed by side then base size. */
  tabHeights: number[][];
  holeHeights: number[][];
};

const POINTS_PER_TEMPLATE = 12;

function makeTemplate(name: string, pts: number[], rev: number[]): Template {
  const p: { fromBase: number; alongBase: number }[] = [];
  for (let i = 0; i < POINTS_PER_TEMPLATE; i++) {
    p.push({ fromBase: pts[i * 2]!, alongBase: pts[i * 2 + 1]! });
  }
  const r: { fromBase: number; alongBase: number }[] = [];
  for (let i = 0; i < POINTS_PER_TEMPLATE; i++) {
    r.push({ fromBase: rev[i * 2]!, alongBase: rev[i * 2 + 1]! });
  }
  return { name, pts: p, ptsReversed: r, tabHeights: [[], [], [], []], holeHeights: [[], [], [], []] };
}

/* "sock" template — flat tab with two small bumps */
const TEMPLATE_SOCK = makeTemplate(
  'sock',
  [
    0.0113636363636364, 0.0946969696969697, -0.0303030303030303, 0.227272727272727,
    -0.117424242424242, 0.537878787878788, 0.132575757575758, 0.382575757575758,
    0.34469696969697, 0.284090909090909, 0.268939393939394, 0.541666666666667,
    0.208333333333333, 0.681818181818182, 0.0568181818181818, 0.575757575757576,
    -0.0795454545454545, 0.515151515151515, -0.0189393939393939, 0.761363636363636,
    0.0113636363636364, 0.90530303030303, 0, 1,
  ],
  [
    0.0113636363636364, -0.0946969696969697, -0.0189393939393939, -0.238636363636364,
    -0.0795454545454545, -0.484848484848485, 0.0568181818181818, -0.424242424242424,
    0.208333333333333, -0.318181181181181, 0.268939393939394, -0.458333333333333,
    0.34469696969697, -0.715909090909091, 0.132575757575758, -0.617424242424242,
    -0.117424242424242, -0.462121212121212, -0.0303030303030303, -0.772727272727273,
    0.0113636363636364, -0.90530303030303, 0, -1,
  ],
);

/* "finger" template — symmetric bump */
const TEMPLATE_FINGER = makeTemplate(
  'finger',
  [
    0, 0.0492424242424242, -0.0227272727272727, 0.159090909090909,
    -0.0681818181818182, 0.545454545454545, 0.125, 0.412878787878788,
    0.34469696969697, 0.253787878787879, 0.272727272727273, 0.473484848484849,
    0.238636363636364, 0.553030303030303, 0.121212121212121, 0.549242424242424,
    -0.109848484848485, 0.5, -0.0189393939393939, 0.761363636363636,
    0.0113636363636364, 0.90530303030303, 0, 1,
  ],
  [
    0.0113636363636364, -0.0946969696969697, -0.0189393939393939, -0.238636363636364,
    -0.109848484848485, -0.5, 0.121212121212121, -0.450757575757576,
    0.238636363636364, -0.446969696969697, 0.272727272727273, -0.526515151515151,
    0.34469696969697, -0.746212121212121, 0.125, -0.587121212121212,
    -0.0681818181818182, -0.454545454545455, -0.0227272727272727, -0.840909090909091,
    0, -0.950757575757576, 0, -1,
  ],
);

/* "ball" template — round knob */
const TEMPLATE_BALL = makeTemplate(
  'ball',
  [
    -0.00378787878787879, 0.0643939393939394, -0.0265151515151515, 0.162878787878788,
    -0.0984848484848485, 0.534090909090909, 0.0568181818181818, 0.431818181818182,
    0.287878787878788, 0.265151515151515, 0.295454545454545, 0.5,
    0.287878787878788, 0.715909090909091, 0.0568181818181818, 0.575757575757576,
    -0.0795454545454545, 0.515151515151515, -0.0189393939393939, 0.761363636363636,
    0.0113636363636364, 0.90530303030303, 0, 1,
  ],
  [
    0.0113636363636364, -0.0946969696969697, -0.0189393939393939, -0.238636363636364,
    -0.0795454545454545, -0.484848484848485, 0.0568181818181818, -0.424242424242424,
    0.287878787878788, -0.284090909090909, 0.295454545454545, -0.5,
    0.287878787878788, -0.734848484848485, 0.0568181818181818, -0.568181818181818,
    -0.0984848484848485, -0.465909090909091, -0.0265151515151515, -0.837121212121212,
    -0.00378787878787879, -0.935606060606061, 0, -1,
  ],
);

/* "stub" template — short asymmetric bump */
const TEMPLATE_STUB = makeTemplate(
  'stub',
  [
    0.00757575757575758, 0.0946969696969697, -0.0492424242424242, 0.21969696969697,
    -0.117424242424242, 0.397727272727101, 0.0189393939393114, 0.378787878787097,
    0.234848484848119, 0.363636363636116, 0.151515151515102, 0.617424242424111,
    0.109848484848083, 0.708333333333032, -0.01515151515151, 0.617424242424097,
    -0.181818181818111, 0.518939393939082, -0.0303030303030032, 0.837121212121097,
    0.0037878787878711, 0.909090909090105, 0, 1,
  ],
  [
    0.00378787878787108, -0.0909090909090111, -0.0303030303030114, -0.162878787878097,
    -0.181818181818067, -0.481060606060032, -0.015151515151505, -0.382575757575049,
    0.109848484848048, -0.29166666666605, 0.151515151515032, -0.382575757575169,
    0.234848484848032, -0.636363636363116, 0.0189393939393104, -0.621212121212103,
    -0.117424242424105, -0.602272727272114, -0.0492424242424121, -0.78030303030112,
    0.00757575757575111, -0.90530303030067, 0, -1,
  ],
);

export const TEMPLATES: Record<string, Template> = {
  sock: TEMPLATE_SOCK,
  finger: TEMPLATE_FINGER,
  ball: TEMPLATE_BALL,
  stub: TEMPLATE_STUB,
};

/* ——— Tab / hole orientation lookup ——— */

/**
 * 30-entry lookup. Each entry is 0 (tab) or 1 (hole) for one of the 4 sides
 * of a piece — combined they define the silhouette of one side of the
 * jigsaw. Indexing: piece index modulo 30 × 4.
 */
const TAB_HOLE_PATTERN: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1],
  [0, 0, 1, 1], [1, 1, 0, 0], [0, 1, 0, 0], [1, 0, 1, 1],
  [0, 0, 0, 1], [1, 1, 1, 0], [0, 1, 1, 1], [1, 0, 0, 0],
  [1, 0, 1, 1], [0, 1, 0, 0], [1, 1, 0, 1], [0, 0, 1, 0],
  [1, 0, 0, 0], [0, 1, 1, 1], [1, 1, 1, 1], [0, 0, 0, 0],
  [0, 1, 0, 1], [1, 0, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1],
  [0, 0, 1, 1], [1, 1, 0, 0], [0, 1, 0, 0], [1, 0, 1, 1],
  [0, 0, 0, 1], [1, 1, 1, 0],
];

export function tabHoleAt(orientationIndex: number, side: 0 | 1 | 2 | 3): boolean {
  const entry = TAB_HOLE_PATTERN[orientationIndex % TAB_HOLE_PATTERN.length]!;
  return entry[side] === 0; // 0 = tab (protrudes), 1 = hole (recess)
}

/* ——— Shape combination table ——— */

/**
 * 36-entry table of {template, bend} combinations.
 * shapeIndex modulo 36 selects one. The bend flag determines which
 * pts/ptsReversed set is used.
 */
const SHAPE_TABLE: ReadonlyArray<{ template: keyof typeof TEMPLATES; bend: boolean }> = [
  { template: 'ball',  bend: false }, { template: 'ball',  bend: true  },
  { template: 'finger', bend: false }, { template: 'finger', bend: true  },
  { template: 'stub', bend: false },  { template: 'stub', bend: true  },
  { template: 'sock',  bend: false },
  // remaining 29 fall back to sock with the corresponding parity
];

function shapeFor(ord: number): { template: Template; bend: boolean } {
  if (ord < 0) ord = 0;
  const idx = ord % 36;
  if (idx < SHAPE_TABLE.length) {
    const e = SHAPE_TABLE[idx]!;
    return { template: TEMPLATES[e.template]!, bend: e.bend };
  }
  return { template: TEMPLATE_SOCK, bend: idx % 2 === 1 };
}

/* ——— PieceSpec ——— */

export interface EdgeSpec {
  side: 0 | 1 | 2 | 3;     // 0=left, 1=bottom, 2=right, 3=top
  border: boolean;          // edge of the puzzle (no neighbor)
  tab: boolean;             // 0=tab (protrudes), 1=hole (recess)
  thickness: number;        // measured/lookup height
  bend: boolean;            // which side of the template
  curves: Template;
}

export interface PieceSpec {
  id: number;                // 1-based
  name: string;
  layer: number;             // layer ordinal
  image: { data: HTMLCanvasElement; bounds: { x: number; y: number; width: number; height: number; margin: number } };
  core: { x: number; y: number; width: number; height: number };
  refPos: { x: number; y: number };
  edges: { top: EdgeSpec; right: EdgeSpec; bottom: EdgeSpec; left: EdgeSpec };
  sortOrder: number;         // for scatter order
  initialAngle: number;
  shadowDepth: number;
  bevelDepth: number;
  shader: null;              // filled by Puzzle at cut() time
}

/* ——— Mask building ——— */

/**
 * Draw one edge of a piece onto the canvas context.
 *
 *   - border: straight `lineTo` to the endpoint
 *   - tab/hole: 6 quadratic Bezier segments (12 control points) that
 *     protrude outward (tab) or recede inward (hole) along the side
 *
 * Multipliers `s` and `l` are taken verbatim from the original jigex-prog.js
 * algorithm; they encode the (side × bend × tab/hole) sign convention so
 * the same `pts` / `ptsReversed` data can be reused for all 4 sides.
 */
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: EdgeSpec,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  if (edge.border) {
    ctx.lineTo(endX, endY);
    return;
  }
  const isVertical = startX === endX;
  const d = isVertical ? Math.abs(startY - endY) : Math.abs(startX - endX);
  // pts vs ptsReversed: the original swaps based on bend
  const pts = edge.bend ? edge.curves.pts : edge.curves.ptsReversed;

  // s: perpendicular sign (tab outward / hole inward)
  // l: along-base sign (depends on direction of travel)
  let s: number;
  let l: number;
  switch (edge.side) {
    case 0:
      s = edge.tab ? -1 : 1;
      l = edge.bend ? 1 : -1;
      break;
    case 1:
      s = edge.tab ? 1 : -1;
      l = edge.bend ? 1 : -1;
      break;
    case 2:
      s = edge.tab ? 1 : -1;
      l = edge.bend ? -1 : 1;
      break;
    case 3:
      s = edge.tab ? -1 : 1;
      l = edge.bend ? -1 : 1;
      break;
  }

  for (let p = 0; p < pts.length; ) {
    const r = pts[p++]!;
    const a = pts[p++]!;
    let ctrlX: number;
    let ctrlY: number;
    let endCx: number;
    let endCy: number;
    if (isVertical) {
      ctrlX = startX + d * r.fromBase * s;
      ctrlY = startY + d * r.alongBase * l;
      endCx = startX + d * a.fromBase * s;
      endCy = startY + d * a.alongBase * l;
    } else {
      ctrlX = startX + d * r.alongBase * l;
      ctrlY = startY + d * r.fromBase * s;
      endCx = startX + d * a.alongBase * l;
      endCy = startY + d * a.fromBase * s;
    }
    ctx.quadraticCurveTo(ctrlX, ctrlY, endCx, endCy);
  }
}

/**
 * Render the mask for all pieces onto a single canvas.
 *
 * The mask is white inside each piece (including any protruding tab) and
 * black elsewhere. The Piece shader uses the red channel of this mask as
 * the alpha multiplier when rendering shaped sprites.
 *
 * Each piece is drawn at its **core** position (the rectangle that excludes
 * tab extensions). The piece's image bounds is offset from the core by the
 * edge thicknesses, computed in cutSpecs.
 *
 *   mask coordinates of piece core top-left = (image.bounds.x + image.bounds.margin,
 *                                              image.bounds.y + image.bounds.margin)
 *
 * For border edges (puzzle perimeter), drawEdge performs a straight lineTo.
 * For internal edges, drawEdge traces 6 quadratic Beziers using the curve
 * template's `pts` or `ptsReversed` data.
 */
export function buildShapedMask(
  specs: PieceSpec[],
  _rows: number,
  _cols: number,
  _size: number,
  margin: number,
): HTMLCanvasElement {
  // Compute total canvas extents.
  let maxX = 0;
  let maxY = 0;
  for (const s of specs) {
    maxX = Math.max(maxX, s.image.bounds.x + s.image.bounds.width);
    maxY = Math.max(maxY, s.image.bounds.y + s.image.bounds.height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = maxX + margin * 2;
  canvas.height = maxY + margin * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw each piece in turn.
  for (const spec of specs) {
    const coreX = spec.image.bounds.x + margin;
    const coreY = spec.image.bounds.y + margin;
    const coreW = spec.core.width;
    const coreH = spec.core.height;
    const left = spec.edges.left;
    const bottom = spec.edges.bottom;
    const right = spec.edges.right;
    const top = spec.edges.top;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    // Traverse counter-clockwise starting at top-left of core, matching
    // the original jigex-prog.js: left → bottom → right → top.
    ctx.moveTo(coreX, coreY);
    // left: (coreX, coreY) → (coreX, coreY+coreH)
    drawEdge(ctx, left, coreX, coreY, coreX, coreY + coreH);
    // bottom: (coreX, coreY+coreH) → (coreX+coreW, coreY+coreH)
    drawEdge(ctx, bottom, coreX, coreY + coreH, coreX + coreW, coreY + coreH);
    // right: (coreX+coreW, coreY+coreH) → (coreX+coreW, coreY)
    drawEdge(ctx, right, coreX + coreW, coreY + coreH, coreX + coreW, coreY);
    // top: (coreX+coreW, coreY) → (coreX, coreY)
    drawEdge(ctx, top, coreX + coreW, coreY, coreX, coreY);
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

/**
 * Render a SIMPLE rectangular mask (no tabs). Kept for testing and as
 * a fallback when the shaped algorithm produces degenerate output.
 */
export function buildRectangularMask(
  specs: PieceSpec[],
  _rows: number,
  _cols: number,
  _size: number,
  margin: number,
): HTMLCanvasElement {
  let maxX = 0;
  let maxY = 0;
  for (const s of specs) {
    maxX = Math.max(maxX, s.image.bounds.x + s.image.bounds.width);
    maxY = Math.max(maxY, s.image.bounds.y + s.image.bounds.height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = maxX + margin * 2;
  canvas.height = maxY + margin * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (const s of specs) {
    const b = s.image.bounds;
    ctx.fillRect(b.x, b.y, b.width, b.height);
  }
  return canvas;
}

/**
 * Cut a Subject into PieceSpec[]. Each spec describes a single piece; the
 * caller is responsible for instantiating Piece objects and registering
 * them with the engine.
 *
 * The mask is rendered separately by `buildRectangularMask` (or a future
 * shaped variant) and uploaded as a Texture.
 */
export function cutSpecs(
  subject: { image: HTMLCanvasElement; width: number; height: number; name: string },
  rows: number,
  cols: number,
  size: number,
  shapeIndex: number,
  tabIndexRight: number,
  tabIndexBottom: number,
  shadowDepth = 3,
  bevelDepth = 2,
): { specs: PieceSpec[]; totalWidth: number; totalHeight: number } {
  const margin = 7;
  const W = subject.width;
  const H = subject.height;
  const specs: PieceSpec[] = [];
  // Bounding box for each piece (in subject pixel space).
  const widths: number[] = new Array(cols);
  const heights: number[] = new Array(rows);
  for (let c = 0; c < cols; c++) widths[c] = size;
  for (let r = 0; r < rows; r++) heights[r] = size;
  // Distribute leftover pixels (if W/H not divisible by size).
  let leftoverX = W - size * cols;
  let leftoverY = H - size * rows;
  // Add one extra pixel to the first leftoverX pieces.
  for (let i = 0; leftoverX > 0 && i < cols; i++, leftoverX--) widths[i]!++;
  for (let i = 0; leftoverY > 0 && i < rows; i++, leftoverY--) heights[i]!++;

  // Layout positions.
  const xs: number[] = new Array(cols);
  const ys: number[] = new Array(rows);
  let xCursor = 0;
  for (let c = 0; c < cols; c++) {
    xs[c] = xCursor;
    xCursor += widths[c]!;
  }
  let yCursor = 0;
  for (let r = 0; r < rows; r++) {
    ys[r] = yCursor;
    yCursor += heights[r]!;
  }

  // Determine tab/hole orientation for each piece.
  let tabR = tabIndexRight;
  let tabB = tabIndexBottom;
  const shape = shapeFor(shapeIndex);
  setCurrentSize(size);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c + 1;
      const w = widths[c]!;
      const h = heights[r]!;
      const x = xs[c]!;
      const y = ys[r]!;

      // First pass: placeholders (border edges) — we'll fix non-border edges below.
      const top: EdgeSpec = isBorder(r, rows, 0) ? borderEdge(3) : { ...borderEdge(3), border: false, side: 3 as const };
      const bottom: EdgeSpec = isBorder(r, rows, 1) ? borderEdge(1) : { ...borderEdge(1), border: false, side: 1 as const };
      const left: EdgeSpec = isBorder(c, cols, 0) ? borderEdge(0) : { ...borderEdge(0), border: false, side: 0 as const };
      const right: EdgeSpec = isBorder(c, cols, 1) ? borderEdge(2) : { ...borderEdge(2), border: false, side: 2 as const };

      // Border edges (no neighbor) get assigned from the global tabR sequence.
      if (top.border) {
        top.tab = !!(TAB_HOLE_PATTERN[tabR % TAB_HOLE_PATTERN.length]![3] === 0);
        top.thickness = 0;
        tabR++;
      }
      if (left.border) {
        left.tab = !!(TAB_HOLE_PATTERN[tabB % TAB_HOLE_PATTERN.length]![0] === 0);
        left.thickness = 0;
        tabB++;
      }

      const spec: PieceSpec = {
        id,
        name: `piece-${id}`,
        layer: getLayerOrdinal('pieces-layer'),
        image: {
          data: subject.image,
          bounds: { x, y, width: w + 2 * margin, height: h + 2 * margin, margin },
        },
        core: { x: margin, y: margin, width: w, height: h },
        refPos: { x: x + w / 2, y: y + h / 2 },
        edges: { top, right, bottom, left },
        sortOrder: Math.random(),
        initialAngle: 0,
        shadowDepth,
        bevelDepth,
        shader: null,
      };
      specs.push(spec);
    }
  }

  // Second pass: assign non-border edges by looking at the now-complete neighbors.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = r * cols + c + 1;
      const idx = id - 1;
      const spec = specs[idx]!;

      if (!spec.edges.top.border) {
        const nb = specs[idx - cols];
        if (nb) {
          spec.edges.top = {
            side: 3,
            border: false,
            tab: !nb.edges.bottom.tab,
            thickness: nb.edges.bottom.thickness,
            bend: nb.edges.bottom.bend,
            curves: nb.edges.bottom.curves,
          };
        } else {
          spec.edges.top = borderEdge(3);
        }
      }
      if (!spec.edges.bottom.border) {
        const nb = specs[idx + cols];
        if (nb) {
          spec.edges.bottom = {
            side: 1,
            border: false,
            tab: !nb.edges.top.tab,
            thickness: nb.edges.top.thickness,
            bend: nb.edges.top.bend,
            curves: nb.edges.top.curves,
          };
        } else {
          spec.edges.bottom = borderEdge(1);
        }
      }
      if (!spec.edges.left.border) {
        const nb = specs[idx - 1];
        if (nb) {
          spec.edges.left = {
            side: 0,
            border: false,
            tab: !nb.edges.right.tab,
            thickness: nb.edges.right.thickness,
            bend: nb.edges.right.bend,
            curves: nb.edges.right.curves,
          };
        } else {
          spec.edges.left = borderEdge(0);
        }
      }
      if (!spec.edges.right.border) {
        // Right edge gets a fresh tab from the sequence.
        spec.edges.right = {
          side: 2,
          border: false,
          tab: !!(TAB_HOLE_PATTERN[tabR % TAB_HOLE_PATTERN.length]![2] === 0),
          thickness: Math.round(_currentSize * 0.18),
          bend: shape.bend,
          curves: shape.template,
        };
        tabR++;
      }
    }
  }

  // Normalize sortOrder into [0, 1).
  specs.forEach((s, i) => {
    s.sortOrder = (i / specs.length + Math.random() * 0.1) % 1;
  });

  return {
    specs,
    totalWidth: xCursor + 2 * margin,
    totalHeight: yCursor + 2 * margin,
  };
}

function isBorder(idx: number, max: number, side: 0 | 1): boolean {
  if (side === 0) return idx === 0;
  return idx === max - 1;
}

function borderEdge(side: 0 | 1 | 2 | 3): EdgeSpec {
  return {
    side: side as 0 | 1 | 2 | 3,
    border: true,
    tab: false,
    thickness: 0,
    bend: false,
    curves: TEMPLATE_SOCK,
  };
}

function assignTabEdge(side: 0 | 1 | 2 | 3, tabIdx: number, shape: { template: Template; bend: boolean }): EdgeSpec {
  return {
    side,
    border: false,
    tab: tabHoleAt(tabIdx, side as 0 | 1 | 2 | 3),
    thickness: Math.round(_currentSize * 0.18),
    bend: shape.bend,
    curves: shape.template,
  };
}

function inheritEdge(
  which: 'top' | 'bottom' | 'left' | 'right',
  specs: PieceSpec[],
  cols: number,
  id: number,
  shape: { template: Template; bend: boolean },
): EdgeSpec {
  // Lookup the neighbor's opposite edge.
  const idx = id - 1;
  const neighbor: PieceSpec | undefined =
    which === 'top'    ? specs[idx - cols]  // top piece is id-cols (above)
  : which === 'bottom' ? specs[idx + cols]  // bottom piece
  : which === 'left'   ? specs[idx - 1]
  :                      specs[idx + 1];
  if (!neighbor) {
    return borderEdge(which === 'top' || which === 'left' ? 0 : 1);
  }
  const neighborEdge: EdgeSpec =
    which === 'top'    ? neighbor.edges.bottom
  : which === 'bottom' ? neighbor.edges.top
  : which === 'left'   ? neighbor.edges.right
  :                      neighbor.edges.left;
  return {
    side: which === 'top' ? 3 : which === 'bottom' ? 1 : which === 'left' ? 0 : 2,
    border: false,
    tab: !neighborEdge.tab,
    thickness: neighborEdge.thickness,
    bend: neighborEdge.bend,
    curves: neighborEdge.curves,
  };
}

/* ——— Knife top-level API ——— */

export const Knife = {
  templates: TEMPLATES,
  tabHoleAt,
  cutSpecs,
  buildRectangularMask,
  shapeFor,
  TAB_HOLE_PATTERN,
};

export type { Template };

/** Per-piece size, set by `cutSpecs`. */
let _currentSize = 0;
export function setCurrentSize(s: number): void {
  _currentSize = s;
}
export function getCurrentSize(): number {
  return _currentSize;
}
