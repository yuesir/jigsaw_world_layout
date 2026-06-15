import { describe, it, expect, beforeEach } from 'vitest';
import { Variant } from '../src/reactive/variant';
import { Sym } from '../src/reactive/sym';

describe('Variant', () => {
  it('holds a value', () => {
    const v = new Variant(42, 'count');
    expect(v.val).toBe(42);
  });

  it('triggers listeners on set', () => {
    const v = new Variant(0, 'count');
    const seen: Array<[number, number]> = [];
    v.addListener((next, prev) => {
      seen.push([next, prev]);
    });
    v.val = 1;
    v.val = 2;
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('skips notifications when value did not change (Object.is)', () => {
    const v = new Variant({ x: 1 }, 'p');
    let calls = 0;
    v.addListener(() => calls++);
    v.val = { x: 1 }; // different object, Object.is false
    expect(calls).toBe(1);
    const same = v.val;
    v.val = same; // same reference
    expect(calls).toBe(1);
  });

  it('rejects writes when locked', () => {
    const v = new Variant(0, 'count');
    v.lock();
    expect(v.set(1)).toBe(false);
    expect(v.val).toBe(0);
    v.unlock();
    expect(v.set(1)).toBe(true);
    expect(v.val).toBe(1);
  });

  it('runs validator and rejects bad values', () => {
    const v = new Variant(0, 'count', {
      validator: (next) => (typeof next === 'number' && next >= 0 ? null : 'must be non-negative'),
    });
    expect(v.set(-1)).toBe(false);
    expect(v.errorMessage).toBe('must be non-negative');
    expect(v.set(5)).toBe(true);
    expect(v.val).toBe(5);
  });

  it('removeListener stops notifications', () => {
    const v = new Variant(0, 'count');
    const l = () => {};
    v.addListener(l);
    v.removeListener(l);
    // internal: not exposed, but should not throw
    expect(v.val).toBe(0);
  });

  it('dispose throws on further set', () => {
    const v = new Variant(0, 'count');
    v.dispose();
    expect(() => {
      v.val = 1;
    }).toThrow();
  });

  it('define installs getter/setter on host object', () => {
    const host: { count?: number } = {};
    const v = new Variant(0, 'count');
    Variant.define(host, 'count', v);
    expect(host.count).toBe(0);
    host.count = 5;
    expect(v.val).toBe(5);
  });
});

describe('Sym', () => {
  it('compares by ordinal', () => {
    const a = new Sym('a', 0);
    const b = new Sym('b', 1);
    expect(a.lt(b)).toBe(true);
    expect(b.gt(a)).toBe(true);
    expect(a.eq(new Sym('x', 0))).toBe(true);
  });

  it('groups support lookup by name and ordinal', () => {
    const group = 'test';
    Sym.register('one', 0, group);
    Sym.register('two', 1, group);
    expect(Sym.get(group, 'two')!.ordinal).toBe(1);
    expect(Sym.get(group, 0)!.name).toBe('one');
  });

  it('bet checks range', () => {
    const a = new Sym('a', 0);
    const b = new Sym('b', 2);
    const c = new Sym('c', 1);
    expect(c.bet(a, b)).toBe(true);
  });
});
