/**
 * Piece — extends Clip with jigsaw-specific state, neighbors, and group join.
 *
 * State machine (5 local states, 2 remote):
 *   F (resting)    — idle, can be picked up
 *   H (selected)   — mouse pressed, drag not yet started
 *   q (moving)     — being dragged
 *   W (touched)    — touch pressed (touch devices)
 *   U (captured)   — being captured (capture mode)
 *   Y (remote-sel) — another player has selected
 *   X (remote-ctl) — another player is moving
 *
 * Variants:
 *   pieceState    — current piece state (Sym)
 *   group         — the Group this piece belongs to (null when alone)
 *   hasMoved      — true once the piece has been placed at least once
 *
 * Input events are routed by the Puzzle's handleEvent. A Piece's own
 * handleEvent reacts to mouse/touch/wheel events.
 */
import { Clip } from './clip';
import { Variant } from '../reactive/variant';
import type { Subject } from './subject';
import type { PieceSpec } from './knife';
import { Sym } from '../reactive/sym';
import { Vec2 } from '../math/vec2';
import { log } from '../utils/log';
import type { Engine } from '../core/engine';
import type { Texture } from '../gl/texture';
import type { Group } from './group';

// Syms for piece states.
const PC_GROUP = 'PC';
export const PC = {
  F: Sym.register('resting', 0, PC_GROUP),
  H: Sym.register('selected', 1, PC_GROUP),
  q: Sym.register('moving', 2, PC_GROUP),
  W: Sym.register('touched', 3, PC_GROUP),
  U: Sym.register('captured', 4, PC_GROUP),
  Y: Sym.register('remote-select', 5, PC_GROUP),
  X: Sym.register('remote-control', 6, PC_GROUP),
};

export interface PieceOptions {
  spec: PieceSpec;
  subject: Subject;
  engine: Engine;
  maskTexture: Texture;
  /** When true, the piece can be rotated by the user. */
  rotatable: boolean;
}

export class Piece extends Clip {
  /** Backing Variant for piece state. */
  readonly pieceState: Variant<Sym>;
  /** The Group this piece belongs to. null when alone. */
  group: Group | null = null;
  /** True once the piece has been placed at least once. */
  hasMoved = false;
  /** True if this piece is on the border of the puzzle. */
  isEdge = false;
  /** 4 cardinal neighbors (top/right/bottom/left). */
  readonly neighbors: (Piece | null)[] = [null, null, null, null];
  /** Diagonal neighbors. */
  readonly caterNeighbors: (Piece | null)[] = [null, null, null, null];
  /** True if this piece's right edge is a tab. */
  isTabRight = false;
  isTabBottom = false;
  /** True if rotatable. */
  rotatable: boolean;
  /** Source spec, for debug. */
  readonly spec: PieceSpec;
  /** Cached origin point. */
  readonly homePos: Vec2 | null = null;

  /** Drag state. */
  private _dragStartTime = 0;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _moveOffsetX = 0;
  private _moveOffsetY = 0;

  constructor(opts: PieceOptions) {
    super(opts.engine, {
      layer: 'pieces-layer',
      name: opts.spec.name,
      image: {
        data: opts.subject.texture!,
        bounds: {
          x: opts.spec.image.bounds.x,
          y: opts.spec.image.bounds.y,
          width: opts.spec.image.bounds.width,
          height: opts.spec.image.bounds.height,
        },
        mask: opts.maskTexture,
        maskBounds: {
          x: opts.spec.image.bounds.x,
          y: opts.spec.image.bounds.y,
          width: opts.spec.image.bounds.width,
          height: opts.spec.image.bounds.height,
        },
      },
      position: { x: 0, y: 0 },
    });
    this.spec = opts.spec;
    this.rotatable = opts.rotatable;
    this.isEdge =
      opts.spec.edges.top.border &&
      opts.spec.edges.bottom.border &&
      opts.spec.edges.left.border &&
      opts.spec.edges.right.border;
    // Override image data width/height for hit testing
    this.width = opts.spec.core.width + 2 * opts.spec.image.bounds.margin;
    this.height = opts.spec.core.height + 2 * opts.spec.image.bounds.margin;
    // Variant-backed state
    this.pieceState = new Variant(PC.F, `${opts.spec.name}.state`);

    // Map the per-piece UVs to the right region of the subject texture
    // (slot 0) and the mask texture (slot 1). Without this, every
    // piece would sample the entire texture, producing a "9 copies of
    // the same image" effect rather than a proper jigsaw.
    const img = this.image!;
    this.setTexBounds(img.data, img.bounds, 0);
    if (img.mask && img.maskBounds) {
      this.setTexBounds(img.mask, img.maskBounds, 1);
    }
  }

  /** Soft drop: snap to nearest neighbor if within snap distance. */
  drop(): { joined: Piece | null; snapped: boolean } {
    const neighbor = this.neighborWithinSnapRange();
    if (neighbor) {
      this.join(neighbor);
      return { joined: neighbor, snapped: true };
    }
    this.pieceState.val = PC.F;
    this.hasMoved = true;
    return { joined: null, snapped: false };
  }

  /**
   * Measure the gap between this piece and another at the same angle.
   * Writes the gap to a returned Vec2. Used for snap detection.
   */
  gapTo(other: Piece, useCurrent: boolean): Vec2 {
    const out = new Vec2();
    if (useCurrent && this.angle !== other.angle) {
      out.x = NaN;
      out.y = NaN;
      return out;
    }
    const ax = useCurrent ? other.x : other.spec.refPos.x;
    const ay = useCurrent ? other.y : other.spec.refPos.y;
    const bx = useCurrent ? this.x : this.spec.refPos.x;
    const by = useCurrent ? this.y : this.spec.refPos.y;
    switch (this.angle) {
      case 0:
        out.x = ax - bx;
        out.y = ay - by;
        break;
      case 90:
        out.x = by - ay;
        out.y = ax - bx;
        break;
      case 180:
        out.x = bx - ax;
        out.y = by - ay;
        break;
      case 270:
        out.x = ay - by;
        out.y = bx - ax;
        break;
      default:
        out.x = NaN;
        out.y = NaN;
    }
    return out;
  }

  /**
   * Check if any of the 4 neighbors is within snap range and aligned.
   * Returns the snap target if yes, null otherwise.
   */
  neighborWithinSnapRange(snapDistance = 12): Piece | null {
    if (this.opacity < 1) return null;
    for (const n of this.neighbors) {
      if (!n) continue;
      if (n.group === this.group) continue;
      if (n.angle !== this.angle) continue;
      if (n.isRotating() || this.isRotating()) continue;
      const dx = n.x - this.x;
      const dy = n.y - this.y;
      if (Math.abs(dx) > 2 * this.width || Math.abs(dy) > 2 * this.height) continue;
      const gap = this.gapTo(n, true);
      if (Number.isNaN(gap.x)) continue;
      if (Math.abs(gap.x - dx) <= snapDistance && Math.abs(gap.y - dy) <= snapDistance) {
        return n;
      }
    }
    return null;
  }

  /** Snap this piece to `other` (a neighbor). Joins groups. */
  join(other: Piece): void {
    // Position so the gap closes.
    const gap = this.gapTo(other, true);
    if (Number.isNaN(gap.x)) {
      log.warn(`Piece.join: NaN gap between ${this.name} and ${other.name}`);
      return;
    }
    this.moveTo(other.x - gap.x, other.y - gap.y);
    // Merge groups.
    if (this.group && other.group) {
      if (this.group !== other.group) {
        const survivor = this.group.members.length >= other.group.members.length ? this.group : other.group;
        const absorbed = survivor === this.group ? other.group : this.group;
        survivor.absorb(absorbed);
      }
    } else if (this.group) {
      this.group.add(other);
      other.group = this.group;
    } else if (other.group) {
      other.group.add(this);
      this.group = other.group;
    } else {
      // Use a lazy require to avoid the import cycle; Group itself imports Piece.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Group } = require('./group') as { Group: typeof import('./group').Group };
      const g = new Group(this, other);
      this.group = g;
      other.group = g;
    }
    this.hasMoved = true;
    other.hasMoved = true;
    this.pieceState.val = PC.F;
  }

  /** Move to (x, y) without animation. */
  override moveTo(x: number, y: number): boolean {
    return super.moveTo(x, y);
  }

  /** Group-aware move: moves every member of this piece's group. */
  moveGroup(dx: number, dy: number): void {
    const members = this.group?.members ?? [this];
    for (const m of members) {
      m.moveTo(m.x + dx, m.y + dy);
    }
  }

  /**
   * Handle a pointer event dispatched by the Puzzle.
   * Returns true if the event was consumed.
   */
  handleEvent(event: { type: string; x: number; y: number; which?: number; deltaY?: number; fromTouch?: boolean; shiftKey?: boolean; ctrlKey?: boolean }): boolean {
    const type = event.type;
    const state = this.pieceState.val;

    // wheel: rotate the piece
    if (type === 'wheel' || type === 'mousewheel') {
      if (this.rotatable) {
        const dir = (event.deltaY ?? 0) > 0 ? 1 : 0;
        this.rotateBy(90, { clockwise: dir === 1 });
        return true;
      }
      return false;
    }

    // state F → handle pick-up events
    if (state.eq(PC.F)) {
      if (type === 'mousedown' || type === 'pointerdown' || type === 'touchstart') {
        this.pieceState.val = PC.H;
        this._dragStartTime = Date.now();
        this._dragStartX = event.x;
        this._dragStartY = event.y;
        this._moveOffsetX = this.x - event.x;
        this._moveOffsetY = this.y - event.y;
        this.moveToTop();
        return true;
      }
      return false;
    }

    // state H → may transition to q
    if (state.eq(PC.H)) {
      if (type === 'mousemove' || type === 'pointermove' || type === 'touchmove') {
        const dx = event.x - this._dragStartX;
        const dy = event.y - this._dragStartY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          this.pieceState.val = PC.q;
        }
        this.moveTo(event.x + this._moveOffsetX, event.y + this._moveOffsetY);
        return true;
      }
      if (type === 'mouseup' || type === 'pointerup' || type === 'touchend') {
        this.drop();
        return true;
      }
    }

    // state q → continue moving
    if (state.eq(PC.q)) {
      if (type === 'mousemove' || type === 'pointermove' || type === 'touchmove') {
        this.moveTo(event.x + this._moveOffsetX, event.y + this._moveOffsetY);
        return true;
      }
      if (type === 'mouseup' || type === 'pointerup' || type === 'touchend') {
        this.drop();
        return true;
      }
    }

    return false;
  }

  /** Rotate by N*90 degrees. */
  rotateBy(deg: number, opts: { clockwise: boolean; slow?: boolean }): void {
    const step = (opts.clockwise ? 90 : -90) * Math.sign(deg || 1);
    const target = ((this.angle + step) % 360 + 360) % 360;
    this.angle = target;
  }
}
