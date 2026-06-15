/**
 * Puzzle — the top-level orchestrator.
 *
 * Owns: subject, pieces, scatter, completion state.
 *
 * State machine:
 *   DEAD(0)         — not initialized
 *   INIT_PREPPING(1)— pre-cut setup
 *   PREPPING(2)     — generating pieces
 *   WAITING(3)      — ready to start; pieces are scattered
 *   READY(4)        — first user interaction begins
 *   PLAYING(5)      — active
 *
 * Variants:
 *   state       — current state
 *   isComplete  — true when all pieces are in one group
 *   capState    — capture-mode state (0=off, 1=ready, 2=capturing, 3=releasing)
 *
 * Properties:
 *   subject      — the source image (Subject)
 *   pieces       — list of PieceSpec and Pieces, in render order
 *   nop          — number of pieces spec {rows, cols, size}
 *   record       — saved state (optional)
 *   theme        — current theme
 *   rotatable    — whether pieces can be rotated
 */
import { Variant } from '../reactive/variant';
import { Sym } from '../reactive/sym';
import { Piece, PC } from './piece';
import { Subject } from './subject';
import { cutSpecs, buildShapedMask, type PieceSpec } from './knife';
import { Texture } from '../gl/texture';
import { log } from '../utils/log';
import type { Engine } from '../core/engine';
import { createRandom } from '../utils/random';

const PS = (() => {
  const g = 'PS';
  return {
    DEAD: Sym.register('dead', 0, g),
    INIT_PREPPING: Sym.register('init_prepping', 1, g),
    PREPPING: Sym.register('prepping', 2, g),
    WAITING: Sym.register('waiting', 3, g),
    READY: Sym.register('ready', 4, g),
    PLAYING: Sym.register('playing', 5, g),
  };
})();

export const PiecesLayerName = 'pieces-layer';
export const PrimerLayerName = 'primer-layer';
export const BkgdLayerName = 'bkgd-layer';

export interface PuzzleOptions {
  /** Pre-loaded image source. */
  source: HTMLImageElement | HTMLCanvasElement;
  /** Optional image name. */
  name?: string;
  /** Number of pieces in each axis. */
  rows?: number;
  cols?: number;
  /** Target piece size in source pixels (overrides rows/cols when given). */
  size?: number;
  /** Allow rotation. */
  rotatable?: boolean;
  /** Initial state to enter after cut. */
  initialState?: Sym;
}

export class Puzzle {
  readonly engine: Engine;
  readonly name: string;
  readonly state: Variant<Sym>;
  readonly isComplete: Variant<boolean>;
  readonly capState: Variant<number>;
  subject: Subject;
  pieces: Piece[] = [];
  piecesById = new Map<number, Piece>();
  nop: { rows: number; cols: number; size: number } = { rows: 3, cols: 3, size: 80 };
  rotatable: boolean;
  shapeIndex = 0;
  tabIndexRight = 0;
  tabIndexBottom = 0;
  maskTexture: Texture | null = null;
  /** Set to true while the puzzle is in scatter. */
  scattering = false;
  /** A seed used for scatter randomization. */
  seed = 0;
  /** Snap distance in pixels. */
  snapDistance = 12;
  /** Called when the puzzle is completed. */
  onComplete: ((puzzle: Puzzle) => void) | null = null;
  /** Called when a piece is dropped and possibly joined. */
  onPieceJoined: ((p1: Piece, p2: Piece) => void) | null = null;
  /** Per-piece toggle: show only the edge pieces. */
  showEdgesOnly = false;

  constructor(engine: Engine, opts: PuzzleOptions) {
    this.engine = engine;
    this.name = opts.name ?? 'puzzle';
    this.rotatable = !!opts.rotatable;
    this.state = new Variant(PS.DEAD, 'puzzle.state');
    this.isComplete = new Variant(false, 'puzzle.isComplete');
    this.capState = new Variant(0, 'puzzle.capState');
    this.subject = new Subject(engine, { source: opts.source, name: opts.name });
    if (opts.rows && opts.cols) this.nop = { rows: opts.rows, cols: opts.cols, size: 0 };
    if (opts.size) this.nop.size = opts.size;
    this.shapeIndex = Math.floor(Math.random() * 36);
    this.tabIndexRight = Math.floor(Math.random() * 30);
    this.tabIndexBottom = Math.floor(Math.random() * 30);
    this.seed = Math.floor(1e8 * Math.random()) || 1;

    // Auto-react to state changes.
    this.state.addListener((next) => {
      log.log(`Puzzle state: ${next.name}`);
    });
    this.isComplete.addListener((next) => {
      if (next) this.onComplete?.(this);
    });

    this.state.val = PS.INIT_PREPPING;
    this._beginCut();
  }

  /** Compute piece size if not given, then run the knife. */
  private _beginCut(): void {
    this.state.val = PS.PREPPING;
    // Make sure subject is ready.
    this.subject.rescale();
    if (!this.subject.isReady()) {
      log.error('Subject failed to scale; aborting cut');
      this.state.val = PS.DEAD;
      return;
    }
    // Compute size if missing.
    if (!this.nop.size) {
      const sw = this.subject.width;
      const sh = this.subject.height;
      this.nop.size = Math.floor(Math.min(sw / this.nop.cols, sh / this.nop.rows));
    }
    // Run knife.
    this.cut(this.subject, this.nop);
  }

  /**
   * Run the knife to produce PieceSpec[], build the mask texture, and
   * instantiate Piece objects. The pieces are then scattered.
   */
  cut(subject: Subject, nop: { rows: number; cols: number; size: number }): void {
    const { specs } = cutSpecs(
      subject,
      nop.rows,
      nop.cols,
      nop.size,
      this.shapeIndex,
      this.tabIndexRight,
      this.tabIndexBottom,
    );
    // Build the shaped mask (real jigsaw silhouette with tabs and holes).
    const maskCanvas = buildShapedMask(specs, nop.rows, nop.cols, nop.size, 7);
    this.maskTexture?.dispose();
    this.maskTexture = Texture.getTexture(this.engine.gl, {
      data: maskCanvas,
      width: maskCanvas.width,
      height: maskCanvas.height,
      name: `${this.name}-mask`,
    });
    // Instantiate pieces.
    for (const spec of specs) {
      const piece = new Piece({
        spec,
        subject,
        engine: this.engine,
        maskTexture: this.maskTexture,
        rotatable: this.rotatable,
      });
      this.pieces.push(piece);
      this.piecesById.set(spec.id, piece);
      piece.angle = 0;
    }
    this._wireNeighbors();
    this.state.val = PS.WAITING;
    this.scatter();
  }

  /** Wire up top/right/bottom/left neighbor pointers for each piece. */
  private _wireNeighbors(): void {
    const { rows, cols } = this.nop;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = r * cols + c + 1;
        const p = this.piecesById.get(id);
        if (!p) continue;
        p.neighbors[3] = r > 0 ? this.piecesById.get(id - cols) ?? null : null; // top
        p.neighbors[2] = c < cols - 1 ? this.piecesById.get(id + 1) ?? null : null; // right
        p.neighbors[1] = r < rows - 1 ? this.piecesById.get(id + cols) ?? null : null; // bottom
        p.neighbors[0] = c > 0 ? this.piecesById.get(id - 1) ?? null : null; // left
      }
    }
  }

  /**
   * Scatter pieces randomly across the canvas. If `opts.partial` is true,
   * only re-place pieces that have not yet been joined.
   */
  scatter(opts: { partial?: boolean } = {}): void {
    this.scattering = true;
    const { rows, cols, size } = this.nop;
    const canvasW = this.engine.canvas.width;
    const canvasH = this.engine.canvas.height;
    const rand = createRandom(this.seed);
    // Compute the puzzle "frame" center.
    const totalW = cols * size;
    const totalH = rows * size;
    const subjectCx = canvasW / 2;
    const subjectCy = canvasH / 2 - totalH / 4; // slightly above center
    const frameLeft = subjectCx - totalW / 2;
    const frameTop = subjectCy - totalH / 2;
    const frameRight = subjectCx + totalW / 2;
    const frameBottom = subjectCy + totalH / 2;
    // For each piece, place at its spec.home position (subject ref) plus a random
    // offset within the canvas, avoiding the puzzle frame.
    for (const p of this.pieces) {
      if (opts.partial && p.hasMoved && p.group && p.group.members.length > 1) continue;
      const targetX = p.spec.refPos.x + frameLeft;
      const targetY = p.spec.refPos.y + frameTop;
      // Random offset, but ensure we don't land on the frame.
      const ox = (rand() - 0.5) * (canvasW - totalW * 1.2);
      const oy = (rand() - 0.5) * (canvasH - totalH * 1.2);
      let x = targetX + ox;
      let y = targetY + oy;
      x = Math.max(20, Math.min(canvasW - p.width - 20, x));
      y = Math.max(20, Math.min(canvasH - p.height - 20, y));
      // Avoid frame: if inside, push out.
      if (x > frameLeft && x < frameRight && y > frameTop && y < frameBottom) {
        x = x < subjectCx ? frameLeft - 20 : frameRight + 20;
      }
      p.moveTo(x, y);
      p.angle = 0;
      p.hasMoved = false;
      if (p.group) p.group.dispose();
      p.group = null;
      p.pieceState.val = PC.F;
    }
    this.scattering = false;
    this.state.val = PS.WAITING;
  }

  /**
   * Handle a pointer event. The Puzzle's job is to hit-test and route.
   */
  handleEvent(event: { type: string; x: number; y: number; which?: number; deltaY?: number; fromTouch?: boolean; shiftKey?: boolean; ctrlKey?: boolean }): boolean {
    // Only react if we're past WAITING.
    if (this.state.val.ordinal < PS.WAITING.ordinal) return false;
    // Mouse/touch start: pick the topmost piece at the click.
    if (event.type === 'mousedown' || event.type === 'pointerdown' || event.type === 'touchstart') {
      const piece = this.pickAt(event.x, event.y);
      if (piece) {
        return piece.handleEvent(event);
      }
    }
    // Forward to currently selected piece if any.
    for (const p of this.pieces) {
      if (p.pieceState.val === PC.H || p.pieceState.val === PC.q || p.pieceState.val === PC.W) {
        return p.handleEvent(event);
      }
    }
    return false;
  }

  /**
   * Hit-test: return the topmost piece at (x, y) on the pieces layer.
   */
  pickAt(x: number, y: number): Piece | null {
    // Iterate from top of stack (tail of list) downward.
    const layer = this.engine.clips.layer(PiecesLayerName);
    if (!layer) return null;
    let node = layer.tail;
    while (node) {
      const c = node.item;
      if (c instanceof Piece && c.active && c.opacity > 0 && c.containsPoint(x, y, false)) {
        return c;
      }
      node = node.prev;
    }
    return null;
  }

  /**
   * Show only the edge pieces (fade non-edge to 0).
   */
  showOnlyEdges(on: boolean): void {
    this.showEdgesOnly = on;
    for (const p of this.pieces) {
      const isEdgePiece = p.isEdge;
      const inGroupEdge = p.group && p.group.isEdge;
      const show = !isEdgePiece && !inGroupEdge ? 0 : 1;
      if (p.opacity !== show) p.opacity = show;
    }
  }

  /** Check whether the puzzle is complete (all pieces in one group, at rest). */
  checkCompletion(): void {
    if (this.isComplete.val) return;
    // Find any non-grouped piece.
    const lonePiece = this.pieces.find((p) => !p.group);
    if (lonePiece) return;
    // Are all pieces in the same group?
    const firstGroup = this.pieces[0]?.group;
    if (!firstGroup) return;
    const allSame = this.pieces.every((p) => p.group === firstGroup);
    if (!allSame) return;
    // Are all pieces roughly at their home position?
    const allHome = this.pieces.every(
      (p) =>
        Math.abs(p.x - p.spec.refPos.x) < 30 && Math.abs(p.y - p.spec.refPos.y) < 30,
    );
    if (!allHome) return;
    this.isComplete.val = true;
  }

  /** Update state machine. Called from the Engine's RAF loop. */
  tick(): void {
    if (this.state.val.eq(PS.WAITING)) {
      // Wait for first interaction.
      // We don't have a clean "first interaction" signal here, so just
      // promote to READY on next tick after scatter.
    }
    if (this.state.val.eq(PS.READY) || this.state.val.eq(PS.PLAYING)) {
      this.checkCompletion();
    }
  }

  /** Reset the puzzle to its initial scattered state. */
  reset(): void {
    this.isComplete.val = false;
    this.scatter();
  }

  /** Dispose: free all pieces, subject, mask. */
  dispose(): void {
    for (const p of this.pieces) p.dispose();
    this.pieces = [];
    this.piecesById.clear();
    this.subject.dispose();
    this.maskTexture?.dispose();
    this.state.val = PS.DEAD;
  }
}
