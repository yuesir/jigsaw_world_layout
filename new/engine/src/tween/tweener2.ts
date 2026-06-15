/**
 * Tweener2 — the engine's primary animation primitive.
 *
 * State machine (5 states):
 *   not_queued  — initial state, no GPU work scheduled
 *   pending     — added to the `pending` queue, waiting for next updateTweeners
 *   active      — currently being interpolated
 *   completed   — final value reached
 *   delayed     — has a start delay
 *
 * Supports `extend(t2)` to chain additional tweens without breaking the
 * currently-active one.
 *
 * Lifecycle (typical):
 *   const t = new Tweener2('opacity', 0, 600);
 *   t.target = clip;
 *   t.queue();              // → pending → active → completed
 *
 *   t.kill();               // mark as completed early (no onEnd)
 *   t.finish();             // snap to toValue and call onEnd
 *   t.abort();              // restore prior value and call no callbacks
 */
import { applyEase, EASE_NONE, type EaseKind } from '../math/easing';

export const TW_FINISH = Symbol('TW_FINISH');
export const TW_ABORT = Symbol('TW_ABORT');
export const TW_DISPOSE = Symbol('TW_DISPOSE');

export type TweenerStateName = 'not_queued' | 'pending' | 'active' | 'completed' | 'delayed';

export const ST = {
  not_queued: 'not_queued',
  pending: 'pending',
  active: 'active',
  completed: 'completed',
  delayed: 'delayed',
} as const;

export interface TweenerTarget {
  /** The host that this tween mutates (e.g. a Clip or PosPoint). */
  name?: string;
  isDisposed?: boolean;
  /**
   * Renderer-side render hook. Set by Clip to write the new value into the
   * VertexManager. For non-vertex properties, the target's own setter runs.
   */
  applyTweenValue?(t: Tweener2): void;
}

export class Tweener2 {
  propName: string;
  toValue: unknown;
  duration: number;
  onEnd?: (t: Tweener2) => void;
  onStep?: (t: Tweener2) => void;
  ease: EaseKind;
  target: TweenerTarget | null = null;
  fromValue: unknown = null;
  startTime = 0;
  progress = 0;
  delay = 0;
  _state: TweenerStateName = ST.not_queued;
  _cycle = 0;
  /** Next tween to run when this one completes. */
  link: Tweener2 | null = null;
  /** Time stamp getter. Injected so tests can drive deterministically. */
  now: () => number;
  throttle = false;
  extension = false;

  constructor(
    propName: string,
    toValue: unknown,
    duration: number,
    onEnd?: (t: Tweener2) => void,
    ease: EaseKind = EASE_NONE,
  ) {
    this.propName = propName;
    this.toValue = toValue;
    this.duration = duration;
    this.onEnd = onEnd;
    this.ease = ease;
    this.now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();
  }

  get state(): TweenerStateName {
    return this._state;
  }

  /** Schedule this tween for the next updateTweeners call. */
  queue(): this {
    if (this._state !== ST.not_queued) {
      throw new Error(`queue: tweener in unexpected state ${this._state}`);
    }
    this._state = ST.pending;
    this.startTime = this.now();
    return this;
  }

  /** Chain another tween after this one finishes. */
  extend(next: Tweener2): void {
    if (next._state !== ST.not_queued) {
      throw new Error('extend: next tween must be in not_queued state');
    }
    if (this._state === ST.completed) {
      throw new Error('extend: cannot extend from completed state');
    }
    if (!next.target) {
      throw new Error('extend: must be called from within the engine');
    }
    // walk to last link
    let tail: Tweener2 = this;
    while (tail.link) tail = tail.link;
    tail.link = next;
  }

  /** Mark completed early; no onEnd. */
  kill(): void {
    let cur: Tweener2 | null = this;
    while (cur) {
      cur._state = ST.completed;
      cur = cur.link;
    }
  }

  /** Snap to toValue on this tween and all links; fire onEnd. */
  finish(): void {
    let cur: Tweener2 | null = this;
    let i = 0;
    while (cur) {
      cur._state = ST.completed;
      cur.progress = 1;
      cur.target?.applyTweenValue?.(cur);
      cur.onEnd?.(cur);
      cur = cur.link;
      if (++i > 100) throw new Error('Infinite tween callback loop');
    }
  }

  /** Advance this tween (used by updateTweeners). Returns true if still active. */
  run(now: number, isFinal: boolean, renderValue: (t: Tweener2) => void): void {
    if (isFinal) {
      this.progress = 1;
      this.fromValue = this.toValue;
      renderValue(this);
      return;
    }
    const t = (now - this.startTime) / this.duration;
    const k = Math.max(0, Math.min(1, t));
    this.progress = k;
    const eased = applyEase(this.ease, k);
    // for numeric targets we interpolate; for object targets (like PosPoint)
    // the target's applyTweenValue is responsible.
    if (typeof this.fromValue === 'number' && typeof this.toValue === 'number') {
      const v = (this.fromValue as number) + ((this.toValue as number) - (this.fromValue as number)) * eased;
      this.toValue = v;
    } else if (this.fromValue && typeof this.fromValue === 'object' && this.toValue && typeof this.toValue === 'object') {
      // object interpolation is performed inside the target's applyTweenValue
    }
    renderValue(this);
  }
}
