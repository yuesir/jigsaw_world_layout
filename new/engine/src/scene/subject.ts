/**
 * Subject — the puzzle source image.
 *
 * Holds an HTMLImageElement (or canvas-rendered image) and produces a
 * scaled-down ImageData suitable for being uploaded as a Texture. The
 * scale is chosen so the image fits within the canvas with a 7-pixel
 * margin on each side, while never exceeding 90% of the canvas area.
 *
 *   const subject = new Subject(image, engine);
 *   await subject.rescale();
 *   const tex = subject.texture;
 *
 * Subject is the only place that knows the puzzle's *natural* dimensions
 * (before the per-piece knife cut). The Knife consumes the Subject's
 * `image` (an OffscreenCanvas) and `width/height/scale` to lay out pieces.
 */
import { log } from '../utils/log';
import { Texture } from '../gl/texture';
import type { Engine } from '../core/engine';

const MARGIN = 7; // pixels of padding around the subject
const MAX_FRACTION = 0.9; // never let subject fill >90% of canvas

export interface SubjectOptions {
  /** Source image — anything that can be drawn into a 2D context. */
  source: HTMLImageElement | HTMLCanvasElement;
  /** Optional explicit display name (used for the texture cache key). */
  name?: string;
}

export class Subject {
  readonly engine: Engine;
  readonly name: string;
  readonly source: HTMLImageElement | HTMLCanvasElement;
  /** Offscreen-canvas holding the scaled image. */
  readonly image: HTMLCanvasElement;
  width = 0;
  height = 0;
  scale = 1;
  texture: Texture | null = null;

  constructor(engine: Engine, opts: SubjectOptions) {
    this.engine = engine;
    this.source = opts.source;
    this.name = opts.name ?? `subject-${(opts.source as HTMLImageElement).src ?? 'inline'}`;
    this.image = document.createElement('canvas');
  }

  isReady(): boolean {
    return this.texture !== null && this.width > 0 && this.height > 0;
  }

  /**
   * Compute the optimal scale and re-render the source into `image`.
   * Target: 0.9 * canvas area, but never less than 0.35 of the canvas area.
   * The 0.35 floor is a heuristic: very small subjects look blurry when
   * scaled up. 0.9 ceiling prevents the subject from being larger than
   * the puzzle stage itself.
   */
  rescale(): void {
    const srcW = this.source instanceof HTMLImageElement ? this.source.naturalWidth : this.source.width;
    const srcH = this.source instanceof HTMLImageElement ? this.source.naturalHeight : this.source.height;
    if (!srcW || !srcH) {
      log.warn('Subject.rescale: source has zero size');
      return;
    }
    const cw = this.engine.canvas.width;
    const ch = this.engine.canvas.height;
    const canvasArea = cw * ch;
    const srcArea = srcW * srcH;
    // shrink if too big
    let scale = 1;
    let w = srcW;
    let h = srcH;
    let area = srcArea;
    const maxAllowed = MAX_FRACTION * canvasArea;
    const minAllowed = 0.35 * canvasArea;
    while ((area > maxAllowed || w > cw * MAX_FRACTION || h > ch * MAX_FRACTION) && scale > 0.05) {
      scale -= 0.01;
      w = Math.round(srcW * scale);
      h = Math.round(srcH * scale);
      area = w * h;
    }
    // grow if too small (but cap at natural size)
    while (area < minAllowed && w < cw * MAX_FRACTION && h < ch * MAX_FRACTION && scale < 1) {
      scale += 0.01;
      w = Math.round(srcW * scale);
      h = Math.round(srcH * scale);
      area = w * h;
    }

    this.scale = scale;
    this.width = w;
    this.height = h;

    const paddedW = w + 2 * MARGIN + 1;
    const paddedH = h + 2 * MARGIN + 1;
    this.image.width = paddedW;
    this.image.height = paddedH;
    const ctx = this.image.getContext('2d')!;
    ctx.clearRect(0, 0, paddedW, paddedH);
    try {
      ctx.drawImage(this.source, MARGIN, MARGIN, w, h);
    } catch (e) {
      log.error(`Subject.rescale: drawImage failed: ${(e as Error).message}`);
      return;
    }

    if (this.texture) this.texture.dispose();
    this.texture = Texture.getTexture(this.engine.gl, {
      data: this.image,
      width: paddedW,
      height: paddedH,
      name: this.name,
    });
  }

  dispose(): void {
    if (this.texture) {
      this.texture.subtractRef();
      this.texture = null;
    }
  }
}
