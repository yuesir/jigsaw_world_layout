/**
 * Shader — compile a vertex/fragment pair and cache uniform / attribute
 * locations on first use. The original jigex-prog.js only cached attribs
 * lazily inside `setActive`; here we expose a richer surface.
 *
 *   const shader = new Shader(gl, 'pieceShader', vertexSrc, fragmentSrc);
 *   shader.use();
 *   shader.uniform1f('u_aspect', w / h);
 *   shader.attribPointer('a_pos', 2, gl.FLOAT, false, stride, 0);
 */
import { ShaderError, ShaderLinkError } from '../core/errors';

export type AttribLocations = Record<string, number>;
export type UniformLocations = Record<string, WebGLUniformLocation | null>;

export class Shader {
  readonly name: string;
  readonly program: WebGLProgram;
  readonly vertexShader: WebGLShader;
  readonly fragmentShader: WebGLShader;
  private _attribs: AttribLocations = {};
  private _uniforms: UniformLocations = {};
  private _attribsCached = false;
  private _uniformsCached = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    name: string,
    vertexSrc: string,
    fragmentSrc: string,
    /** When provided, only attribs/uniforms in these lists are cached. */
    attribList?: string[],
    uniformList?: string[],
  ) {
    this.name = name;
    this.vertexShader = this._compile(gl.VERTEX_SHADER, vertexSrc, `${name}.vertex`);
    this.fragmentShader = this._compile(gl.FRAGMENT_SHADER, fragmentSrc, `${name}.fragment`);
    const program = gl.createProgram();
    if (!program) throw new ShaderError(`Failed to create program: ${name}`);
    gl.attachShader(program, this.vertexShader);
    gl.attachShader(program, this.fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      throw new ShaderLinkError(`Link failed: ${name}: ${info}`, name);
    }
    this.program = program;
    if (attribList) this.cacheAttribs(attribList);
    if (uniformList) this.cacheUniforms(uniformList);
  }

  private _compile(type: number, src: string, label: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type);
    if (!sh) throw new ShaderError(`createShader failed: ${label}`);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh) ?? '';
      gl.deleteShader(sh);
      throw new ShaderError(`Compile failed: ${label}: ${info}`);
    }
    return sh;
  }

  cacheAttribs(names: string[]): AttribLocations {
    const gl = this.gl;
    for (const n of names) {
      this._attribs[n] = gl.getAttribLocation(this.program, n);
    }
    this._attribsCached = true;
    return this._attribs;
  }

  cacheUniforms(names: string[]): UniformLocations {
    const gl = this.gl;
    for (const n of names) {
      this._uniforms[n] = gl.getUniformLocation(this.program, n);
    }
    this._uniformsCached = true;
    return this._uniforms;
  }

  attrib(name: string): number {
    if (!this._attribsCached) this._attribs[name] = this.gl.getAttribLocation(this.program, name);
    return this._attribs[name]!;
  }

  uniform(name: string): WebGLUniformLocation | null {
    if (!this._uniformsCached) this._uniforms[name] = this.gl.getUniformLocation(this.program, name);
    return this._uniforms[name] ?? null;
  }

  use(): this {
    this.gl.useProgram(this.program);
    return this;
  }

  // ——— uniform setters ———

  uniform1f(name: string, x: number): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform1f(u, x);
    return this;
  }

  uniform1i(name: string, x: number): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform1i(u, x);
    return this;
  }

  uniform2f(name: string, x: number, y: number): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform2f(u, x, y);
    return this;
  }

  uniform3f(name: string, x: number, y: number, z: number): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform3f(u, x, y, z);
    return this;
  }

  uniform4f(name: string, x: number, y: number, z: number, w: number): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform4f(u, x, y, z, w);
    return this;
  }

  uniform4fv(name: string, v: Float32Array): this {
    const u = this.uniform(name);
    if (u) this.gl.uniform4fv(u, v);
    return this;
  }

  // ——— attrib pointer helpers ———

  attribPointer(
    name: string,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): this {
    const loc = this.attrib(name);
    this.gl.vertexAttribPointer(loc, size, type, normalized, stride, offset);
    return this;
  }

  enableAttrib(name: string): this {
    this.gl.enableVertexAttribArray(this.attrib(name));
    return this;
  }

  disableAttrib(name: string): this {
    this.gl.disableVertexAttribArray(this.attrib(name));
    return this;
  }

  /** Bind the program; cache all attribs/uniforms if not yet. */
  bind(): this {
    this.use();
    return this;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.vertexShader) gl.deleteShader(this.vertexShader);
    if (this.fragmentShader) gl.deleteShader(this.fragmentShader);
    if (this.program) gl.deleteProgram(this.program);
  }
}
