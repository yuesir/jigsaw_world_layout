/**
 * Public API entry point.
 */
export { Vec2 } from './math/vec2';
export { Mat3 } from './math/mat3';
export { Color } from './math/color';
export { AABB } from './math/aabb';
export {
  applyEase,
  EASE_NONE,
  EASE_IN,
  EASE_IN_SLOW,
  EASE_OUT,
  EASE_OUT_SLOW,
  EASE_IN_OUT,
} from './math/easing';
export type { EaseKind } from './math/easing';

export { Sym } from './reactive/sym';
export { Variant, LOG_NONE, LOG_FAILURES, LOG_CHANGES, LOG_ALL, LOG_DEBUG } from './reactive/variant';
export type { VariantOptions, VariantListener } from './reactive/variant';
export { StateCell } from './reactive/state-cell';

export { Engine } from './core/engine';
export type { EngineOptions, InputEvent } from './core/engine';
export { Projector } from './core/projector';
export { Clock } from './core/clock';
export { acquireContext, acquireContextFallback, hexToRgb } from './core/context';
export { Shader } from './gl/shader';
export { Buffer } from './gl/buffer';
export { Texture } from './gl/texture';
export type { TextureSource } from './gl/texture';
export { VertexManager } from './gl/vertex-manager';
export {
  STRIDE,
  STRIDE_BYTES,
  VERTS_PER_QUAD,
  FLOATS_PER_QUAD,
  OFFSET_POS,
  OFFSET_SCALE,
  OFFSET_TRANS,
  OFFSET_ROT,
  OFFSET_STATE,
  OFFSET_COLOR,
  OFFSET_OPACITY,
  OFFSET_TEX0,
  OFFSET_TEX1,
} from './gl/vertex-manager';

export { Clip } from './scene/clip';
export type { ClipOptions, ImageSource } from './scene/clip';
export { Clips } from './scene/clips';
export { PosPoint } from './scene/pos-point';
export { layerIndex, getLayerIndex, listLayers } from './scene/layers';
export { Piece, PC } from './scene/piece';
export type { PieceOptions } from './scene/piece';
export { Group } from './scene/group';
export { Subject } from './scene/subject';
export { Animator, ANI_DEAD, ANI_STOPPED, ANI_WAITING, ANI_RUNNING, updateAnimators, registerAnimator, unregisterAnimator } from './scene/animator';
export type { AnimatorOptions, AnimatorTarget, AnimatorState } from './scene/animator';
export { Knife, cutSpecs, buildShapedMask, buildRectangularMask, tabHoleAt, TEMPLATES } from './scene/knife';
export type { Template, PieceSpec, EdgeSpec } from './scene/knife';
export { Puzzle } from './scene/puzzle';
export type { PuzzleOptions } from './scene/puzzle';

export { Tweener2, TW_FINISH, TW_ABORT, TW_DISPOSE, ST } from './tween/tweener2';
export type { TweenerTarget, TweenerStateName } from './tween/tweener2';
export { updateTweeners, clearAllTweeners, tweeningInProgress } from './tween/tween-update';

export { ThemeState } from './theme/state';
export { THEME_PRESETS, THEME_NAMES, DEFAULT_THEME_NAME } from './theme/presets';
export type { Theme, ThemeColor } from './theme/types';
export { injectTheme } from './theme/injection';

export { List } from './utils/list';
export type { LinkNode } from './utils/list';
export { createRandom, randomSeed } from './utils/random';
export { log } from './utils/log';
export { createWebReq } from './utils/web-req';
export type { WebReqResponse, WebReqOptions } from './utils/web-req';

export {
  EngineError,
  ShaderError,
  ShaderLinkError,
  ContextError,
  TextureError,
} from './core/errors';
