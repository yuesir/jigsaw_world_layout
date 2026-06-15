/**
 * Easing functions used by Tweener2.
 *
 * All take progress t ∈ [0, 1] and return the eased value.
 *
 * Six presets, matching the original jigex-prog.js:
 *   EASE_NONE       — linear
 *   EASE_IN         — cubic accelerate
 *   EASE_IN_SLOW    — quadratic accelerate
 *   EASE_OUT        — cubic decelerate
 *   EASE_OUT_SLOW   — quadratic decelerate
 *   EASE_IN_OUT     — cubic accelerate then decelerate
 */
export const EASE_NONE = 0;
export const EASE_IN = 1;
export const EASE_IN_SLOW = 2;
export const EASE_OUT = 3;
export const EASE_OUT_SLOW = 4;
export const EASE_IN_OUT = 5;
export type EaseKind =
  | typeof EASE_NONE
  | typeof EASE_IN
  | typeof EASE_IN_SLOW
  | typeof EASE_OUT
  | typeof EASE_OUT_SLOW
  | typeof EASE_IN_OUT;

export function applyEase(kind: EaseKind, t: number): number {
  switch (kind) {
    case EASE_NONE:
      return t;
    case EASE_IN:
      return t * t * t;
    case EASE_IN_SLOW:
      return t * t;
    case EASE_OUT: {
      const k = t - 1;
      return k * k * k + 1;
    }
    case EASE_OUT_SLOW:
      return -t * (t - 2);
    case EASE_IN_OUT:
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}
