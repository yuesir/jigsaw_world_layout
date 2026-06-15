import { describe, it, expect, beforeAll } from 'vitest';
import { Knife, cutSpecs, buildShapedMask, buildRectangularMask, tabHoleAt, TEMPLATES } from '../src/scene/knife';

// Minimal canvas mock — jsdom doesn't implement getContext('2d').
// We track enough state to verify that our drawing functions are invoked
// correctly without doing real rasterization.
interface MockContext {
  _calls: string[];
  fillStyle: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

interface MockCanvas extends HTMLCanvasElement {
  _lastCtx?: MockContext;
}

beforeAll(() => {
  (HTMLCanvasElement.prototype as unknown as { getContext: (k: string) => MockContext | null }).getContext =
    function getContext2DMock(this: MockCanvas, _kind: string): MockContext {
      const ctx: MockContext = {
        _calls: [],
        fillStyle: '#000',
        beginPath() {
          this._calls.push('beginPath');
        },
        moveTo(x: number, y: number) {
          this._calls.push(`moveTo(${x},${y})`);
        },
        lineTo(x: number, y: number) {
          this._calls.push(`lineTo(${x},${y})`);
        },
        quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
          this._calls.push(`qCurveTo(${cx},${cy},${x},${y})`);
        },
        closePath() {
          this._calls.push('closePath');
        },
        fill() {
          this._calls.push('fill');
        },
        fillRect(x: number, y: number, w: number, h: number) {
          this._calls.push(`fillRect(${x},${y},${w},${h})`);
        },
      };
      this._lastCtx = ctx;
      return ctx;
    };
  (HTMLCanvasElement.prototype as unknown as { toDataURL: () => string }).toDataURL =
    function toDataURLMock(this: MockCanvas): string {
      const calls = this._lastCtx?._calls ?? [];
      return `data:image/png;base64,${btoa(calls.join('|')).slice(0, 64)}`;
    };
});

describe('tabHoleAt', () => {
  it('returns boolean from 30-entry pattern', () => {
    for (let i = 0; i < 30; i++) {
      const v = tabHoleAt(i, 0);
      expect(typeof v).toBe('boolean');
    }
  });

  it('wraps around index 30 to start', () => {
    expect(tabHoleAt(0, 0)).toBe(tabHoleAt(30, 0));
    expect(tabHoleAt(7, 2)).toBe(tabHoleAt(37, 2));
  });
});

describe('cutSpecs', () => {
  it('produces the expected number of pieces for 3x3', () => {
    const subject = makeSubject(360, 360);
    const { specs, totalWidth, totalHeight } = cutSpecs(subject, 3, 3, 120, 0, 0, 0);
    expect(specs.length).toBe(9);
    expect(totalWidth).toBeGreaterThan(360);
    expect(totalHeight).toBeGreaterThan(360);
  });

  it('respects leftover distribution', () => {
    const subject = makeSubject(100, 100);
    const { specs } = cutSpecs(subject, 2, 2, 40, 0, 0, 0);
    // 4 pieces, each ~50 wide (since 100 / 2 = 50, no leftover)
    expect(specs.length).toBe(4);
    const widths = specs.map((s) => s.image.bounds.width);
    // All widths should be roughly equal (margin + size)
    const max = Math.max(...widths);
    const min = Math.min(...widths);
    expect(max - min).toBeLessThanOrEqual(14); // 2 * margin tolerance
  });

  it('initializes every piece with edges', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    for (const s of specs) {
      expect(s.edges.top).toBeDefined();
      expect(s.edges.right).toBeDefined();
      expect(s.edges.bottom).toBeDefined();
      expect(s.edges.left).toBeDefined();
      expect(s.id).toBeGreaterThan(0);
      expect(s.name).toMatch(/^piece-\d+$/);
    }
  });

  it('assigns border=true to outer edges', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const topLeft = specs[0]!;
    expect(topLeft.edges.top.border).toBe(true);
    expect(topLeft.edges.left.border).toBe(true);
    expect(topLeft.edges.right.border).toBe(false);
    expect(topLeft.edges.bottom.border).toBe(false);
  });

  it('makes adjacent pieces share tab/hole orientation', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    // Piece 1's right edge is mirrored by piece 2's left edge
    const p1 = specs[0]!;
    const p2 = specs[1]!;
    expect(p1.edges.right.tab).toBe(!p2.edges.left.tab);
  });
});

describe('Knife constants', () => {
  it('exposes 4 templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(['ball', 'finger', 'sock', 'stub']);
    for (const k of Object.keys(TEMPLATES)) {
      const t = TEMPLATES[k as keyof typeof TEMPLATES]!;
      expect(t.pts.length).toBe(12);
      expect(t.ptsReversed.length).toBe(12);
      expect(t.tabHeights.length).toBe(4);
      expect(t.holeHeights.length).toBe(4);
    }
  });

  it('exposes 30-entry tab pattern', () => {
    expect(Knife.TAB_HOLE_PATTERN.length).toBe(30);
  });
});

describe('buildRectangularMask', () => {
  it('produces a canvas of expected dimensions', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const mask = buildRectangularMask(specs, 2, 2, 100, 7);
    expect(mask.width).toBeGreaterThan(200);
    expect(mask.height).toBeGreaterThan(200);
  });
});

describe('buildShapedMask', () => {
  it('produces a canvas of expected dimensions', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const mask = buildShapedMask(specs, 2, 2, 100, 7);
    expect(mask.width).toBeGreaterThan(200);
    expect(mask.height).toBeGreaterThan(200);
  });

  it('produces a different mask than the rectangular one (tabs extend the silhouette)', () => {
    const subject = makeSubject(240, 240);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const rect = buildRectangularMask(specs, 2, 2, 100, 7);
    const shaped = buildShapedMask(specs, 2, 2, 100, 7);
    // They should differ in at least the canvas dimensions OR the
    // visible silhouette. The shaped version's external tabs add
    // pixels to the white region.
    expect(shaped.toDataURL()).not.toBe(rect.toDataURL());
  });

  it('uses quadraticCurveTo for non-border edges', () => {
    // For a 2x2 puzzle every piece has 2 border edges (border)
    // and 2 internal edges (tab or hole). Each internal edge should
    // contribute 6 quadraticCurveTo calls.
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const canvas = buildShapedMask(specs, 2, 2, 100, 7);
    const ctx = (canvas as unknown as { _lastCtx: { _calls: string[] } })._lastCtx;
    expect(ctx).toBeDefined();
    const calls = ctx!._calls;
    // Count quadraticCurveTo calls.
    const qCount = calls.filter((c) => c.startsWith('qCurveTo')).length;
    // 4 pieces × 2 internal edges × 6 segments = 48
    expect(qCount).toBe(48);
  });

  it('uses lineTo for border edges only', () => {
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const canvas = buildShapedMask(specs, 2, 2, 100, 7);
    const ctx = (canvas as unknown as { _lastCtx: { _calls: string[] } })._lastCtx;
    const calls = ctx!._calls;
    const lCount = calls.filter((c) => c.startsWith('lineTo')).length;
    // 4 pieces × 2 border edges = 8
    expect(lCount).toBe(8);
  });

  it('handles all 36 shape indices without error', () => {
    const subject = makeSubject(200, 200);
    for (let i = 0; i < 36; i++) {
      const { specs } = cutSpecs(subject, 2, 2, 100, i, 0, 0);
      const mask = buildShapedMask(specs, 2, 2, 100, 7);
      expect(mask.width).toBeGreaterThan(0);
    }
  });

  it('handles 3x3 with various tab/border configurations', () => {
    const subject = makeSubject(360, 360);
    for (let r = 0; r < 30; r += 5) {
      const { specs } = cutSpecs(subject, 3, 3, 100, 0, r, r);
      const mask = buildShapedMask(specs, 3, 3, 100, 7);
      expect(mask.width).toBeGreaterThan(0);
      expect(mask.height).toBeGreaterThan(0);
    }
  });

  it('produces stable output for a given seed', () => {
    // Two runs with the same input should produce identical call sequences.
    const subject = makeSubject(200, 200);
    const { specs } = cutSpecs(subject, 2, 2, 100, 0, 0, 0);
    const a = buildShapedMask(specs, 2, 2, 100, 7).toDataURL();
    const b = buildShapedMask(specs, 2, 2, 100, 7).toDataURL();
    expect(a).toBe(b);
  });
});

function makeSubject(w: number, h: number): { image: HTMLCanvasElement; width: number; height: number; name: string } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { image: c, width: w, height: h, name: 'test-subject' };
}
