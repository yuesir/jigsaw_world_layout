/**
 * 2D vector — mutable, no allocations on hot path.
 *
 * Design choice: mutable + chaining, because VertexManager / PosPoint / Tweener
 * are extremely hot paths in 60fps render loops. Returning new Vec2 from every
 * op would create GC pressure.
 */
export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Vec2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  add(v: Vec2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  addXY(x: number, y: number): this {
    this.x += x;
    this.y += y;
    return this;
  }

  sub(v: Vec2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  distance(v: Vec2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static distance(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static lerp(a: Vec2, b: Vec2, t: number, out: Vec2): Vec2 {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }
}
