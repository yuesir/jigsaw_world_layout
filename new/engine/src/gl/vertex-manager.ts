/**
 * VertexManager — owns the global interleaved vertex buffer for all Clips.
 *
 * Mirrors the original `vertMngr` design:
 *   - One big Float32Array `R` holds every vertex, indexed by `zOrder * 90`.
 *   - 6 vertices per quad, 15 floats per vertex, total 90 floats per quad.
 *   - Two VBO buffers (`F` and `H`) ping-pong on commit.
 *
 * Per-vertex layout (15 floats, 60 bytes):
 *   0  pos.x
 *   1  pos.y
 *   2  scale.x
 *   3  scale.y
 *   4  trans.x
 *   5  trans.y
 *   6  rot.x    (cos θ)
 *   7  rot.y    (sin θ)
 *   8  state    (free 32-bit slot for shader-specific data)
 *   9  color    (free 32-bit slot)
 *  10  opacity
 *  11  tex0.u
 *  12  tex0.v
 *  13  tex1.u
 *  14  tex1.v
 *
 * Field offsets are exported as constants for use by the Clip / Shader code.
 */
import { Buffer } from './buffer';

export const STRIDE = 15;
export const STRIDE_BYTES = STRIDE * 4;
export const VERTS_PER_QUAD = 6;
export const FLOATS_PER_QUAD = STRIDE * VERTS_PER_QUAD; // 90

export const OFFSET_POS = 0;
export const OFFSET_SCALE = 2;
export const OFFSET_TRANS = 4;
export const OFFSET_ROT = 6;
export const OFFSET_STATE = 8;
export const OFFSET_COLOR = 9;
export const OFFSET_OPACITY = 10;
export const OFFSET_TEX0 = 11;
export const OFFSET_TEX1 = 13;

export interface VertexManagerOptions {
  /** Initial backing-store size in floats. Defaults to 18 000 (≈ 200 quads). */
  initialFloats?: number;
}

/** Default full-quad UV pattern, matching jigex-prog.js. */
const QUAD_UV: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 1],
  [1, 0],
  [1, 1],
] as const;

const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, 1],
  [1, 1],
  [-1, -1],
  [-1, -1],
  [1, 1],
  [1, -1],
] as const;

export class VertexManager {
  readonly gl: WebGL2RenderingContext;
  readonly bufferF: Buffer;
  readonly bufferH: Buffer;
  /** Backing CPU array; shared with caller for direct property writes. */
  R: Float32Array;
  private _capacityFloats: number;
  private _nextZ = 0;
  private _modified = false;
  private _activeBuff: 'F' | 'H' = 'F';

  constructor(gl: WebGL2RenderingContext, opts: VertexManagerOptions = {}) {
    this.gl = gl;
    this._capacityFloats = opts.initialFloats ?? 18000;
    this.R = new Float32Array(this._capacityFloats);
    this.bufferF = new Buffer(gl, gl.ARRAY_BUFFER, 'dynamic');
    this.bufferH = new Buffer(gl, gl.ARRAY_BUFFER, 'dynamic');
    const bytes = this._capacityFloats * 4;
    this.bufferF.growTo(bytes);
    this.bufferH.growTo(bytes);
  }

  get isModified(): boolean {
    return this._modified;
  }

  get activeBuffId(): 1 | 2 {
    return this._activeBuff === 'F' ? 1 : 2;
  }

  /** Allocate 1 quad slot. Returns the zOrder (0-based). */
  register(): number {
    this._ensureQuadCapacity();
    const z = this._nextZ++;
    this._modified = true;
    return z;
  }

  /** Release a previously-allocated zOrder. Idempotent. */
  deregister(z: number): void {
    if (z < 0 || z >= this._nextZ) return;
    // zero out the slot
    const base = z * FLOATS_PER_QUAD;
    for (let i = 0; i < FLOATS_PER_QUAD; i++) this.R[base + i] = 0;
    this._modified = true;
  }

  /** Total quads currently registered. */
  quadCount(): number {
    return this._nextZ;
  }

  /** Grow the backing if we're about to exceed capacity. */
  private _ensureQuadCapacity(): void {
    if ((this._nextZ + 1) * FLOATS_PER_QUAD > this._capacityFloats) {
      const newCap = Math.ceil((this._nextZ * FLOATS_PER_QUAD * 3) / 2);
      const nb = new Float32Array(newCap);
      nb.set(this.R);
      this.R = nb;
      this._capacityFloats = newCap;
      const bytes = newCap * 4;
      this.bufferF.growTo(bytes);
      this.bufferH.growTo(bytes);
    }
  }

  /** Write a quad's 90 floats from current values; increments modified. */
  writeQuad(
    z: number,
    pixelW: number,
    pixelH: number,
    width: number,
    height: number,
    tx: number,
    ty: number,
    cos: number,
    sin: number,
    state: number,
    color: number,
    opacity: number,
    tex0?: ReadonlyArray<readonly [number, number]>,
    tex1?: ReadonlyArray<readonly [number, number]>,
  ): void {
    const base = z * FLOATS_PER_QUAD;
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      const c = CORNERS[i]!;
      const o = base + i * STRIDE;
      r[o + 0] = c[0];
      r[o + 1] = c[1];
      r[o + 2] = width * pixelW;
      r[o + 3] = height * pixelH;
      r[o + 4] = tx;
      r[o + 5] = ty;
      r[o + 6] = cos;
      r[o + 7] = sin;
      r[o + 8] = state;
      r[o + 9] = color;
      r[o + 10] = opacity;
      const u0 = (tex0 ?? QUAD_UV)[i] ?? QUAD_UV[i]!;
      const u1 = (tex1 ?? QUAD_UV)[i] ?? QUAD_UV[i]!;
      r[o + 11] = u0[0];
      r[o + 12] = u0[1];
      r[o + 13] = u1[0];
      r[o + 14] = u1[1];
    }
    this._modified = true;
  }

  /**
   * Update just the trans.xy fields for a clip. Use this on hot move paths
   * instead of writeQuad to avoid the corner/UV loops.
   */
  setTrans(z: number, tx: number, ty: number): void {
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      const o = z * FLOATS_PER_QUAD + i * STRIDE;
      r[o + 4] = tx;
      r[o + 5] = ty;
    }
    this._modified = true;
  }

  setRot(z: number, cos: number, sin: number): void {
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      const o = z * FLOATS_PER_QUAD + i * STRIDE;
      r[o + 6] = cos;
      r[o + 7] = sin;
    }
    this._modified = true;
  }

  setScale(z: number, pixelW: number, pixelH: number, width: number, height: number): void {
    const r = this.R;
    const sx = width * pixelW;
    const sy = height * pixelH;
    for (let i = 0; i < 6; i++) {
      const o = z * FLOATS_PER_QUAD + i * STRIDE;
      r[o + 2] = sx;
      r[o + 3] = sy;
    }
    this._modified = true;
  }

  setOpacity(z: number, opacity: number): void {
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      r[z * FLOATS_PER_QUAD + i * STRIDE + 10] = opacity;
    }
    this._modified = true;
  }

  setColor(z: number, color: number): void {
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      r[z * FLOATS_PER_QUAD + i * STRIDE + 9] = color;
    }
    this._modified = true;
  }

  setState(z: number, state: number): void {
    const r = this.R;
    for (let i = 0; i < 6; i++) {
      r[z * FLOATS_PER_QUAD + i * STRIDE + 8] = state;
    }
    this._modified = true;
  }

  /**
   * Write per-vertex UVs for one quad.
   *
   *   uvs = [u0, v0, u1, v1, u2, v2, u3, v3]
   *
   * The 6 vertices are written in the pattern used by the original
   * jigex-prog.js (a, b, c, b, c, d). With this layout and the
   * 2-triangle corner order (TL, TR, BL, BL, TR, BR), the resulting
   * quad samples the texture's rectangular region (u0, v0) → (u3, v3)
   * — provided `u0 ≤ u2 ≤ u3` and `v0 ≤ v1 ≤ v3`.
   *
   *   vertex 0 (TL) : (u0, v0)
   *   vertex 1 (TR) : (u1, v1)
   *   vertex 2 (BL) : (u2, v2)
   *   vertex 3 (BL) : (u1, v1)   ← reused
   *   vertex 4 (TR) : (u2, v2)   ← reused
   *   vertex 5 (BR) : (u3, v3)
   *
   * This is the same UV-write pattern the original `addTexture0` uses,
   * kept verbatim so the texture region is sampled correctly.
   */
  setTexture(z: number, slot: 0 | 1, uvs: readonly [number, number, number, number, number, number, number, number]): void {
    const r = this.R;
    const offset = slot === 0 ? OFFSET_TEX0 : OFFSET_TEX1;
    for (let i = 0; i < 6; i++) {
      const o = z * FLOATS_PER_QUAD + i * STRIDE + offset;
      // i=0,1,2 → uvs[0..5]
      // i=3   → uvs[2..3]  (BL duplicate, reuse TR pair)
      // i=4   → uvs[4..5]  (TR duplicate, reuse BL pair)
      // i=5   → uvs[6..7]
      const pair = i < 3 ? i : i === 3 ? 1 : i === 4 ? 2 : 3;
      r[o] = uvs[pair * 2]!;
      r[o + 1] = uvs[pair * 2 + 1]!;
    }
    this._modified = true;
  }

  /**
   * Convenience: compute UVs for a texture region and write them.
   *
   *   tex      — texture with `pixelWidth` and `pixelHeight`
   *   bounds   — { x, y, width, height } in texture pixel space
   *   margin   — extra pixels of padding to include (default 0)
   */
  setTexBounds(
    z: number,
    slot: 0 | 1,
    tex: { pixelWidth: number; pixelHeight: number },
    bounds: { x: number; y: number; width: number; height: number } | null,
    margin = 0,
  ): void {
    let uvs: [number, number, number, number, number, number, number, number];
    if (bounds) {
      const r = (bounds.x - margin) * tex.pixelWidth;
      const a = (bounds.y - margin) * tex.pixelHeight;
      const s = (bounds.x + bounds.width + margin) * tex.pixelWidth;
      const l = (bounds.y + bounds.height + margin) * tex.pixelHeight;
      uvs = [r, a, r, l, s, a, s, l];
    } else {
      uvs = [0, 0, 0, 1, 1, 0, 1, 1];
    }
    this.setTexture(z, slot, uvs);
  }

  /** Upload R to the inactive VBO and swap active. No-op if clean. */
  commit(): void {
    if (!this._modified) return;
    const gl = this.gl;
    const target = this._activeBuff === 'F' ? this.bufferH : this.bufferF;
    target.bind();
    const bytes = this.R.byteLength;
    if (bytes > target.byteCapacity) {
      target.growTo(bytes, this.R);
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.R);
    }
    this._activeBuff = this._activeBuff === 'F' ? 'H' : 'F';
    this._modified = false;
  }

  reset(): void {
    this.R.fill(0);
    this._nextZ = 0;
    this._modified = true;
  }
}
