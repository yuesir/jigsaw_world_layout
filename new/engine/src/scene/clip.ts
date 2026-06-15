/**
 * Clip — base drawable. Holds an image, a position, an angle, an opacity,
 * a color slot, a layer, and a 4-quad mesh slot in the global VertexManager.
 *
 *   const clip = new Clip(engine, {
 *     layer: 'pieces-layer',
 *     name: 'hero',
 *     image: { data: tex, bounds: { x: 0, y: 0, width: 512, height: 512 } },
 *     position: { x: 100, y: 100 },
 *     angle: 0,
 *     opacity: 1,
 *     color: 0,
 *   });
 *
 * Properties are exposed via Variant-like getters/setters. Most properties
 * support being assigned a Tweener2 for animation:
 *
 *   clip.opacity = new Tweener2('opacity', 0, 600);
 *
 * Mirrors the original `O.Clip` class.
 */
import { Variant } from '../reactive/variant';
import type { VertexManager } from '../gl/vertex-manager';
import type { Texture } from '../gl/texture';
import { PosPoint } from './pos-point';
import type { LinkNode } from '../utils/list';
import type { Tweener2 } from '../tween/tweener2';
import { TW_FINISH, TW_ABORT, TW_DISPOSE } from '../tween/tweener2';
import type { Engine } from '../core/engine';
import { applyEase, EASE_NONE, type EaseKind } from '../math/easing';
import { AABB } from '../math/aabb';

export interface ImageSource {
  data: Texture;
  bounds: { x: number; y: number; width: number; height: number };
  mask?: Texture | null;
  maskBounds?: { x: number; y: number; width: number; height: number } | null;
}

export interface ClipOptions {
  layer: string;
  name: string;
  image?: ImageSource;
  /** Width in canvas pixels; defaults to image bounds. */
  width?: number;
  /** Height in canvas pixels. */
  height?: number;
  position?: { x: number; y: number };
  angle?: number;
  opacity?: number;
  color?: number;
  state?: number;
  visible?: boolean;
}

interface PropWrapper<T> {
  value: T;
  renderedValue: T;
  tweener: Tweener2 | null;
  disposed: boolean;
  isEqualTo(other: unknown): boolean;
}

function wrapProp<T>(initial: T): PropWrapper<T> {
  return {
    value: initial,
    renderedValue: initial,
    tweener: null,
    disposed: false,
    isEqualTo(other) {
      return other instanceof Object && 'value' in (other as object) && (other as PropWrapper<T>).value === this.value;
    },
  };
}

export class Clip {
  readonly engine: Engine;
  readonly name: string;
  readonly id: number;
  layer: string;
  width = 0;
  height = 0;
  _active = false;
  _zOrder = -1;
  _node: LinkNode<Clip> | null = null;
  _opacity: PropWrapper<number> = wrapProp(1);
  _color: PropWrapper<number> = wrapProp(0);
  _angle: PropWrapper<number> = wrapProp(0);
  _state: PropWrapper<number> = wrapProp(0);
  _position: PosPoint;
  image: ImageSource | null = null;
  isDisposed = false;
  /** Editor slot. */
  userState = 0;

  /** Frame to use in the source texture's animation, if any. */
  bounds: AABB = new AABB(0, 0, 0, 0);
  onMove: ((clip: Clip, t?: Tweener2) => void) | null = null;
  onDispose: ((clip: Clip) => void) | null = null;

  /** Auto-incrementing id for z-indexing. */
  private static _nextId = 1;

  constructor(engine: Engine, opts: ClipOptions) {
    this.engine = engine;
    this.name = opts.name;
    this.id = Clip._nextId++;
    this.layer = opts.layer;
    if (opts.image) this._setImage(opts.image);
    if (opts.width !== undefined) this.width = opts.width;
    if (opts.height !== undefined) this.height = opts.height;
    const pos = opts.position ?? { x: 0, y: 0 };
    this._position = new PosPoint(
      {
        pixelWidth: engine.pixelWidth,
        pixelHeight: engine.pixelHeight,
        onMove: () => this._onPosChanged(),
      },
      pos.x,
      pos.y,
    );
    if (opts.angle !== undefined) this._angle.value = opts.angle;
    if (opts.opacity !== undefined) this._opacity.value = opts.opacity;
    if (opts.color !== undefined) this._color.value = opts.color;
    if (opts.state !== undefined) this._state.value = opts.state;

    // Register with the engine.
    this.engine.clips.add(opts.layer, this);
    this._active = true;
    this._zOrder = engine.vertMngr.register();
    this._pushToGpu();
  }

  get active(): boolean {
    return this._active;
  }
  set active(v: boolean) {
    if (this._active === v) return;
    if (v) {
      this._active = true;
      this._zOrder = this.engine.vertMngr.register();
      this.engine.clips.add(this.layer, this);
      this._pushToGpu();
    } else {
      this._active = false;
      this.engine.clips.remove(this.layer, this);
      if (this._zOrder >= 0) {
        this.engine.vertMngr.R.fill(0, this._zOrder * 90, (this._zOrder + 1) * 90);
        this.engine.vertMngr.deregister?.({ id: this.id } as never);
        this._zOrder = -1;
      }
    }
  }

  get position(): PosPoint {
    return this._position;
  }

  get x(): number {
    return this._position.x;
  }
  get y(): number {
    return this._position.y;
  }

  // ——— opacity with tween support ———

  get opacity(): number {
    if (this.isDisposed) throw new Error(`Access denied: ${this.name} is disposed`);
    return this._opacity.value;
  }
  set opacity(v: number | Tweener2) {
    if (this.isDisposed) throw new Error(`Access denied: ${this.name} is disposed`);
    if (typeof v === 'number') {
      if (this._opacity.value === v) return;
      this._opacity.value = v;
      this._opacity.renderedValue = v;
      this._pushOpacity();
    } else if (v instanceof Object && 'propName' in v) {
      const tw = v as Tweener2;
      tw.target = this;
      tw.fromValue = this._opacity.value;
      tw.toValue = (tw.toValue as number) ?? 0;
      if (this._opacity.tweener) this._opacity.tweener.kill();
      this._opacity.tweener = tw;
      tw.queue();
    }
  }

  // ——— angle with tween support ———

  get angle(): number {
    if (this.isDisposed) throw new Error(`Access denied: ${this.name} is disposed`);
    return this._angle.value;
  }
  set angle(v: number | Tweener2) {
    if (this.isDisposed) throw new Error(`Access denied: ${this.name} is disposed`);
    if (typeof v === 'number') {
      const norm = ((v % 360) + 360) % 360;
      if (this._angle.value === norm) return;
      this._angle.value = norm;
      this._angle.renderedValue = norm;
      this._pushRot();
    } else if (v instanceof Object && 'propName' in v) {
      const tw = v as Tweener2;
      tw.target = this;
      tw.fromValue = this._angle.value;
      tw.queue();
    }
  }

  // ——— color slot ———

  get color(): number {
    return this._color.value;
  }
  set color(v: number) {
    if (this._color.value === v) return;
    this._color.value = v;
    this._color.renderedValue = v;
    this._pushColor();
  }

  // ——— state slot ———

  get state(): number {
    return this._state.value;
  }
  set state(v: number) {
    if (this._state.value === v) return;
    this._state.value = v;
    this._state.renderedValue = v;
    this._pushState();
  }

  // ——— position shortcuts ———

  moveTo(x: number, y: number): boolean {
    return this._position.assign(x, y);
  }

  moveBy(dx: number, dy: number): boolean {
    return this._position.moveBy(dx, dy);
  }

  // ——— z-order operations ———

  moveToTop(): void {
    if (this._node) {
      const list = this.engine.clips.layer(this.layer);
      list?.moveToEnd(this._node);
    }
  }

  moveToBottom(): void {
    if (this._node) {
      const list = this.engine.clips.layer(this.layer);
      list?.moveToBeginning(this._node);
    }
  }

  // ——— Tweener render hook ———

  /** True while this clip's angle is being tweened. */
  isRotating(): boolean {
    return !!(this._angle.tweener);
  }

  /**
   * Set the per-vertex UVs for one of the two texture slots.
   *
   *   - `slot = 0` updates the image UVs (a_texCoord0)
   *   - `slot = 1` updates the mask UVs (a_texCoord1)
   *
   * `bounds` is `{ x, y, width, height }` in the texture's pixel space.
   * Pass null to use the full-texture default (0..1).
   *
   * In the puzzle engine this is called from the Piece constructor so
   * each piece only samples the region of the subject (or mask) that
   * belongs to it. Without it, every piece would draw the entire
   * subject and the puzzle wouldn't look right.
   */
  setTexBounds(
    tex: { pixelWidth: number; pixelHeight: number } | null,
    bounds: { x: number; y: number; width: number; height: number } | null,
    slot: 0 | 1 = 0,
    margin = 0,
  ): void {
    if (this._zOrder < 0) return;
    if (!tex) return;
    this.engine.vertMngr.setTexBounds(this._zOrder, slot as 0 | 1, tex, bounds, margin);
  }

  applyTweenValue(t: Tweener2): void {
    switch (t.propName) {
      case 'opacity':
        this._opacity.renderedValue = t.toValue as number;
        this._pushOpacity();
        break;
      case 'angle':
        this._angle.renderedValue = t.toValue as number;
        this._pushRot();
        break;
      case 'position':
        // position is interpolated by PosPoint; this hook isn't used.
        break;
    }
  }

  // ——— hit test ———

  containsPoint(x: number, y: number, _touch = false): boolean {
    if (!this._active) return false;
    const w = this.width / 2;
    const h = this.height / 2;
    return x >= this._position._x - w && x < this._position._x + w && y >= this._position._y - h && y < this._position._y + h;
  }

  // ——— disposal ———

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this._active = false;
    this.engine.clips.remove(this.layer, this);
    this._position.dispose();
    this.image = null;
    this.onDispose?.(this);
  }

  // ——— private: push to GPU ———

  private _setImage(img: ImageSource): void {
    this.image = img;
    if (this.width === 0 || this.height === 0) {
      this.width = img.bounds.width;
      this.height = img.bounds.height;
    }
    this.bounds.set(0, 0, this.width, this.height);
  }

  private _onPosChanged(): void {
    this.engine.vertMngr.setTrans(this._zOrder, this._position._oglX, this._position._oglY);
    this.onMove?.(this);
  }

  private _pushToGpu(): void {
    const vm = this.engine.vertMngr;
    if (this._zOrder < 0) return;
    vm.writeQuad(
      this._zOrder,
      1 / this.engine.canvas.width,
      1 / this.engine.canvas.height,
      this.width,
      this.height,
      this._position._oglX,
      this._position._oglY,
      Math.cos((this._angle.value * Math.PI) / 180),
      Math.sin((this._angle.value * Math.PI) / 180),
      this._state.value,
      this._color.value,
      this._opacity.value,
    );
  }

  private _pushOpacity(): void {
    if (this._zOrder < 0) return;
    this.engine.vertMngr.setOpacity(this._zOrder, this._opacity.renderedValue);
  }

  private _pushRot(): void {
    if (this._zOrder < 0) return;
    const a = (this._angle.renderedValue * Math.PI) / 180;
    this.engine.vertMngr.setRot(this._zOrder, Math.cos(a), Math.sin(a));
  }

  private _pushColor(): void {
    if (this._zOrder < 0) return;
    this.engine.vertMngr.setColor(this._zOrder, this._color.value);
  }

  private _pushState(): void {
    if (this._zOrder < 0) return;
    this.engine.vertMngr.setState(this._zOrder, this._state.value);
  }
}

// Re-export easing symbols for convenience.
export { applyEase, EASE_NONE };
export type { EaseKind };
