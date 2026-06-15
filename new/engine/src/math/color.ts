/**
 * RGBA color helpers.
 * Internally uses Float32Array to be friendly to GL uniform uploads.
 */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class Color {
  readonly data: Float32Array;

  constructor(r = 1, g = 1, b = 1, a = 1) {
    this.data = new Float32Array([r, g, b, a]);
  }

  set(r: number, g: number, b: number, a: number): this {
    this.data[0] = r;
    this.data[1] = g;
    this.data[2] = b;
    this.data[3] = a;
    return this;
  }

  setHex(hex: string, alpha = 1): this {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) throw new Error(`Invalid hex color: "${hex}"`);
    const n = parseInt(m[1]!, 16);
    this.data[0] = ((n >> 16) & 255) / 255;
    this.data[1] = ((n >> 8) & 255) / 255;
    this.data[2] = (n & 255) / 255;
    this.data[3] = alpha;
    return this;
  }

  setRGB(r: number, g: number, b: number, a = 1): this {
    return this.set(r, g, b, a);
  }

  copy(c: Color): this {
    this.data[0] = c.data[0]!;
    this.data[1] = c.data[1]!;
    this.data[2] = c.data[2]!;
    this.data[3] = c.data[3]!;
    return this;
  }

  toRGBA(): RGBA {
    return {
      r: this.data[0]!,
      g: this.data[1]!,
      b: this.data[2]!,
      a: this.data[3]!,
    };
  }
}
