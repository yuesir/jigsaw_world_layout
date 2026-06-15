import { describe, it, expect } from 'vitest';
import { Group } from '../src/scene/group';
import type { Piece } from '../src/scene/piece';

// Minimal stand-in for Piece (Group only needs .x / .y / .id / .isEdge / .group).
interface FakePiece {
  id: number;
  x: number;
  y: number;
  isEdge: boolean;
  group: Group | null;
  moveTo: (x: number, y: number) => boolean;
}

function fakePiece(id: number, x: number, y: number, isEdge = false): Piece {
  const p: FakePiece = {
    id,
    x,
    y,
    isEdge,
    group: null,
    moveTo(xx: number, yy: number) {
      p.x = xx;
      p.y = yy;
      return true;
    },
  };
  return p as unknown as Piece;
}

describe('Group', () => {
  it('initializes with two pieces', () => {
    const p1 = fakePiece(1, 10, 20);
    const p2 = fakePiece(2, 30, 40);
    const g = new Group(p1, p2);
    expect(g.members.length).toBe(2);
    expect(g.id).toBe(1); // refPiece is the smaller id
    expect(p1.group).toBe(g);
    expect(p2.group).toBe(g);
  });

  it('absorbs another group, merging members', () => {
    const p1 = fakePiece(1, 0, 0);
    const p2 = fakePiece(2, 0, 0);
    const p3 = fakePiece(3, 0, 0);
    const g1 = new Group(p1, p2);
    const g2 = new Group(p3, p1); // re-using p1 is wrong; use a fresh piece
    const p4 = fakePiece(4, 0, 0);
    const g3 = new Group(p4, fakePiece(5, 0, 0));
    g1.absorb(g3);
    expect(g1.members).toContain(p1);
    expect(g1.members).toContain(p2);
    expect(g1.members).toContain(p4);
    expect(p4.group).toBe(g1);
  });

  it('counts edge pieces', () => {
    const p1 = fakePiece(1, 0, 0, true);
    const p2 = fakePiece(2, 0, 0, false);
    const g = new Group(p1, p2);
    expect(g.edgeCount).toBe(1);
    expect(g.isEdge).toBe(true);
  });

  it('translates all members', () => {
    const p1 = fakePiece(1, 0, 0);
    const p2 = fakePiece(2, 10, 10);
    const g = new Group(p1, p2);
    g.translate(5, 5);
    expect(p1.x).toBe(5);
    expect(p1.y).toBe(5);
    expect(p2.x).toBe(15);
    expect(p2.y).toBe(15);
  });

  it('disposes by clearing members and unlinking', () => {
    const p1 = fakePiece(1, 0, 0);
    const p2 = fakePiece(2, 0, 0);
    const g = new Group(p1, p2);
    g.dispose();
    expect(g.members.length).toBe(0);
    expect(p1.group).toBeNull();
    expect(p2.group).toBeNull();
  });
});
