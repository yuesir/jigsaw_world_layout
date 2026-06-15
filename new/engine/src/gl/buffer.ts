/**
 * VBO wrapper.
 *
 * Encapsulates WebGL2 buffer object creation, allocation, and updates.
 * Supports two allocation modes:
 *   - STATIC: bufferData on first upload, immutable thereafter
 *   - DYNAMIC: bufferData initially, then bufferSubData per-frame
 *
 * The VertexManager uses DYNAMIC mode with two buffers ping-ponged (F / H).
 */
export type BufferUsage = 'static' | 'dynamic';

export class Buffer {
  readonly buffer: WebGLBuffer;
  private _byteCapacity = 0;
  private _byteLength = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    public readonly target: number = gl.ARRAY_BUFFER,
    public readonly usage: BufferUsage = 'dynamic',
  ) {
    const b = gl.createBuffer();
    if (!b) throw new Error('createBuffer failed');
    this.buffer = b;
  }

  get byteCapacity(): number {
    return this._byteCapacity;
  }

  get byteLength(): number {
    return this._byteLength;
  }

  bind(): this {
    this.gl.bindBuffer(this.target, this.buffer);
    return this;
  }

  /**
   * Upload the entire backing store. Resizes the GPU allocation if `bytes`
   * exceeds capacity. Pass `usageHint` to override per-call.
   */
  data(bytes: ArrayBufferView, usageHint?: number): this {
    const gl = this.gl;
    this.bind();
    if (bytes.byteLength > this._byteCapacity) {
      this._byteCapacity = Math.max(bytes.byteLength, this._grow(bytes.byteLength));
      gl.bufferData(this.target, bytes, usageHint ?? this._defaultUsage());
    } else {
      gl.bufferSubData(this.target, 0, bytes);
    }
    this._byteLength = bytes.byteLength;
    return this;
  }

  /**
   * Partial upload — caller must ensure the buffer was already allocated
   * (use data() at least once before subData()).
   */
  subData(offset: number, bytes: ArrayBufferView): this {
    this.bind();
    this.gl.bufferSubData(this.target, offset, bytes);
    return this;
  }

  /** Reallocate to a larger size, keeping existing data. */
  growTo(byteCapacity: number, copyFrom?: ArrayBufferView): this {
    const gl = this.gl;
    this.bind();
    if (byteCapacity <= this._byteCapacity) return this;
    const newBytes = new Uint8Array(byteCapacity);
    if (copyFrom) {
      newBytes.set(new Uint8Array(copyFrom.buffer, copyFrom.byteOffset, copyFrom.byteLength));
    }
    gl.bufferData(this.target, newBytes, this._defaultUsage());
    this._byteCapacity = byteCapacity;
    return this;
  }

  private _grow(currentBytes: number): number {
    return Math.ceil((currentBytes * 3) / 2);
  }

  private _defaultUsage(): number {
    const gl = this.gl;
    return this.usage === 'static' ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
  }
}
