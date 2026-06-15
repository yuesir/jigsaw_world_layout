/**
 * Engine — top-level facade tying together WebGL2 context, vertex manager,
 * texture pool, clips, projector, and theme.
 *
 *   const engine = new Engine(canvas, { layers: 5, clearColor: '#7390aa' });
 *   engine.projector.start();
 *
 * The engine owns the GL context and all GL resources. `dispose()` releases
 * everything.
 */
import { acquireContext, hexToRgb } from './context';
import { ContextError, EngineError } from './errors';
import { Shader } from '../gl/shader';
import { VertexManager } from '../gl/vertex-manager';
import { Texture } from '../gl/texture';
import { Clips } from '../scene/clips';
import { Clip } from '../scene/clip';
import { Projector } from './projector';
import { SHADERS } from '../gl/shaders';
import { layerIndex } from '../scene/layers';
import { log } from '../utils/log';

export interface EngineOptions {
  layers?: number;
  clearColor?: string;
  devicePixelRatio?: number;
}

export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly vertMngr: VertexManager;
  readonly clips: Clips;
  readonly projector: Projector;
  readonly devicePixelRatio: number;

  /** Map<shaderName, Shader> */
  private _shaders: Map<string, Shader> = new Map();
  /** Active shader during a draw. */
  private _currentShader: Shader | null = null;
  private _layerCount: number;
  private _clearColor: [number, number, number];
  private _disposed = false;

  constructor(canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.canvas = canvas;
    this.devicePixelRatio = opts.devicePixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const gl = acquireContext(canvas);
    if (!gl) throw new ContextError('WebGL2 is unavailable');
    this.gl = gl;
    this._layerCount = opts.layers ?? 5;
    this._clearColor = opts.clearColor ? hexToRgb(opts.clearColor) : [0.45, 0.56, 0.67];

    this.vertMngr = new VertexManager(gl, { initialFloats: 18000 });
    this.clips = new Clips();
    this.clips.initLayers(this._layerCount);
    this.projector = new Projector(this);

    // Compile the three default shaders and cache their attribs/uniforms.
    this._compileDefaultShaders();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    log.log('Engine: WebGL2 ready, layers=%d', this._layerCount);
  }

  private _compileDefaultShaders(): void {
    const common = SHADERS.commonVert;
    const ATTRS = ['a_pos', 'a_texCoord0', 'a_texCoord1', 'a_color', 'a_opacity', 'a_state', 'a_trans', 'a_scale', 'a_rot'];
    const UNI = ['u_aspect', 'u_invAspect', 'u_image', 'u_mask'];

    const colorShader = new Shader(this.gl, 'color', common, SHADERS.colorFrag, ATTRS, ['u_color']);
    this._shaders.set('color', colorShader);

    const imageShader = new Shader(this.gl, 'image', common, SHADERS.imageFrag, ATTRS, ['u_aspect', 'u_invAspect', 'u_image']);
    this._shaders.set('image', imageShader);

    const imageMaskShader = new Shader(this.gl, 'image-mask', common, SHADERS.imageMaskFrag, ATTRS, UNI);
    this._shaders.set('image-mask', imageMaskShader);
  }

  getShader(name: string): Shader {
    const s = this._shaders.get(name);
    if (!s) throw new EngineError(`Shader "${name}" not found`);
    return s;
  }

  registerShader(name: string, shader: Shader): void {
    this._shaders.set(name, shader);
  }

  /**
   * Re-initialize after a WebGL context loss. The vertex buffers and shaders
   * are recreated; textures are re-uploaded.
   */
  reinitAfterContextRestore(): void {
    log.log('Engine: reinitializing after context restore');
    this._compileDefaultShaders();
    Texture.resetAll();
    // Re-register all active clips' quads.
    let ord = 0;
    for (let i = 0; i < this.clips.layerCount(); i++) {
      const layer = this.clips.layerAt(i);
      if (!layer) continue;
      layer.forEach((clip) => {
        clip._zOrder = ord++;
        // clip will push its quad on next move or via its push method
        (clip as unknown as { _pushToGpu(): void })._pushToGpu?.();
      });
    }
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Update the GL viewport to match canvas size × devicePixelRatio. */
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = this.devicePixelRatio;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  /** Aspect used by the vertex shader's OGL conversion. */
  get aspect(): number {
    return this.canvas.width / this.canvas.height;
  }

  get invAspect(): number {
    return this.canvas.height / this.canvas.width;
  }

  get pixelWidth(): number {
    return 1 / this.canvas.width;
  }

  get pixelHeight(): number {
    return 1 / this.canvas.height;
  }

  /** Issue the actual draw calls for the current frame. */
  drawAll(): void {
    const gl = this.gl;
    gl.clearColor(this._clearColor[0], this._clearColor[1], this._clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.vertMngr.isModified) {
      // Still need to draw from the active buffer.
    }
    const vm = this.vertMngr;
    const activeBuf = vm.activeBuffId === 1 ? vm.bufferF : vm.bufferH;
    activeBuf.bind();

    for (let li = 0; li < this.clips.layerCount(); li++) {
      const layer = this.clips.layerAt(li);
      if (!layer || layer.length === 0) continue;
      // Walk the layer from bottom (head) to top (tail) — render in order.
      // For each consecutive run of identical (shader, texture, mask, mask2),
      // emit one drawArrays.
      let runStart: Clip | null = null;
      let runCount = 0;
      layer.forEach((clip) => {
        if (!clip.active || clip._zOrder < 0) {
          // flush current run
          if (runStart && runCount > 0) this._drawRun(runStart, runCount);
          runStart = null;
          runCount = 0;
          return;
        }
        if (runStart === null) {
          runStart = clip;
          runCount = 1;
          return;
        }
        if (this._sameShaderConfig(runStart, clip)) {
          runCount++;
        } else {
          this._drawRun(runStart, runCount);
          runStart = clip;
          runCount = 1;
        }
      });
      if (runStart && runCount > 0) this._drawRun(runStart, runCount);
    }
  }

  private _sameShaderConfig(a: Clip, b: Clip): boolean {
    return a.image === b.image; // simplified: same image source → same shader
  }

  private _drawRun(first: Clip, count: number): void {
    if (!first.image) return;
    const gl = this.gl;
    const tex = first.image.data;
    const hasMask = !!first.image.mask;
    const shaderName = hasMask ? 'image-mask' : 'image';
    const shader = this.getShader(shaderName);
    if (this._currentShader !== shader) {
      shader.use();
      this._currentShader = shader;
      // Set static uniforms.
      shader.uniform1f('u_aspect', this.aspect);
      shader.uniform1f('u_invAspect', this.invAspect);
      // Wire attribs.
      const stride = VertexManager_module.STRIDE_BYTES;
      shader.attribPointer('a_pos', 2, gl.FLOAT, false, stride, 0);
      shader.attribPointer('a_texCoord0', 2, gl.FLOAT, false, stride, 4 * 11);
      shader.attribPointer('a_texCoord1', 2, gl.FLOAT, false, stride, 4 * 13);
      shader.attribPointer('a_color', 1, gl.FLOAT, false, stride, 4 * 9);
      shader.attribPointer('a_opacity', 1, gl.FLOAT, false, stride, 4 * 10);
      shader.attribPointer('a_state', 1, gl.FLOAT, false, stride, 4 * 8);
      shader.attribPointer('a_trans', 2, gl.FLOAT, false, stride, 4 * 4);
      shader.attribPointer('a_scale', 2, gl.FLOAT, false, stride, 4 * 2);
      shader.attribPointer('a_rot', 2, gl.FLOAT, false, stride, 4 * 6);
      shader.enableAttrib('a_pos');
      shader.enableAttrib('a_texCoord0');
      shader.enableAttrib('a_texCoord1');
      shader.enableAttrib('a_color');
      shader.enableAttrib('a_opacity');
      shader.enableAttrib('a_state');
      shader.enableAttrib('a_trans');
      shader.enableAttrib('a_scale');
      shader.enableAttrib('a_rot');
    }
    tex.setActive(0);
    shader.uniform1i('u_image', 0);
    if (hasMask && first.image.mask) {
      first.image.mask.setActive(1);
      shader.uniform1i('u_mask', 1);
    }
    gl.drawArrays(gl.TRIANGLES, first._zOrder * 6, count * 6);
  }

  /** Convenience: create a Clip bound to this engine. */
  createClip(opts: ConstructorParameters<typeof Clip>[1]): Clip {
    return new Clip(this, opts);
  }

  /**
   * Register a top-level input handler. The Engine normalizes pointer
   * events from the canvas and forwards to the handler in canvas pixel
   * coordinates. Use this for routing mouse/touch to a Puzzle.
   */
  setInputHandler(handler: ((event: InputEvent) => void) | null): void {
    this._inputHandler = handler;
    if (handler && !this._inputAttached) this._attachInputListeners();
    else if (!handler && this._inputAttached) this._detachInputListeners();
  }

  private _inputHandler: ((event: InputEvent) => void) | null = null;
  private _inputAttached = false;

  private _attachInputListeners(): void {
    const c = this.canvas;
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('mouseup', this._onMouseUp);
    c.addEventListener('touchstart', this._onTouchStart, { passive: false });
    c.addEventListener('touchmove', this._onTouchMove, { passive: false });
    c.addEventListener('touchend', this._onTouchEnd);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this._inputAttached = true;
  }

  private _detachInputListeners(): void {
    const c = this.canvas;
    c.removeEventListener('mousedown', this._onMouseDown);
    c.removeEventListener('mousemove', this._onMouseMove);
    c.removeEventListener('mouseup', this._onMouseUp);
    c.removeEventListener('touchstart', this._onTouchStart);
    c.removeEventListener('touchmove', this._onTouchMove);
    c.removeEventListener('touchend', this._onTouchEnd);
    c.removeEventListener('wheel', this._onWheel);
    this._inputAttached = false;
  }

  private _toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / rect.width;
    const sy = this.canvas.height / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  private _onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    if (!this._inputHandler) return;
    const { x, y } = this._toCanvasCoords(e.clientX, e.clientY);
    this._inputHandler({ type: 'mousedown', x, y, which: e.button });
  };
  private _onMouseMove = (e: MouseEvent): void => {
    if (!this._inputHandler) return;
    const { x, y } = this._toCanvasCoords(e.clientX, e.clientY);
    this._inputHandler({ type: 'mousemove', x, y });
  };
  private _onMouseUp = (e: MouseEvent): void => {
    if (!this._inputHandler) return;
    const { x, y } = this._toCanvasCoords(e.clientX, e.clientY);
    this._inputHandler({ type: 'mouseup', x, y });
  };
  private _onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this._inputHandler || !e.touches[0]) return;
    const { x, y } = this._toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    this._inputHandler({ type: 'touchstart', x, y });
  };
  private _onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (!this._inputHandler || !e.touches[0]) return;
    const { x, y } = this._toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
    this._inputHandler({ type: 'touchmove', x, y });
  };
  private _onTouchEnd = (e: TouchEvent): void => {
    if (!this._inputHandler) return;
    const t = e.changedTouches[0];
    if (!t) {
      this._inputHandler({ type: 'touchend', x: 0, y: 0 });
      return;
    }
    const { x, y } = this._toCanvasCoords(t.clientX, t.clientY);
    this._inputHandler({ type: 'touchend', x, y });
  };
  private _onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (!this._inputHandler) return;
    const { x, y } = this._toCanvasCoords(e.clientX, e.clientY);
    this._inputHandler({ type: 'wheel', x, y, deltaY: e.deltaY });
  };

  /** Convenience: load an HTMLImageElement into the texture pool. */
  loadTexture(image: HTMLImageElement | HTMLCanvasElement, name: string): Texture {
    const w = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const h = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    const tex = Texture.getTexture(this.gl, {
      data: image,
      width: w,
      height: h,
      name,
    });
    return tex;
  }

  setClearColor(hex: string): void {
    const [r, g, b] = hexToRgb(hex);
    this._clearColor = [r, g, b];
  }

  layerIndex(name: string): number {
    return layerIndex(name);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._detachInputListeners();
    this.projector.detachContextLossHandlers();
    this.projector.stop();
    for (let i = 0; i < this.clips.layerCount(); i++) {
      const l = this.clips.layerAt(i);
      l?.forEach((c) => c.dispose());
    }
    for (const s of this._shaders.values()) s.dispose();
    Texture.freeAllUnused();
  }
}

/** Engine-level input event. */
export interface InputEvent {
  type:
    | 'mousedown'
    | 'mousemove'
    | 'mouseup'
    | 'touchstart'
    | 'touchmove'
    | 'touchend'
    | 'wheel';
  x: number;
  y: number;
  which?: number;
  deltaY?: number;
}

// Trick to keep STRIDE_BYTES referenced without circular import in template literal.
import { STRIDE_BYTES as _STRIDE_BYTES } from '../gl/vertex-manager';
const VertexManager_module = { STRIDE_BYTES: _STRIDE_BYTES };
