/**
 * High-resolution clock for animation loops and benchmarks.
 *
 *   const clock = new Clock();
 *   requestAnimationFrame((t) => {
 *     const dt = clock.tick(t);
 *     // dt in milliseconds
 *   });
 */
export class Clock {
  private _start = 0;
  private _prev = 0;

  /** Call once before the first frame. */
  start(now: number): void {
    this._start = now;
    this._prev = now;
  }

  /** Returns the time since the previous tick, in milliseconds. */
  tick(now: number): number {
    if (this._start === 0) this.start(now);
    const dt = now - this._prev;
    this._prev = now;
    return dt;
  }

  /** Total elapsed since `start()`. */
  elapsed(now: number): number {
    return now - this._start;
  }

  now(): number {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    return Date.now();
  }
}
