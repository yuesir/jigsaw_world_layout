/**
 * Reference-counted texture pool.
 *
 * `Texture.getTexture(source, isMask)` returns a `Texture` object, incrementing
 * the refcount of an existing texture with the same name. Callers must invoke
 * `subtractRef()` when they release a reference. The pool itself is bounded
 * (default 32 entries) and reports an error when full.
 *
 * Mirrors the original `u.Texture.getTexture` API.
 */
import { TextureError } from '../core/errors';

export interface TextureSource {
  /** ImageBitmap, HTMLImageElement, HTMLCanvasElement, or ImageData. */
  data: ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData;
  width: number;
  height: number;
  /** Optional cache key (defaults to src/name). */
  name?: string;
  /** When true, texture is GL_LUMINANCE / used as mask. */
  isMask?: boolean;
}

export class Texture {
  /** Internal pool registry. Key is the texture's name. */
  private static _pool: Texture[] = [];
  /** Counter for auto-naming. */
  private static _autoInc = 0;
  /** Maximum pool size. */
  static POOL_LIMIT = 32;

  readonly gl: WebGL2RenderingContext;
  readonly tex: WebGLTexture;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  isMask: boolean;
  name: string | null;
  source: TextureSource;
  /** Reference count. Texture is eligible for disposal when 0. */
  refCount: number;
  active = true;

  constructor(gl: WebGL2RenderingContext, source: TextureSource, slot: number) {
    this.gl = gl;
    this.width = source.width;
    this.height = source.height;
    this.pixelWidth = 1 / source.width;
    this.pixelHeight = 1 / source.height;
    this.isMask = !!source.isMask;
    this.name = source.name ?? null;
    this.source = source;
    this.refCount = 1;
    const tex = gl.createTexture();
    if (!tex) throw new TextureError('createTexture failed');
    this.tex = tex;
    this._upload(slot);
  }

  private _upload(slot: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const { data, width, height } = this.source;
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data as unknown as TexImageSource,
    );
    // Avoid unused param warning in strict mode for isMask
    void this.isMask;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Bind this texture to TEXTURE0+slot. */
  setActive(slot: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  addRef(): void {
    this.refCount++;
  }

  subtractRef(): void {
    if (this.refCount > 0) this.refCount--;
  }

  /** Recreate the GL texture from the current source. For context restore. */
  reinit(): void {
    if (this.refCount > 0) this._upload(0);
  }

  dispose(): void {
    if (this.refCount > 0) {
      console.warn(
        `[Texture] disposing of texture with ${this.refCount} refs: name=${this.name}`,
      );
    }
    this.gl.deleteTexture(this.tex);
    this.active = false;
    this.refCount = 0;
    this.name = null;
  }

  // ——— Pool API ———

  /**
   * Look up a texture by `name`, or create a new one from `source`.
   * Re-uses an existing slot (incrementing its refcount) when the name matches.
   */
  static getTexture(gl: WebGL2RenderingContext, source: TextureSource): Texture {
    const name = source.name;
    const pool = Texture._pool;
    if (!name) {
      // no name → just create a new one (no pooling)
      Texture._autoInc++;
      const autoName = `__no_name_${Texture._autoInc}__`;
      const slot = pool.length;
      if (slot >= Texture.POOL_LIMIT) {
        throw new TextureError('No more available texture slots');
      }
      const t = new Texture(gl, { ...source, name: autoName }, slot);
      pool.push(t);
      return t;
    }
    for (let i = pool.length - 1; i >= 0; i--) {
      const existing = pool[i]!;
      if (existing.name === name) {
        existing.addRef();
        return existing;
      }
    }
    const slot = pool.length;
    if (slot >= Texture.POOL_LIMIT) {
      throw new TextureError('No more available texture slots');
    }
    const t = new Texture(gl, source, slot);
    pool.push(t);
    return t;
  }

  /** Dispose every texture whose refCount has dropped to zero. */
  static freeAllUnused(): void {
    const pool = Texture._pool;
    for (let i = pool.length - 1; i >= 0; i--) {
      const t = pool[i]!;
      if (t.refCount <= 0) t.dispose();
    }
  }

  /** Re-upload all textures. Used after a WebGL context loss. */
  static resetAll(): void {
    for (const t of Texture._pool) {
      t.reinit();
    }
  }

  /** For tests. */
  static poolSize(): number {
    return Texture._pool.length;
  }
}
