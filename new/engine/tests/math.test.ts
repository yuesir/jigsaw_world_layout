import { describe, it, expect } from 'vitest';
import { Vec2 } from '../src/math/vec2';
import { Mat3 } from '../src/math/mat3';
import { Color } from '../src/math/color';
import { AABB } from '../src/math/aabb';
import { applyEase, EASE_IN, EASE_OUT, EASE_NONE } from '../src/math/easing';

describe('Vec2', () => {
  it('constructs and mutates', () => {
    const v = new Vec2(1, 2);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    v.set(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('adds and scales', () => {
    const v = new Vec2(1, 2);
    v.add(new Vec2(3, 4));
    expect(v.x).toBe(4);
    expect(v.y).toBe(6);
    v.scale(2);
    expect(v.x).toBe(8);
    expect(v.y).toBe(12);
  });

  it('computes distance and length', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(3, 4);
    expect(a.distance(b)).toBe(5);
    expect(b.length()).toBe(5);
  });

  it('lerps without allocating', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(10, 20);
    const out = new Vec2();
    Vec2.lerp(a, b, 0.5, out);
    expect(out.x).toBe(5);
    expect(out.y).toBe(10);
  });
});

describe('Mat3', () => {
  it('starts as identity', () => {
    const m = new Mat3();
    expect(Array.from(m.data)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('builds a transform with scale+rotate+translate', () => {
    const m = new Mat3();
    m.fromTransform(2, 2, 0, 5, 6);
    // tx=5, ty=6 at positions [6, 7]
    expect(m.data[6]).toBe(5);
    expect(m.data[7]).toBe(6);
    // scale=2 with rotation 0 → sx*c=2, sy*c=2
    expect(m.data[0]).toBeCloseTo(2);
    expect(m.data[4]).toBeCloseTo(2);
  });
});

describe('Color', () => {
  it('parses hex', () => {
    const c = new Color();
    c.setHex('#ff8800');
    expect(c.data[0]).toBeCloseTo(1.0);
    expect(c.data[1]).toBeCloseTo(0x88 / 255);
    expect(c.data[2]).toBe(0);
    expect(c.data[3]).toBe(1);
  });

  it('rejects invalid hex', () => {
    const c = new Color();
    expect(() => c.setHex('not-a-color')).toThrow();
  });

  it('copies and serializes', () => {
    const a = new Color(0.1, 0.2, 0.3, 0.4);
    const b = new Color();
    b.copy(a);
    // Float32 → use toBeCloseTo to avoid precision-equality issues
    for (let i = 0; i < 4; i++) {
      expect(b.data[i]).toBeCloseTo(a.data[i]!, 5);
    }
  });
});

describe('AABB', () => {
  it('detects containment', () => {
    const a = new AABB(0, 0, 10, 10);
    expect(a.contains(5, 5)).toBe(true);
    expect(a.contains(10, 5)).toBe(false); // right edge exclusive
    expect(a.contains(-1, 5)).toBe(false);
  });

  it('detects intersection', () => {
    const a = new AABB(0, 0, 10, 10);
    const b = new AABB(5, 5, 15, 15);
    const c = new AABB(20, 20, 30, 30);
    expect(a.intersects(b)).toBe(true);
    expect(a.intersects(c)).toBe(false);
  });
});

describe('applyEase', () => {
  it('linear maps t → t', () => {
    expect(applyEase(EASE_NONE, 0)).toBe(0);
    expect(applyEase(EASE_NONE, 0.5)).toBe(0.5);
    expect(applyEase(EASE_NONE, 1)).toBe(1);
  });

  it('ease-in is slow at start, fast at end', () => {
    expect(applyEase(EASE_IN, 0.5)).toBeLessThan(0.5);
    expect(applyEase(EASE_IN, 1)).toBe(1);
  });

  it('ease-out is fast at start, slow at end', () => {
    expect(applyEase(EASE_OUT, 0.5)).toBeGreaterThan(0.5);
    expect(applyEase(EASE_OUT, 1)).toBe(1);
  });
});
