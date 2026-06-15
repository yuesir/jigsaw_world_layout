import { describe, it, expect } from 'vitest';
import { List } from '../src/utils/list';

describe('List', () => {
  it('starts empty', () => {
    const l = new List<number>();
    expect(l.head).toBeNull();
    expect(l.tail).toBeNull();
    expect(l.length).toBe(0);
  });

  it('adds to head and tail', () => {
    const l = new List<number>();
    l.addFirst(2);
    l.addFirst(1);
    l.addLast(3);
    const out: number[] = [];
    l.forEach((v) => out.push(v));
    expect(out).toEqual([1, 2, 3]);
    expect(l.length).toBe(3);
  });

  it('inserts before and after', () => {
    const l = new List<string>();
    l.addLast('b');
    const bNode = l.tail!;
    l.addBefore('a', bNode);
    l.addAfter('c', bNode);
    const out: string[] = [];
    l.forEach((v) => out.push(v));
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('moves node to end', () => {
    const l = new List<number>();
    l.addLast(1);
    const n = l.addLast(2);
    l.addLast(3);
    l.moveToEnd(n);
    const out: number[] = [];
    l.forEach((v) => out.push(v));
    expect(out).toEqual([1, 3, 2]);
  });

  it('unlinks first/last/middle', () => {
    const l = new List<number>();
    l.addLast(1);
    l.addLast(2);
    const n = l.addLast(3);
    l.addLast(4);
    l.unlinkFirst();
    l.unlinkLast();
    l.unlink(n);
    const out: number[] = [];
    l.forEach((v) => out.push(v));
    expect(out).toEqual([2]);
  });

  it('recycles nodes via dispose', () => {
    const l = new List<number>();
    const n = l.addLast(1);
    l.dispose(n);
    expect(l.length).toBe(0);
    l.addLast(2);
    // internal free pool reused
    expect(l.length).toBe(1);
  });

  it('finds items by predicate', () => {
    const l = new List<number>();
    [1, 2, 3, 4].forEach((v) => l.addLast(v));
    const node = l.find((v) => v === 3);
    expect(node?.item).toBe(3);
  });
});
