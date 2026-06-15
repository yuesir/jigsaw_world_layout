/**
 * 3x3 matrix for 2D affine transforms (scale / rotate / translate).
 *
 * Stored in column-major order to match WebGL conventions.
 *
 * | sx*c   -sy*s   tx |
 * | sx*s    sy*c   ty |
 * |  0       0      1 |
 *
 * Where (sx, sy) is scale, (c, s) = (cos θ, sin θ), (tx, ty) is translation.
 */
export class Mat3 {
  readonly data: Float32Array;

  constructor() {
    this.data = new Float32Array(9);
    this.identity();
  }

  identity(): this {
    const d = this.data;
    d[0] = 1;
    d[1] = 0;
    d[2] = 0;
    d[3] = 0;
    d[4] = 1;
    d[5] = 0;
    d[6] = 0;
    d[7] = 0;
    d[8] = 1;
    return this;
  }

  /** Build a 2D affine: T(tx,ty) · R(θ) · S(sx,sy) */
  fromTransform(sx: number, sy: number, angleRad: number, tx: number, ty: number): this {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const d = this.data;
    d[0] = sx * c;
    d[1] = sx * s;
    d[2] = 0;
    d[3] = -sy * s;
    d[4] = sy * c;
    d[5] = 0;
    d[6] = tx;
    d[7] = ty;
    d[8] = 1;
    return this;
  }
}
