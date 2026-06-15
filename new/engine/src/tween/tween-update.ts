/**
 * updateTweeners — per-frame driver for all active Tweener2 instances.
 *
 * Each frame:
 *   1. Move every `delayed` tweener with elapsed delay into `active`.
 *   2. For each `active` tweener, compute progress, call render hook, then
 *      check completion.
 *   3. Fire onEnd for completed tweens; chain their `link` if set.
 *   4. The `tweeningInProgress` Variant flips to false when nothing remains.
 */
import { Tweener2, ST, type TweenerTarget } from './tweener2';
import { Variant } from '../reactive/variant';

const _pending: Tweener2[] = [];
const _active: Tweener2[] = [];

export const tweeningInProgress = new Variant(false, 'tweeningInProgress');

let _cycle = 0;
let _now = 0;

export function updateTweeners(now: number): void {
  _now = now;
  let t: boolean | null = false;
  _cycle++;

  for (let i = _pending.length - 1; i >= 0; i--) {
    const tw = _pending[i]!;
    _pending.splice(i, 1);
    if (tw._state === ST.pending) {
      tw._state = ST.active;
      _active.push(tw);
    }
  }

  for (let i = _active.length - 1; i >= 0; i--) {
    const tw = _active[i]!;
    if (tw._state !== ST.active) {
      _active.splice(i, 1);
      continue;
    }
    const tgt = tw.target as TweenerTarget | null;
    if (tgt?.isDisposed) {
      tw._state = ST.completed;
      _active.splice(i, 1);
      t = true;
      continue;
    }
    const isFinal = now - tw.startTime >= tw.duration;
    tw.run(now, isFinal, (tw2) => tgt?.applyTweenValue?.(tw2));
    if (isFinal) {
      tw._state = ST.completed;
      _active.splice(i, 1);
      try {
        tw.onEnd?.(tw);
      } catch (e) {
        console.error('Tweener onEnd threw:', e);
      }
      if (tw.link) {
        const link = tw.link;
        link._state = ST.active;
        link.startTime = now;
        _active.push(link);
      }
      t = true;
    } else {
      tw.onStep?.(tw);
    }
  }

  if (!t && _active.length === 0 && _pending.length === 0) {
    if (tweeningInProgress.val) tweeningInProgress.val = false;
  } else if (!tweeningInProgress.val) {
    tweeningInProgress.val = true;
  }
}

export function clearAllTweeners(): void {
  _pending.length = 0;
  _active.length = 0;
  if (tweeningInProgress.val) tweeningInProgress.val = false;
}

/** Internal: schedule a tween for the next update. */
export function scheduleTween(t: Tweener2): void {
  _pending.push(t);
  if (!tweeningInProgress.val) tweeningInProgress.val = true;
}

/** Test helper: read internal counters. */
export function _debugCounts(): { active: number; pending: number; cycle: number; now: number } {
  return { active: _active.length, pending: _pending.length, cycle: _cycle, now: _now };
}
