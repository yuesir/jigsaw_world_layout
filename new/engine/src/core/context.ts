/**
 * Acquire a WebGL2 context with the standard attribute set used by the engine.
 *
 *   const gl = acquireContext(canvas);
 *   if (!gl) throw new ContextError('WebGL2 unavailable');
 *
 * On failure returns null; caller decides whether to fall back or surface
 * a user-facing error.
 */
import { ContextError } from './errors';

export interface ContextOptions {
  /** default true — set false to debug GL errors as exceptions */
  throwOnAssertFail?: boolean;
  /** width override, otherwise uses canvas.width */
  width?: number;
  /** height override, otherwise uses canvas.height */
  height?: number;
  alpha?: boolean;
  depth?: boolean;
  stencil?: boolean;
  antialias?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
}

const CONTEXT_ATTRS: WebGLContextAttributes = {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

export function acquireContext(
  canvas: HTMLCanvasElement,
  opts: ContextOptions = {},
): WebGL2RenderingContext | null {
  if (!canvas) {
    throw new ContextError('acquireContext: canvas is null/undefined');
  }
  const attrs: WebGLContextAttributes = { ...CONTEXT_ATTRS, ...opts };
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
  } catch (e) {
    throw new ContextError('Failed to acquire WebGL2 context', e);
  }
  return gl;
}

/**
 * Best-effort fallback to WebGL1 if WebGL2 is unavailable. Most of the engine
 * is built around WebGL2 features, so this is only useful for very simple
 * debugging. Returns null if neither is available.
 */
export function acquireContextFallback(
  canvas: HTMLCanvasElement,
): WebGLRenderingContext | null {
  if (!canvas) return null;
  const names = ['webgl2', 'webgl', 'experimental-webgl'];
  for (const name of names) {
    try {
      const gl = canvas.getContext(name);
      if (gl) return gl as WebGLRenderingContext;
    } catch {
      // continue
    }
  }
  return null;
}

/** Parse "#rrggbb" → [r, g, b] in 0..1 range */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new ContextError(`Invalid hex color: "${hex}"`);
  const n = parseInt(m[1]!, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
