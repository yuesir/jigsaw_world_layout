/**
 * Projector — the requestAnimationFrame main loop.
 *
 * Each frame:
 *   1. Capture the high-res timestamp.
 *   2. Update all active tweens.
 *   3. Commit the VertexManager (uploads to the inactive VBO).
 *   4. Call drawAll() to issue the GL draw calls.
 *   5. Process the createTask queue (one-off / repeating tasks).
 *
 * The loop can be started/stopped. `autoStart()` defers to the next
 * RAF tick if not already running. The context-lost path resets
 * `vertMngr` and re-compiles shaders.
 */
import { Clock } from './clock';
import { VertexManager } from '../gl/vertex-manager';
import { updateTweeners, tweeningInProgress } from '../tween/tween-update';
import type { Engine } from './engine';
import { log } from '../utils/log';

export type TaskCallback<T = unknown> = (data: T) => void;

export interface ProjectorOptions {
  onBenchmark?: (fps: number) => void;
  onContextLost?: (e: Event) => void;
  onContextRestored?: () => void;
}

interface Task<T = unknown> {
  id: number;
  callback: TaskCallback<T>;
  data: T;
  when: number; // ms-since-epoch
  interval: number; // 0 = one-shot
  repeat: boolean;
  active: boolean;
  cancel(): void;
}

let _taskIdSeq = 1;

export class Projector {
  readonly engine: Engine;
  readonly clock = new Clock();
  private _rafId = 0;
  private _running = false;
  private _autoArmed = true;
  private _fpsBuf: number[] = [];
  private _fpsIdx = 0;
  private _lastFrameTime = 0;
  /** Per-frame task queue (one-shot + repeating). */
  private _tasks: Task[] = [];
  private _lostHandler?: (e: Event) => void;
  private _restoredHandler?: () => void;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /** Per-frame callback for benchmarks. */
  onBenchmark: ((fps: number) => void) | null = null;

  /** Bind webglcontextlost / restored listeners. */
  attachContextLossHandlers(): void {
    const canvas = this.engine.canvas;
    this._lostHandler = (e: Event) => {
      e.preventDefault();
      this.stop();
      log.warn('WebGL context lost.');
      this.onBenchmark = null;
    };
    this._restoredHandler = () => {
      log.log('WebGL context restored.');
      this.engine.reinitAfterContextRestore();
      this.autoStart();
    };
    canvas.addEventListener('webglcontextlost', this._lostHandler as EventListener, false);
    canvas.addEventListener('webglcontextrestored', this._restoredHandler, false);
  }

  detachContextLossHandlers(): void {
    const canvas = this.engine.canvas;
    if (this._lostHandler) canvas.removeEventListener('webglcontextlost', this._lostHandler as EventListener);
    if (this._restoredHandler) canvas.removeEventListener('webglcontextrestored', this._restoredHandler);
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.clock.start(this.clock.now());
    this._lastFrameTime = this.clock.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop(): void {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  autoStart(): void {
    if (this._autoArmed) {
      this._autoArmed = false;
      this.start();
    }
  }

  isRunning(): boolean {
    return this._running;
  }

  createTask<T>(callback: TaskCallback<T>, interval = 0, repeat = false, data?: T): Task<T> {
    const task: Task<T> = {
      id: _taskIdSeq++,
      callback,
      data: data as T,
      when: Date.now() + interval,
      interval,
      repeat,
      active: true,
      cancel() {
        task.active = false;
      },
    };
    this._tasks.push(task as unknown as Task);
    return task;
  }

  cancelTask(task: Task): void {
    task.active = false;
    const i = this._tasks.indexOf(task);
    if (i >= 0) this._tasks.splice(i, 1);
  }

  /** Process scheduled tasks. Called every frame before draw. */
  private _processTasks(): void {
    const now = Date.now();
    for (let i = this._tasks.length - 1; i >= 0; i--) {
      const t = this._tasks[i]!;
      if (!t.active) {
        this._tasks.splice(i, 1);
        continue;
      }
      if (t.when <= now) {
        if (t.interval > 0 && t.repeat) {
          t.when = now + t.interval;
        } else {
          t.active = false;
          this._tasks.splice(i, 1);
        }
        try {
          t.callback(t.data);
        } catch (e) {
          console.error('Task callback threw:', e);
        }
      }
    }
  }

  private _tick = (now: number): void => {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(this._tick);
    const t = this.clock.tick(now);

    // 1. Tween updates
    updateTweeners(now);

    // 2. Task queue
    this._processTasks();

    // 3. Per-frame VertexManager commit + draw
    const vm: VertexManager = this.engine.vertMngr;
    if (vm.isModified || tweeningInProgress.val) {
      vm.commit();
    }
    this.engine.drawAll();

    // 4. Benchmark (rolling 100-frame avg)
    if (this.onBenchmark) {
      if (this._fpsBuf.length < 100) {
        this._fpsBuf.push(t);
      } else {
        this._fpsBuf[this._fpsIdx] = t;
        this._fpsIdx = (this._fpsIdx + 1) % 100;
        if (this._fpsIdx === 0) {
          const sum = this._fpsBuf.reduce((a, b) => a + b, 0);
          this.onBenchmark(Math.round(100000 / sum));
        }
      }
    }
    this._lastFrameTime = now;
  };
}
