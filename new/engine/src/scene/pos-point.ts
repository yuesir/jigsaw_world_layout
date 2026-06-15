/**
 * PosPoint — 2D position with logic ↔ OGL coord conversion.
 *
 * In the engine, positions are stored in canvas pixel space (origin at top-left,
 * y growing downward). The vertex shader expects normalized device coords
 * ([-1, 1] with y up). This class handles the conversion and applies a small
 * pixel-alignment tweak so rotated sprites snap to integer pixels.
 */
import { applyEase, EaseKind } from '../math/easing';
import { Tweener2 } from '../tween/tweener2';

export interface PosPointDelegate {
  /** OGL width factor = 1 / canvas.width. */
  pixelWidth: number;
  /** OGL height factor = 1 / canvas.height. */
  pixelHeight: number;
  /** Callback fired when position changes. */
  onMove?(pp: PosPoint): void;
}

export class PosPoint {
  /** Canvas pixel x. */
  _x = 0;
  /** Canvas pixel y. */
  _y = 0;
  /** Normalized OGL x (-1..1). */
  _oglX = 0;
  /** Normalized OGL y (-1..1), inverted. */
  _oglY = 0;
  /** Tweener state when position is being interpolated. */
  tweener: Tweener2 | null = null;
  delegate: PosPointDelegate | null = null;
  disposed = false;

  constructor(delegate: PosPointDelegate | null = null, x = 0, y = 0) {
    this.delegate = delegate;
    this._x = x;
    this._y = y;
    this._updateOgl();
  }

  get x(): number {
    return this._x;
  }
  set x(v: number) {
    this.assign(v, this._y);
  }

  get y(): number {
    return this._y;
  }
  set y(v: number) {
    this.assign(this._x, v);
  }

  get normX(): number {
    const d = this.delegate;
    if (!d) return 0;
    return this._x * d.pixelWidth * 2 - 1;
  }

  get normY(): number {
    const d = this.delegate;
    if (!d) return 0;
    return 1 - 2 * this._y * d.pixelHeight;
  }

  private _updateOgl(): void {
    const d = this.delegate;
    if (!d) {
      this._oglX = 0;
      this._oglY = 0;
      return;
    }
    this._oglX = 2 * this._x * d.pixelWidth - 1;
    this._oglY = 1 - 2 * this._y * d.pixelHeight;
  }

  assign(x: number, y: number): boolean {
    if (this._x === x && this._y === y) return false;
    this._x = x;
    this._y = y;
    this._updateOgl();
    this.delegate?.onMove?.(this);
    return true;
  }

  assignNorm(nx: number, ny: number): boolean {
    const d = this.delegate;
    if (!d) return false;
    return this.assign(nx / (2 * d.pixelWidth), ny / (2 * d.pixelHeight));
  }

  moveBy(dx: number, dy: number): boolean {
    return this.assign(this._x + dx, this._y + dy);
  }

  distanceTo(o: PosPoint): number {
    const dx = this._x - o._x;
    const dy = this._y - o._y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Tween position to (x, y) over `duration` ms. */
  tween(
    x: number,
    y: number,
    duration: number,
    onEnd?: () => void,
    ease: EaseKind = applyEase as unknown as EaseKind,
  ): Tweener2 {
    if (this.tweener) this.tweener.kill();
    const t = new Tweener2('position', { x, y }, duration, onEnd, ease);
    t.target = { name: 'PosPoint', isDisposed: this.disposed, applyTweenValue: () => {} };
    this.tweener = t;
    t.queue();
    return t;
  }

  setDelegate(d: PosPointDelegate | null): void {
    this.delegate = d;
    this._updateOgl();
  }

  dispose(): void {
    this.tweener?.kill();
    this.tweener = null;
    this.disposed = true;
    this.delegate = null;
  }
}
