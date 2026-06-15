/**
 * Animator — sprite-frame animation.
 *
 * Drives `target.setTexBounds(target.texture, bounds, false)` once per frame,
 * advancing `bounds.x/y` to the next cell in a frame grid.
 *
 * Frame grid: `frameCount` cells laid out in `frameRows` rows × `frameCols`
 * columns. Frame index `fCurr` selects the cell, wraps modulo `frameCount`.
 *
 *   const tex = engine.loadTexture(spritesheet, 'applause');
 *   const clip = engine.createClip({ ... tex ... });
 *   const animator = new Animator(clip, {
 *     frameCount: 15,
 *     frameRows: 5,
 *     fps: 12.5,
 *     autoStart: true,
 *   });
 *   animator.play();
 *   animator.stop();
 *   animator.dispose();
 *
 * State machine:
 *   ANI_DEAD    — disposed, never used again
 *   ANI_STOPPED — created but not yet started
 *   ANI_WAITING — armed, will start on first updateAnimators tick
 *   ANI_RUNNING — playing
 */
import { log } from '../utils/log';

export const ANI_DEAD = 0;
export const ANI_STOPPED = 1;
export const ANI_WAITING = 2;
export const ANI_RUNNING = 3;
export type AnimatorState = 0 | 1 | 2 | 3;

export interface AnimatorOptions {
  frameCount: number;
  frameRows: number;
  fps: number;
  autoStart?: boolean;
  startFrame?: number;
}

export interface AnimatorTarget {
  width: number;
  height: number;
  texture: {
    name: string | null;
    width: number;
  } | null;
  setTexBounds(tex: unknown, bounds: { x: number; y: number; width: number; height: number }, isMask: boolean): void;
}

export class Animator {
  readonly target: AnimatorTarget;
  readonly frameCount: number;
  readonly frameCols: number;
  readonly frameRows: number;
  readonly fPeriod: number;
  state: AnimatorState;
  autoStart: boolean;
  fCurr: number;
  /** ms timestamp of last frame advance. */
  timestamp = 0;
  bounds: { x: number; y: number; width: number; height: number };

  constructor(target: AnimatorTarget, opts: AnimatorOptions) {
    this.target = target;
    this.frameCount = opts.frameCount;
    this.frameRows = opts.frameRows;
    this.frameCols = Math.ceil(opts.frameCount / opts.frameRows);
    this.fPeriod = Math.round(1000 / opts.fps);
    this.autoStart = !!opts.autoStart;
    this.fCurr = (opts.startFrame ?? 1) - 1;
    this.state = this.autoStart ? ANI_RUNNING : ANI_STOPPED;
    this.bounds = {
      x: this.fCurr * target.width,
      y: 0,
      width: target.width,
      height: target.height,
    };

    // Validate sprite sheet width.
    if (target.texture && target.texture.width % this.frameCols !== 0) {
      log.error(
        `invalid animation image width: w=${target.texture.width}, fc=${opts.frameCount}, name=${target.texture.name}`,
      );
      this.state = ANI_DEAD;
    }
  }

  /** Begin playing from the current frame. */
  play(): void {
    if (this.state !== ANI_DEAD) this.state = ANI_RUNNING;
  }

  /** Stop (reversible — call play() to resume). */
  stop(): void {
    if (this.state !== ANI_DEAD) this.state = ANI_STOPPED;
  }

  /**
   * Advance one frame. Called by `updateAnimators` once per RAF tick.
   * Returns true if the frame was advanced, false otherwise.
   */
  tick(now: number): boolean {
    if (this.state !== ANI_RUNNING) return false;
    if (now - this.timestamp < this.fPeriod) return false;
    this.fCurr++;
    if (this.fCurr >= this.frameCount) this.fCurr = 0;
    this.bounds.x = (this.fCurr % this.frameCols) * this.target.width;
    this.bounds.y = Math.floor(this.fCurr / this.frameCols) * this.target.height;
    this.timestamp = now;
    if (this.target.texture) {
      this.target.setTexBounds(this.target.texture, this.bounds, false);
    }
    return true;
  }

  /** Free resources; the Animator must not be used after dispose. */
  dispose(): void {
    if (this.state === ANI_DEAD) return;
    this.state = ANI_DEAD;
    this.bounds.x = 0;
    if (this.target.texture) this.target.setTexBounds(this.target.texture, this.bounds, false);
  }
}

/* ——— global animator list ——— */

const _animators: Animator[] = [];

/** Register an animator for per-frame ticking. */
export function registerAnimator(a: Animator): void {
  if (!_animators.includes(a)) _animators.push(a);
}

export function unregisterAnimator(a: Animator): void {
  const i = _animators.indexOf(a);
  if (i >= 0) _animators.splice(i, 1);
}

/** Tick all registered animators. Called by the Projector once per frame. */
export function updateAnimators(now: number): void {
  for (let i = _animators.length - 1; i >= 0; i--) {
    const a = _animators[i]!;
    if (a.state === ANI_DEAD) {
      _animators.splice(i, 1);
      continue;
    }
    a.tick(now);
  }
}

export function countAnimators(): number {
  return _animators.length;
}
