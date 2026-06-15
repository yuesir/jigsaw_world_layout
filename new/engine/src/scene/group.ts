/**
 * Group — a set of physically-connected Pieces.
 *
 * When two pieces snap together (via `Piece.join`), they're merged into
 * the same Group. The Group tracks:
 *   - members: the pieces in the group
 *   - refPiece: the canonical piece (id == this.id)
 *   - isEdge / edgeCount: does this group include the puzzle border?
 *   - id: the refPiece's id
 *
 * A piece's position is in canvas pixel space; when you "move the group",
 * every member is translated by the same delta.
 */
import type { Piece } from './piece';
import { log } from '../utils/log';

export class Group {
  /** The reference piece (id of the group == refPiece.id). */
  readonly refPiece: Piece;
  readonly id: number;
  readonly name: string;
  members: Piece[];
  isEdge = false;
  edgeCount = 0;

  constructor(p1: Piece, p2: Piece) {
    // The reference piece is the one with the smaller id (matches original).
    this.refPiece = p1.id <= p2.id ? p1 : p2;
    this.id = this.refPiece.id;
    this.name = `group-${this.id}`;
    this.members = [];
    this.add(p1);
    this.add(p2);
    this.recomputeEdge();
    p1.group = this;
    p2.group = this;
  }

  /** Add a piece to this group. Caller is responsible for setting piece.group. */
  add(p: Piece): void {
    if (this.members.includes(p)) return;
    this.members.push(p);
    if (p.isEdge) this.edgeCount++;
    this.isEdge = this.isEdge || p.isEdge;
  }

  /** Merge `other` into this group. Other group's members become ours. */
  absorb(other: Group): void {
    if (other === this) return;
    for (const p of other.members) {
      this.add(p);
      p.group = this;
    }
    other.members = [];
    this.recomputeEdge();
  }

  /** Recompute edge count from current members. */
  recomputeEdge(): void {
    let n = 0;
    let anyEdge = false;
    for (const p of this.members) {
      if (p.isEdge) {
        n++;
        anyEdge = true;
      }
    }
    this.edgeCount = n;
    this.isEdge = anyEdge;
  }

  /** Translate every member by (dx, dy). */
  translate(dx: number, dy: number): void {
    for (const m of this.members) m.moveTo(m.x + dx, m.y + dy);
  }

  get length(): number {
    return this.members.length;
  }

  /** Move to a specific (x, y) for the ref piece, keeping relative offsets. */
  moveRefTo(x: number, y: number): void {
    const dx = x - this.refPiece.x;
    const dy = y - this.refPiece.y;
    this.translate(dx, dy);
  }

  dispose(): void {
    for (const p of this.members) p.group = null;
    this.members = [];
    log.debug?.(`Group ${this.name} disposed`);
  }
}
